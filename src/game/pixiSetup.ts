import {extensions,MeshPipe} from 'pixi.js';
// Register before Application.init(): the animated field loads MeshPlane later,
// after renderer.renderPipes has already been constructed.
extensions.add(MeshPipe);
