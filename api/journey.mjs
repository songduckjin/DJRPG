import { createClient } from '@libsql/client';
import { configureDatabase } from '../server/database-config.mjs';
import { journeyEndpoint } from '../server/endpoints/journey.mjs';
import { toRequest, sendNode } from '../server/node-adapter.mjs';

configureDatabase(createClient);
export default async function handler(req, res) {
  return sendNode(res, await journeyEndpoint(toRequest(req), { env: process.env }));
}
