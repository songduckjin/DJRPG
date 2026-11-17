import type {SkillBook} from '../game/items';
import {passives,type PassiveId,type SkillId} from '../game/skills';
import {setPassiveSkillIcon,setSkillIcon} from './skillArtwork';
export function createSkillBookArt(book:SkillBook):HTMLElement {
  const passive=Object.hasOwn(passives,book.skillId),art=document.createElement('span');
  art.className=`skill-book-art${passive?' passive-book-art':''}`;art.setAttribute('aria-hidden','true');
  art.style.backgroundImage=`url('/assets/icons/${passive?'icon_skillbook_passive.png':'icon_skillbook.png'}')`;
  const badge=document.createElement('span');badge.className='skill-book-emblem';
  const icon=document.createElement('span');icon.className='skill-book-emblem-art';
  if(passive)setPassiveSkillIcon(icon,book.skillId as PassiveId);else setSkillIcon(icon,book.skillId as SkillId);
  badge.append(icon);art.append(badge);return art;
}
