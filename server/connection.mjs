import { client, schema } from './database.mjs';
import { connectionProvider } from './market-connection.mjs';

/**
 * 계정·던전·월드보스 엔드포인트도 거래소와 같은 **연결 재사용**을 쓴다(작업 209).
 *
 * 예전에는 요청마다 `client(env)`로 새 libsql 클라이언트를 만들고 `close()`했고, 스키마 초기화 결과만
 * 캐시됐다. 요청 집중 시 연결 준비가 요청 수만큼 반복되므로, 런타임이 살아 있는 동안은 한 번 초기화한
 * 연결을 그대로 쓴다. `createDbClient`를 넘긴 호출(테스트·Vercel 어댑터)은 종전처럼 자기 연결을 쓰고
 * 스스로 닫는다.
 */
export const sharedConnection = connectionProvider(client, schema);
