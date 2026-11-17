import {isSkillBook,type Item} from './items';
export const EQUIPMENT_BAG_LIMIT=40;
export function equipmentCount(items:Item[]):number{return items.filter(item=>!isSkillBook(item)).length;}
export function canStoreItem(items:Item[],item:Item):boolean{return isSkillBook(item)||equipmentCount(items)<EQUIPMENT_BAG_LIMIT;}
