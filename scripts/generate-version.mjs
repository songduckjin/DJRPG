// 빌드마다 클라이언트 번들과 서버 Functions가 함께 쓰는 버전 식별자를 만든다.
// Cloudflare Pages 빌드에서는 CF_PAGES_COMMIT_SHA, 로컬에서는 HEAD 커밋을 쓴다.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = process.env;
const short = value => String(value ?? '').trim().replace(/[^0-9a-zA-Z]/g, '').slice(0, 12);
let version = short(env.DJRPG_APP_VERSION || env.CF_PAGES_COMMIT_SHA || env.GITHUB_SHA || env.VERCEL_GIT_COMMIT_SHA);
if (!version) {
  try { version = short(execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch { version = ''; }
}
// 어떤 경우에도 개발 기본값('dev')과 겹치지 않게 해, 구버전 차단이 조용히 꺼지지 않도록 한다.
if (!version) version = `t${Date.now().toString(36)}`;
const builtAt = new Date().toISOString();
writeFileSync(new URL('../server/version.generated.mjs', import.meta.url),
  `// scripts/generate-version.mjs가 빌드할 때 덮어쓴다. 저장소의 값은 개발·테스트용 폴백이다.\nexport const BUILD_VERSION = '${version}';\nexport const BUILT_AT = '${builtAt}';\n`);
writeFileSync(new URL('../public/version.json', import.meta.url), `${JSON.stringify({ version, builtAt })}\n`);
// 관리자 화면의 업데이트 목록은 WORKLOG 제목만 공개한다. 설명·비밀값은 포함하지 않는다.
const worklog = readFileSync(new URL('../docs/WORKLOG.md', import.meta.url), 'utf8');
const updates = [...worklog.matchAll(/^## (\d{4}-\d{2}-\d{2})\s*[·—-]?\s*(.+)$/gm)]
  .slice(0, 16)
  .map(([, date, title]) => ({ date, title: title.trim().slice(0, 180) }));
writeFileSync(new URL('../public/admin-updates.json', import.meta.url), `${JSON.stringify(updates)}\n`);
console.log(`앱 버전 ${version} 기록 완료`);
