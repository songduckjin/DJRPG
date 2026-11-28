/**
 * 전용 필드(월드보스·던전)를 닫을 때의 정리 순서.
 *
 * PixiJS v8의 `app.destroy(true, …)`는 **ticker를 먼저 없앤 뒤** stage를 파괴한다. 그래서 stage의
 * `'destroyed'` 이벤트에서 도는 장면 정리(`ambientScene`)나 필터·텍스처 해제는 이미 `null`이 된
 * ticker를 만질 수 있다(2026-11-28 월드보스·던전 복귀 멈춤 — `TypeError: Cannot read properties of
 * null (reading 'remove')`).
 *
 * 그 예외가 `cleanup()` 중간에서 터지면 그 뒤 줄에 있던 **메인 필드 복원**이 실행되지 않는다.
 * 복원(`ui.world.paused` 해제·티커 재개)이 빠지면 화면을 닫아도 캐릭터와 몹이 그대로 멈춰 선다.
 * 그래서 정리 단계의 실패와 무관하게 복원은 **반드시** 실행한다 — 파괴 → (해제) → 복원.
 */
export type FieldTeardownSteps = {
  /** 렌더러·캔버스 파괴. 여기서 예외가 나도 아래 단계는 계속한다. */
  destroy: () => void;
  /** 텍스처·필터 해제 같은 뒤처리. 선택. 여기서 예외가 나도 복원은 한다. */
  release?: () => void;
  /** 메인 필드 복원(`paused` 해제·티커 재개). 항상 마지막에 실행된다. */
  restore: () => void;
};

export function releaseField({ destroy, release, restore }: FieldTeardownSteps): void {
  try {
    destroy();
  } finally {
    try {
      release?.();
    } finally {
      restore();
    }
  }
}
