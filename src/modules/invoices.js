import {all,put,del,get} from '../core/db.js';
import {uid,todayISO,now} from '../core/utils.js';
export async function nextInvoiceNo(prefix='INV'){const date=todayISO().replaceAll('-','');const base=`${prefix}-${date}-`;const invs=await all('invoices');let max=0;for(const x of invs){const n=String(x.invoiceNo||'');if(n.startsWith(base)){const tail=n.slice(base.length);if(/^\d+$/.test(tail))max=Math.max(max,Number(tail))}}return `${base}${String(max+1).padStart(4,'0')}`}
export function newDraft(invoiceNo,type='Slipper'){return {id:uid('inv'),invoiceNo,invoiceDate:todayISO(),createdAt:now(),updatedAt:now(),saved:false,autoSaved:true,erpEntered:false,erpInvoiceNo:'',type,supplierId:'',supplierName:'',notes:'',lines:[],attachmentId:'',attachmentName:'',attachmentType:''}}
export async function saveInvoice(inv){return put('invoices',{...inv,saved:true,autoSaved:false,updatedAt:now()})}
export async function autosaveInvoice(inv){return put('invoices',{...inv,saved:!!inv.saved,autoSaved:!inv.saved,updatedAt:now()})}
export async function listInvoices(){return (await all('invoices')).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
export async function getInvoice(id){return get('invoices',id)}
export async function deleteInvoice(id){return del('invoices',id)}
