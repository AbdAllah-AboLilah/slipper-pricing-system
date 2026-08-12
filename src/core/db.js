const DB_NAME='slipperPricingDB';
const DB_VERSION=2;
const STORES=['settings','suppliers','items','tiers','invoices','attachments','meta','logs'];
let dbp;
export function db(){if(dbp)return dbp;dbp=new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;for(const s of STORES){if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})}};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return dbp}
export async function get(store,id){const d=await db();return new Promise((res,rej)=>{const r=d.transaction(store,'readonly').objectStore(store).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
export async function all(store){const d=await db();return new Promise((res,rej)=>{const r=d.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
export async function put(store,obj){const d=await db();return new Promise((res,rej)=>{const r=d.transaction(store,'readwrite').objectStore(store).put(obj);r.onsuccess=()=>res(obj);r.onerror=()=>rej(r.error)})}
export async function del(store,id){const d=await db();return new Promise((res,rej)=>{const r=d.transaction(store,'readwrite').objectStore(store).delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
export async function clear(store){const d=await db();return new Promise((res,rej)=>{const r=d.transaction(store,'readwrite').objectStore(store).clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
export async function putMany(store,items){if(!items?.length)return;const d=await db();return new Promise((res,rej)=>{const tx=d.transaction(store,'readwrite'),s=tx.objectStore(store);items.forEach(x=>s.put(x));tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
export async function snapshotStores(stores){const out={};for(const s of stores)out[s]=await all(s);return out}
