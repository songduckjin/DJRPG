# DJRPG 3D → 2.5D Blender 자동 렌더 파이프라인

> **책임 경계**: 3D 모델 → 2.5D 셀·아틀라스 생성 절차만. 결과물 규격·매니페스트·필드 연결은 `docs/COSTUME_SYSTEM.md` §7.

> 대상: PC 코덱스(Windows) 실행 환경 · 담당 `songduckjin` · [작업 147]
> 실행 스크립트: `scripts/blender/render_25d_costume.py`
> 셀 규약의 단일 기준: `docs/COSTUME_SYSTEM.md` §7.2 — 이 문서와 어긋나면 그쪽이 기준이다.

이 문서는 **3D 휴머노이드 + 대검 모델을 Blender CLI에서 2.5D 쿼터뷰 스프라이트 셀로 뽑아
기존 코스튬 파이프라인에 넣는 절차**를 처음부터 끝까지 담는다. 사람이 Blender를 열어 손으로
뽑지 않고, 같은 입력이면 같은 출력이 나오는 명령 한 줄로 끝내는 것이 목적이다.

---

## 0. 한눈에 보는 흐름

```
 3D 모델(.blend/.glb/.fbx)                scripts/blender/render_25d_costume.py
 ┌────────────────────────┐               ┌──────────────────────────────────────┐
 │ 아마추어 + 액션         │  blender -b   │ ① 액션·프레임 샘플링                  │
 │ idle / walk / attack   │ ────────────▶ │ ② 쿼터뷰 직교 카메라 + 3점 조명        │
 │ 파츠 분리 메시          │               │ ③ 발끝 피벗·본체 190px 카메라 피팅     │
 └────────────────────────┘               │ ④ 셀 234×242 투명 PNG                 │
                                          │ ⑤ (선택) 8×8 아틀라스 + 매니페스트     │
                                          └───────────────┬──────────────────────┘
                                                          │ out/<파츠>/<액션>-NN.png
                                                          ▼
                        ┌─────────────────────────────────────────────────────┐
                        │ 기존 코스튬 파이프라인                                │
                        │  · 검수: 셀·아틀라스 페이지를 눈으로 확인             │
                        │  · 배포: `COSTUME_ASSET_VERSION`을 올린 새 버전 경로  │
                        │    (`/assets/costume/v6/...`) + 매니페스트 55종       │
                        │  · 연결: `src/game/render/costumeHero.ts`가 소비      │
                        └─────────────────────────────────────────────────────┘
```

**이 스크립트가 하는 일과 하지 않는 일**

| 한다 | 하지 않는다 |
|---|---|
| 모델 로드·액션 샘플링·카메라·조명·셀 렌더 | 포즈를 만들어 주지 않는다(포즈는 리깅·애니메이션 몫, §5) |
| 발끝 피벗·본체 높이 정규화 | 배포 매니페스트 55종을 만들지 않는다(§8.4) |
| 파츠 분리 렌더·Holdout | 게임 코드·세이브·API를 건드리지 않는다 |
| 규약 8×8 아틀라스 패킹(검수·개발용) | `public/assets/**`에 직접 쓰지 않는다 |

---

## 1. 환경 준비 (PC 코덱스 / Windows)

### 1.1 Blender 설치 확인

```bat
:: 설치 경로 확인(버전에 따라 폴더명이 다르다)
dir "C:\Program Files\Blender Foundation"
```

* **Blender 4.0 이상**(권장 4.2 LTS 이상)을 쓴다. 3.x도 대부분 동작하지만 `BLENDER_EEVEE_NEXT`가
  없어 `--engine eevee`가 `BLENDER_EEVEE`로 떨어진다.
* 설치형이 아니라 포터블(zip)이면 `blender.exe`가 있는 폴더를 그대로 쓰면 된다.
* CLI가 되는지 먼저 확인한다.

```bat
set BLENDER="C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
%BLENDER% -b --version
```

`Blender 4.2.x` 같은 줄이 나오면 준비 끝이다. `-b`는 백그라운드(창 없이) 실행이라는 뜻이다.

### 1.2 스크립트 자체 점검 (렌더 없이 30초)

```bat
:: Blender 없이도 되는 점검이지만, Blender 번들 파이썬으로 돌리면 환경까지 같이 확인된다
%BLENDER% -b --python-expr "import runpy,sys; sys.argv=['x','--selftest']; runpy.run_path(r'scripts\blender\render_25d_costume.py', run_name='__main__')"
```

또는 저장소 루트에서 PC에 있는 아무 `python3`로:

```bat
python scripts\blender\render_25d_costume.py --selftest
```

