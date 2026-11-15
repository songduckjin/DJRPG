## 2026-11-15 · 작업 2
- `vercel.json`에 Vite 빌드·`dist` 출력, SPA fallback, HTML/정적 자산 캐시 헤더 추가.
- 검증: `pnpm run build` 성공 (`tsc --noEmit && vite build`), JSON 구문 검사 통과.
- Vercel CLI·인증·프로젝트 연결이 없어 URL 미발급; `main` 푸시 후 Vercel Import 필요.

## 2026-11-15 · 작업 1
- Vite·TypeScript·PixiJS 초기화 및 세로형 전투/인벤토리 UI 구현.
- `src/game/`에 직접 이동, 4개 공격 동작, 적·보스, 빛기둥 드랍, 장비·저장 구현.
- `src/ui/`에 10칸 장비, 가방 비교·장착·분해, 튜토리얼 구현.
- 검증: `pnpm run build` 성공 (내부 `tsc --noEmit && vite build`); 브라우저 실기 검증 생략.
