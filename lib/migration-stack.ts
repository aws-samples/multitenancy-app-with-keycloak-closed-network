import { Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Architecture, LambdaInsightsVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { NodeJsFunction } from './constructs/nodeJsFunction';

import * as path from 'path';
export interface MigrationProps extends NestedStackProps {
  vpc: Vpc;
  path: string;
  lambdaSg: SecurityGroup;
}

export class MigrationStack extends NestedStack {
  public readonly migrationDbLambda: NodeJsFunction;
  constructor(scope: Construct, id: string, props: MigrationProps) {
    super(scope, id, props);
    this.migrationDbLambda = new NodeJsFunction(this, `${id}-databaseMigration`, {
      lambdaProps: {
        runtime: Runtime.NODEJS_18_X,
        architecture: Architecture.ARM_64,
        memorySize: 128,
        insightsVersion: LambdaInsightsVersion.VERSION_1_0_119_0,
        vpc: props.vpc,
        handler: 'handler',
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [props.lambdaSg],
        functionName: `${id}-lambda`.slice(0, 64),
        timeout: Duration.seconds(30),
        entry: props.path,
        depsLockFilePath: path.join(__dirname, '../lambda/package-lock.json'),
        environment: {
          REGION: Stack.of(this).region,
        },
        bundling: {
          nodeModules: ['pg', 'lodash', 'kysely'],
          externalModules: ['@aws-sdk/rds-signer', '@aws-sdk/client-secrets-manager'],
          // commandHooks: {
          //   beforeBundling() {
          //     return [];
          //   },
          //   afterBundling(inputDir: string, outputDir: string): string[] {
          //     return [
          //       `esbuild ${inputDir}/sql/migrationsTs/migration.ts --bundle --outfile=${inputDir}/sql/migrations/migration.js`,
          //       `cp -r ${inputDir}/sql/migrations ${outputDir}`,
          //     ];
          //   },
          //   beforeInstall() {
          //     return [];
          //   },
          // },
        },
      },
    });
    // props.secrets.grantRead(this.migrationDbLambda.lambda.role!);
  }
}