`자체 점검 6/6 통과`가 나오면 PNG 코덱·프레임 슬롯·샘플링·CLI가 정상이다.

### 1.3 엔진 선택 — 기본은 Cycles

| 항목 | `--engine cycles`(기본) | `--engine eevee` |
|---|---|---|
| 백그라운드 안정성 | 높음(CPU로 확실히 돈다) | GPU/그래픽 드라이버에 따라 실패할 수 있다 |
| 속도 | 234×242·64샘플에서 프레임당 수 초 | 훨씬 빠름 |
| Holdout 마스킹 | 지원 | 4.2+에서 부분 지원, 결과가 다를 수 있다 |
| 권장 | **최종 렌더·CI성 반복** | 빠른 포즈 확인 |

`--samples`는 기본 64다. 포즈 확인용이면 `--samples 16`, 최종이면 64~128을 쓴다.
`--device GPU`는 Cycles GPU가 잡혀 있을 때만 쓴다(노트북에서 CPU가 더 안정적인 경우가 많다).

### 1.4 소요 시간 어림

| 구성 | 프레임 수 | Cycles CPU 64샘플 기준 |
|---|---|---|
| `idle,walk,attack` 합성 1파츠 | 1+8+4 = 13 | 1~3분 |
| 위 + 4파츠 분리 + 아틀라스 | 52 + 패킹 | 5~15분 |
| 7액션 전체 × 4파츠 | 120 | 15~40분 |

수치는 CPU·샘플·모델 폴리곤에 따라 달라진다. 처음에는 `--dry-run`으로 프레임 수를 확인한다.

---

## 2. 파일럿 3D 모델 준비

### 2.1 어떤 모델을 쓰나

처음부터 자체 모델을 만들지 않는다. **파이프라인 검증용 파일럿**은 무료·라이선스가 명확한
휴머노이드 + 대검으로 충분하다.

| 출처 | 얻는 것 | 조건 |
|---|---|---|
| **Mixamo**(Adobe) | 리깅된 휴머노이드 + 기본 애니메이션(idle·walk·slash) | 무료, Adobe 계정 필요, 상업 사용 가능(Adobe 약관) |
| **Quaternius / Kenney** | CC0 저폴리 캐릭터·무기 | CC0, 출처 표기 불필요(표기 권장) |
| **Sketchfab** | 대검·갑옷 모델 | 라이선스 필터를 **CC0 또는 CC-BY**로 고정, CC-BY는 저작자 표기 |
| **Poly Haven** | 소품·텍스처(캐릭터 없음) | CC0 |

* 파일럿이라도 **출처·라이선스·다운로드 날짜**를 이 문서 §11 기록표나 커밋 메시지에 남긴다.
  `docs/COSTUME_SYSTEM.md` §6.3이 요구하는 "도구·버전·원본 기록"이 이것이다.
* 실제 게임 에셋으로 승격할 때는 라이선스를 다시 확인한다(특히 CC-BY의 저작자 표기 의무).

### 2.2 Mixamo에서 받는 순서

1. 캐릭터 선택 → **T-pose**로 Download(Format: **FBX Binary**, Skin: With Skin, 30fps).
2. 애니메이션을 고를 때 **`In Place` 체크**를 켠다. 켜지 않으면 캐릭터가 앞으로 걸어가
   셀 밖으로 나간다(이 스크립트는 프레임별로 카메라를 다시 맞추지 않는다 — §7.5).
3. `idle`용(Idle), `walk`용(Walking), `attack`용(대검 계열 Slash/Smash)을 각각 받는다.
4. 받은 파일은 저장소 밖에 두거나 `assets_src/`(커밋 금지 대상)에 둔다.
   **모델 원본·텍스처를 저장소에 커밋하지 않는다**(용량·라이선스).

### 2.3 모델이 갖춰야 하는 조건

| 조건 | 이유 |
|---|---|
| 휴머노이드 리그(팔·다리·손·발 본) | 액션 샘플링·파츠 분리의 전제 |
| 단위 m, 키 1.6~1.9m | 카메라 피팅이 본체 높이를 자동 측정해 190px로 맞춘다(값이 달라도 동작) |
| 발이 원점(z=0) 근처 | 발끝 앵커 자동 검출이 안정적 |
| **인플레이스** 사이클 | 프레임마다 카메라가 고정이므로 이동하면 셀을 벗어난다 |
| 파츠 분리(몸/갑옷/투구/무기) | 4파츠 렌더를 하려면 메시가 나뉘어 있어야 한다(§2.4) |

### 2.4 파츠 분리 레시피 (Blender에서 1회)

