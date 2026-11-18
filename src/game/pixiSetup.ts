// Register every primitive used by the field before Application.init().
// Dynamic scene imports can otherwise register pipes after renderer creation.
import 'pixi.js/graphics';
import 'pixi.js/sprite-tiling';
import 'pixi.js/text';
import 'pixi.js/mesh';
