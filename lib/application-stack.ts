import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { EcsProps, EcsApp } from './constructs/ecsApp';
import { ECR } from './constructs/ecr';

export interface ApplicationStackProps extends NestedStackProps, EcsProps {}

export class ApplicationStack extends NestedStack {
  public readonly ecsApp: EcsApp;
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    const ecr = new ECR(this, `${id}-repo`, {
      tag: props.aliasTag,
      path: props.imagePath,
    });

    const repository = ecr.repository;

    const ecsAppProps = { ...props, ...{ repository } };
    this.ecsApp = new EcsApp(this, `${id}-ecsApp`, ecsAppProps);
  }
}