Mixamo 캐릭터는 보통 **스킨 메시 1개**다. 파츠 렌더를 하려면 재질 단위로 나눈다.

1. 메시 선택 → `Tab`(Edit Mode) → 재질 하나 선택 → `Select`(재질 패널의 Select 버튼)
2. `P` → **By Material** → 오브젝트가 재질 수만큼 분리된다
3. 나눈 오브젝트 이름을 규약 토큰으로 바꾼다 — `body_torso`, `armor_chest`, `helmet_helm`,
   `weapon_sword` 처럼 **파츠 이름이 이름 안에 들어가면** 스크립트가 자동 인식한다
   (`PART_TOKENS`: body·skin·base / armor·plate / helmet·hood / weapon·sword·blade …)
4. 이름을 못 바꾸는 상황이면 오브젝트 커스텀 속성으로 지정한다:
   Object Properties → Custom Properties → `djrpg_part` = `armor`
5. 또는 실행할 때 직접 매핑한다: `--part-map armor=Cuirass --part-map helmet=Helm`

> 이름으로도 속성으로도 못 찾은 오브젝트는 `body`로 취급되고 경고가 찍힌다. 파츠 렌더에서
> 그 파츠가 비어 보이면 `--dry-run`의 `parts` 목록부터 확인한다.

### 2.5 액션 이름

Blender Action Editor에서 액션 이름을 정확히 `idle`, `walk`, `attack`으로 바꾼다.
`Armature|idle`, `mixamorig:Walk` 처럼 접두사가 붙어도 정규화해 찾는다(정확 일치 → 정규화 일치 →
부분 일치). 스킬 모션(`slash`·`spin`·`smash`·`cast`)은 §7.4를 참고한다.

---

## 3. 확정 포즈 스펙 (사용자 확정)

이 스펙은 사용자가 최종 확정한 시안이며, `scripts/blender/render_25d_costume.py`의 `POSE_SPEC`과
`--print-spec` 출력이 같은 내용이다.

```bat
python scripts\blender\render_25d_costume.py --print-spec
```

**레퍼런스 이미지** (추후 PC 코덱스가 3D 포즈·렌더링을 눈으로 대조하는 기준)

| 파일 | 내용 |
|---|---|
| `docs/references/djrpg_25d_3poses_preview_v2.png` | 서기 · 양손 끌며 걷기 · 공격 준비 |
| `docs/references/djrpg_attack_4frames_v2.png` | 4단계 내려찍기 궤적(전체 칼 길이 유지) |

원본은 워크스페이스 `downloads/`에 있고, 저장소에는 **가로 1024px·256색 PNG**로 줄여 넣었다
(두 장 합계 약 850KB). `public/assets/**`에는 넣지 않았으므로 번들·런타임 용량에 영향이 없다.

### 3.1 서기 — `idle`

* **양손을 오른쪽 허리 옆에 모아** 대검 자루를 함께 쥔다(오른손 위·왼손 아래, 간격 5~7cm).
* 가드와 칼날이 **허벅지 앞쪽**을 지나 **등 뒤 대각선 아래**로, 땅에 끌릴 듯 뻗는다.
* 칼끝은 캐릭터 뒤로 25~35°, 아래로 40~50°. 상체는 오른쪽으로 10~15° 튼다.
* 왼손은 자루에서 **풀리지 않는다**(자유로운 손이 없다).

### 3.2 걷기 — `walk`

* 걷는 동안에도 **왼손이 풀리지 않고** 양손이 오른쪽에 모인 채 자루를 쥔다.
* 무거운 대검을 **뒤쪽 아래로 끌며** 전진한다(칼끝은 바닥에서 5~15cm).
* 프레임이 바뀌어도 **손 간격·손 높이가 변하지 않는다** — 이 불변 조건이 걷기의 핵심이다.
* 보폭 55~70cm, 상체 흔들림은 3~5°로 억제하고 무게 중심을 낮게 둔다.

### 3.3 공격 — `attack` 4단계

| 단계 | t(액션 비율) | 그립 | 칼날 | 상체 |
|---|---|---|---|---|
| ① Wind-up | 0.00 | 오른쪽 허리 옆(뒤)에서 어깨 뒤로 당김 | 등 뒤 아래 → 뒤 위로 들기 시작 | 오른쪽으로 25~30° 감아 비틂 |
| ② Apex | 0.33 | 머리 위(정수리 +25~35cm) | 위·뒤로 20~25° 눕고 칼끝은 머리보다 30cm 위 | 정면, 허리는 살짝 젖힘 |
| ③ Mid-swing | 0.66 | 가슴 앞 높이, 두 팔 앞으로 뻗음 | 앞·아래 40~55°(세로 원호) | 앞으로 15~20° 숙이고 앞무릎 굽힘 |
| ④ Impact | 1.00 | 앞무릎 높이 | **몸에서 1.6~1.8m 앞 바닥에 칼끝**, 날 전체 길이 유지 | 깊게 앉음 |

