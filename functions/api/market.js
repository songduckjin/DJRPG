import { createClient } from '@libsql/client/web';
import { configureDatabase } from '../../server/database-config.mjs';
import { marketEndpoint } from '../../server/endpoints/market.mjs';

configureDatabase(createClient);
export const onRequest = context => marketEndpoint(context.request, { env: context.env });
