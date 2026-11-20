import {createClient} from '@libsql/client/web';
import {configureDatabase} from '../../server/database-config.mjs';
import {dungeonEndpoint} from '../../server/endpoints/dungeon.mjs';
configureDatabase(createClient);
export const onRequest=context=>dungeonEndpoint(context.request,{env:context.env});