**Impact의 절대 조건**: 칼을 땅에 "파묻어" 짧아 보이게 만들지 않는다. 칼끝이 지면에 닿되
날이 지면과 이루는 각을 20° 안팎으로 두어 **화면에서 칼 길이가 줄지 않게** 한다. 이전 2D 시트에서
"칼이 땅에 박혀 짧아 보이는" 문제가 있었고, 사용자가 이를 명시적으로 지적했다.

---

## 4. 본·소켓 규약과 양손 대검 리깅

이 스크립트는 **렌더러**다. 포즈(양손이 함께 자루를 쥐는 것)는 모델 리깅·애니메이션에서 만든다.
아래는 파일럿 모델에 그 구조를 넣는 표준 절차다.

### 4.1 본 이름 규약

| 역할 | 이름(별칭 허용) | 용도 |
|---|---|---|
| 루트 | `root` / `hips` / `reference` | 캐릭터 원점 |
| 손 | `hand_r`, `hand_l` | 그립 기준 |
| 발 | `foot_r`, `foot_l` | 발끝 앵커(자동 검출이 안 될 때 `--anchor-bone`) |
| 무기 소켓 | `weapon_socket` (`weapon.r`·`sword_socket`·`prop_r`) | 무기 오브젝트 부모 |
| 무기 제어 | `weapon_ctrl`(권장) | 스윙 궤적을 애니메이션하는 본 |

스크립트는 시작할 때 이 이름들을 찾아 로그로 보여 주고, 없으면 경고만 한다(렌더는 계속).

```bat
%BLENDER% -b -P scripts\blender\render_25d_costume.py -- --input pilot.fbx --dry-run
:: [25d] 리그 본 65개 · 기대 역할 8/8 확인 ...
```

### 4.2 양손 그립 — "왼손이 풀리지 않게" 만드는 두 가지 방법

**(A) Child-Of 제약(가장 간단·권장)**

1. `weapon_socket`을 `hand_r`의 자식으로 만든다(오른손이 자루를 쥔 기준).
2. 무기 오브젝트를 `weapon_socket`에 부모 지정한다. 무기 원점은 **자루(그립) 중심**에 둔다.
3. `hand_l`에 **Child-Of** 제약을 걸고 Target을 `weapon_socket`(또는 무기 오브젝트)로,
   `Set Inverse`를 누른 뒤 **자루 아래쪽 5~7cm** 위치로 손을 옮긴다.
4. 이제 오른손·무기를 어떻게 움직여도 **왼손이 자동으로 자루를 따라온다** — 걷기·공격 모두.

**(B) IK(정교한 제어가 필요할 때)**

1. `hand_l`의 IK 타깃이 될 empty/bone(`grip_l`)을 무기 자루에 부모 지정한다.
2. IK 체인 길이 2(전완·상완), 폴 타깃은 팔꿈치 방향 empty.
3. 장점: 팔꿈치 방향·어깨 각을 제어할 수 있다. 단점: IK/FK 전환·과신전(over-extension)을
   프레임마다 확인해야 한다.

> 어느 쪽이든 **왼손 그립 오프셋을 상수로 고정**한다. 프레임마다 손 위치를 키프레임으로
> 따로 찍으면 걷기에서 손이 미끄러진다(사용자가 지적한 "왼손이 풀린다"의 원인).

### 4.3 무기 방향(정방향 그립)

* 무기 오브젝트의 **로컬 +Y를 칼끝 방향**으로 통일한다(Blender 기본은 +Y가 앞).
* `weapon_socket`은 손바닥 회전에 맞춰 **-Z가 손등 방향**, +Y가 칼끝이 되도록 회전값을 잡는다.
* 그립 각도는 `idle`에서 "칼날이 뒤·아래"가 되도록 어깨 축 회전으로 만든다(§3.1).
* 좌우 손이 같은 자루를 쥐므로 **칼날의 회전(엣지 방향)은 손목 회전 하나로만** 제어한다.

### 4.4 4단계 내려찍기 키프레임 규약

샘플러가 **액션 범위를 등간격으로 나눠** 프레임을 뽑기 때문에(§7.2), 키 포즈를 등간격에 둬야
뽑힌 셀이 정확히 그 포즈가 된다. 액션 범위를 `1..33`(32프레임)으로 잡으면:

