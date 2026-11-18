import type { Gender, Save } from '../store';

export type ClassId = 'warrior';
export type WeaponSocket = {
  u: number; v: number; size: number; rotation: number;
  anchorX: number; anchorY: number; zOrder: number;
};
export type WeaponMotionSockets = { idle: WeaponSocket; walk: readonly WeaponSocket[] };
export type WeaponSocketTable = Record<ClassId, Record<Gender, WeaponMotionSockets>>;

export const weaponSockets: WeaponSocketTable = {
  warrior: {
    male: {
      idle: { u: .54, v: .44, size: .55, rotation: 0, anchorX: .18, anchorY: .82, zOrder: 1 },
      walk: [
        { u: .59, v: .45, size: .55, rotation: -.04, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .60, v: .43, size: .55, rotation: -.02, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .61, v: .44, size: .55, rotation: .01, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .60, v: .46, size: .55, rotation: .03, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .59, v: .45, size: .55, rotation: -.04, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .60, v: .43, size: .55, rotation: -.02, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .61, v: .44, size: .55, rotation: .01, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .60, v: .46, size: .55, rotation: .03, anchorX: .18, anchorY: .82, zOrder: 1 }
      ]
    },
    female: {
      idle: { u: .37, v: .49, size: .55, rotation: 0, anchorX: .18, anchorY: .82, zOrder: 1 },
      walk: [
        { u: .51, v: .44, size: .55, rotation: -.04, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .52, v: .42, size: .55, rotation: -.02, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .53, v: .43, size: .55, rotation: .01, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .52, v: .45, size: .55, rotation: .03, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .51, v: .44, size: .55, rotation: -.04, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .52, v: .42, size: .55, rotation: -.02, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .53, v: .43, size: .55, rotation: .01, anchorX: .18, anchorY: .82, zOrder: 1 },
        { u: .52, v: .45, size: .55, rotation: .03, anchorX: .18, anchorY: .82, zOrder: 1 }
      ]
    }
  }
};

export function heroClass(_save: Pick<Save, 'gender'>): ClassId { return 'warrior'; }

/**
 * 코스튬 모션 이름 → 무기 소켓 모션 (작업 140).
 *
 * 코스튬 모드의 무기는 매니페스트 `anchor`·`fit`을 쓰므로 이 소켓 표를 조회하지 않는다.
 * 소켓 표는 **폴백(기존 통합 바디) 경로 전용**이며, 스킬·기본 공격 모션은 서는 자세(idle)에
 * 무기를 두고 공격 프레임에서는 어차피 숨기므로 여기서는 `idle`·`walk`만 돌려준다.
 */
export function socketMotion(motion: string): 'idle' | 'walk' { return motion === 'walk' ? 'walk' : 'idle'; }

export function weaponSocket(classId: ClassId, gender: Gender, motion: 'idle' | 'walk', frame: number): WeaponSocket {
  const sockets = weaponSockets[classId][gender];
  const index = Number.isFinite(frame) ? ((Math.trunc(frame) % 8) + 8) % 8 : 0;
  return motion === 'walk' ? sockets.walk[index] : sockets.idle;
}
