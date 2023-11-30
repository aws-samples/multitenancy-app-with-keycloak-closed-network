/*
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib';

export class NodeJsFunction extends Construct {
  public readonly lambda: NodejsFunction;
  constructor(scope: Construct, id: string, props: { lambdaProps: NodejsFunctionProps }) {
    super(scope, id);

    const lambdaRole = new Role(this, `${id}-LambdaRole`, {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    lambdaRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [
          `arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:log-group:/aws/lambda/${
            props.lambdaProps.functionName
          }:*`,
        ],
      })
    );
    lambdaRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DeleteNetworkInterface',
          'ec2:AssignPrivateIpAddresses',
          'ec2:UnassignPrivateIpAddresses',
        ],
        resources: ['*'],
      })
    );
    this.lambda = new NodejsFunction(this, `${id}`, {
      ...props.lambdaProps,
      role: lambdaRole,
    });

    NagSuppressions.addResourceSuppressions(
      [lambdaRole],
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Create lambdaInsight Policy automatically',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy',
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Need the policy for vpc Lambda',
          appliesTo: [`Resource::*`],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Suppress the policy for cloudwatch logs',
          appliesTo: [
            {
              regex: '/^Resource::arn:aws:logs:(.*):\\*$/g',
            },
          ],
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      this.lambda,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'Used node v18 instead of the',
        },
      ],
      true
    );
  }
}
