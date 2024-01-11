import { Duration, RemovalPolicy, Stack, aws_secretsmanager } from 'aws-cdk-lib';
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Peer, Port, SecurityGroup, Vpc, VpcEndpointService } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import {
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  FargateTaskDefinitionProps,
  LogDriver,
  PortMapping,
  RuntimePlatform,
  Secret,
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateServiceProps } from 'aws-cdk-lib/aws-ecs-patterns';
import {
  ListenerCertificate,
  NetworkLoadBalancer,
  NetworkTargetGroup,
  Protocol,
  TargetType,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Bucket, BucketEncryption, StorageClass } from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

import { AcmCertificateArn, LbConfig } from '../../config.types';
import { ARecord, PrivateHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';

export interface EcsProps {
  vpc: Vpc;
  zonename: string;
  acmCertificateArn: AcmCertificateArn;
  alternativeNames: string;
  fargateTaskDefinition: FargateTaskDefinitionProps;
  fargateService: ApplicationLoadBalancedFargateServiceProps;
  runtimePlatform: RuntimePlatform;
  aliasTag: string;
  portMapping: PortMapping[];
  nlbConfig: LbConfig;
  imagePath: string;
  dbSecrets?: aws_secretsmanager.ISecret;
  zone?: PrivateHostedZone;
}

interface EcsAppProps extends EcsProps {
  repository: Repository;
}
export class EcsApp extends Construct {
  public readonly nlb: NetworkLoadBalancer;
  public readonly ecsSg: SecurityGroup;
  public readonly fargateTaskDefinition: FargateTaskDefinition;
  public readonly service: FargateService;
  constructor(scope: Construct, id: string, props: EcsAppProps) {
    super(scope, id);

    let containerEnv = {};
    // Security group
    this.ecsSg = new SecurityGroup(this, 'Security group for ECS', {
      vpc: props.vpc,
    });

    // Limited access to alb from isolated subnets (NLB)
    props.vpc.isolatedSubnets.map((subnet) => {
      this.ecsSg.addIngressRule(
        Peer.ipv4(subnet.ipv4CidrBlock),
        Port.tcp(props.nlbConfig.targetPort)
      );
    });

    const createnlbResources = (certificate: ICertificate) => {
      const nlb = new NetworkLoadBalancer(this, `${certificate}-${props.aliasTag}-nlb`, {
        vpc: props.vpc,
        internetFacing: false,
        vpcSubnets: {
          subnets: props.vpc.isolatedSubnets,
        },
      });

      const accessLoggingBucket = new Bucket(this, `${certificate}-accesslogging-bucket`, {
        removalPolicy: RemovalPolicy.DESTROY,
        encryption: BucketEncryption.S3_MANAGED,
        autoDeleteObjects: true,
        enforceSSL: true,
        lifecycleRules: [
          {
            transitions: [
              {
                storageClass: StorageClass.INFREQUENT_ACCESS,
                transitionAfter: Duration.days(90),
              },
              {
                storageClass: StorageClass.INTELLIGENT_TIERING,
                transitionAfter: Duration.days(182),
              },
              {
                storageClass: StorageClass.GLACIER,
                transitionAfter: Duration.days(365),
              },
              {
                storageClass: StorageClass.DEEP_ARCHIVE,
                transitionAfter: Duration.days(730),
              },
            ],
          },
        ],
      });

      NagSuppressions.addResourceSuppressions(accessLoggingBucket, [
        {
          id: 'AwsSolutions-S1',
          reason: "Bucket for access log doesn't need to turn on ServerAccessLog",
        },
      ]);
      nlb.logAccessLogs(accessLoggingBucket);

      // // Add alb target group to nlb
      const nlbTargetGroup = new NetworkTargetGroup(this, `${certificate}-nlbTargetGroup`, {
        vpc: props.vpc,
        port: props.nlbConfig.targetPort,
        protocol: Protocol.TCP,
        targetType: TargetType.IP,
        healthCheck: {
          path: props.nlbConfig.healthCheckPath,
          port: props.nlbConfig.targetPort.toString(),
          protocol: Protocol.HTTP,
          interval: Duration.seconds(120),
          // timeout: Duration.seconds(15),
          healthyHttpCodes: '200',
          // healthyHttpCodes: props.aliasTag === 'keycloak' ? '200-399' : '200,404',
        },
      });

      const nlbListener = nlb.addListener('nlbListner', {
        port: props.nlbConfig.listenerPort,
        protocol: Protocol.TLS,
        certificates: [ListenerCertificate.fromArn(certificate.certificateArn)],
      });
      nlbListener.addTargetGroups(`${certificate}-addTargetGroups`, nlbTargetGroup);

      return { nlb, nlbTargetGroup };
    };

    const { nlb, nlbTargetGroup } = createnlbResources(
      Certificate.fromCertificateArn(this, 'Certificate', props.acmCertificateArn.service)
    );
    this.nlb = nlb;

    // Create TaskDefinition
    const executionRole = new Role(this, 'taskExecutionRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    this.fargateTaskDefinition = new FargateTaskDefinition(this, 'fargateTaskDefinition', {
      ...props.fargateTaskDefinition,
      runtimePlatform: props.runtimePlatform,
      executionRole: executionRole,
    });

    if (props.aliasTag === 'keycloak') {
      const s3PingBucket = new Bucket(this, 's3PingBucket', {
        removalPolicy: RemovalPolicy.DESTROY,
        encryption: BucketEncryption.S3_MANAGED,
        autoDeleteObjects: true,
        enforceSSL: true,
      });
      NagSuppressions.addResourceSuppressions(s3PingBucket, [
        {
          id: 'AwsSolutions-S1',
          reason: 'No need access logging enabled due to only ping',
        },
      ]);

      const keycloakAdminSecrets = new aws_secretsmanager.Secret(this, 'keycloakAdminSecrets', {
        secretName: 'KeycloakAdmin',
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ username: 'keycloak' }),
          generateStringKey: 'password',
          passwordLength: 12,
        },
        removalPolicy: RemovalPolicy.DESTROY,
      });

      NagSuppressions.addResourceSuppressions(
        keycloakAdminSecrets,
        [
          {
            id: 'AwsSolutions-SMG4',
            reason: 'Unabled to rotate the password due to Keycloak app',
          },
        ],
        true
      );

      props.dbSecrets!.grantRead(this.fargateTaskDefinition.executionRole!);
      keycloakAdminSecrets.grantRead(this.fargateTaskDefinition.executionRole!);
      containerEnv = {
        command: ['start'],
        secrets: {
          ['KC_DB']: Secret.fromSecretsManager(props.dbSecrets!, 'engine'),
          ['KC_DB_URL_PORT']: Secret.fromSecretsManager(props.dbSecrets!, 'port'),
          ['KC_DB_URL_DATABASE']: Secret.fromSecretsManager(props.dbSecrets!, 'dbname'),
          ['KC_DB_USERNAME']: Secret.fromSecretsManager(props.dbSecrets!, 'username'),
          ['KC_DB_PASSWORD']: Secret.fromSecretsManager(props.dbSecrets!, 'password'),
          ['KC_DB_URL_HOST']: Secret.fromSecretsManager(props.dbSecrets!, 'host'),
          ['KEYCLOAK_ADMIN']: Secret.fromSecretsManager(keycloakAdminSecrets, 'username'),
          ['KEYCLOAK_ADMIN_PASSWORD']: Secret.fromSecretsManager(keycloakAdminSecrets, 'password'),
        },
        environment: {
          ['KC_HTTP_ENABLED']: 'true',
          ['KC_HEALTH_ENABLED']: 'true',
          ['KC_HOSTNAME_DEBUG']: 'true',
          ['KC_PROXY']: 'edge',
          ['KC_HOSTNAME_STRICT']: 'false',
          ['KC_HOSTNAME_URL']: `https://${props.aliasTag}.${props.zonename}`,
          ['KC_HOSTNAME_ADMIN_URL']: `https://admin.${props.aliasTag}.${props.zonename}`,
          ['KC_CACHE_STACK']: 'ec2',
          ['JAVA_OPTS_APPEND']: `-Djgroups.s3.region_name=${
            Stack.of(this).region
          } -Djgroups.s3.bucket_name=${s3PingBucket.bucketName}`,
        },
      };
      this.ecsSg.addIngressRule(this.ecsSg, Port.tcp(7800));
      s3PingBucket.grantReadWrite(this.fargateTaskDefinition.taskRole);
      NagSuppressions.addResourceSuppressions(
        this.fargateTaskDefinition.taskRole,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason:
              'Create the policy of s3 automatically, but restriced to access the specified s3 bucket',
            appliesTo: [
              {
                regex: '/^Resource::(.*)\\/*$/g',
              },
            ],
          },
        ],
        true
      );
    } else {
      containerEnv = {
        environment: {
          ['NUXT_AWS_REGION']: Stack.of(this).region,
        },
      };
    }

    const container = this.fargateTaskDefinition.addContainer('container', {
      image: ContainerImage.fromEcrRepository(props.repository, props.aliasTag),
      portMappings: props.portMapping,
      logging: LogDriver.awsLogs({
        streamPrefix: props.aliasTag,
      }),
      ...containerEnv,
    });

    const cluster = new Cluster(this, 'cluster', {
      vpc: props.vpc,
      containerInsights: true,
    });
    this.service = new FargateService(this, `${props.aliasTag}-service`, {
      cluster,
      taskDefinition: this.fargateTaskDefinition,
      securityGroups: [this.ecsSg],
      ...props.fargateService,
      enableExecuteCommand: false,
    });
    this.service.attachToNetworkTargetGroup(nlbTargetGroup);

    NagSuppressions.addResourceSuppressions(
      executionRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Create the policy for ecr:GetAuthorizationToken automatically',
          appliesTo: ['Resource::*'],
        },
      ],
      true
    );

    NagSuppressions.addResourceSuppressions(
      this.fargateTaskDefinition.taskRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Create the policy of s3 automatically, but restriced to access the specified s3 bucket  ',
          appliesTo: [
            'Action::s3:Abort*',
            'Action::s3:DeleteObject*',
            'Action::s3:GetBucket*',
            'Action::s3:GetObject*',
            'Action::s3:List*',
          ],
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      this.fargateTaskDefinition,
      [
        {
          id: 'AwsSolutions-ECS2',
          reason: 'Store the credentials in secrets in the task definition',
        },
      ],
      true
    );
    // Create admin url network for keycloak
    if (props.aliasTag === 'keycloak') {
      const { nlb, nlbTargetGroup } = createnlbResources(
        Certificate.fromCertificateArn(
          this,
          'KeyclakForAdminCertificate',
          props.acmCertificateArn.keycloackForAdmin!
        )
      );
      this.service.attachToNetworkTargetGroup(nlbTargetGroup);
      new ARecord(this, 'Keycloak', {
        zone: props.zone!,
        target: RecordTarget.fromAlias(new LoadBalancerTarget(this.nlb)),
        recordName: `${props.aliasTag}.${props.zonename}`,
      });
      new ARecord(this, 'AdminKeycloak', {
        zone: props.zone!,
        target: RecordTarget.fromAlias(new LoadBalancerTarget(nlb)),
        recordName: `admin.${props.aliasTag}.${props.zonename}`,
      });
    }
  }

  addEpService(domainName: string, nlb?: NetworkLoadBalancer) {
    const vpcEndpointService = new VpcEndpointService(this, `${domainName}-endpointSevice`, {
      vpcEndpointServiceLoadBalancers: nlb ? [nlb] : [this.nlb],
      acceptanceRequired: false,
    });
    return vpcEndpointService;
  }

  addDedicatedNLB(vpc: Vpc, subDomainName: string, certificate: string, nlbConfig: LbConfig) {
    const dedicatedNlb = new NetworkLoadBalancer(this, `${subDomainName}-nlb`, {
      vpc: vpc,
      internetFacing: false,
      vpcSubnets: {
        subnets: vpc.isolatedSubnets,
      },
    });
    const accessLoggingBucket = new Bucket(this, `${subDomainName}-accesslogging-bucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      enforceSSL: true,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(90),
            },
            {
              storageClass: StorageClass.INTELLIGENT_TIERING,
              transitionAfter: Duration.days(182),
            },
            {
              storageClass: StorageClass.GLACIER,
              transitionAfter: Duration.days(365),
            },
            {
              storageClass: StorageClass.DEEP_ARCHIVE,
              transitionAfter: Duration.days(730),
            },
          ],
        },
      ],
    });
    dedicatedNlb.logAccessLogs(accessLoggingBucket);
    NagSuppressions.addResourceSuppressions(accessLoggingBucket, [
      {
        id: 'AwsSolutions-S1',
        reason: "Bucket for access log doesn't need to turn on ServerAccessLog",
      },
    ]);
    // // Add alb target group to nlb
    const nlbTargetGroup = new NetworkTargetGroup(this, `${subDomainName}-nlbTargetGroup`, {
      vpc: vpc,
      port: nlbConfig.targetPort,
      protocol: Protocol.TCP,
      targetType: TargetType.IP,
      healthCheck: {
        path: nlbConfig.healthCheckPath,
        port: nlbConfig.targetPort.toString(),
        protocol: Protocol.HTTP,
        interval: Duration.seconds(120),
        // timeout: Duration.seconds(15),
        healthyHttpCodes: '200',
      },
    });
    const nlbListener = dedicatedNlb.addListener(`${subDomainName}-nlbListner`, {
      port: nlbConfig.listenerPort,
      protocol: Protocol.TLS,
      certificates: [ListenerCertificate.fromArn(certificate)],
    });
    nlbListener.addTargetGroups(`${subDomainName}-addTargetGroups`, nlbTargetGroup);
    this.service.attachToNetworkTargetGroup(nlbTargetGroup);
    return dedicatedNlb;
  }
}
