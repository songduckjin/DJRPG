import { createClient } from '@libsql/client/web';
import { configureDatabase } from '../../server/database-config.mjs';
import { marketEventsEndpoint } from '../../server/endpoints/market-events.mjs';

configureDatabase(createClient);
export const onRequest = context => marketEventsEndpoint(context.request, { env: context.env });
