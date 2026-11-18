import {extensions,MeshPipe,GraphicsPipe,GraphicsContextSystem,TilingSpritePipe,CanvasTextPipe,CanvasTextSystem} from 'pixi.js';
// Explicit values keep registrations in the initial bundle even with split scene imports.
// All field primitives must exist before Application.init() constructs renderPipes.
extensions.add(MeshPipe,GraphicsPipe,GraphicsContextSystem,TilingSpritePipe,CanvasTextPipe,CanvasTextSystem);
