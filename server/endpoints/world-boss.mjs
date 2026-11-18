import {client,schema} from '../database.mjs';
import {tokenPayload} from '../auth.mjs';
import {runtimeEnv} from '../env.mjs';
import {json,readBody,errorResponse,versionGuard} from '../http.mjs';
import {worldBossOperation} from '../world-boss.mjs';
export async function worldBossEndpoint(request,{env=runtimeEnv(),createDbClient}={}){
  if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED',error:'POST 요청만 허용합니다.'},405);
  const outdated=versionGuard(request);if(outdated)return outdated;
  if(!env.TURSO_DATABASE_URL||!env.TURSO_AUTH_TOKEN)return json({code:'DB_NOT_CONFIGURED',error:'서버 DB가 설정되지 않았습니다.'},503);
  const signed=tokenPayload(request,env);if(!signed)return json({code:'INVALID_TOKEN',error:'다시 로그인해 주세요.'},401);
  let db;try{
    const input=await readBody(request);db=createDbClient?createDbClient(env):client(env);await schema(db,env);
    return json(await worldBossOperation(db,signed.id,input??{},signed.sid,Date.now(),env.TURSO_DATABASE_URL));
  }catch(error){return errorResponse(error);}finally{await db?.close();}
}
