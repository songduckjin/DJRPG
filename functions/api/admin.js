import { createClient } from '@libsql/client/web';
import { configureDatabase } from '../../server/database-config.mjs';
import { adminEndpoint } from '../../server/endpoints/admin.mjs';

configureDatabase(createClient);
export const onRequest = context => adminEndpoint(context.request, { env: context.env });
