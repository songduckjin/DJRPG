import {extensions,ExtensionType,MeshPipe,GraphicsPipe,GraphicsContextSystem,TilingSpritePipe,CanvasTextPipe,CanvasTextSystem,SpritePipe,type Renderer,type Mesh,type Sprite,type InstructionSet} from 'pixi.js';
// CanvasRenderer has no mesh pipe. Preserve textured rectangles without a GPU;
// WebGL/WebGPU retain the full animated mesh. No source texture is changed.
export class CanvasMeshFallbackPipe {
  static extension={type:ExtensionType.CanvasPipes,name:'mesh'};
  private pipe:SpritePipe;
  constructor(renderer:Renderer){this.pipe=new SpritePipe(renderer);}
  private quad(mesh:Mesh):Sprite {
    if(!('visualBounds' in mesh))Object.defineProperty(mesh,'visualBounds',{get:()=>mesh.bounds});
    return mesh as unknown as Sprite;
  }
  addRenderable(mesh:Mesh,instructions:InstructionSet):void{this.pipe.addRenderable(this.quad(mesh),instructions);}
  updateRenderable(mesh:Mesh):void{this.pipe.updateRenderable(this.quad(mesh));}
  validateRenderable(mesh:Mesh):boolean{return this.pipe.validateRenderable(this.quad(mesh));}
  destroy():void{this.pipe.destroy();}
}
// Register before Application.init() constructs renderPipes.
extensions.add(MeshPipe,GraphicsPipe,GraphicsContextSystem,TilingSpritePipe,CanvasTextPipe,CanvasTextSystem);
extensions.add(CanvasMeshFallbackPipe);
