import { createClient } from '@libsql/client';
import { configureDatabase } from '../server/database-config.mjs';
import { warehouseEndpoint } from '../server/endpoints/warehouse.mjs';
import { toRequest, sendNode } from '../server/node-adapter.mjs';

configureDatabase(createClient);
export default async function handler(req, res) {
  return sendNode(res, await warehouseEndpoint(toRequest(req), { env: process.env }));
}
