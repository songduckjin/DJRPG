import { defineConfig } from 'vite';
// 빌드 스크립트(scripts/generate-version.mjs)가 기록한 배포 버전. 서버 Functions도 같은 값을 쓴다.
import { BUILD_VERSION } from './server/version.generated.mjs';

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(BUILD_VERSION) }
});
