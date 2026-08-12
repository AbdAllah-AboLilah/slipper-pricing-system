import {all,put,del} from '../core/db.js';
import {uid} from '../core/utils.js';
export async function loadCatalog(){return {suppliers:await all('suppliers'),items:await all('items')}}
export async function saveSupplier(x){return put('suppliers',{...x,id:x.id||uid('sup')})}
export async function removeSupplier(id){return del('suppliers',id)}
export async function saveItem(x){return put('items',{...x,id:x.id||uid('item')})}
export async function removeItem(id){return del('items',id)}
