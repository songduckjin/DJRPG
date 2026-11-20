import { createClient } from '@libsql/client/web';
import { configureDatabase } from '../../server/database-config.mjs';
import { shopEndpoint } from '../../server/endpoints/shop.mjs';

configureDatabase(createClient);
export const onRequest = context => shopEndpoint(context.request, { env: context.env });
