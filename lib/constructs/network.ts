import { RemovalPolicy } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  FlowLogDestination,
  FlowLogTrafficType,
  SubnetType,
  Vpc,
  VpcProps,
  IpAddresses,
} from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { isEmpty } from 'lodash';

export interface NetworkProps {
  maxAzs: number;
  cidr: string;
  cidrMask: number;
  publicSubnet?: boolean;
  isolatedSubnet?: boolean;
  natSubnet?: boolean;
}

export class Network extends Construct {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);
    // Vpc logging - 60 days
    const cwLogs = new LogGroup(this, `${id}-vpc-logs`, {
      logGroupName: `/vpc/${id}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.TWO_MONTHS,
    });

    const subnetConfiguration: VpcProps['subnetConfiguration'] = [];

    if (props.publicSubnet) {
      subnetConfiguration.push({
        cidrMask: props.cidrMask,
        name: `${id}-public-subnet`,
        subnetType: SubnetType.PUBLIC,
      });
    }

    if (props.natSubnet) {
      subnetConfiguration.push({
        cidrMask: props.cidrMask,
        name: `${id}-private-subnet`,
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      });
    }

    if (props.isolatedSubnet) {
      subnetConfiguration.push({
        cidrMask: props.cidrMask,
        name: `${id}-isolated-subnet`,
        subnetType: SubnetType.PRIVATE_ISOLATED,
      });
    }

    if (isEmpty(subnetConfiguration)) {
      throw new Error('No subnet configuration enabled');
    }

    // Create VPC - Private and public subnets
    this.vpc = new Vpc(this, 'vpc', {
      ipAddresses: IpAddresses.cidr(props.cidr),
      subnetConfiguration,
      maxAzs: props.maxAzs,
      flowLogs: {
        s3: {
          destination: FlowLogDestination.toCloudWatchLogs(cwLogs),
          trafficType: FlowLogTrafficType.ALL,
        },
      },
    });
  }
}
