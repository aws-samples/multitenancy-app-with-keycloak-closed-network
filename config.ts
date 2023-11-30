import { AuroraPostgresEngineVersion, DatabaseClusterEngine } from 'aws-cdk-lib/aws-rds';
import { Config } from './config.types';
import { Duration } from 'aws-cdk-lib';
import { CpuArchitecture, OperatingSystemFamily } from 'aws-cdk-lib/aws-ecs';
import path = require('path');
export const devConfig: Config = {
  base: {
    alias: 'hkoizum',
  },
  networkConfig: {
    cidr: '10.0.0.0/16',
    cidrMask: 24,
    publicSubnet: false,
    natSubnet: false,
    isolatedSubnet: true,
    maxAzs: 2,
    zoneName: 'multitenancy.com',
    adEnv: false,
  },
  keyCloakApp: {
    dbConfig: {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_15_2,
      }),
      v2MaxCapacity: 32,
      v2MinCapacity: 0.5,
      metricDuration: Duration.minutes(10),
      databaseCapacityOption: {
        threshold: 1.5,
        evaluationPeriods: 3,
      },
      acuUtilOption: {
        threshold: 90,
        evaluationPeriods: 3,
      },
      dbUserName: 'awsdemo',
      dbname: 'awssample',
      port: 5432,
      parameterName: 'keycloak',
      enableProxy: false,
    },
    appConfig: {
      acmCertificateArn: {
        service:
          'arn:aws:acm:ap-northeast-1:123456789012:certificate/8980a069-827b-4c74-9833-9522c3f32962',
        keycloackForAdmin:
          'arn:aws:acm:ap-northeast-1:123456789012:certificate/914aa0f1-ff3e-4b30-9300-7345dad453a7',
      },
      fargateTaskDefinition: {
        cpu: 1024,
        memoryLimitMiB: 2048,
      },
      fargateService: {
        desiredCount: 1,
        enableExecuteCommand: true,
      },
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.ARM64,
      },
      nlbConfig: {
        listenerPort: 443,
        healthCheckPath: '/health',
        targetPort: 8080,
      },
      portMapping: [
        {
          hostPort: 8080,
          containerPort: 8080,
        },
        {
          hostPort: 7800,
          containerPort: 7800,
        },
      ],
      imagePath: path.join(__dirname, './', 'docker/keycloak'),
    },
  },
  nuxtApp: {
    corpList: [
      {
        name: 'a',
        dedicated: false,
        overrideDbConfig: {
          dbUserName: 'acorpdemo',
          dbname: 'acorpsample',
          parameterName: 'a-corp',
        },
      },
      {
        name: 'b',
        dedicated: false,
        overrideDbConfig: {
          dbUserName: 'bcorpdemo',
          dbname: 'bcorpsample',
          parameterName: 'b-corp',
        },
      },
      {
        name: 'c',
        dedicated: true,
        acmCertificateArn:
          'arn:aws:acm:ap-northeast-1:123456789012:certificate/815d888f-89c9-4411-b8f5-d790a187c18f',
        overrideDbConfig: {
          dbUserName: 'ccorpdemo',
          dbname: 'ccorpsample',
          parameterName: 'c-corp',
        },
      },
    ],

    dbConfig: {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_15_2,
      }),
      v2MaxCapacity: 32,
      v2MinCapacity: 0.5,
      metricDuration: Duration.minutes(10),
      databaseCapacityOption: {
        threshold: 1.5,
        evaluationPeriods: 3,
      },
      acuUtilOption: {
        threshold: 90,
        evaluationPeriods: 3,
      },
      dbUserName: 'corpdemo',
      dbname: 'corpsample',
      port: 5432,
      parameterName: 'corp',
      enableProxy: true,
    },
    appConfig: {
      acmCertificateArn: {
        service:
          'arn:aws:acm:ap-northeast-1:123456789012:certificate/dc2cf171-3a0a-48ef-a3aa-458bf2c375de',
      },
      fargateTaskDefinition: {
        cpu: 1024,
        memoryLimitMiB: 2048,
      },
      fargateService: {
        desiredCount: 1,
        enableExecuteCommand: true,
      },
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.ARM64,
      },
      nlbConfig: {
        listenerPort: 443,
        healthCheckPath: '/',
        targetPort: 3000,
      },
      portMapping: [
        {
          hostPort: 3000,
          containerPort: 3000,
        },
      ],
      imagePath: path.join(__dirname, './', 'docker/nuxtjs'),
    },
  },
};
