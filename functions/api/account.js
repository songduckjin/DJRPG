import { createClient } from '@libsql/client/web';
import { configureDatabase } from '../../server/database-config.mjs';
import { accountEndpoint } from '../../server/endpoints/account.mjs';

configureDatabase(createClient);
export const onRequest = context => accountEndpoint(context.request, { env: context.env });
