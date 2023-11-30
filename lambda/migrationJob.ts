import { Signer } from '@aws-sdk/rds-signer';
import { Handler, Context } from 'aws-lambda';
import { Pool } from 'pg';
import get from 'lodash/get';

import {
  GetSecretValueCommand,
  GetSecretValueCommandOutput,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

import { Kysely, PostgresDialect, sql } from 'kysely';

type Posts = {
  title: string;
  description: string;
};
export const handler: Handler = async (event: any) => {
  console.log(event);
  const client = new SecretsManagerClient({ region: process.env.REGION });
  await Promise.all(
    event.map(async (data: Posts[], index: number) => {
      const command = new GetSecretValueCommand({ SecretId: process.env[`SECRETS_ARN_${index}`] });
      const secret: GetSecretValueCommandOutput = await client.send(command);

      const credentials = JSON.parse(secret.SecretString || '');

      const username = get(credentials, 'username');
      const port = get(credentials, 'port');

      const signer = new Signer({
        region: process.env.REGION,
        hostname: process.env[`PROXY_ENDPOINT_${index}`]!,
        port,
        username,
      });

      const token = await signer.getAuthToken();

      const poolConfig = {
        host: process.env[`PROXY_ENDPOINT_${index}`],
        database: get(credentials, 'dbname'),
        port,
        user: username,
        password: token,
        ssl: true,
      };
      const db = new Kysely({
        dialect: new PostgresDialect({
          pool: new Pool(poolConfig),
        }),
      });

      const res = await checkTables(db);

      if (res.length) {
        await down(db);
      }
      await up(db);
      await insert(db, data);
      await db.destroy();
    })
  );
};

async function up(db: Kysely<any>): Promise<void> {
  console.log('create table');
  await db.schema
    .createTable('posts')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('description', 'varchar')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();
}

async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('posts').execute();
}

async function insert(db: Kysely<any>, values: Posts[]): Promise<void> {
  await db.insertInto('posts').values(values).execute();
}

async function checkTables(db: Kysely<any>) {
  const tables = await db.introspection.getTables({ withInternalKyselyTables: true });
  return tables;
}
