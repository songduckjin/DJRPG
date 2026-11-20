// Shared source-image coordinates for the field and ambient animation.
// Keeping these independent of the renderer lets wasteland load ambientScene statically.
export const wastelandScene = { path: '/assets/wasteland-scene-extended-v1.png', width: 637, height: 1079 };
export const wastelandCore = { x: 48, y: 82, width: 540, height: 914 };
export function originalScenePoint(x: number, y: number) {
  return {
    x: (wastelandCore.x + x * wastelandCore.width) / wastelandScene.width,
    y: (wastelandCore.y + y * wastelandCore.height) / wastelandScene.height
  };
}
const fires = [[.5, .044], [.813, .30], [.176, .694]] as const;
export const wastelandFireAnchors = fires.map(([x, y]) => originalScenePoint(x, y));
