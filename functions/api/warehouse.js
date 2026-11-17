import { createClient } from '@libsql/client/web';
import { configureDatabase } from '../../server/database-config.mjs';
import { warehouseEndpoint } from '../../server/endpoints/warehouse.mjs';

configureDatabase(createClient);
export const onRequest = context => warehouseEndpoint(context.request, { env: context.env });
