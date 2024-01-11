import pg from 'pg';
import * as fs from 'fs';
import rds_signer from '@aws-sdk/rds-signer';
import ssm from '@aws-sdk/client-ssm';
import secrets from '@aws-sdk/client-secrets-manager';
import { Kysely, PostgresDialect } from 'kysely';
import { useKeycloakStore } from '../../stores/keycloakStore';
import { storeToRefs } from 'pinia';
import { Database, PostTable } from '../../types/db/types';
const { Signer } = rds_signer;
const { SSMClient, GetParameterCommand } = ssm;
const { SecretsManagerClient, GetSecretValueCommand } = secrets;

interface DbParams {
  proxy: string;
  secretArn: string;
}
interface SecretParams {
  dbname: string;
  port: string;
  username: string;
  host?: string;
}
const runtimeConfig = useRuntimeConfig();

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  console.log(body);
  const region = runtimeConfig.awsRegion;
  const ssmClient = new SSMClient({ region: region });
  const secretsClient = new SecretsManagerClient({ region: region });
  const ssmInput = {
    Name: `${event.context.subdomain}`,
  };
  const result = await ssmClient.send(new GetParameterCommand(ssmInput));
  const dbParams: DbParams = JSON.parse(result.Parameter.Value);
  const getSecretsValueInput = {
    SecretId: `${dbParams.secretArn}`,
  };
  const secretsResult = await secretsClient.send(new GetSecretValueCommand(getSecretsValueInput));
  const secretParams: SecretParams = JSON.parse(secretsResult.SecretString);
  const signer = new Signer({
    region: region,
    hostname: dbParams.proxy,
    port: secretParams.port,
    username: secretParams.username,
  });

  const token = await signer.getAuthToken({
    username: secretParams.username,
  });

  const dbConfig = {
    user: secretParams.username,
    password: token,
    port: secretParams.port,
    database: secretParams.dbname,
    host: dbParams.proxy,
    ssl: {
      ca: fs.readFileSync('/app/server/api/AmazonRootCA1.pem'),
    },
  };

  const dialect = new PostgresDialect({
    pool: new pg.Pool(dbConfig),
  });

  console.log(dialect);

  const db = new Kysely<Database>({
    dialect,
  });

  console.log(db);
  const res = addPost(db, body);
  console.log(res);
  return res;
});

export async function addPost(db: Kysely<Database>, body: PostTable) {
  const res = await db
    .insertInto('posts')
    .values({
      title: body.title,
      description: body.description,
    })
    .executeTakeFirst();
  console.log(res);
  return res;
}
