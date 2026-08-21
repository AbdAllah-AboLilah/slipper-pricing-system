import {snapshotStores,clear,putMany,STORES} from '../core/db.js';
import {base64FromBlob,blobFromDataUrl,downloadBlob,now,APP_VERSION} from '../core/utils.js';

// تصدير نسخة احتياطية. المرفقات بتتحوّل base64 وبتكبر ~33%، فالخيار موجود
// لتصدير البيانات من غيرها لما يكون حجمها كبير على ذاكرة المتصفح.
export async function exportBackup({includeAttachments=true}={}){
 const data=await snapshotStores(STORES);
 let attachmentBytes=0;
 if(includeAttachments){
  for(const a of data.attachments||[]){
   if(a.blob instanceof Blob){attachmentBytes+=a.blob.size;a.blobData=await base64FromBlob(a.blob);delete a.blob}
  }
 }else{
  data.attachments=(data.attachments||[]).map(({blob,...rest})=>({...rest,blobOmitted:true}));
 }
 const blob=new Blob([JSON.stringify({app:'slipper-pricing-system',version:APP_VERSION,exportedAt:now(),includesAttachments:includeAttachments,data})],{type:'application/json'});
 downloadBlob(blob,`slipper-pricing-backup-${now().slice(0,10)}.json`);
 return {attachmentBytes,counts:Object.fromEntries(STORES.map(s=>[s,(data[s]||[]).length]))};
}

// حجم المرفقات المجمّع قبل التصدير — الواجهة بتستخدمه للتحذير.
export async function attachmentsSize(){
 const {attachments=[]}=await snapshotStores(['attachments']);
 return attachments.reduce((s,a)=>s+(a.blob instanceof Blob?a.blob.size:0),0);
}

// تحقّق كامل من الملف في الذاكرة قبل لمس قاعدة البيانات.
// لو الملف تالف بنرمي خطأ من هنا، فبيانات المستخدم القديمة تفضل سليمة.
async function parseBackup(file){
 let json;
 try{json=JSON.parse(await file.text())}catch{throw new Error('الملف مش JSON صالح — يبدو إنه اتقطع أثناء التحميل.')}
 if(json?.app!=='slipper-pricing-system')throw new Error('الملف ده مش نسخة احتياطية من نظام تسعير السليبر.');
 const data=json.data;
 if(!data||typeof data!=='object')throw new Error('النسخة الاحتياطية مفيهاش بيانات.');
 const prepared={};
 for(const s of STORES){
  if(!(s in data))continue;
  if(!Array.isArray(data[s]))throw new Error(`قسم "${s}" في النسخة الاحتياطية تالف (المفروض يكون قائمة).`);
  const rows=data[s];
  if(rows.some(r=>!r||typeof r!=='object'||!r.id))throw new Error(`قسم "${s}" فيه سجل بدون معرّف — النسخة ناقصة أو تالفة.`);
  if(s==='attachments'){
   for(const row of rows){
    if(row.blobData){
     try{row.blob=await blobFromDataUrl(row.blobData)}catch{throw new Error('مرفق في النسخة الاحتياطية تالف ومش قادر يتقرا.')}
     delete row.blobData;
    }
   }
  }
  prepared[s]=rows;
 }
 if(!Object.keys(prepared).length)throw new Error('النسخة الاحتياطية مفيهاش أي قسم معروف.');
 return prepared;
}

export async function importBackup(file){
 const prepared=await parseBackup(file);           // بيرمي خطأ قبل أي مسح
 for(const s of Object.keys(prepared))await clear(s);
 for(const s of Object.keys(prepared))await putMany(s,prepared[s]);
 return Object.fromEntries(Object.entries(prepared).map(([s,rows])=>[s,rows.length]));
}
