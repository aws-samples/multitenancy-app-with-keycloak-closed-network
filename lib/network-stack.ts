import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpointAwsService,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import { NagSuppressions } from 'cdk-nag';
import { PrivateHostedZone } from 'aws-cdk-lib/aws-route53';
import { NetworkProps, Network } from './constructs/network';

export interface NetworkStackProps extends NestedStackProps, NetworkProps {
  adEnv: boolean;
  zoneName?: string;
}
export class NetworkStack extends NestedStack {
  public readonly network: Network;
  public readonly zone: PrivateHostedZone;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    // Create the network related services
    this.network = new Network(this, id, props);

    const subnets = this.network.vpc.isolatedSubnets;

    // Create VPC Endpoint
    if (!props.adEnv) {
      const ecrEp = this.network.vpc.addInterfaceEndpoint('ecrEndpoint', {
        service: InterfaceVpcEndpointAwsService.ECR,
        subnets: {
          subnets,
        },
      });

      const ecrDkrEp = this.network.vpc.addInterfaceEndpoint('ecr-dkrEndpoint', {
        service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
        subnets: {
          subnets,
        },
      });
      const cwLogsEp = this.network.vpc.addInterfaceEndpoint('cwLogs', {
        service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        subnets: {
          subnets,
        },
      });
      const secretsManageEp = this.network.vpc.addInterfaceEndpoint('secretsManage', {
        service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        subnets: {
          subnets,
        },
      });

      NagSuppressions.addResourceSuppressions(
        [ecrEp, ecrDkrEp, cwLogsEp, secretsManageEp],
        [
          {
            id: 'CdkNagValidationFailure',
            reason: 'https://github.com/cdklabs/cdk-nag/issues/817',
          },
        ],
        true
      );
    }

    this.zone = new PrivateHostedZone(this, `${id}-PrivateHostedZone`, {
      zoneName: props.zoneName!,
      vpc: this.network.vpc,
    });

    this.network.vpc.addGatewayEndpoint('s3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    const ssmMsgEp = this.network.vpc.addInterfaceEndpoint('ssmMsg', {
      service: InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: {
        subnets,
      },
    });

    const ssmEp = this.network.vpc.addInterfaceEndpoint('ssm', {
      service: InterfaceVpcEndpointAwsService.SSM,
      subnets: {
        subnets,
      },
    });

    const ec2MsgEp = this.network.vpc.addInterfaceEndpoint('ec2Msg', {
      service: InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      subnets: {
        subnets,
      },
    });

    NagSuppressions.addResourceSuppressions(
      [ssmMsgEp, ssmEp, ec2MsgEp],
      [{ id: 'CdkNagValidationFailure', reason: 'https://github.com/cdklabs/cdk-nag/issues/817' }],
      true
    );
  }
}
