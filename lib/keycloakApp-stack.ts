import { Construct } from 'constructs';
import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { CfnKeyPair, Port } from 'aws-cdk-lib/aws-ec2';
import { PrivateHostedZone } from 'aws-cdk-lib/aws-route53';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

import { AuroraServerlessV2 } from './constructs/auroraServerlessV2';
import { ECR } from './constructs/ecr';
import { EcsApp, EcsProps } from './constructs/ecsApp';
import { Ec2Instance } from './constructs/ec2';
import { DBConfig, ManageKeycloak } from '../config.types';

export interface KeyCloakAppStackConfig extends EcsProps {
  aliasTag: string;
  alternativeNames: string;
  zone: PrivateHostedZone;
}
export interface KeycloakAppStackProps extends NestedStackProps {
  dbConfig: DBConfig;
  appConfig: KeyCloakAppStackConfig;
  manageKeycloak?: ManageKeycloak;
}

export class KeycloakAppStack extends NestedStack {
  public readonly ecsApp: EcsApp;
  public readonly key: CfnKeyPair;
  constructor(scope: Construct, id: string, props: KeycloakAppStackProps) {
    super(scope, id, props);

    // Aurora Serverless v2
    const keycloakDb = new AuroraServerlessV2(this, `${id}-aurora`, {
      vpc: props.appConfig.vpc,
      engine: props.dbConfig.engine,
      v2MaxCapacity: props.dbConfig.v2MaxCapacity,
      v2MinCapacity: props.dbConfig.v2MinCapacity,
      metricDuration: props.dbConfig.metricDuration,
      databaseCapacityOption: props.dbConfig.databaseCapacityOption,
      acuUtilOption: props.dbConfig.acuUtilOption,
      dbUserName: props.dbConfig.dbUserName,
      dbname: props.dbConfig.dbname,
      enableProxy: props.dbConfig.enableProxy,
      port: props.dbConfig.port,
    });
    if (props.dbConfig.enableProxy) {
      const paramValue = JSON.stringify({
        proxy: keycloakDb.dbProxy?.endpoint,
        dbUserName: props.dbConfig.dbUserName,
        dbName: props.dbConfig.dbname,
        port: 5432,
      });
      new StringParameter(this, `${id}-stringParam`, {
        parameterName: props.dbConfig.parameterName,
        stringValue: paramValue,
      });
    }

    // ECR
    const ecr = new ECR(this, `${id}-repo`, {
      tag: props.appConfig.aliasTag,
      path: props.appConfig.imagePath,
    });

    const repository = ecr.repository;
    const ecsAppProps = {
      ...props.appConfig,
      repository: repository,
      dbSecrets: keycloakDb.dbSecrets,
    };

    // ECS application
    this.ecsApp = new EcsApp(this, `${id}-ecsApp`, ecsAppProps);
    keycloakDb.dbSg.addIngressRule(this.ecsApp.ecsSg, Port.tcp(props.dbConfig.port));

    const keycloakManagedInstance = new Ec2Instance(this, `${id}-bastion`, {
      vpc: props.appConfig.vpc,
      instanceClass: props.manageKeycloak!.instanceClass,
      instanceSize: props.manageKeycloak!.instanceSize,
      machineImage: props.manageKeycloak!.machineImage,
      name: props.manageKeycloak!.name,
    });
    this.key = keycloakManagedInstance.key;
  }
}
