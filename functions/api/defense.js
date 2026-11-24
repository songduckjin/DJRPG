import {createClient} from '@libsql/client/web';
import {configureDatabase} from '../../server/database-config.mjs';
import {defenseEndpoint} from '../../server/endpoints/defense.mjs';
configureDatabase(createClient);
export const onRequest=context=>defenseEndpoint(context.request,{env:context.env});