| 스테이지 | t | 32프레임 기준 | 4샘플이 뽑는 프레임 |
|---|---|---|---|
| Wind-up | 0.00 | 1 | **1** |
| Apex | 0.33 | 11 | **9** ← 11에 두면 9가 뽑혀 2프레임 어긋난다 |
| Mid-swing | 0.66 | 22 | **17** |
| Impact | 1.00 | 33 | **25** |

`attack`은 4개를 뽑으므로 **1·9·17·25**(32/4 = 8 간격)가 뽑힌다. 따라서 키를 정확히
1·9·17·25에 찍고, 마지막 키(25)에 **2~3프레임 홀드 키**를 더 찍어 피니시가 흔들리지 않게 한다.

* Wind-up은 **2프레임 뒤로 살짝 더 감는** 준비 동작을 넣으면 무게감이 산다(샘플에 잡히지 않는 구간).
* Impact 직전(17→25)은 **보간을 Linear 또는 짧은 Bézier**로 두어 칼끝이 지면을 뚫지 않게 한다.
* 걷기 8샘플은 `1,5,9,13,17,21,25,29`가 뽑힌다 → 32프레임 사이클에서 그 지점이
  접지/통과(pass) 포즈가 되도록 배치하면 자연스럽다.
* 서기는 1프레임만 뽑으므로 **1프레임을 "가장 좋은 서기 자세"** 로 잡는다.

프레임 수를 바꾸고 싶으면 `--frames-per-action attack=6`처럼 덮어쓴다(이때는 슬롯 규약 4칸을
넘으므로 아틀라스 패킹에서 경고가 난다 — 셀 검수용으로만 쓴다).

---

## 5. 실행

모든 명령은 저장소 루트(`DJRPG`)에서 실행하고, 인자는 **`--` 뒤**에 둔다.

### 5.1 계획만 확인 (렌더 없음)

```bat
%BLENDER% -b -P scripts\blender\render_25d_costume.py -- ^
  --input assets_src\pilot\warrior_male.fbx --out out\25d\male --dry-run
```

출력 JSON에서 확인할 것: `armature`, `actions[].frames`, `parts`(파츠별 오브젝트 이름),
`outputs`(만들어질 파일 목록), `cell`·`camera`.

### 5.2 합성 렌더 (한 장에 몸·갑옷·무기 전부)

```bat
%BLENDER% -b -P scripts\blender\render_25d_costume.py -- ^
  --input assets_src\pilot\warrior_male.fbx --out out\25d\male ^
  --actions idle,walk,attack --samples 64
```

결과: `out\25d\male\full\idle-00.png`, `walk-00..07.png`, `attack-00..03.png` (13장).

### 5.3 파츠 분리 + 아틀라스 (게임 규약 검수용)

```bat
%BLENDER% -b -P scripts\blender\render_25d_costume.py -- ^
  --input assets_src\pilot\warrior_male.fbx --out out\25d\male ^
  --parts body,armor,helmet,weapon --holdout ^
  --actions idle,walk,attack --atlas all --samples 64
```

* 파츠마다 폴더가 생기고(`out\25d\male\body\...`), `atlas\`에 **1872×1936**(234×242 × 8×8)
  페이지가 파츠별로 하나씩 만들어진다.
* `--holdout`은 선택하지 않은 파츠를 **숨기지 않고 Holdout으로 가린다** — 앞을 가리는 파츠
  (예: 망토·투구)의 실루엣이 잘려 나가는지 확인할 때 쓴다. Cycles에서만 확실히 동작한다.
* `--holdout` 없이 파츠 렌더를 하면 뒤 파츠가 **투명으로 비어** 나온다(레이어 합성용 정답).

### 5.4 스킬 모션까지

```bat
%BLENDER% -b -P scripts\blender\render_25d_costume.py -- ^
  --input assets_src\pilot\warrior_male.blend --out out\25d\male ^
  --actions idle,walk,attack,slash,spin,smash,cast --parts body,armor,helmet,weapon --atlas all
