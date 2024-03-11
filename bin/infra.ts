#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import * as path from 'path';
import {
  InstanceClass,
  InstanceSize,
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointService,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  WindowsVersion,
} from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { filter, map } from 'lodash';
import { ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { InterfaceVpcEndpointTarget } from 'aws-cdk-lib/aws-route53-targets';

// Stacks
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { ApplicationStack } from '../lib/application-stack';
import { AdSampleStack } from '../lib/ad-stack';
import { KeycloakAppStack } from '../lib/keycloakApp-stack';
import { MigrationStack } from '../lib/migration-stack';

// Config
import { devConfig } from '../config';
import { Corp } from '../config.types';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage');
const baseConfig = app.node.tryGetContext('base');
const context = app.node.tryGetContext(stage);

const tags = {
  environment: stage,
  appName: context.appName,
  stageAlias: context.alias,
};

interface CorpList extends Corp {
  stack?: NetworkStack;
}

export const config = (baseConfig: any) => {
  const account = baseConfig.deployAwsEnv?.accountId || process.env.CDK_DEFAULT_ACCOUNT;
  const region =
    baseConfig.deployAwsEnv?.region || process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION;
  if (!account || !region) {
    throw new Error('Wrong config');
  }
  return { account, region };
};

class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Network
    const multitenancyNetwork = new NetworkStack(
      this,
      'MultitenancyNetwork',
      devConfig.networkConfig
    );
    let coprList: CorpList[] = devConfig.nuxtApp.corpList;
    devConfig.nuxtApp.corpList.map((corp: Corp, index: number) => {
      let num = index + 1;
      const networkStack = new NetworkStack(this, `${corp.name}Network`, {
        ...devConfig.networkConfig,
        cidr: `10.${num}.0.0/16`,
        adEnv: true,
      });
      coprList[index].stack = networkStack;
      return;
    });

    // Create Database
    const nuxtAppDbs = devConfig.nuxtApp.corpList.map((configValue: CorpList) => {
      return new DatabaseStack(this, `${configValue.name}-NuxtDatabase`, {
        ...devConfig.nuxtApp.dbConfig,
        ...configValue.overrideDbConfig,
        vpc: multitenancyNetwork.network.vpc,
        parameterName: !configValue.overrideDbConfig?.parameterName
          ? `${configValue.name}-${devConfig.nuxtApp.dbConfig.parameterName}`
          : configValue.overrideDbConfig.parameterName,
      });
    });

    const nuxtTaskRoleResources: string[] = [];
    nuxtAppDbs.map((dbValue) => {
      nuxtTaskRoleResources.push(dbValue.parameterStore!.parameterArn);
    });

    // To avoid circular dependency, put on the role
    const nuxtTaskRole = new Role(this, 'nuxtTaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add SSM permission to nuxt taskRole
    nuxtTaskRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: nuxtTaskRoleResources,
        actions: ['ssm:GetParameter'],
      })
    );

    // Add Secrets Manager permission to nuxt taskRole
    nuxtAppDbs.map((stack: DatabaseStack) => {
      stack.auroraServerlessV2.dbSecrets.grantRead(nuxtTaskRole);
      stack.auroraServerlessV2.dbProxy!.grantConnect(
        nuxtTaskRole,
        stack.auroraServerlessV2.dbUserName || 'dbadmin'
      );
    });

    // Create Keycloak app
    const keycloakApp = new KeycloakAppStack(this, 'KeycloakApp', {
      dbConfig: {
        ...devConfig.keyCloakApp.dbConfig,
      },
      appConfig: {
        ...devConfig.keyCloakApp.appConfig,
        vpc: multitenancyNetwork.network.vpc,
        zonename: devConfig.networkConfig.zoneName,
        alternativeNames: '',
        aliasTag: 'keycloak',
        zone: multitenancyNetwork.zone,
      },
      manageKeycloak: {
        name: 'keycloak-manage-instance',
        machineImage: MachineImage.latestWindows(
          WindowsVersion.WINDOWS_SERVER_2022_ENGLISH_FULL_BASE
        ),
        instanceClass: InstanceClass.T3,
        instanceSize: InstanceSize.MEDIUM,
      },
    });

    NagSuppressions.addStackSuppressions(keycloakApp, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Create the lambda resouce automatically',
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'Create the lambda resouce automatically',
      },
    ]);

    // Create Nuxt3 app
    const nuxtApp = new ApplicationStack(this, 'nuxtApp', {
      ...devConfig.nuxtApp.appConfig,
      fargateTaskDefinition: {
        ...devConfig.nuxtApp.appConfig.fargateTaskDefinition,
        // To avoid circular dependency, define nuxtTaskRole from the role arn
        taskRole: Role.fromRoleArn(this, 'taskRole', nuxtTaskRole.roleArn),
      },
      vpc: multitenancyNetwork.network.vpc,
      zonename: devConfig.networkConfig.zoneName,
      alternativeNames: '*.',
      aliasTag: 'nuxt3',
    });

    NagSuppressions.addStackSuppressions(nuxtApp, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Create the lambda resouce automatically',
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'Create the lambda resouce automatically',
      },
    ]);

    nuxtAppDbs.map((stack: DatabaseStack) => {
      stack.auroraServerlessV2.dbProxySg!.addIngressRule(
        nuxtApp.ecsApp.ecsSg,
        Port.tcp(stack.auroraServerlessV2.dbPort)
      );
    });

    //  NLB + PrivateLink for Keycloack
    const keycloakEpService = keycloakApp.ecsApp.addEpService(
      `keycloak.${devConfig.networkConfig.zoneName}`
    );

    map(coprList, (corp: CorpList) => {
      const zone = corp.stack!.zone;
      const vpc = corp.stack!.network.vpc;
      return {
        zone,
        vpc,
      };
    });

    coprList.map((corp: CorpList, index: number) => {
      const privateLinkSg = new SecurityGroup(this, `PrivateLinkSgKeycloakEp-${corp.name}`, {
        vpc: corp.stack!.network.vpc,
      });
      privateLinkSg.addIngressRule(Peer.anyIpv4(), Port.tcp(443));
      const endpoint = new InterfaceVpcEndpoint(this, `KeycloakEp-${corp.name}`, {
        vpc: corp.stack!.network.vpc,
        service: new InterfaceVpcEndpointService(keycloakEpService.vpcEndpointServiceName, 443),
        securityGroups: [privateLinkSg],
        privateDnsEnabled: false,
      });

      new ARecord(this, `KeycloakAR-${corp.name}`, {
        zone: corp.stack!.zone,
        target: RecordTarget.fromAlias(new InterfaceVpcEndpointTarget(endpoint)),
        recordName: `keycloak.${devConfig.networkConfig.zoneName}`,
      });
      NagSuppressions.addResourceSuppressions(privateLinkSg, [
        {
          id: 'AwsSolutions-EC23',
          reason: 'Restriced access to the endpoint from private link',
        },
      ]);
    });

    // Filter the networkList
    const nonDedicatedList = filter(coprList, ['dedicated', false]);
    const dedicatedList = filter(coprList, 'dedicated');

    // Create Non-Dedicated NLB + Private Link
    const nuxtAppEpService = nuxtApp.ecsApp.addEpService(
      `*.nuxt3.${devConfig.networkConfig.zoneName}`
    );

    nonDedicatedList.map((corp: CorpList, index: number) => {
      const privateLinkSg = new SecurityGroup(this, `PrivateLinkSgNuxt3Ep-${corp.name}`, {
        vpc: corp.stack!.network.vpc,
      });
      privateLinkSg.addIngressRule(Peer.anyIpv4(), Port.tcp(443));
      const endpoint = new InterfaceVpcEndpoint(this, `Nuxt3Ep-${corp.name}`, {
        vpc: corp.stack!.network.vpc,
        service: new InterfaceVpcEndpointService(nuxtAppEpService.vpcEndpointServiceName, 443),
        securityGroups: [privateLinkSg],
        privateDnsEnabled: false,
      });

      new ARecord(this, `Nuxt3AR-${corp.name}`, {
        zone: corp.stack!.zone,
        target: RecordTarget.fromAlias(new InterfaceVpcEndpointTarget(endpoint)),
        recordName: `*.nuxt3.${devConfig.networkConfig.zoneName}`,
      });
      NagSuppressions.addResourceSuppressions(privateLinkSg, [
        {
          id: 'AwsSolutions-EC23',
          reason: 'Restriced access to the endpoint from private link',
        },
      ]);
    });

    // Create Dedicated NLB + Private Link
    dedicatedList.map((corp: CorpList) => {
      const subDomain = `${corp.name}-corp`;
      const nlb = nuxtApp.ecsApp.addDedicatedNLB(
        multitenancyNetwork.network.vpc,
        subDomain,
        corp.acmCertificateArn!,
        devConfig.nuxtApp.appConfig.nlbConfig
      );
      const nlbNuxtAppEpService = nuxtApp.ecsApp.addEpService(
        `${subDomain}.${devConfig.networkConfig.zoneName}`,
        nlb
      );

      dedicatedList.map((corp: CorpList, index: number) => {
        const privateLinkSg = new SecurityGroup(this, `PrivateLinkSgNuxt3Ep-${corp.name}`, {
          vpc: corp.stack!.network.vpc,
        });
        privateLinkSg.addIngressRule(Peer.anyIpv4(), Port.tcp(443));
        const endpoint = new InterfaceVpcEndpoint(this, `Nuxt3Ep-${corp.name}`, {
          vpc: corp.stack!.network.vpc,
          service: new InterfaceVpcEndpointService(nlbNuxtAppEpService.vpcEndpointServiceName, 443),
          securityGroups: [privateLinkSg],
          privateDnsEnabled: false,
        });

        new ARecord(this, `Nuxt3AR-${corp.name}`, {
          zone: corp.stack!.zone,
          target: RecordTarget.fromAlias(new InterfaceVpcEndpointTarget(endpoint)),
          recordName: `${subDomain}.${devConfig.networkConfig.zoneName}`,
        });
        NagSuppressions.addResourceSuppressions(privateLinkSg, [
          {
            id: 'AwsSolutions-EC23',
            reason: 'Restriced access to the endpoint from private link',
          },
        ]);
      });
    });

    // // Create AD instance
    const adStacks = coprList.map((corp: CorpList, index: number) => {
      const adStack = new AdSampleStack(this, `AdSample${index}`, {
        vpc: corp.stack!.network.vpc,
        name: `${corp.name}-corp-ad-demo`,
      });
      const privateLinkSg = new SecurityGroup(this, `${corp.name}-privateLink-Sg`, {
        vpc: multitenancyNetwork.network.vpc,
      });
      privateLinkSg.addIngressRule(Peer.anyIpv4(), Port.tcp(389));

      NagSuppressions.addResourceSuppressions(privateLinkSg, [
        {
          id: 'AwsSolutions-EC23',
          reason: 'Restriced access to the endpoint from private link',
        },
      ]);
      const endpoint = new InterfaceVpcEndpoint(this, `${corp.name}-vpcEndpoint`, {
        vpc: multitenancyNetwork.network.vpc,
        service: new InterfaceVpcEndpointService(
          adStack.adEnv.vpcEndpointService.vpcEndpointServiceName,
          389
        ),
        securityGroups: [privateLinkSg],
        privateDnsEnabled: false,
      });
      new cdk.CfnOutput(this, `KeycloakLdapFor${corp.name.toUpperCase()}Corp`, {
        exportName: `KeycloakLdapFor${corp.name}Corp`,
        value: cdk.Fn.select(
          1,
          cdk.Fn.split(':', cdk.Fn.select(0, endpoint.vpcEndpointDnsEntries))
        ),
      });
      return adStack;
    });

    // DB Migration
    const lambdaSg = new SecurityGroup(this, 'migrationLambdaSg', {
      vpc: multitenancyNetwork.network.vpc,
    });

    nuxtAppDbs.map((stack: DatabaseStack) => {
      stack.auroraServerlessV2.dbProxySg!.addIngressRule(
        lambdaSg,
        Port.tcp(stack.auroraServerlessV2.dbPort)
      );
    });

    const lambda = new MigrationStack(this, 'MigrationLambda', {
      vpc: multitenancyNetwork.network.vpc,
      lambdaSg: lambdaSg,
      path: path.join(__dirname, '../lambda/migrationJob.ts'),
    });
    nuxtAppDbs.map((stack: DatabaseStack, index: number) => {
      lambda.migrationDbLambda.lambda.addEnvironment(
        `SECRETS_ARN_${index}`,
        stack.auroraServerlessV2.dbSecrets.secretArn
      );
      lambda.migrationDbLambda.lambda.addEnvironment(
        `PROXY_ENDPOINT_${index}`,
        stack.auroraServerlessV2.dbProxy!.endpoint
      );
      stack.auroraServerlessV2.dbSecrets.grantRead(lambda.migrationDbLambda.lambda.role!);
      stack.auroraServerlessV2.dbProxy!.grantConnect(
        lambda.migrationDbLambda.lambda.role!,
        stack.auroraServerlessV2.dbUserName || 'dbadmin'
      );
    });
    adStacks.map((adStack: AdSampleStack) => {
      new cdk.CfnOutput(this, `${adStack.adEnv.key.keyName}corpAdkKeyId`, {
        exportName: `${adStack.adEnv.key.keyName}CorpAdkKeyId`,
        value: adStack.adEnv.key.attrKeyPairId,
      });
    });
    new cdk.CfnOutput(this, `KeyclaokManagedInstanceKeyId`, {
      exportName: 'KeyclaokManagedInstanceKeyId',
      value: keycloakApp.key.attrKeyPairId,
    });
    new cdk.CfnOutput(this, 'migrationLambdaCommand', {
      exportName: 'InvokeLambdaCommand',
      value: `aws lambda invoke --function-name ${lambda.migrationDbLambda.lambda.functionName} --cli-binary-format raw-in-base64-out --payload file://lambda/payload.json response.json --profile <Your profile>`,
    });
  }
}
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
new InfraStack(app, `${devConfig.base.alias}-${stage}-${context.appName}-InfraStack`, {
  env: config(baseConfig),
  tags: tags,
  description: 'Infrastack for multitenancy application (uksb-1tupboc59).',
  synthesizer: new cdk.DefaultStackSynthesizer({
    qualifier: `${devConfig.base.alias.slice(0, 5)}${stage.slice(0, 5)}`,
  }),
});
