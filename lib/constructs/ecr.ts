import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

import * as imagedeploy from 'cdk-docker-image-deployment';
import { NagSuppressions } from 'cdk-nag';

interface EcrProps extends StackProps {
  tag: string;
  path: string;
}
export class ECR extends Construct {
  public readonly repository: Repository;
  constructor(scope: Construct, id: string, props: EcrProps) {
    super(scope, id);
    this.repository = new Repository(this, 'ecr', {
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteImages: true,
    });

    const dockerImageDeployment = new imagedeploy.DockerImageDeployment(this, 'deployDockerImage', {
      source: imagedeploy.Source.directory(props.path),
      destination: imagedeploy.Destination.ecr(this.repository, {
        tag: props.tag,
      }),
    });

    NagSuppressions.addResourceSuppressions(
      dockerImageDeployment,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Create the Lambda and codebuild iam role for this automatically',
        },
        { id: 'AwsSolutions-CB3', reason: 'Create Codebuild automatically' },
        { id: 'AwsSolutions-CB4', reason: 'Create Codebuild automatically' },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Create the Lambda automatically',
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'Create the Lambda automatically',
        },
      ],
      true
    );
  }
}