```

`spin`(회전)은 게임 규칙상 **본체를 360° 돌리지 않는다**(`COSTUME_SYSTEM.md` §7.6). 3D에서
회전 액션을 뽑아도 셀은 정면 기준으로 두고, 실제 연출은 이펙트·잔상이 담당한다.

### 5.5 주요 인자

| 인자 | 기본 | 설명 |
|---|---|---|
| `--input` | (필수) | `.blend` / `.glb` / `.gltf` / `.fbx` |
| `--out` | `out/25d` | 셀 출력 폴더. **성별·모델마다 따로** 준다 |
| `--actions` | `idle,walk,attack` | `idle,walk,attack,slash,spin,smash,cast` |
| `--parts` | (없음 = 합성) | `body,armor,helmet,weapon` 등. 이름은 자유 |
| `--part-map` | — | `PART=이름일부` 반복 지정 |
| `--holdout` | 꺼짐 | 미선택 파츠를 Holdout으로 |
| `--cell-width` / `--cell-height` | `234` / `242` | 규약값. 바꾸면 §8 검증이 깨진다 |
| `--body-px` | `190` | 본체 정규화 높이(`heroScale.ts` `costumeBodyPx`) |
| `--pivot-x` / `--pivot-y` | `0.5` / `0.96` | 발끝 피벗 |
| `--camera-pitch` / `--camera-yaw` | `35` / `30` | 쿼터뷰 각도. 게임 필드와 맞출 때 조정 |
| `--frame-range` | 액션별 | `1:33` 처럼 공통 범위 강제 |
| `--frames-per-action` | 슬롯 수 | `walk=8,attack=4` 덮어쓰기 |
| `--include-end` | 꺼짐 | 마지막 프레임 포함(기본은 반복 중복 방지로 제외) |
| `--atlas` | (없음) | 파츠 목록 또는 `all` |
| `--atlas-variant` | `0` | 페이지 안 변형 번호(0/1) |
| `--engine` / `--samples` / `--device` | `cycles` / `64` / `CPU` | 품질·속도 |
| `--dry-run` | 꺼짐 | 계획만 출력 |
| `--print-spec` | — | 확정 포즈 스펙 출력 |
| `--selftest` | — | Blender 없이 자체 점검 |

전체 목록은 `--help`로 본다.

```bat
%BLENDER% -b -P scripts\blender\render_25d_costume.py -- --help
```

> **PowerShell**에서는 줄바꿈 문자와 경로 인용이 다르다. 한 줄로 쓰거나 백틱(`` ` ``)을 쓴다:
> `& $BLENDER -b -P scripts\blender\render_25d_costume.py -- --input "assets_src\pilot\a b.fbx" --out out\25d\male`

---

## 6. 출력 규격

| 항목 | 값 | 근거 |
|---|---|---|
| 셀 크기 | **234×242** px | `COSTUME_SYSTEM.md` §7.2 |
| 발끝 피벗 | 셀의 `(0.5, 0.96)` = (117, 232.3)px | 동일 |
| 본체 높이 | **190px** (셀 높이의 78.5%) | `heroScale.ts` `costumeBodyPx` |
| 배경 | 완전 투명(RGBA, `FILM_TRANSPARENT`) | 레이어 합성 전제 |
| 톤 | 뷰 트랜스폼 `Standard`(톤매핑 없음) | 프레임 간 색 고정 |
| 파일명 | `<파츠>/<액션>-<2자리 인덱스>.png` | `body/walk-03.png` |
| 매니페스트 | `<out>/render-manifest.json` | 셀·카메라·슬롯·파일 목록 |
| 아틀라스 | `<out>/atlas/<파츠>-<라벨>-v<변형>.png` = 1872×1936 | 8×8, 변형당 32칸 |

**프레임 슬롯**(아틀라스 셀 번호 = 변형×32 + 슬롯)

| 모션 | 슬롯 | 프레임 수 |
|---|---|---|
| `idle` | 0 | 1 |
| `walk` | 1–8 | 8 |
| `attack` | 9–12 | 4 |
| `slash` | 13–16 | 4 |
| `spin` | 17–22 | 6 |
| `smash` | 23–26 | 4 |
| `cast` | 27–29 | 3 |

---

## 7. 스크립트가 카메라를 맞추는 방식 (왜 프레임이 흔들리지 않는가)

1. **본체 높이 측정** — 측정 액션(기본 `idle`)의 첫 프레임에서 body 파츠 메시 정점의 z 범위를
   잰다. 정점은 평가된(evaluated) 메시에서 읽으므로 스킨 변형 후 형상이다.
2. **발끝 앵커** — 최저점 위 2% 띠에 속한 정점들의 x·y 평균 + 최저 z. `--anchor-bone`으로
   특정 본을 앵커로 고정할 수도 있다.
3. **ortho_scale 1회 보정** — 투영된 본체 높이가 190px가 되도록 직교 카메라 배율을 바꾼다
   (직교 투영이라 한 번에 정확히 맞는다).
4. **위치 2~3회 반복** — 발끝이 (117, 232.3)px에 오도록 카메라를 카메라 로컬 up/right로 이동.

카메라는 **모든 액션·프레임에 공통으로 고정**한다. 프레임마다 다시 맞추면 칼을 든 프레임에서
몸이 작아지는(정확히 `heroScale.ts`가 피했던) 문제가 생기기 때문이다.

