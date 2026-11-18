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

export function weaponSocket(classId: ClassId, gender: Gender, motion: 'idle' | 'walk', frame: number): WeaponSocket {
  const sockets = weaponSockets[classId][gender];
  const index = Number.isFinite(frame) ? ((Math.trunc(frame) % 8) + 8) % 8 : 0;
  return motion === 'walk' ? sockets.walk[index] : sockets.idle;
}
