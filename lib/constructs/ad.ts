import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  SecurityGroup,
  Vpc,
  WindowsVersion,
  CfnKeyPair,
  VpcEndpointService,
  BlockDeviceVolume,
  Peer,
  Port,
  ISubnet,
} from 'aws-cdk-lib/aws-ec2';
import { NetworkLoadBalancer, Protocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { InstanceIdTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Bucket, BucketEncryption, StorageClass } from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export interface AdStackProps {
  vpc: Vpc;
  name: string;
}

export class AdStack extends Construct {
  public readonly nlb: NetworkLoadBalancer;
  public readonly key: CfnKeyPair;
  public readonly vpcEndpointService: VpcEndpointService;
  constructor(scope: Construct, id: string, props: AdStackProps) {
    super(scope, id);

    const ec2Sg = new SecurityGroup(this, 'Security group for AD', {
      vpc: props.vpc,
    });

    props.vpc.isolatedSubnets.map((value: ISubnet) => {
      ec2Sg.addIngressRule(Peer.ipv4(`${value.ipv4CidrBlock}`), Port.tcp(389));
    });

    this.key = new CfnKeyPair(this, 'adKey', {
      keyName: `${props.name}-key`,
    });
    this.key.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // For fleet  Manager
    const instanceRole = new Role(this, 'AdRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
    });
    instanceRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'ssm:DescribeAssociation',
          'ssm:GetDeployablePatchSnapshotForInstance',
          'ssm:GetDocument',
          'ssm:DescribeDocument',
          'ssm:GetManifest',
          'ssm:GetParameter',
          'ssm:GetParameters',
          'ssm:ListAssociations',
          'ssm:ListInstanceAssociations',
          'ssm:PutInventory',
          'ssm:PutComplianceItems',
          'ssm:PutConfigurePackageResult',
          'ssm:UpdateAssociationStatus',
          'ssm:UpdateInstanceAssociationStatus',
          'ssm:UpdateInstanceInformation',
        ],
        resources: ['*'],
      })
    );
    instanceRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
        ],
        resources: ['*'],
      })
    );
    instanceRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'ec2messages:AcknowledgeMessage',
          'ec2messages:DeleteMessage',
          'ec2messages:FailMessage',
          'ec2messages:GetEndpoint',
          'ec2messages:GetMessages',
          'ec2messages:SendReply',
        ],
        resources: ['*'],
      })
    );
    NagSuppressions.addResourceSuppressions(
      instanceRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Use this role for only fleet manager access',
          appliesTo: ['Resource::*'],
        },
      ],
      true
    );

    const adInstance = new Instance(this, 'windows', {
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.vpc.isolatedSubnets,
      },
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
      machineImage: MachineImage.latestWindows(
        WindowsVersion.WINDOWS_SERVER_2022_ENGLISH_FULL_BASE
      ),
      securityGroup: ec2Sg,
      role: instanceRole,
      detailedMonitoring: true,
      instanceName: props.name,
      keyName: this.key.keyName,
      blockDevices: [
        {
          volume: BlockDeviceVolume.ebs(30, {
            encrypted: true,
          }),
          deviceName: '/dev/sda1',
        },
      ],
    });
    NagSuppressions.addResourceSuppressions(adInstance, [
      {
        id: 'AwsSolutions-EC29',
        reason: 'No need to attach ASG due to the bastion instance',
      },
    ]);

    const accessLoggingBucket = new Bucket(this, 'accesslogging-bucket', {
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

    this.nlb = new NetworkLoadBalancer(this, 'nlb', {
      vpc: props.vpc,
      internetFacing: false,
      vpcSubnets: {
        subnets: props.vpc.isolatedSubnets,
      },
    });
    this.nlb.logAccessLogs(accessLoggingBucket);

    const nlbListener = this.nlb.addListener('NlbHttpListener', {
      port: 389,
    });

    nlbListener.addTargets('nlbTarget', {
      protocol: Protocol.TCP,
      port: 389,
      targets: [new InstanceIdTarget(adInstance.instanceId, 389)],
    });

    this.vpcEndpointService = new VpcEndpointService(this, 'endpointSevice', {
      vpcEndpointServiceLoadBalancers: [this.nlb],
      acceptanceRequired: false,
    });
  }
}
