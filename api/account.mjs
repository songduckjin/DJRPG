import { createClient } from '@libsql/client';
import { configureDatabase } from '../server/database-config.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { toRequest, sendNode } from '../server/node-adapter.mjs';

configureDatabase(createClient);
export { tokenId } from '../server/auth.mjs';
export default async function handler(req, res) {
  return sendNode(res, await accountEndpoint(toRequest(req), { env: process.env }));
}
