import {extensions,ExtensionType,MeshPipe,GraphicsPipe,GraphicsContextSystem,TilingSpritePipe,CanvasTextPipe,CanvasTextSystem,SpritePipe} from 'pixi.js';
// CanvasRenderer has no mesh pipe. Preserve the textured rectangle on browsers
// without GPU rendering; WebGL/WebGPU retain the full animated mesh.
export class CanvasMeshFallbackPipe extends SpritePipe {
  static extension={type:[ExtensionType.CanvasPipes],name:'mesh'};
}
// Register before Application.init() constructs renderPipes.
extensions.add(MeshPipe,GraphicsPipe,GraphicsContextSystem,TilingSpritePipe,CanvasTextPipe,CanvasTextSystem,CanvasMeshFallbackPipe);
