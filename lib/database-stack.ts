import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

import { AuroraServerlessV2, AuroraServerlessV2Props } from './constructs/auroraServerlessV2';

export interface DatabaseStackProps extends NestedStackProps, AuroraServerlessV2Props {
  parameterName: string;
}

export class DatabaseStack extends NestedStack {
  public readonly auroraServerlessV2: AuroraServerlessV2;
  public readonly parameterStore: StringParameter | undefined;
  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.auroraServerlessV2 = new AuroraServerlessV2(this, `${id}-aurorav2`, {
      vpc: props.vpc,
      engine: props.engine,
      v2MaxCapacity: props.v2MaxCapacity,
      v2MinCapacity: props.v2MinCapacity,
      metricDuration: props.metricDuration,
      databaseCapacityOption: props.databaseCapacityOption,
      acuUtilOption: props.acuUtilOption,
      dbUserName: props.dbUserName,
      dbname: props.dbname,
      enableProxy: props.enableProxy,
      port: props.port,
    });

    if (props.enableProxy) {
      const paramValue = JSON.stringify({
        proxy: this.auroraServerlessV2.dbProxy?.endpoint,
        secretArn: this.auroraServerlessV2.dbSecrets.secretFullArn,
      });
      this.parameterStore = new StringParameter(this, `${id}-stringParam`, {
        parameterName: props.parameterName,
        stringValue: paramValue,
      });
    }
  }
}
