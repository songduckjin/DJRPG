#!/usr/bin/env python3
"""DJRPG 3D → 2.5D 코스튬 셀 렌더러 — [작업 147].

3D 휴머노이드 모델(`.blend` / `.glb` / `.fbx`)을 Blender CLI에서 2.5D 쿼터뷰로 렌더해
`docs/COSTUME_SYSTEM.md` §7.2의 코스튬 셀 규약(셀 `234×242`, 발끝 피벗 `(0.5, 0.96)`,
본체 190px, 프레임 슬롯 idle 0 · walk 1–8 · attack 9–12 · slash 13–16 · spin 17–22 ·
smash 23–26 · cast 27–29)에 바로 꽂히는 PNG 셀을 만든다.

하는 일
  1. 모델 로드(.blend은 그대로 열고, .glb/.fbx는 빈 씬에 import)
  2. 액션(`idle`·`walk`·`attack`·`slash`·`spin`·`smash`·`cast`) 찾기 + 프레임 샘플링
  3. 2.5D 쿼터뷰 직교 카메라 + 3점 다크 판타지 조명 + 투명 배경(`FILM_TRANSPARENT`)
  4. 발끝 앵커를 피벗에, 본체 높이를 190px에 맞춘 카메라 피팅(모든 액션·프레임 공통 고정)
  5. 파츠별 분리 렌더(`body`·`armor`·`helmet`·`weapon` …) + `Holdout` 마스킹 옵션
  6. 선택적 아틀라스 패킹(8×8, 변형당 32칸)과 렌더 매니페스트 JSON

의존성: Blender 4.x의 번들 파이썬(`bpy`·`mathutils`)만 쓴다. Pillow 등 외부 패키지는 필요 없다.
PNG 읽기/쓰기는 아틀라스 패커용 최소 구현(8bit·비인터레이스)을 파일 안에 두었다.

실행 (Blender CLI — `--` 뒤의 인자만 이 스크립트가 받는다)
  # 1) 설치·인자 확인 (렌더 없이 계획만)
  blender -b -P scripts/blender/render_25d_costume.py -- --input model.blend --dry-run
  # 2) 전체(합성) 렌더
  blender -b -P scripts/blender/render_25d_costume.py -- --input model.blend --out out/25d/male
  # 3) 파츠 분리 + 아틀라스 패킹
  blender -b -P scripts/blender/render_25d_costume.py -- --input model.fbx --out out/25d/male \\
      --parts body,armor,helmet,weapon --holdout --atlas all
  # 4) 스크립트 자체 점검(Blender 없이도 됨)
  python3 scripts/blender/render_25d_costume.py --selftest

가이드: `docs/BLENDER_25D_PIPELINE.md` (모델 준비·본/소켓 규약·확정 포즈·기존 파이프라인 연결)
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import struct
import sys
import zlib

# ── 규약 상수 — docs/COSTUME_SYSTEM.md §7.2·§7.4와 반드시 같은 값 ─────────────────

CELL_W, CELL_H = 234, 242          # 셀 크기(최대 동작 캔버스 후보)
BODY_PX = 190                      # heroScale.ts costumeBodyPx — 본체 정규화 높이(px)
PIVOT_X, PIVOT_Y = 0.5, 0.96       # 발끝 피벗(셀 정규화 좌표)
COLUMNS, ROWS = 8, 8               # 아틀라스 페이지 8×8 = 64칸
VARIANT_STRIDE = 32                # 변형 하나가 쓰는 칸 수(사용 30 + 정렬 2)

MOTION_SLOTS = {'idle': 1, 'walk': 8, 'attack': 4, 'slash': 4, 'spin': 6, 'smash': 4, 'cast': 3}
MOTION_ORDER = ['idle', 'walk', 'attack', 'slash', 'spin', 'smash', 'cast']
MOTION_SLOT_BASE = {}
_slot = 0
for _m in MOTION_ORDER:
    MOTION_SLOT_BASE[_m] = _slot
    _slot += MOTION_SLOTS[_m]

# 파츠 이름 → 오브젝트/컬렉션 이름에서 찾을 토큰. 모델마다 이름이 달라 못 찾으면
# 오브젝트 커스텀 속성 `djrpg_part` 또는 `--part-map`으로 직접 지정한다.
PART_TOKENS = {
    'body': ('body', 'skin', 'base', 'naked', 'character', 'torso', 'legs', 'arms'),
    'armor': ('armor', 'armour', 'plate', 'cuirass', 'chest', 'mail'),
    'helmet': ('helmet', 'hood', 'headgear', 'barbute', 'helm'),
    'weapon': ('weapon', 'sword', 'blade', 'zweihander', 'greatsword', 'grip', 'hilt'),
    'gloves': ('glove', 'gauntlet'),
    'boots': ('boot', 'shoe', 'greave', 'sabaton'),
}

# 확정 포즈 스펙 — 사용자가 최종 확정한 시안(docs/references/*.png)을 실행 가능한 형태로 옮긴 것.
# 값은 "리그에 재현할 목표"이며, 축 부호는 모델의 본 축 규약에 맞춰 옮긴다(가이드 §4.3).
POSE_SPEC = {
    'idle': {
        '요약': '양손을 오른쪽 허리 옆에 모아 대검 자루를 함께 쥐고, 가드·날이 허벅지 앞을 지나 '
                '등 뒤 대각선 아래로 땅에 끌릴 듯 뻗은 자세',
        'grip': '오른손이 위·왼손이 아래, 두 손 간격 5~7cm, 그립 지점은 오른쪽 허리 높이(골반 위 3~5cm)',
        'blade': '칼끝이 캐릭터 뒤(후방)로 25~35°, 아래로 40~50° — 칼끝이 뒤발 옆 바닥 가까이',
        'torso': '정면에서 오른쪽으로 10~15° 틀고, 무게를 왼발에 조금 더',
        'free_hand': '없음(왼손이 자루에 고정)',
    },
    'walk': {
        '요약': '걷는 동안에도 왼손이 풀리지 않고 양손이 오른쪽에 모여 자루를 쥔 채 무거운 검을 '
                '뒤쪽 아래로 끌며 전진',
        'grip': 'idle과 같은 그립(두 손 고정). 프레임이 바뀌어도 손 간격·손 높이가 변하지 않는다',
        'blade': '칼끝이 뒤쪽 아래로 끌리며 바닥에서 5~15cm — 발이 오를 때만 칼끝도 살짝 뜬다',
        'torso': '보폭 55~70cm, 상체는 3~5°만 흔들고 무게 중심은 낮게(무거운 검)',
        'free_hand': '없음',
    },
    'attack': {
        '요약': '4단계 연속 궤적 — 끌어올리기 → 머리 위 정점 → 세로 원호 스윙 → 앞바닥까지 길게 내리침',
        'stages': [
            {'id': 'windup', 't': 0.00, '이름': 'Wind-up',
             'grip': '오른쪽 허리 옆(뒤)에서 자루를 쥔 채 어깨 뒤로 당김',
             'blade': '칼끝이 등 뒤 아래 → 뒤 위로 들기 시작',
             'torso': '오른쪽으로 25~30° 감아 몸을 비틂(반동 만들기)'},
            {'id': 'apex', 't': 0.33, '이름': 'Apex',
             'grip': '머리 위(정수리 위 25~35cm), 팔꿈치는 살짝 굽힘',
             'blade': '칼날이 위·뒤로 20~25° 눕고 칼끝은 머리보다 30cm 이상 위',
             'torso': '정면, 허리는 살짝 젖힘 — 다음 프레임에서 앞으로 던진다'},
            {'id': 'mid', 't': 0.66, '이름': 'Mid-swing',
             'grip': '가슴 앞 높이, 두 팔을 앞으로 뻗음',
             'blade': '앞·아래 40~55° — 칼날이 세로 원호를 그리며 내려오는 중',
             'torso': '앞으로 15~20° 숙이고 앞무릎을 굽힘'},
            {'id': 'impact', 't': 1.00, '이름': 'Impact',
             'grip': '앞무릎 높이(허리 아래), 두 팔을 낮게 뻗음',
             'blade': '칼끝이 앞쪽 바닥에 닿고 — 몸에서 1.6~1.8m 앞, **날 전체 길이를 유지**',
             'torso': '깊게 앉아(무게 중심 아래) 앞손이 바닥에 가깝다'},
        ],
        '주의': '피니시에서 칼을 땅에 "파묻어" 길이를 줄이지 않는다. 스윙 궤적은 등 뒤 → 머리 위 → '
                '정면 아래의 한 평면이고, 카메라(쿼터뷰)에서 칼날 길이가 줄어들지 않는 각도를 쓴다.',
    },
}

# 리그 점검용 기대 본 이름(없으면 경고만 — 렌더를 막지 않는다).
EXPECTED_BONES = {
    'root': ('root', 'reference', 'hips'),
    'spine': ('spine', 'spine_01', 'spine1'),
    'head': ('head', 'neck'),
    'hand_r': ('hand_r', 'righthand', 'right_hand', 'hand.r'),
    'hand_l': ('hand_l', 'lefthand', 'left_hand', 'hand.l'),
    'foot_r': ('foot_r', 'rightfoot', 'right_foot'),
    'foot_l': ('foot_l', 'leftfoot', 'left_foot'),
    'weapon_socket': ('weapon_socket', 'weapon.r', 'weapon_r', 'sword_socket', 'prop_r'),
}


# ── CLI ────────────────────────────────────────────────────────────────────────

def _argv_after_dashdash(argv=None):
    """Blender는 `--` 뒤의 인자만 스크립트에 준다. `python3 script.py ...` 직접 실행도 지원."""
    argv = list(sys.argv[1:] if argv is None else argv)
    if '--' in argv:
        return argv[argv.index('--') + 1:]
    return argv


def build_parser():
    p = argparse.ArgumentParser(
        prog='render_25d_costume.py',
        description='DJRPG 3D→2.5D 코스튬 셀 렌더러 (Blender CLI). `--` 뒤의 인자만 받는다.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='예) blender -b -P scripts/blender/render_25d_costume.py -- '
               '--input model.blend --out out/male --parts body,armor,helmet,weapon --atlas all',
    )
    io = p.add_argument_group('입출력')
    io.add_argument('--input', help='모델 파일(.blend/.glb/.gltf/.fbx)')
    io.add_argument('--out', default='out/25d', help='셀 출력 폴더(기본 out/25d)')
    io.add_argument('--label', default='', help='아틀라스·매니페스트 파일 접두(기본 입력 파일명)')

    act = p.add_argument_group('액션·프레임')
    act.add_argument('--actions', default='idle,walk,attack',
                     help='렌더할 액션(쉼표). 지원: ' + ','.join(MOTION_ORDER))
    act.add_argument('--frames-per-action', default='',
                     help='액션별 프레임 수 덮어쓰기 예) walk=8,attack=4')
    act.add_argument('--frame-range', default='',
                     help='모든 액션에 공통 적용할 프레임 범위 예) 1:33')
    act.add_argument('--include-end', action='store_true',
                     help='샘플에 액션 마지막 프레임 포함(기본은 끝을 제외해 반복 포즈 중복을 막는다)')

    cam = p.add_argument_group('카메라·조명')
    cam.add_argument('--cell-width', type=int, default=CELL_W, help='셀 폭(기본 234)')
    cam.add_argument('--cell-height', type=int, default=CELL_H, help='셀 높이(기본 242)')
    cam.add_argument('--body-px', type=float, default=BODY_PX, help='본체 정규화 높이 px(기본 190)')
    cam.add_argument('--pivot-x', type=float, default=PIVOT_X, help='발끝 피벗 x(기본 0.5)')
    cam.add_argument('--pivot-y', type=float, default=PIVOT_Y, help='발끝 피벗 y(기본 0.96)')
    cam.add_argument('--camera-pitch', type=float, default=35.0, help='카메라 앙각(도, 기본 35)')
    cam.add_argument('--camera-yaw', type=float, default=30.0, help='카메라 방위각(도, 기본 30)')
    cam.add_argument('--camera-distance', type=float, default=6.0, help='카메라 거리(m, 기본 6)')
    cam.add_argument('--light-key', type=float, default=3.2, help='주광 세기(기본 3.2)')
    cam.add_argument('--light-rim', type=float, default=2.4, help='림라이트 세기(기본 2.4)')
    cam.add_argument('--light-fill', type=float, default=0.7, help='보조광 세기(기본 0.7)')
    cam.add_argument('--anchor-bone', default='',
                     help='발끝 앵커로 쓸 본 이름(기본은 메시 최저점 자동 검출)')
    cam.add_argument('--measure-action', default='idle', help='본체 높이를 잴 액션(기본 idle)')

    par = p.add_argument_group('파츠·아틀라스·품질')
    par.add_argument('--parts', default='',
                     help='파츠 분리 렌더(쉼표): body,armor,helmet,weapon,gloves,boots 또는 임의 이름')
    par.add_argument('--part-map', action='append', default=[], metavar='PART=PATTERN',
                     help='오브젝트 이름 부분일치로 파츠 지정(여러 번 가능) 예) helmet=Helm')
    par.add_argument('--holdout', action='store_true',
                     help='선택하지 않은 파츠를 숨기지 않고 Holdout으로 가린다(Cycles)')
    par.add_argument('--atlas', default='', help="아틀라스로 묶을 파츠(쉼표) 또는 'all'")
    par.add_argument('--atlas-columns', type=int, default=COLUMNS)
    par.add_argument('--atlas-rows', type=int, default=ROWS)
    par.add_argument('--atlas-variant', type=int, default=0, help='페이지 안 변형 번호(0 또는 1)')
    par.add_argument('--manifest', default='', help='렌더 매니페스트 JSON 경로(기본 <out>/render-manifest.json)')
    par.add_argument('--engine', choices=('cycles', 'eevee'), default='cycles',
                     help='렌더 엔진(기본 cycles — 백그라운드에서 안정적)')
    par.add_argument('--samples', type=int, default=64, help='샘플 수(기본 64)')
    par.add_argument('--device', choices=('CPU', 'GPU'), default='CPU', help='Cycles 장치(기본 CPU)')
    par.add_argument('--denoise', action='store_true', help='Cycles 디노이즈(기본 꺼짐 — 프레임 간 편차 방지)')

    etc = p.add_argument_group('기타')
    etc.add_argument('--dry-run', action='store_true', help='렌더 없이 계획(모델·액션·파츠·경로)만 출력')
    etc.add_argument('--print-spec', action='store_true', help='확정 포즈 스펙을 출력하고 종료')
    etc.add_argument('--selftest', action='store_true', help='Blender 없이 PNG·슬롯 계산 자체 점검')
    etc.add_argument('--quiet', action='store_true', help='진행 로그 최소화')
    return p


def log(args, *msg):
    if not getattr(args, 'quiet', False):
        print('[25d]', *msg, flush=True)


def warn(*msg):
    print('[25d][경고]', *msg, file=sys.stderr, flush=True)


def fail(msg):
    print('[25d][실패]', msg, file=sys.stderr, flush=True)
    raise SystemExit(1)


# ── 최소 PNG 코덱 (아틀라스 패커용 — 8bit·비인터레이스만) ────────────────────────

def png_read_rgba(path):
    """PNG → (width, height, rgba bytes). 지원: bit depth 8, color type 0/2/4/6, 비인터레이스."""
    with open(path, 'rb') as fh:
        data = fh.read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'PNG 시그니처가 아님: {path}')
    pos, width, height, depth, color, interlace = 8, 0, 0, 0, 0, 0
    idat = bytearray()
    while pos + 8 <= len(data):
        (length,) = struct.unpack('>I', data[pos:pos + 4])
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctype == b'IHDR':
            width, height, depth, color, _comp, _filt, interlace = struct.unpack('>IIBBBBB', chunk)
        elif ctype == b'IDAT':
            idat += chunk
        elif ctype == b'IEND':
            break
    if depth != 8 or interlace != 0 or color not in (0, 2, 4, 6):
        raise ValueError(f'지원하지 않는 PNG 형식(depth={depth}, color={color}, '
                         f'interlace={interlace}): {path}')
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[color]
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    out = bytearray(height * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(height):
        ftype = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if ftype == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        elif ftype != 0:
            raise ValueError(f'알 수 없는 PNG 필터 {ftype}: {path}')
        out[y * stride:(y + 1) * stride] = line
        prev = line
    if channels == 4:
        return width, height, bytes(out)
    rgba = bytearray(width * height * 4)
    for i in range(width * height):
        if channels == 3:
            rgba[i * 4:i * 4 + 3] = out[i * 3:i * 3 + 3]
        elif channels == 1:
            v = out[i]
            rgba[i * 4:i * 4 + 3] = bytes((v, v, v))
        else:                                   # gray + alpha
            v, a = out[i * 2], out[i * 2 + 1]
            rgba[i * 4:i * 4 + 3] = bytes((v, v, v))
            rgba[i * 4 + 3] = a
            continue
        rgba[i * 4 + 3] = 255
    return width, height, bytes(rgba)


def png_write_rgba(path, width, height, rgba):
    """RGBA bytes → PNG(필터 0, zlib). 아틀라스 페이지 저장용."""
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(raw), 6)

    def chunk(tag, payload):
        return (struct.pack('>I', len(payload)) + tag + payload +
                struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF))

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', comp) +
                 chunk(b'IEND', b''))


# ── 이름·액션 해석 ─────────────────────────────────────────────────────────────

def norm_name(text):
    """`mixamorig:RightHand` · `Armature|Idle` · `L_Armor.001` → `righthand` · `idle` · `larmor`."""
    text = str(text or '')
    for sep in ('|', ':', '/'):
        if sep in text:
            text = text.rsplit(sep, 1)[-1]
    text = re.sub(r'\.\d{3}$', '', text)          # Blender 중복 접미 .001
    return re.sub(r'[^a-z0-9]', '', text.lower())


def norm_tokens(text):
    return [t for t in re.split(r'[^a-z0-9]+', str(text or '').lower()) if t]


def parse_csv(text):
    return [t.strip() for t in (text or '').split(',') if t.strip()]


def parse_pairs(text):
    out = {}
    for item in parse_csv(text):
        if '=' not in item:
            fail(f'`{item}` 형식이 아니다. 예) walk=8')
        key, value = item.split('=', 1)
        try:
            out[key.strip().lower()] = int(value)
        except ValueError:
            fail(f'프레임 수가 정수가 아니다: {item}')
    return out


def action_frames(action, count, include_end, override_range=None):
    """액션 범위에서 count개 프레임을 균등 샘플. 기본은 마지막 프레임 제외(반복 포즈 중복 방지)."""
    if override_range:
        start, end = override_range
    else:
        start, end = (float(x) for x in action.frame_range)
    if count <= 1:
        return [int(round(start))]
    step = (end - start) / (count - 1 if include_end else count)
    frames = [int(round(start + step * i)) for i in range(count)]
    for i in range(1, len(frames)):               # 반올림으로 겹치면 최소 1프레임씩 벌린다
        if frames[i] <= frames[i - 1]:
            frames[i] = frames[i - 1] + 1
    return frames


def find_action(actions, name):
    """정확 일치 → 정규화 일치 → 정규화 부분일치 순서로 액션을 찾는다."""
    key = norm_name(name)
    for act in actions:
        if act.name.lower() == name.lower():
            return act
    for act in actions:
        if norm_name(act.name) == key:
            return act
    for act in actions:
        if key and key in norm_name(act.name):
            return act
    return None


def parse_part_map(entries):
    mapping = []
    for entry in entries:
        if '=' not in entry:
            fail(f'--part-map 형식은 PART=PATTERN 이다. 받은 값: {entry}')
        part, pattern = entry.split('=', 1)
        mapping.append((part.strip().lower(), pattern.strip().lower()))
    return mapping


def classify_object(obj, part_map):
    """오브젝트 → 파츠 이름. ① 커스텀 속성 ② --part-map ③ 이름/컬렉션 토큰. 못 찾으면 None."""
    prop = obj.get('djrpg_part') if hasattr(obj, 'get') else None
    if isinstance(prop, str) and prop.strip():
        return prop.strip().lower()
    names = [obj.name] + [c.name for c in getattr(obj, 'users_collection', [])]
    joined = ' '.join(names).lower()
    for part, pattern in part_map:
        if pattern and pattern in joined:
            return part
    tokens = set()
    for name in names:
        tokens.update(norm_tokens(name))
    for part, part_tokens in PART_TOKENS.items():
        if any(token in tokens for token in part_tokens):
            return part
    return None


# ── Blender 씬 준비 ────────────────────────────────────────────────────────────

def require_bpy():
    try:
        import bpy
    except ImportError:
        fail('bpy가 없다. 이 스크립트는 Blender 안에서 실행한다: '
             '`blender -b -P scripts/blender/render_25d_costume.py -- --input model.blend`. '
             '자체 점검은 `--selftest`.')
    return bpy


def load_model(bpy, path):
    ext = os.path.splitext(path)[1].lower()
    if not os.path.isfile(path):
        fail(f'입력 파일이 없다: {path}')
    if ext == '.blend':
        bpy.ops.wm.open_mainfile(filepath=path)
        return 'blend'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
        return 'gltf'
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
        return 'fbx'
    fail(f'지원하지 않는 확장자: {ext} (.blend/.glb/.gltf/.fbx)')


def assign_action(obj, action):
    if obj.animation_data is None:
        obj.animation_data_create()
    ad = obj.animation_data
    for track in list(ad.nla_tracks):
        track.mute = True                      # NLA가 액션을 덮어쓰지 않게
    ad.action = action
    slots = getattr(action, 'slots', None)     # Blender 4.4+ 슬롯 액션
    if slots:
        try:
            ad.action_slot = slots[0]
        except Exception:
            pass


def rig_report(bpy, armature, args):
    bones = {norm_name(b.name): b.name for b in armature.data.bones}
    found, missing = {}, []
    for role, aliases in EXPECTED_BONES.items():
        hit = next((bones[norm_name(a)] for a in aliases if norm_name(a) in bones), None)
        if hit:
            found[role] = hit
        else:
            missing.append(role)
    log(args, f'리그 본 {len(bones)}개 · 기대 역할 {len(found)}/{len(EXPECTED_BONES)} 확인')
    for role, bone in found.items():
        log(args, f'  · {role:<14} = {bone}')
    if missing:
        warn('기대 본을 찾지 못했다: ' + ', '.join(missing) +
             ' — 앵커 자동 검출은 그대로 동작하지만, 양손 그립은 모델 리깅에서 만든다(가이드 §4).')
    return found


# ── 카메라·조명 ────────────────────────────────────────────────────────────────

def direction_from(yaw_deg, pitch_deg):
    from mathutils import Vector
    y, p = math.radians(yaw_deg), math.radians(pitch_deg)
    return Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))


def place_camera(cam, target, yaw, pitch, distance):
    direction = direction_from(yaw, pitch)     # 타깃 → 카메라 방향
    cam.location = target + direction * distance
    cam.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()


def add_sun(bpy, scene, name, direction, energy, color, angle_deg=12.0):
    data = bpy.data.lights.new(name, type='SUN')
    data.energy = energy
    data.color = color
    data.angle = math.radians(angle_deg)
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return obj


def setup_camera_lights(bpy, scene, args):
    from mathutils import Vector
    # 파일에 들어 있던 카메라·조명은 끄고 우리 3점 조명만 쓴다(프레임 간 색 고정).
    for obj in list(bpy.data.objects):
        if obj.type in {'LIGHT', 'CAMERA'}:
            obj.hide_render = True
            for coll in list(obj.users_collection):
                coll.objects.unlink(obj)

    cam_data = bpy.data.cameras.new('25d_camera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 2.4
    cam_data.clip_start = 0.05
    cam_data.clip_end = 60.0
    cam = bpy.data.objects.new('25d_camera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    place_camera(cam, Vector((0, 0, 1.0)), args.camera_yaw, args.camera_pitch,
                 args.camera_distance)

    # 3점 조명: 차분한 주광(전면 위) + 차가운 림(뒤) + 낮은 보조광.
    add_sun(bpy, scene, 'key_light', direction_from(args.camera_yaw - 40, 52),
            args.light_key, (1.0, 0.93, 0.82))
    add_sun(bpy, scene, 'rim_light', direction_from(args.camera_yaw + 150, 38),
            args.light_rim, (0.55, 0.68, 1.0), angle_deg=25.0)
    add_sun(bpy, scene, 'fill_light', direction_from(args.camera_yaw - 105, 12),
            args.light_fill, (0.72, 0.78, 0.92), angle_deg=45.0)

    if scene.world is None:
        scene.world = bpy.data.worlds.new('25d_world')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.045, 0.050, 0.065, 1.0)
        bg.inputs[1].default_value = 1.0
    return cam


def setup_render(bpy, scene, args):
    if args.engine == 'eevee':
        for candidate in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
            try:
                scene.render.engine = candidate
                break
            except (TypeError, ValueError):
                continue
        else:
            fail('이 Blender에는 EEVEE가 없다. --engine cycles로 실행한다.')
    else:
        try:
            scene.render.engine = 'CYCLES'
        except (TypeError, ValueError):
            warn('Cycles를 켤 수 없다(애드온 비활성?) — EEVEE로 렌더한다')
            scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = args.cell_width
    scene.render.resolution_y = args.cell_height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 70
    scene.render.use_file_extension = True
    scene.render.use_persistent_data = True
    scene.render.threads_mode = 'AUTO'
    if scene.render.engine == 'CYCLES':
        scene.cycles.samples = args.samples
        scene.cycles.device = args.device
        scene.cycles.use_denoising = bool(args.denoise)
        scene.cycles.use_adaptive_sampling = True
    else:
        scene.eevee.taa_render_samples = max(16, args.samples)
    # 스프라이트는 톤매핑하지 않는다(프레임 간 색 고정).
    try:
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
        scene.view_settings.exposure = 0.0
        scene.view_settings.gamma = 1.0
    except Exception:
        pass
    log(args, f'렌더 {scene.render.engine} · {args.cell_width}×{args.cell_height} · '
              f'samples={args.samples} · device={args.device if scene.render.engine == "CYCLES" else "n/a"}')


# ── 발끝 앵커·본체 높이 측정과 카메라 피팅 ─────────────────────────────────────

def object_world_points(obj, depsgraph, stride=3):
    evo = obj.evaluated_get(depsgraph)
    try:
        mesh = evo.to_mesh()
    except Exception:
        return []
    if mesh is None:
        return []
    matrix = evo.matrix_world
    pts = []
    try:
        for i in range(0, len(mesh.vertices), max(1, stride)):
            pts.append(matrix @ mesh.vertices[i].co)
    finally:
        evo.to_mesh_clear()
    return pts


def measure_anchor_and_height(bpy, objs, args, armature=None):
    """최저점 띠의 중심을 발끝 앵커로, z 범위를 본체 높이(m)로 돌려준다."""
    from mathutils import Vector
    depsgraph = bpy.context.evaluated_depsgraph_get()
    if args.anchor_bone and armature is not None:
        bone = armature.data.bones.get(args.anchor_bone)
        if bone is None:
            warn(f'--anchor-bone `{args.anchor_bone}`을 찾지 못해 자동 검출로 넘어간다')
        else:
            anchor = armature.matrix_world @ bone.head_local
            pts = [p for obj in objs for p in object_world_points(obj, depsgraph, stride=9)]
            top = max((p.z for p in pts), default=anchor.z + 1.7)
            return Vector((anchor.x, anchor.y, anchor.z)), max(0.3, top - anchor.z)

    pts = [p for obj in objs for p in object_world_points(obj, depsgraph, stride=3)]
    if not pts:
        fail('메시 정점을 읽지 못했다. 파츠/오브젝트가 렌더 가능한 상태인지 확인한다.')
    zmin = min(p.z for p in pts)
    zmax = max(p.z for p in pts)
    band = zmin + max(0.01, (zmax - zmin) * 0.02)
    feet = [p for p in pts if p.z <= band] or pts
    ax = sum(p.x for p in feet) / len(feet)
    ay = sum(p.y for p in feet) / len(feet)
    return Vector((ax, ay, zmin)), (zmax - zmin)


def project_point(bpy, scene, cam, point):
    from bpy_extras.object_utils import world_to_camera_view
    view = world_to_camera_view(scene, cam, point)
    return (view[0] * scene.render.resolution_x,
            (1.0 - view[1]) * scene.render.resolution_y)


def projected_height_px(bpy, scene, cam, base, height):
    from mathutils import Vector
    from bpy_extras.object_utils import world_to_camera_view
    a = world_to_camera_view(scene, cam, base)
    b = world_to_camera_view(scene, cam, base + Vector((0, 0, height)))
    return abs(b[1] - a[1]) * scene.render.resolution_y


def fit_camera(bpy, scene, cam, anchor, height, args):
    """발끝 = 피벗 픽셀, 본체 높이 = --body-px 가 되도록 직교 카메라를 맞춘다."""
    from mathutils import Vector
    scene.render.resolution_x = args.cell_width
    scene.render.resolution_y = args.cell_height
    target = Vector((anchor.x, anchor.y, anchor.z + height * 0.5))
    place_camera(cam, target, args.camera_yaw, args.camera_pitch, args.camera_distance)
    bpy.context.view_layer.update()

    # ① 크기: 투영된 본체 높이를 목표 px에 맞춘다(직교라 1회 보정으로 정확).
    measured = projected_height_px(bpy, scene, cam, anchor, height)
    if measured <= 4:
        warn(f'본체 투영 높이가 {measured:.1f}px로 너무 작다 — ortho_scale 보정을 건너뛴다')
    else:
        cam.data.ortho_scale *= args.body_px / measured
        bpy.context.view_layer.update()

    # ② 위치: 발끝을 피벗 픽셀에 앉힌다(직교라 2~3회면 수렴).
    max_px = max(scene.render.resolution_x, scene.render.resolution_y)
    for _ in range(4):
        px, py = project_point(bpy, scene, cam, anchor)
        dx = args.pivot_x * scene.render.resolution_x - px
        dy = args.pivot_y * scene.render.resolution_y - py
        if abs(dx) < 0.5 and abs(dy) < 0.5:
            break
        unit = cam.data.ortho_scale / max_px
        basis = cam.matrix_world.to_3x3()
        right = basis @ Vector((1, 0, 0))
        up = basis @ Vector((0, 1, 0))
        target = target + up * (dy * unit) - right * (dx * unit)
        place_camera(cam, target, args.camera_yaw, args.camera_pitch, args.camera_distance)
        bpy.context.view_layer.update()

    px, py = project_point(bpy, scene, cam, anchor)
    height_px = projected_height_px(bpy, scene, cam, anchor, height)
    log(args, f'카메라 피팅: 발끝 ({px:.1f}, {py:.1f})px · 본체 {height_px:.1f}px '
              f'(목표 {args.pivot_x * args.cell_width:.1f}, {args.pivot_y * args.cell_height:.1f} / '
              f'{args.body_px:.0f}px) · ortho_scale {cam.data.ortho_scale:.3f}')
    return {'foot_px': [round(px, 2), round(py, 2)], 'body_px': round(height_px, 2),
            'ortho_scale': round(cam.data.ortho_scale, 4)}


# ── 파츠 적용·아틀라스·매니페스트 ──────────────────────────────────────────────

def _set_holdout(obj, value):
    try:
        obj.is_holdout = bool(value)
    except AttributeError:
        pass


def apply_parts(assigned, selected, holdout):
    """selected가 비어 있으면 전체(합성) 렌더 — 모든 파츠를 보인다."""
    for obj, part in assigned.items():
        if not selected or part in selected:
            obj.hide_render = False
            _set_holdout(obj, False)
        elif holdout:
            obj.hide_render = False
            _set_holdout(obj, True)
        else:
            obj.hide_render = True
            _set_holdout(obj, False)


def pack_atlas(args, rendered, out_root, label):
    """파츠별로 8×8 페이지를 만들어 페이지 목록을 돌려준다."""
    pages = []
    by_part = {}
    for item in rendered:
        by_part.setdefault(item['part'], []).append(item)
    for part, items in sorted(by_part.items()):
        width = args.atlas_columns * args.cell_width
        height = args.atlas_rows * args.cell_height
        page = bytearray(width * height * 4)
        used = 0
        for item in items:
            action = item['action']
            if action not in MOTION_SLOT_BASE:
                warn(f'아틀라스: `{action}`은 슬롯 규약에 없어 건너뛴다')
                continue
            slot = MOTION_SLOT_BASE[action] + item['index']
            cell = args.atlas_variant * VARIANT_STRIDE + slot
            col, row = cell % args.atlas_columns, cell // args.atlas_columns
            if row >= args.atlas_rows:
                warn(f'아틀라스: {item["file"]} 슬롯 {cell}이 페이지({args.atlas_rows}행)를 넘어 건너뛴다')
                continue
            w, h, rgba = png_read_rgba(os.path.join(out_root, item['file']))
            if (w, h) != (args.cell_width, args.cell_height):
                warn(f'아틀라스: {item["file"]} 셀 크기 {w}×{h}가 규약과 달라 건너뛴다')
                continue
            stride = width * 4
            for y in range(h):
                src = y * w * 4
                dst = (row * args.cell_height + y) * stride + col * args.cell_width * 4
                page[dst:dst + w * 4] = rgba[src:src + w * 4]
            item['slot'] = cell
            used += 1
        path = os.path.join(out_root, 'atlas', f'{part}-{label}-v{args.atlas_variant}.png')
        png_write_rgba(path, width, height, bytes(page))
        pages.append({'file': os.path.relpath(path, out_root), 'part': part,
                      'width': width, 'height': height,
                      'columns': args.atlas_columns, 'rows': args.atlas_rows,
                      'variant': args.atlas_variant, 'cells': used})
        log(args, f'  아틀라스 {pages[-1]["file"]} ({width}×{height}, {used}칸)')
    return pages


def write_manifest(args, out_root, rendered, pages, camera):
    path = args.manifest or os.path.join(out_root, 'render-manifest.json')
    data = {
        'schemaVersion': 1,
        'source': os.path.basename(args.input) if args.input else '',
        'cell': {'width': args.cell_width, 'height': args.cell_height,
                 'pivot': [args.pivot_x, args.pivot_y], 'bodyPx': args.body_px},
        'slotBases': MOTION_SLOT_BASE,
        'variantStride': VARIANT_STRIDE,
        'camera': {'pitch': args.camera_pitch, 'yaw': args.camera_yaw,
                   'distance': args.camera_distance, **camera},
        'pages': pages,
        'frames': [{'action': i['action'], 'index': i['index'], 'part': i['part'],
                    'slot': i.get('slot'), 'frame': i['frame'], 'file': i['file']}
                   for i in rendered],
    }
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    log(args, f'매니페스트 {path}')
    return path


# ── 포즈 스펙 출력 ─────────────────────────────────────────────────────────────

def print_spec():
    print('DJRPG 2.5D 대검 포즈 확정 스펙 (docs/references/*.png 기준)\n')
    for key in ('idle', 'walk', 'attack'):
        spec = POSE_SPEC[key]
        print(f'■ {key} — {spec["요약"]}')
        for field in ('grip', 'blade', 'torso', 'free_hand', '주의'):
            if field in spec:
                print(f'  · {field}: {spec[field]}')
        for stage in spec.get('stages', []):
            print(f'  · [{stage["이름"]}] t={stage["t"]:.2f}')
            print(f'      grip : {stage["grip"]}')
            print(f'      blade: {stage["blade"]}')
            print(f'      torso: {stage["torso"]}')
        print()


# ── 자체 점검(Blender 없이) ────────────────────────────────────────────────────

def selftest():
    import tempfile
    ok = 0

    # 1) PNG 왕복
    w, h = 7, 5
    rgba = bytearray(w * h * 4)
    for i in range(w * h):
        rgba[i * 4:i * 4 + 4] = bytes((i % 256, (i * 7) % 256, (i * 13) % 256, (i * 29) % 256))
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'roundtrip.png')
        png_write_rgba(path, w, h, bytes(rgba))
        gw, gh, got = png_read_rgba(path)
        assert (gw, gh) == (w, h), (gw, gh)
        assert got == bytes(rgba), 'PNG 왕복이 픽셀 단위로 일치하지 않는다'
    ok += 1
    print('  ✓ PNG 쓰기/읽기 왕복')

    # 2) 프레임 슬롯 규약
    assert MOTION_SLOT_BASE == {'idle': 0, 'walk': 1, 'attack': 9, 'slash': 13,
                                'spin': 17, 'smash': 23, 'cast': 27}, MOTION_SLOT_BASE
    assert sum(MOTION_SLOTS.values()) == 30 and VARIANT_STRIDE == 32
    ok += 1
    print('  ✓ 프레임 슬롯 합계 30 / 변형 32칸 / 8×8 페이지')

    # 3) 프레임 샘플링
    class _A:
        frame_range = (1.0, 33.0)
    assert action_frames(_A(), 1, False) == [1]
    assert action_frames(_A(), 4, False) == [1, 9, 17, 25]
    assert action_frames(_A(), 8, False) == [1, 5, 9, 13, 17, 21, 25, 29]
    assert action_frames(_A(), 4, True) == [1, 12, 22, 33]
    ok += 1
    print('  ✓ 액션 범위 균등 샘플링(끝 제외/포함)')

    # 4) 이름 정규화
    assert norm_name('mixamorig:RightHand') == 'righthand'
    assert norm_name('Armature|Idle') == 'idle'
    assert norm_name('L_Armor.001') == 'larmor'
    assert norm_tokens('Armor_Plate-L')[:2] == ['armor', 'plate']
    ok += 1
    print('  ✓ 오브젝트·액션 이름 정규화')

    # 5) CLI 파서 기본값
    args = build_parser().parse_args(['--input', 'm.blend', '--parts', 'body,weapon',
                                      '--atlas', 'all', '--holdout'])
    assert args.cell_width == CELL_W and args.cell_height == CELL_H and args.body_px == BODY_PX
    assert args.camera_pitch == 35.0 and args.camera_yaw == 30.0
    assert args.holdout and args.atlas == 'all'
    ok += 1
    print('  ✓ CLI 인자 파싱·기본값(234×242, 190px)')

    # 6) 포즈 스펙 4단계
    stages = POSE_SPEC['attack']['stages']
    assert [s['id'] for s in stages] == ['windup', 'apex', 'mid', 'impact']
    assert [round(s['t'], 2) for s in stages] == [0.0, 0.33, 0.66, 1.0]
    ok += 1
    print('  ✓ 공격 4단계(Wind-up·Apex·Mid-swing·Impact) 스펙')

    print(f'\n자체 점검 {ok}/6 통과')
    return 0


# ── 실행 ──────────────────────────────────────────────────────────────────────

def run(args):
    bpy = require_bpy()

    model_path = os.path.abspath(args.input)
    fmt = load_model(bpy, model_path)
    scene = bpy.context.scene
    log(args, f'모델 {os.path.basename(model_path)} ({fmt}) 로드')

    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    armature = armatures[0] if armatures else None
    if armature is None:
        warn('아마추어가 없다 — 정지 모델은 idle 한 프레임만 렌더된다.')

    # 파츠 해석
    parts = [p.lower() for p in parse_csv(args.parts)]
    part_map = parse_part_map(args.part_map)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not meshes:
        fail('메시 오브젝트가 없다.')
    assigned = {}
    for obj in meshes:
        part = classify_object(obj, part_map)
        if part is None:
            part = 'body'
            if parts:
                warn(f'`{obj.name}`의 파츠를 이름으로 알 수 없어 body로 둔다 — '
                     f'`--part-map armor={obj.name.split(".")[0]}`처럼 지정할 수 있다')
        # 요청하지 않은 파츠도 표에 남겨 둔다(렌더 때 숨겨야 다른 파츠가 섞이지 않는다).
        assigned[obj] = part
    if parts:
        missing = [p for p in parts if p not in set(assigned.values())]
        if missing:
            warn('오브젝트를 찾지 못한 파츠: ' + ', '.join(missing) + ' (해당 파츠는 빈 셀로 남는다)')

    # 액션 해석
    counts = dict(MOTION_SLOTS)
    counts.update(parse_pairs(args.frames_per_action))
    wanted = [a.lower() for a in parse_csv(args.actions)]
    unknown = [a for a in wanted if a not in MOTION_SLOTS]
    if unknown:
        fail(f'지원하지 않는 액션: {", ".join(unknown)} (지원: {", ".join(MOTION_ORDER)})')
    override_range = None
    if args.frame_range:
        if ':' not in args.frame_range:
            fail('--frame-range는 `시작:끝` 형식이다. 예) 1:33')
        a, b = args.frame_range.split(':', 1)
        override_range = (float(a), float(b))

    resolved, missing_actions = [], []
    for name in wanted:
        action = find_action(bpy.data.actions, name)
        if action is None:
            missing_actions.append(name)
            continue
        resolved.append((name, action, action_frames(action, counts[name], args.include_end,
                                                     override_range)))
    if not resolved:
        fail('요청한 액션을 모델에서 찾지 못했다: ' + ', '.join(wanted) +
             f' (모델 액션: {", ".join(a.name for a in bpy.data.actions) or "없음"})')
    if missing_actions:
        warn('모델에 없는 액션은 건너뛴다: ' + ', '.join(missing_actions))

    if args.dry_run:
        plan = {
            'input': model_path, 'format': fmt, 'out': os.path.abspath(args.out),
            'armature': armature.name if armature else None,
            'actions': [{'name': n, 'action': a.name,
                         'range': [float(x) for x in a.frame_range], 'frames': f}
                        for n, a, f in resolved],
            'parts': {p: sorted(o.name for o, q in assigned.items() if q == p)
                      for p in sorted(set(assigned.values()))},
            'renderParts': parts or ['full'],
            'cell': {'width': args.cell_width, 'height': args.cell_height,
                     'pivot': [args.pivot_x, args.pivot_y], 'bodyPx': args.body_px},
            'camera': {'pitch': args.camera_pitch, 'yaw': args.camera_yaw,
                       'distance': args.camera_distance},
            'engine': args.engine, 'samples': args.samples, 'holdout': args.holdout,
            'atlas': parse_csv(args.atlas),
            'outputs': [f'{p}/{n}-{i:02d}.png'
                        for p in (parts or ['full']) for n, _a, f in resolved
                        for i in range(len(f))],
        }
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    cam = setup_camera_lights(bpy, scene, args)
    setup_render(bpy, scene, args)
    if armature is not None:
        rig_report(bpy, armature, args)

    # 측정: 본체 파츠(없으면 무기 제외 전체)를 측정 액션 첫 프레임에서 본다.
    measure_action = find_action(bpy.data.actions, args.measure_action)
    if measure_action is None and resolved:
        measure_action = resolved[0][1]
    if measure_action is not None:
        if armature is not None:
            assign_action(armature, measure_action)
        measure_frames = action_frames(measure_action, 1, False, override_range)
        scene.frame_set(measure_frames[0])
        bpy.context.view_layer.update()
    measure_objs = [o for o, p in assigned.items() if p == 'body'] or \
                   [o for o, p in assigned.items() if p != 'weapon']
    for obj in measure_objs:
        obj.hide_render = False
    anchor, height = measure_anchor_and_height(bpy, measure_objs, args, armature)
    log(args, f'발끝 앵커 ({anchor.x:.3f}, {anchor.y:.3f}, {anchor.z:.3f}) · '
              f'본체 높이 {height:.3f}m')
    camera_meta = fit_camera(bpy, scene, cam, anchor, height, args)

    # 렌더
    out_root = os.path.abspath(args.out)
    os.makedirs(out_root, exist_ok=True)
    label = args.label or os.path.splitext(os.path.basename(model_path))[0] or 'model'
    log(args, f'출력 {out_root} · 파츠 {parts or ["full(합성)"]} · '
              f'액션 {", ".join(n for n, _a, _f in resolved)}')

    rendered = []
    for name, action, frames in resolved:
        if armature is not None:
            assign_action(armature, action)
        for part in (parts or ['full']):
            apply_parts(assigned, {part} if parts else set(), args.holdout)
            folder = os.path.join(out_root, part)
            os.makedirs(folder, exist_ok=True)
            for index, frame in enumerate(frames):
                scene.frame_set(frame)
                bpy.context.view_layer.update()
                path = os.path.join(folder, f'{name}-{index:02d}.png')
                scene.render.filepath = path
                bpy.ops.render.render(write_still=True)
                if not os.path.isfile(path):
                    fail(f'렌더 결과 파일이 없다: {path}')
                rendered.append({'action': name, 'index': index, 'frame': frame,
                                 'part': part, 'file': os.path.relpath(path, out_root)})
                log(args, f'  {part}/{name}-{index:02d}.png (frame {frame})')

    pages = []
    atlas_parts = [p.lower() for p in parse_csv(args.atlas)]
    if atlas_parts:
        target_parts = (sorted({i['part'] for i in rendered})
                        if 'all' in atlas_parts else atlas_parts)
        pages = pack_atlas(args, [i for i in rendered if i['part'] in target_parts],
                           out_root, label)

    manifest = write_manifest(args, out_root, rendered, pages, camera_meta)
    print(json.dumps({'rendered': len(rendered), 'pages': [p['file'] for p in pages],
                      'manifest': manifest, 'camera': camera_meta}, ensure_ascii=False, indent=2))
    return 0


def main(argv=None):
    raw = _argv_after_dashdash(argv)
    args, extra = build_parser().parse_known_args(raw)
    if extra:
        warn('알 수 없는 인자는 무시한다: ' + ' '.join(extra) +
             ' (Blender에 넘긴 인자는 `--` 뒤에 둔다)')
    if args.print_spec:
        print_spec()
        return 0
    if args.selftest:
        return selftest()
    if not args.input:
        build_parser().print_help()
        print('\n[25d][실패] --input이 필요하다(또는 --selftest / --print-spec).', file=sys.stderr)
        return 2
    return run(args)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
