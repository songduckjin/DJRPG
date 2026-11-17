export type Preferences={shake:boolean;powerSaving:boolean;effects:'full'|'low'};
export const preferences:Preferences={shake:true,powerSaving:false,effects:'full'};
try{const data=JSON.parse(localStorage.getItem('djrpg_preferences')??'{}');if(typeof data.shake==='boolean')preferences.shake=data.shake;if(typeof data.powerSaving==='boolean')preferences.powerSaving=data.powerSaving;if(data.effects==='low')preferences.effects='low';}catch{/* Defaults remain usable when storage is unavailable. */}
export function savePreferences():boolean{try{localStorage.setItem('djrpg_preferences',JSON.stringify(preferences));return true;}catch{return false;}}
