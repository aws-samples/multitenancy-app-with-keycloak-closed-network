import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { CreateAlarmOptions } from 'aws-cdk-lib/aws-cloudwatch';
import { Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  ClusterInstance,
  Credentials,
  DatabaseCluster,
  DatabaseProxy,
  IClusterEngine,
  ProxyTarget,
} from 'aws-cdk-lib/aws-rds';
import { HostedRotation, ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export interface AuroraServerlessV2Props {
  vpc: Vpc;
  engine: IClusterEngine;
  v2MinCapacity: number;
  v2MaxCapacity: number;
  metricDuration: Duration;
  databaseCapacityOption: CreateAlarmOptions;
  acuUtilOption: CreateAlarmOptions;
  dbUserName: string;
  dbname: string;
  enableProxy: boolean;
  port: number;
}

export class AuroraServerlessV2 extends Construct {
  public readonly dbSecrets: ISecret;
  public readonly dbSg: SecurityGroup;
  public readonly dbProxySg: SecurityGroup | undefined;
  public readonly dbProxy: DatabaseProxy | undefined;
  public readonly dbUserName: string;
  public readonly dbPort: number;
  constructor(scope: Construct, id: string, props: AuroraServerlessV2Props) {
    super(scope, id);

    const dbCredentials = Credentials.fromGeneratedSecret(props.dbUserName || 'dbadmin');
    this.dbSg = new SecurityGroup(this, 'Security group for AuroraServerlessV2', {
      vpc: props.vpc,
    });

    this.dbUserName = dbCredentials.username;
    this.dbPort = props.port;
    this.dbSg.addIngressRule(this.dbSg, Port.tcp(props.port));
    const cluster = new DatabaseCluster(this, `serverlessV2Cluster`, {
      engine: props.engine,
      defaultDatabaseName: props.dbname || 'postgres',
      serverlessV2MinCapacity: props.v2MinCapacity,
      serverlessV2MaxCapacity: props.v2MaxCapacity,
      writer: ClusterInstance.provisioned('writer'),
      readers: [ClusterInstance.serverlessV2('reader', { scaleWithWriter: true })],
      securityGroups: [this.dbSg],
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.vpc.isolatedSubnets,
      },
      port: props.port,
      removalPolicy: RemovalPolicy.DESTROY,
      storageEncrypted: true,
      iamAuthentication: true,
      credentials: dbCredentials,
    });
    NagSuppressions.addResourceSuppressions(cluster, [
      { id: 'AwsSolutions-RDS10', reason: 'For dev stage' },
    ]);
    this.dbSecrets = cluster.secret!;
    this.dbSecrets.addRotationSchedule(id, {
      automaticallyAfter: Duration.days(7),
      hostedRotation: HostedRotation.postgreSqlSingleUser({
        functionName: `${id}-credentialRotateFn`.slice(0, 64),
      }),
    });
    cluster
      .metricServerlessDatabaseCapacity({
        period: props.metricDuration,
      })
      .createAlarm(this, 'capacity', {
        ...props.databaseCapacityOption,
      });
    cluster
      .metricACUUtilization({
        period: props.metricDuration,
      })
      .createAlarm(this, 'alarm', {
        ...props.acuUtilOption,
      });

    if (props.enableProxy) {
      this.dbProxySg = new SecurityGroup(this, 'Security group for DBProxy', {
        vpc: props.vpc,
      });
      this.dbSg.addIngressRule(this.dbProxySg, Port.tcp(props.port));
      this.dbProxy = new DatabaseProxy(this, 'DBProxy', {
        proxyTarget: ProxyTarget.fromCluster(cluster),
        vpc: props.vpc,
        secrets: [cluster.secret!],
        securityGroups: [this.dbProxySg],
        iamAuth: true,
        requireTLS: true,
        debugLogging: true,
      });
    }
  }
}