> 3번에서 잰 높이는 **body 파츠** 기준이다. body 파츠가 없으면 무기를 뺀 나머지를 쓴다.
> `--parts armor,helmet,weapon`처럼 body를 빼고 렌더해도 측정은 따로 하므로 크기는 같다.

---

## 8. 기존 파이프라인과 연결

### 8.1 지금 게임이 쓰는 것

* 배포 아틀라스: `public/assets/costume/v3/{manifest.json,atlas/*.png}` (매니페스트 55종, 70장)
* `COSTUME_ASSET_VERSION = 3` — `src/game/costume/manifest.ts`의 유일한 URL 생성 지점
* 필드 렌더러: `src/game/render/costumeHero.ts`(`planHeroCostume`·`costumeLayerCell`)
  → `render/entities.ts` `drawHero` → 실패 시 통합 바디 폴백
* 장비창 미리보기: `src/ui/equipmentPortrait.ts`(같은 계획을 idle 0프레임으로)
* 검증: `node scripts/verify-item-art.mjs`(매니페스트·셀 격자), `node --test tests/costume-*.test.mjs`
* 검수 시트: `python3 scripts/costume-contact-sheet.py --version 3 --only verify`

### 8.2 이 스크립트의 산출물로 갈아 끼우는 절차 (다음 작업에서)

1. **렌더** → `out/25d/male`, `out/25d/female` (성별 2회)
2. **검수**: `out/25d/*/atlas/*.png`를 이미지 뷰어로 열어 §3 스펙과 대조한다
   (idle 0 · walk 1–8 · attack 9–12 칸). 필요하면 `album`·`contact sheet` 도구로 접촉 시트를 만든다.
3. **매니페스트 작성**: §6 슬롯 표대로 55종(`<부위>-t<인덱스>`)을 페이지·변형에 매핑한다.
   기존 `manifest.json`의 스키마(`schemaVersion`·`costumeId`·`slot`·`animMode`·`anchor`·`fit`·
   `zOrder`)를 그대로 지킨다. `anchor`는 `{0,0}`(본체 발 피벗) 또는 `{x:0.5,y:0.96}`을 쓴다.
4. **버전 올리기**: `COSTUME_ASSET_VERSION`을 **6**으로 올려 `/assets/costume/v6/...`로 배포한다.
   `/assets/*`는 `immutable`이라 같은 URL의 내용 교체는 반영되지 않는다(`COSTUME_SYSTEM.md` §6.2).
5. **검증**: `node scripts/verify-item-art.mjs` + `node --test tests/costume-*.test.mjs`
   + `npm run build` → PR → 실기 화면 검수(사용자).

> 이번 [작업 147]은 **도구와 문서만** 넣었다. 위 3~5번(매니페스트·버전·배포)은 실제 렌더
> 결과가 나온 뒤 별도 작업으로 등록한다. `scripts/build-costume-atlas.py`는 2D 시트 재료용
> 생성기이므로, 3D 렌더 결과는 이 스크립트의 아틀라스 페이지를 기반으로 매니페스트를 만든다.

### 8.3 층·부위 매핑 참고

| 파츠 | 게임 부위 | 그리는 조건 |
|---|---|---|
| `body` | 본체(torso·arms·legs) | **갑옷 미착용일 때만** |
| `armor` | `armor` | 갑옷 착용 시 본체 3파츠를 대체 |
| `helmet` | `helmet` | 갑옷 유무에 따라 페이지가 다르다(`helmet`·`helmet-body`) |
| `weapon` | `weapon` | idle·walk에서만(공격 셀은 검을 시트에 내장) |
| `gloves` `/` `boots` | — | **현재 캐릭터 외형은 갑옷·투구·무기 3부위만** 그린다(§7.9). 뽑아 두되 배포 계획에는 넣지 않는다 |

### 8.4 배포 시 지켜야 하는 기존 규칙

* 매니페스트·아틀라스·`costumeId` 중 하나라도 빠지면 **부분 합성하지 않고 통합 바디로 폴백**한다.
* 필드 페이지 캐시 상한 6장(§7.6) — 파츠·변형을 늘리면 페이지 수부터 다시 센다.
* 셀 크기·피벗이 규약과 다르면 로더가 폴백한다. **스크립트 기본값을 바꾸지 않는다.**
* `public/assets/**`를 바꿀 때는 `COSTUME_ASSET_VERSION`을 올리고, 아이템 아트 검증을 통과시킨다.

---

## 9. 검증 체크리스트

렌더 1회가 끝나면 아래를 순서대로 본다.

