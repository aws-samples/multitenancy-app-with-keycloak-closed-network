import { RemovalPolicy } from 'aws-cdk-lib';
import {
  BlockDeviceVolume,
  CfnKeyPair,
  IMachineImage,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  SecurityGroup,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export interface Ec2InstanceProps {
  vpc: Vpc;
  instanceClass: InstanceClass;
  instanceSize: InstanceSize;
  machineImage: IMachineImage;
  name: string;
}

export class Ec2Instance extends Construct {
  public readonly key: CfnKeyPair;
  constructor(scope: Construct, id: string, props: Ec2InstanceProps) {
    super(scope, id);

    this.key = new CfnKeyPair(this, 'adKey', {
      keyName: `${props.name}-key`,
    });
    this.key.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const ec2Sg = new SecurityGroup(this, 'Security group for EC2', {
      vpc: props.vpc,
    });

    // For fleet  Manager
    const instanceRole = new Role(this, 'InstanceRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
    });
    instanceRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'ssm:DescribeAssociation',
          'ssm:GetDeployablePatchSnapshotForInstance',
          'ssm:GetDocument',
          'ssm:DescribeDocument',
          'ssm:GetManifest',
          'ssm:GetParameter',
          'ssm:GetParameters',
          'ssm:ListAssociations',
          'ssm:ListInstanceAssociations',
          'ssm:PutInventory',
          'ssm:PutComplianceItems',
          'ssm:PutConfigurePackageResult',
          'ssm:UpdateAssociationStatus',
          'ssm:UpdateInstanceAssociationStatus',
          'ssm:UpdateInstanceInformation',
        ],
        resources: ['*'],
      })
    );
    instanceRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
        ],
        resources: ['*'],
      })
    );
    instanceRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'ec2messages:AcknowledgeMessage',
          'ec2messages:DeleteMessage',
          'ec2messages:FailMessage',
          'ec2messages:GetEndpoint',
          'ec2messages:GetMessages',
          'ec2messages:SendReply',
        ],
        resources: ['*'],
      })
    );
    NagSuppressions.addResourceSuppressions(
      instanceRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Use this role for only fleet manager access',
          appliesTo: ['Resource::*'],
        },
      ],
      true
    );

    const instance = new Instance(this, 'ec2', {
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.vpc.isolatedSubnets,
      },
      instanceType: InstanceType.of(props.instanceClass, props.instanceSize),
      machineImage: props.machineImage,
      securityGroup: ec2Sg,
      role: instanceRole,
      instanceName: props.name,
      keyName: this.key.keyName,
      detailedMonitoring: true,
      blockDevices: [
        {
          volume: BlockDeviceVolume.ebs(30, {
            encrypted: true,
          }),
          deviceName: '/dev/sda1',
        },
      ],
    });
    NagSuppressions.addResourceSuppressions(instance, [
      {
        id: 'AwsSolutions-EC29',
        reason: 'No need to attach ASG due to the bastion instance',
      },
    ]);
  }
}
