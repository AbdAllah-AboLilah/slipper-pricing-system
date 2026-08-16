export const APP_VERSION='1.3.12';
export const CREATOR='عبد الله <Abo Lilah>';
export const BUILD_DATE='2026-08-13';
export const APP_NAME='نظام تسعير السليبر';
export const TYPES=[{key:'Slipper',label:'Slipper'},{key:'Winter',label:'Winter'}];
export const todayISO=()=>{const d=new Date();return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
export const now=()=>new Date().toISOString();
export const uid=(p='id')=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
export const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
export const money=n=>Number(n||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
export const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
export const fmtDate=d=>d?new Date(d).toLocaleDateString('ar-EG'):'—';
export function toast(msg,type='info'){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.dataset.type=type;el.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove('show'),2400)}
export function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200)}
export function excelHtmlBlob(headers,rows,title='ERP Export'){const head=headers.map(h=>`<th>${esc(h)}</th>`).join('');const body=rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('');const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:5px}th{font-weight:bold;background:#eee}</style></head><body><table><caption>${esc(title)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;return new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'})}
export async function ensureXLSX(){if(window.XLSX)return window.XLSX;await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';sc.onload=resolve;sc.onerror=()=>reject(new Error('تعذر تحميل محرك Excel. تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى.'));document.head.appendChild(sc)});return window.XLSX}
export async function xlsxBlob(headers,rows,sheetName='Sheet1'){const XLSX=await ensureXLSX();const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheetName);const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});return new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
export function base64FromBlob(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
export async function blobFromDataUrl(dataUrl){const [meta,b64]=String(dataUrl).split(',');const mime=(meta.match(/data:(.*?);base64/)||[])[1]||'application/octet-stream';const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));return new Blob([bytes],{type:mime})}
export function normalizeKey(s){return String(s??'').trim().toLowerCase().replace(/[\s_\-]+/g,'')}
