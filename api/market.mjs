import { createClient } from '@libsql/client';
import { configureDatabase } from '../server/database-config.mjs';
import { marketEndpoint } from '../server/endpoints/market.mjs';
import { toRequest, sendNode } from '../server/node-adapter.mjs';

configureDatabase(createClient);
export default async function handler(req, res) {
  return sendNode(res, await marketEndpoint(toRequest(req), { env: process.env }));
}
