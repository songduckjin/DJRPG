import {extensions,ExtensionType,MeshPipe,GraphicsPipe,GraphicsContextSystem,TilingSpritePipe,CanvasTextPipe,CanvasTextSystem,SpritePipe} from 'pixi.js';
// CanvasRenderer has no mesh pipe. Preserve the textured rectangle on browsers
// without GPU rendering; WebGL/WebGPU retain the full animated mesh.
export class CanvasMeshFallbackPipe extends SpritePipe {}
// Register before Application.init() constructs renderPipes.
extensions.add(MeshPipe,GraphicsPipe,GraphicsContextSystem,TilingSpritePipe,CanvasTextPipe,CanvasTextSystem);
extensions.add({type:ExtensionType.CanvasPipes,name:'mesh',ref:CanvasMeshFallbackPipe});
