import {createClient} from '@libsql/client/web';
import {configureDatabase} from '../../server/database-config.mjs';
import {worldBossEndpoint} from '../../server/endpoints/world-boss.mjs';
configureDatabase(createClient);
export const onRequest=context=>worldBossEndpoint(context.request,{env:context.env});
