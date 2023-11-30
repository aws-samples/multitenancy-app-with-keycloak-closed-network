import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { AdStack, AdStackProps } from './constructs/ad';

export interface AdSampleStackProps extends NestedStackProps, AdStackProps {}

export class AdSampleStack extends NestedStack {
  public readonly adEnv: AdStack;
  constructor(scope: Construct, id: string, props: AdSampleStackProps) {
    super(scope, id, props);

    this.adEnv = new AdStack(this, `${id}-ad`, {
      vpc: props.vpc,
      name: props.name,
    });
  }
}
