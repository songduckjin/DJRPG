/**
 * 서버 공통 오류 (작업 260).
 *
 * `server/database.mjs` 5분할에서 **다른 모듈이 서로를 끌어오지 않도록** 오류 클래스만 따로 두었다.
 * `server/database.mjs`가 그대로 re-export하므로 `import { ApiError, fail } from './database.mjs'` 같은
 * 기존 import 경로·인스턴스 판정(`error instanceof ApiError`)은 모두 종전과 같다.
 */
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new ApiError(status, code, message); };
