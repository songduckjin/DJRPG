import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../../src/styles/modals.css', import.meta.url));

/**
 * 모달 CSS 전체를 한 덩어리 문자열로 돌려준다.
 *
 * `src/styles/modals.css`는 진입점이고 실제 규칙은 `src/styles/modals/<도메인>.css`에 있다.
 * 진입점이 @import 하는 순서대로 이어 붙여, 규칙을 검사하는 테스트가 도메인 분리를 신경 쓰지 않게 한다.
 */
export function modalStyles() {
  const seen = new Set();
  const read = (file) => {
    if (seen.has(file)) return '';
    seen.add(file);
    return readFileSync(file, 'utf8').replace(
      /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g,
      (_, target) => read(resolve(dirname(file), target)),
    );
  };
  return read(ENTRY);
}