- [ ] `--dry-run`의 `actions[].frames`가 의도한 키 포즈 프레임인가(§4.4)
- [ ] `[25d] 카메라 피팅:` 로그의 발끝 px가 `(117, 232.3)` 근처인가
- [ ] `본체 190px` 근처인가(±2px)
- [ ] 셀 PNG가 **234×242**이고 배경이 투명한가
- [ ] `idle-00`에서 **양손이 오른쪽 허리에 모여** 있는가, 왼손이 떠 있지 않은가
- [ ] `walk-00..07`에서 **손 간격·손 높이가 변하지 않는가**
- [ ] `attack-03`(Impact)에서 **칼끝이 앞바닥에 닿고 날 길이가 줄지 않았는가**
- [ ] 파츠 렌더에서 다른 파츠가 섞이지 않았는가(`--holdout` 유무 각각)
- [ ] `atlas/*.png`가 1872×1936이고 셀이 규약 슬롯에 놓였는가
- [ ] `render-manifest.json`의 `frames[].slot`이 §6 표와 맞는가

---

## 10. 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| `bpy가 없다` | Blender 밖에서 실행 | `blender -b -P ... --`로 실행 |
| 인자가 무시된다 | `--`를 빼먹었다 | Blender 인자 뒤에 `--`를 두고 그 뒤에 스크립트 인자 |
| `요청한 액션을 모델에서 찾지 못했다` | 액션 이름이 다르다 | `--dry-run`으로 모델 액션 목록 확인 후 이름 변경 |
| 캐릭터가 셀 밖으로 나간다 | 인플레이스가 아닌 액션 | Mixamo에서 `In Place` 체크 후 재다운로드 |
| 프레임마다 크기가 변한다 | 액션에 루트 이동/스케일 키가 있다 | 루트 본 이동 키 제거(`root` 고정) |
| 파츠가 비어 나온다 | 오브젝트 이름에 토큰이 없다 | `--part-map`·`djrpg_part` 속성으로 지정 |
| 갑옷 렌더에 몸이 비친다 | Holdout 미사용 | `--holdout`(Cycles) 또는 몸 파츠 숨김 |
| 배경이 검게 나온다 | `film_transparent` 미적용 | 스크립트가 켠다 — 다른 애드온이 끄는지 확인 |
| 렌더가 너무 느리다 | Cycles CPU 64샘플 | `--samples 16`, `--engine eevee`, 파츠 수 축소 |
| EEVEE가 백그라운드에서 실패 | GPU/드라이버 | `--engine cycles`로 |
| 아틀라스에 셀이 안 들어간다 | 슬롯이 64칸 초과 | `--atlas-variant 1` 또는 `--actions` 축소 |
| 창(chrome) 실행에서 `%BLENDER%` 미인식 | `set` 후 같은 줄 | 한 줄씩 실행하거나 `setx` 대신 `set`을 같은 세션에서 |

---

## 11. 기록·한계

### 11.1 파일럿 모델 기록 (채울 것)

| 모델 | 출처·URL | 라이선스 | 받은 날짜 | 리깅 손질 | 비고 |
|---|---|---|---|---|---|
| (예) warrior_male.fbx | Mixamo | Adobe 약관(무료 상업) | 2026-11-__ | `hand_l` Child-Of 추가 | 첫 파일럿 |

### 11.2 알려진 한계

* **포즈를 대신 만들어 주지 않는다.** §3·§4 스펙대로 리깅·애니메이션이 되어 있어야 결과가 맞다.
* **2방향 정책 유지**: 게임은 오른쪽 원본 + 좌우 반전 2방향이다. 4방향 공격은 `[작업 145]`
  두건 파일럿에만 있는 예외다. 3D에서 4방향을 뽑아도 기본 정책에는 넣지 않는다.
* **회전(`spin`)**: 본체 회전 금지(§7.6). 회전 액션을 그대로 30장으로 뽑으면 규약 위반이다.
* **배포 매니페스트 자동 생성 없음**: 셀·아틀라스·검수용 렌더 매니페스트까지다(§8.2 3~5번은 별도 작업).
* **아틀라스 페이지 배경 투명도**: 레이어 PNG는 straight alpha다. 합성 도구(Pixi)에서 문제가
  생기면 `png_write_rgba` 대신 Blender의 `film_transparent` 결과를 그대로 쓰면 된다.
* **다중 아마추어 모델**: 첫 아마추어만 쓴다. 리깅이 여러 개면 하나로 합친다.
* **모델 원본은 저장소에 넣지 않는다.** 용량·라이선스 모두 커밋 대상이 아니다.
