import { isEquipment, type Item } from './items';
export const EQUIPMENT_BAG_LIMIT=40;
/** 가방 40칸에 세는 것은 장비뿐이다 — 스킬북과 보물 주머니(작업 207)는 따로 센다. */
export function equipmentCount(items:Item[]):number{return items.filter(isEquipment).length;}
export function canStoreItem(items:Item[],item:Item):boolean{return !isEquipment(item)||equipmentCount(items)<EQUIPMENT_BAG_LIMIT;}
