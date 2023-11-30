import { Duration } from 'aws-cdk-lib';
import {
  IMachineImage,
  InstanceClass,
  InstanceSize,
  Vpc,
  SecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import { IClusterEngine, DatabaseProxy } from 'aws-cdk-lib/aws-rds';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { CreateAlarmOptions } from 'aws-cdk-lib/aws-cloudwatch';
import { FargateTaskDefinitionProps, RuntimePlatform, PortMapping } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateServiceProps } from 'aws-cdk-lib/aws-ecs-patterns';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';

export type Config = {
  base: BaseConfig;
  /**
   * Define the network configuration
   * @type {NetworkConfig}
   */
  networkConfig: NetworkConfig;
  /**
   * Define KeyCloak configuration
   * @type {KeyCloakAppConfig}
   */
  keyCloakApp: KeyCloakAppConfig;
  /**
   * Define Nuxt3 App configuration
   * @type {NuxtAppConfig}
   */
  nuxtApp: NuxtAppConfig;
};

export type BaseConfig = {
  /**
   * Define the identifying your stack
   * @type {string}
   */
  alias: string;
};

export type AcmCertificateArn = {
  /**
   * Define the arn of ACM for keycloack or nuxt3
   * @type {string}
   */
  service: string;
  /**
   * Define the arn of ACM for keycloak admin
   * @type {string}
   */
  keycloackForAdmin?: string;
};

export type NetworkConfig = {
  /**
   * Vpc CIDR of multitenancy and each corp network
   * @type {string}
   */
  cidr: string;
  /**
   * Define the CIDR of `publicSubnet`,`natSubnet` and `isolatedSubnet`
   * @type {number}
   */
  cidrMask: number;
  /**
   * Define whether creating a public subnet or not
   * @type {boolean}
   */
  publicSubnet: boolean;
  /**
   * Define whether creating a nat subnet (a private subnet with NAT gateway) or not
   * @type {boolean}
   */
  natSubnet: boolean;
  /**
   * Define whether creating a isolated subnet (a private subnet without NAT gateway) or not
   * @type {boolean}
   */
  isolatedSubnet: boolean;
  /**
   * Define how many AZs in the region are created
   * @type {number}
   */
  maxAzs: number;
  /**
   * Define the domain name of PrivatedHostedZone in Route53
   * @type {string}
   */
  zoneName: string;
  /**
   * Define whether creating some vpc endpoints or not
   * @type {boolean}
   */
  adEnv: boolean;
};

export type KeyCloakAppConfig = {
  /**
   * Define Keycloak database configuration
   * @type {DBConfig}
   */
  dbConfig: DBConfig;
  /**
   * Define Keycloak app configuration
   * @type {DBConfig}
   */
  appConfig: AppConfig;
};
export type NuxtAppConfig = {
  /**
   * Define each corperation configuration
   * @type {Corp[]}
   */
  corpList: Corp[];
  /**
   * Define Nuxt3 database configuration
   * @type {DBConfig}
   */
  dbConfig: DBConfig;
  /**
   * Define Nuxt3 app configuration
   * @type {AppConfig}
   */
  appConfig: AppConfig;
};

export type DBConfig = {
  /**
   * Define the Aurora Serverless v2 cluster engine
   * @type {IClusterEngine}
   */
  engine: IClusterEngine;
  /**
   * Define the maximum number of Aurora capacity units (ACUs) for a DB instance in an Aurora Serverless v2 cluster
   * @type {number}
   */
  v2MaxCapacity: number;
  /**
   * Define the minimum number of Aurora capacity units (ACUs) for a DB instance in an Aurora Serverless v2 cluster
   * @type {number}
   */
  v2MinCapacity: number;
  /**
   * Define how frequency caliculating of the database metrics
   * @type {Duration}
   */
  metricDuration: Duration;
  /**
   * Define the alarm configuration of the average of the `ServerlessDatabaseCapacity` values
   * @type {CreateAlarmOptions}
   */
  databaseCapacityOption: CreateAlarmOptions;
  /**
   * Define the alarm configuration of the average of the `ServerlessDatabaseCapacity` metric divided by the maximum ACU value
   * @type {CreateAlarmOptions}
   */
  acuUtilOption: CreateAlarmOptions;
  /**
   * Define the administrative username of the database
   * @type {string}
   */
  dbUserName: string;
  /**
   * Define the name of the database
   * @type {number}
   */
  dbname: string;
  /**
   * Define the database listen port
   * @type {number}
   */
  port: number;
  /**
   * Define the parameter name in SSM parameter store
   * @type {string}
   */
  parameterName: string;
  /**
   * Define whether creating the rds proxy or not
   * @type {boolean}
   */
  enableProxy: boolean;
};

