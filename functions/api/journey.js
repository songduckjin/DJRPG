import { createClient } from '@libsql/client/web';
import { configureDatabase } from '../../server/database-config.mjs';
import { journeyEndpoint } from '../../server/endpoints/journey.mjs';

configureDatabase(createClient);
export const onRequest = context => journeyEndpoint(context.request, { env: context.env });
