import {all,put} from '../core/db.js';
export async function getSettings(){return Object.fromEntries((await all('settings')).map(x=>[x.id,x.value]))}
export async function setSetting(id,value){return put('settings',{id,value})}
