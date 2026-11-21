/**
 * 작업 233 검수용 — 머리 위 초록 체력바 좌표를 실제 게임 배율로 계산해 JSON 으로 내린다.
 *
 * 그리기는 `scripts/preview-hero-hp-bar.py`(PIL)가 맡고, 화면 좌표·배율·색은 이 스크립트가
 * 게임 코드(`src/game/render/heroHpBar.ts`·`heroScale.ts`·`arena.ts`)에서 그대로 가져온다.
 * 검수 이미지가 게임과 다른 값을 쓰지 않도록 계산을 복제하지 않는다.
 *
 * 사용: node scripts/preview-hero-hp-bar.mjs [out.json]
 */
import { writeFileSync } from 'node:fs';
import '../tests/ts-loader.mjs';

const { HERO_HP_BAR, heroHpBarBox } = await import('../src/game/render/heroHpBar.ts');
const { heroScale, heroBodyPx } = await import('../src/game/render/heroScale.ts');
const { projectArenaPoint } = await import('../src/game/arena.ts');

/** 검수 화면 — 아이폰 390×700(게임 캔버스). 배율·좌표는 모두 이 화면 기준이다. */
const SCREEN = { width: 390, height: 700 };
const [centerX, centerY] = projectArenaPoint(0, 0, SCREEN.width, SCREEN.height);

const ROOT = '/assets/pilot-25d';

/**
 * 검수 대상 — 3직업 × 남녀, 서기·걷기·공격, 100%/50% 등.
 * `sheet` 은 그 자세의 시트 파일, `frame` 은 4×2 걷기 시트의 셀 번호(0~7)다.
 */
const CASES = [
  { label: '전사 남 · 서기 · 100%', art: 'pilotMale', sheet: `${ROOT}/warrior_male_idle_v1.png`, hp: 1 },
  { label: '전사 남 · 서기 · 50%', art: 'pilotMale', sheet: `${ROOT}/warrior_male_idle_v1.png`, hp: .5 },
  { label: '전사 여 · 걷기 · 70%', art: 'pilotFemaleWalk', sheet: `${ROOT}/warrior_female_walk_v1.png`, frame: 2, hp: .7 },
  { label: '궁수 여 · 서기 · 100%', art: 'archerFemale', sheet: `${ROOT}/archer_female_idle_v1.png`, hp: 1 },
  { label: '궁수 남 · 공격 · 50%', art: 'archerMaleAttack', sheet: `${ROOT}/archer_male_attack_v1.png`, frame: 1, hp: .5 },
  { label: '마법사 남 · 서기 · 35%', art: 'mageMale', sheet: `${ROOT}/mage_nostaff/mage_male_idle_v1.png`, hp: .35 },
  {
    label: '마법사 여 · 고깔모자 · 100%', art: 'mageFemale', sheet: `${ROOT}/mage_headless/mage_female_idle_v1.png`, hp: 1, hat: true,
    helm: { sheet: `${ROOT}/mage_helms/female_7_v1.png`, cellY: -44 }
  },
  { label: '전사 남 · 투구 · 80%', art: 'pilotMale', sheet: `${ROOT}/headless/warrior_male_idle_v1.png`, hp: .8,
    helm: { sheet: `${ROOT}/helmets/helm_7.png`, cellY: 0, cellX: 228 - 0, cellYNeck: 89, anchor: 'neck' } }
];

const ANCHOR_Y = .97;

const cases = CASES.map(item => {
  const bodyPx = heroBodyPx[item.art];
  const scale = heroScale(SCREEN.height, item.art, 362);
  const bodyScreenHeight = bodyPx * scale;
  const box = heroHpBarBox({
    centerX,
    headTopY: centerY - bodyScreenHeight,
    bodyScreenHeight,
    hp: item.hp * 1000,
    maxHp: 1000,
    // 게임의 `drawHero` 와 같게: 마법사 고깔모자 착용 프레임만 관모 높이만큼 더 띄운다.
    headroom: item.hat ? HERO_HP_BAR.hatLiftArtPx * scale : 0
  });
  return {
    label: item.label,
    art: item.art,
    sheet: item.sheet,
    frame: item.frame ?? 0,
    hp: item.hp,
    helm: item.helm ?? null,
    bodyPx,
    scale,
    bodyScreenHeight,
    anchorY: ANCHOR_Y,
    /** 발밑(레이어 기준점)의 화면 좌표 — 게임의 `heroLayer.position` 과 같다. */
    feet: { x: centerX, y: centerY },
    headTopY: centerY - bodyScreenHeight,
    box
  };
});

const out = process.argv[2] ?? '/workspace/downloads/hero-hp-bar-plan.json';
writeFileSync(out, JSON.stringify({ screen: SCREEN, bar: HERO_HP_BAR, cases }, null, 2));
console.log(`plan → ${out} (${cases.length} cases)`);
for (const item of cases) {
  console.log(`${item.label}: body ${item.bodyScreenHeight.toFixed(1)}px · bar ${item.box.width}×${item.box.height} @ y${item.box.y} (머리 ${item.headTopY.toFixed(1)})`);
}