export type OverridDbConfig = {
  /**
   * Define the Aurora Serverless v2 cluster engine
   * @type {IClusterEngine}
   */
  engine?: IClusterEngine;
  /**
   * Define the maximum number of Aurora capacity units (ACUs) for a DB instance in an Aurora Serverless v2 cluster
   * @type {number}
   */
  v2MaxCapacity?: number;
  /**
   * Define the minimum number of Aurora capacity units (ACUs) for a DB instance in an Aurora Serverless v2 cluster
   * @type {number}
   */
  v2MinCapacity?: number;
  /**
   * Define how frequency caliculating of the database metrics
   * @type {Duration}
   */
  metricDuration?: Duration;
  /**
   * Define the alarm configuration of the average of the `ServerlessDatabaseCapacity` values
   * @type {CreateAlarmOptions}
   */
  databaseCapacityOption?: CreateAlarmOptions;
  /**
   * Define the alarm configuration of the average of the `ServerlessDatabaseCapacity` metric divided by the maximum ACU value
   * @type {CreateAlarmOptions}
   */
  acuUtilOption?: CreateAlarmOptions;
  /**
   * Define the administrative username of the database
   * @type {string}
   */
  dbUserName?: string;
  /**
   * Define the name of the database
   * @type {number}
   */
  dbname?: string;
  /**
   * Define the database listen port
   * @type {number}
   */
  port?: number;
  /**
   * Define the parameter name in SSM parameter store
   * @type {string}
   */
  parameterName?: string;
  /**
   * Define whether creating the rds proxy or not
   * @type {boolean}
   */
  enableProxy?: boolean;
};
export type DBStackConfig = {
  /**
   * Define the vpc where the database is deployed
   * @type {Vpc}
   */
  vpc: Vpc;
  /**
   * Define the database configuration
   * @type {DBConfig}
   */
  dbConfig: DBConfig;
};

export type LbConfig = {
  /**
   * Define the port on which the listener listens for requests.
   * @type {number}
   */
  listenerPort: number;
  /**
   * Define the port that the LB uses when performing health checks on the targets
   * @type {string}
   */
  healthCheckPath: string;
  /**
   * Define the port on which the target receives traffic in the LB
   * @type {number}
   */
  targetPort: number;
};

export interface AppConfig {
  /**
   * Define the arn of ACMs
   * @type {AcmCertificateArn}
   */
  acmCertificateArn: AcmCertificateArn;
  /**
   * Define the details of a task definition run on a Fargate cluster
   * @type {FargateTaskDefinitionProps}
   */
  fargateTaskDefinition: FargateTaskDefinitionProps;
  /**
   * Define the properties for the ApplicationLoadBalancedFargateService service
   * @type {ApplicationLoadBalancedFargateServiceProps}
   */
  fargateService: ApplicationLoadBalancedFargateServiceProps;
  /**
   * Define the Runtime Platform in a fargate
   * @type {RuntimePlatform}
   */
  runtimePlatform: RuntimePlatform;
  /**
   * Define the properties of LB
   * @type {LbConfig}
   */
  nlbConfig: LbConfig;
  /**
   * Define the port mappings to add to the container definition
   * @type {PortMapping[]}
   */
  portMapping: PortMapping[];
  /**
   * Define the image path for pushing it in ECR
   * @type {string}
   */
  imagePath: string;
}

export type Corp = {
  /**
   * Define the corp name
   * @type {string}
   */
  name: string;
  /**
   * Define whether creating the dedicated NLB for the corp
   * @type {boolean}
   */
  dedicated: boolean;
  /**
   * Define the arn of ACM if the dedicated is true
   * @type {string}
   */
  acmCertificateArn?: string;
  /**
   * Define the properties overriding the default DB config
   * @type {OverridDbConfig}
   */
  overrideDbConfig?: OverridDbConfig;
};

export type ManageKeycloak = {
  /**
   * Define what class and generation of instance to use in the bastion
   * @type {InstanceClass}
   */
  instanceClass: InstanceClass;
  /**
   * Define what size of instance to use in the bastion
   * @type {InstanceSize}
   */
  instanceSize: InstanceSize;
  /**
   * Define the machine image to use in the bastion
   * @type {IMachineImage}
   */
  machineImage: IMachineImage;
  name: string;
};

export type KeycloakConfig = {
  /**
   * Define the vpc where the keycloak is deployed
   * @type {Vpc}
   */
  vpc: Vpc;
  /**
   * Define the Keycloak database configuration
   * @type {DBConfig}
   */
  dbConfig: DBConfig;
  /**
   * Define the Keycloak app configuration
   * @type {AppConfig}
   */
  appConfig: AppConfig;
};

export type AdSampleConfig = {
  vpc: Vpc;
  name: string;
  allowedCidrs: string[];
};

export type MigrationConfig = {
  path: string;
  vpc: Vpc;
  secrets: ISecret;
  rdsProxy: DatabaseProxy;
  lambdaSg: SecurityGroup;
};
