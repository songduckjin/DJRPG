import { skillOrder, type SkillId } from '../skills';

/**
 * 스킬 모션 템플릿 매핑 (작업 139, `docs/COSTUME_SYSTEM.md` §3.3 v1.1 확정).
 *
 * 액티브 스킬 8종(`skills.ts` `skills` 레코드 키 전체)만 4대 템플릿에 매핑한다.
 * 모션이 없는 패시브 3종(`mastery`·`body`·`instinct`)은 대상이 아니다.
 * 템플릿 ID는 138 뷰어(`tools/costume-viewer/model.ts` `Motion`)의 이름을 그대로 쓴다.
 */
export type CostumeMotionTemplate = 'slash' | 'spin' | 'smash' | 'cast';

export const costumeMotionTemplates: readonly CostumeMotionTemplate[] = ['slash', 'spin', 'smash', 'cast'];

export const costumeMotionTemplateNames: Record<CostumeMotionTemplate, string> = {
  slash: '베기', spin: '회전', smash: '내려찍기', cast: '발동 자세'
};

/**
 * | 스킬 ID | 스킬명 | 템플릿 | 근거 |
 * |---|---|---|---|
 * | `slash2` | 휘두르기 | 베기 | 전방 1회 휘두름 |
 * | `power` | 파워 스트라이크 | 베기 | 좁은 전방 1격 |
 * | `destroy` | 디스트로이 스윙 | 베기 | 전방 검기 발사(발사 자세) |
 * | `spin` | 드래곤 트위스터 | 회전 | 회오리·잔상 중심(본체 360° 회전 없음) |
 * | `crushing` | 딜레이 크러싱 | 내려찍기 | 지연 폭발을 예고하는 내려찍기 |
 * | `slam` | 와일드 스탬프 | 내려찍기 | 지면 강타·균열 |
 * | `warcry` | 블러드 레이지 | 발동 자세 | 6초 버프 발동 |
 * | `hell` | 헬 파이어 소드 | 발동 자세 | 대검 폭발 발동 |
 */
export const skillMotionTemplates: Record<SkillId, CostumeMotionTemplate> = {
  slash2: 'slash', power: 'slash', destroy: 'slash',
  spin: 'spin',
  crushing: 'smash', slam: 'smash',
  warcry: 'cast', hell: 'cast'
};

export function skillMotionTemplate(id: SkillId): CostumeMotionTemplate { return skillMotionTemplates[id]; }

/** 한 템플릿을 쓰는 액티브 스킬 목록(`skillOrder` 순서). */
export function motionTemplateSkills(template: CostumeMotionTemplate): SkillId[] {
  return skillOrder.filter(id => skillMotionTemplates[id] === template);
}
