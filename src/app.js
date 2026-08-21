import {all,put,putMany,del,delMany,get,clear} from './core/db.js';
import {state,setState} from './core/state.js';
import {APP_VERSION,CREATOR,BUILD_DATE,esc,money,moneyOrDash,num,todayISO,uid,toast,normalizeKey,ensureXLSX,debounce,FONT_OPTIONS,fontOption,ensureGoogleFont} from './core/utils.js';
import {loadPricing,calcLine,saveTier,removeTier,tierMatches as matchTierItems,itemSalePrice} from './modules/pricing.js';
import {newDraft,nextInvoiceNo,saveInvoice,autosaveInvoice,listInvoices,getInvoice,deleteInvoice} from './modules/invoices.js';
import {loadCatalog,saveSupplier,removeSupplier,saveItem,removeItem} from './modules/catalog.js';
import {getSettings,setSetting} from './modules/settings.js';
import {exportERP} from './modules/export.js';
import {printInvoice,shareImage,saveImageOnly} from './modules/receipt.js';
import {exportBackup,importBackup,attachmentsSize} from './modules/backup.js';

const app=document.getElementById('app');
const online=document.getElementById('onlineState');
function applyFont(id){const opt=fontOption(id);ensureGoogleFont(opt);document.documentElement.style.setProperty('--app-font',opt.stack)}
document.getElementById('versionBadge').textContent=`v${APP_VERSION}`;
document.getElementById('creatorBadge').textContent=CREATOR;
document.getElementById('buildBadge').textContent=`Build ${BUILD_DATE}`;
function onlineUI(){online.textContent=navigator.onLine?'●':'○';online.title=navigator.onLine?'متصل بالإنترنت':'وضع محلي/بدون إنترنت';online.className=navigator.onLine?'online':'offline'}
onlineUI();addEventListener('online',onlineUI);addEventListener('offline',onlineUI);

const ITEMS_PAGE=100;
const DEFAULT_ERP_COLUMNS=[
 {key:'itemId',label:'الاي دي'},{key:'barcode',label:'الباركود'},{key:'itemName',label:'اسم الصنف'},
 {key:'unitLabel',label:'الوحدة'},{key:'cost',label:'السعر'},{key:'qty',label:'الكمية'},{key:'sellPrice',label:'سعر البيع'}
];
const IMPORT_FIELDS=[
 ['name','اسم الصنف'],['itemId','الاي دي'],['barcode','الباركود'],['supplier','المورد'],['mainCategory','القسم الرئيسي'],['subCategory','القسم الفرعي'],['salePriceBeforeDiscount','سعر البيع / قبل الخصم'],['salePriceAfterDiscount','السعر بعد الخصم']
];
// قوالب شرائح مأخوذة من معادلة IF/VLOOKUP الأصلية في ملف الإكسل.
// الحدود مكتوبة بأرقام صحيحة؛ القيم العشرية اللي بتقع بينها بيتعامل معها
// findTier في pricing.js بنفس منطق الـIF المتتالية (بتروح للشريحة الأعلى).
const TIER_TEMPLATES={
 slipper:{label:'قالب السليبر (17 شريحة)',rows:[[25,30,29],[31,45,40],[46,60,55],[61,70,65],[71,80,75],[81,90,85],[91,105,100],[106,120,120],[121,135,135],[136,150,150],[151,160,160],[161,170,170],[171,195,190],[196,210,210],[211,220,220],[221,290,290],[291,330,330]]},
 winter:{label:'قالب الشتوي / Foot Wear (21 شريحة)',rows:[[30,45,50],[46,55,55],[56,65,65],[66,75,75],[76,85,85],[86,105,100],[106,125,120],[126,150,150],[151,160,160],[161,185,180],[186,205,200],[206,225,220],[226,240,240],[241,255,250],[256,270,270],[271,290,280],[291,320,310],[321,350,340],[351,390,380],[391,420,410],[421,474,460]]}
};

async function migrateBlank(){
 const meta=await get('meta','seeded');
 if(meta?.source==='نموذج تسعير السليبر-1.xlsx' || meta?.source==='seed-v1.1.0'){
  await clear('suppliers');await clear('items');await clear('tiers');await del('meta','seeded');
  await put('meta',{id:'blankMigration',value:APP_VERSION,at:new Date().toISOString()});
 }
 await put('meta',{id:'appVersion',value:APP_VERSION});await put('meta',{id:'creator',value:CREATOR});await put('meta',{id:'buildDate',value:BUILD_DATE});
 const savedCols=await get('meta','erpColumns');
 const colsLookValid=Array.isArray(savedCols?.value)&&savedCols.value.some(c=>c.key==='itemName')&&savedCols.value.some(c=>c.key==='sellPrice');
 if(!colsLookValid)await put('meta',{id:'erpColumns',value:DEFAULT_ERP_COLUMNS});
 const s=await getSettings();
 if(s.marginRate==null)await setSetting('marginRate',0.35);
 if(!s.marginBasis)await setSetting('marginBasis','cost');
 if(!s.invoicePrefix)await setSetting('invoicePrefix','INV');
 if(!s.fontFamily)await setSetting('fontFamily','tahoma');
 // ترحيل الأنواع الإنجليزية القديمة (قبل v1.3.12) لأسماء الأقسام الفعلية.
 // مفيش قيمة افتراضية بتتكتب هنا: القسم بييجي من ملف المستخدم نفسه.
 const typeMap={Slipper:'سليبر',Winter:'winter'};
 if(typeMap[s.defaultType])await setSetting('defaultType',typeMap[s.defaultType]);
 const oldTiers=(await all('tiers')).filter(t=>typeMap[t.type]);
 if(oldTiers.length)await putMany('tiers',oldTiers.map(t=>({...t,type:typeMap[t.type]})));
}
async function load(){
 await migrateBlank();
 const p=await loadPricing(),c=await loadCatalog(),inv=await listInvoices(),meta=await all('meta');
 setState({...p,...c,invoices:inv,erpColumns:meta.find(x=>x.id==='erpColumns')?.value||DEFAULT_ERP_COLUMNS});
 applyFont(state.settings.fontFamily||'tahoma');
}
function syncTabs(){document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view))}
function nav(){document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;syncTabs();render()})}
nav();

// القسم الافتراضي بييجي من آخر صنف أضفته، وإلا أول قسم موجود في بياناتك.
// مفيش اسم قسم مكتوب في الكود — الأقسام كلها بتيجي من ملف الـERP بتاعك.
function defaultCategory(){return state.settings.defaultType||knownCategories()[0]||''}
async function startNewDraft(){
 const d=newDraft(await nextInvoiceNo(state.settings.invoicePrefix||'INV'),defaultCategory());
 state.draft=d;composeLine=null;return d;
}
async function ensureDraft(){
 // أي فاتورة في state.draft بتتفتح زي ما هي — محفوظة كانت أو مسودة.
 if(state.draft)return state.draft;
 const unsaved=state.invoices.filter(x=>x.saved===false).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
 if(unsaved){state.draft=unsaved;return unsaved}
 return startNewDraft();
}
function recalcDraft(d){d.lines=d.lines.map(l=>calcLine(l,state.settings,state.tiers,state.items));return d}
// مسودة فاضية متتحفظش أصلًا — عشان ما تتراكمش في "المحفوظة" وما تاكلش رقم فاتورة.
function draftWorthSaving(d){return !!(d&&(d.saved||d.lines?.length||d.supplierId||d.attachmentId||String(d.erpInvoiceNo||'').trim()))}
async function autoSave(silent=true){
 if(!draftWorthSaving(state.draft))return;
 recalcDraft(state.draft);state.draft.updatedAt=new Date().toISOString();
 try{await autosaveInvoice(state.draft);if(!silent)toast('تم الحفظ التلقائي','ok')}catch(e){console.error(e)}
}
// 500ms بدل 25ms، وبدون إعادة قراءة كل الفواتير مع كل حرف.
const scheduleAuto=debounce(()=>autoSave(true),500);
function supplierName(id){return state.suppliers.find(x=>x.id===id)?.name||''}
function invoiceTotal(d){return (d.lines||[]).reduce((s,l)=>s+num(l.total),0)}
function piecesTotal(d){return (d.lines||[]).reduce((s,l)=>s+num(l.pieces),0)}
function erpNameCellHTML(l){if(l.status==='multiple-match'&&l.matches?.length>1){return `<select data-k="manualErpItemId"><option value="">اختر الصنف (${l.matches.length} مطابق)</option>${l.matches.map(m=>`<option value="${esc(m.id)}" ${l.manualErpItemId===m.id?'selected':''}>${esc(m.name)}${m.supplier?' · '+esc(m.supplier):''}</option>`).join('')}</select>`}return esc(l.erpName||'—')}
// سطر لسه ما اتكتبش فيه سعر — نعرضه محايد بدل تحذير أحمر قبل ما المستخدم يبدأ.
const isBlankLine=l=>!num(l.purchaseCartonPrice??l.cartonPrice)&&!String(l.manualFinalPrice??'').trim();
function statusHTML(l){if(isBlankLine(l))return '<span class="status neutral">املأ البيانات</span>';const m={ok:['مطابق','ok'],manual:['تعديل يدوي','warn'],'multiple-match':['أكثر من صنف','warn'],'manual-no-item':['يدوي بدون صنف ERP','danger'],'no-tier':['لا توجد شريحة','danger'],'no-item':['لا يوجد صنف ERP','danger']};const [t,c]=m[l.status]||['مراجعة','warn'];return `<span class="status ${c}">${t}</span>`}
async function render(){const views={invoice:renderInvoice,saved:renderSaved,catalog:renderCatalog,pricing:renderPricing,export:renderERP,backup:renderBackup};await (views[state.view]||renderInvoice)()}
function knownCategories(extra){const set=new Set();state.items.forEach(x=>x.subCategory&&set.add(x.subCategory));state.tiers.forEach(t=>t.type&&set.add(t.type));if(state.settings?.defaultType)set.add(state.settings.defaultType);if(extra)set.add(extra);return [...set].sort((a,b)=>a.localeCompare(b))}
function itemTypeOptions(v){const list=knownCategories(v);if(!list.length)list.push(v||'');return list.map(t=>`<option value="${esc(t)}" ${v===t?'selected':''}>${esc(t)||'—'}</option>`).join('')}

function lineStatusClass(l){if(isBlankLine(l))return 'neutral';return {ok:'ok',manual:'ok','multiple-match':'warn','manual-no-item':'danger','no-tier':'danger','no-item':'danger'}[l.status]||'warn'}
function fieldsHTML(l){return `<div class="pline-grid"><div class="field"><label>النوع (القسم الفرعي)</label><select data-k="type">${itemTypeOptions(l.type)}</select></div><div class="field"><label>قطع الدستة/الكرتونة</label><input data-k="unit" type="number" min="1" step="1" inputmode="numeric" value="${num(l.unit)||12}"></div><div class="field"><label>عدد الدستات/الكراتين</label><input data-k="qty" type="number" min="0" step="1" inputmode="numeric" value="${num(l.qty)||0}"></div><div class="field"><label>سعر شراء الدستة/الكرتونة</label><input data-k="purchaseCartonPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${num(l.purchaseCartonPrice??l.cartonPrice)||0}"></div><div class="field"><label>خصم المورد % (اختياري)</label><input data-k="discountRate" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${num(l.discountRate)}"></div><div class="field"><label>سعر بيع يدوي (اختياري)</label><input data-k="manualFinalPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="تلقائي من الشريحة" value="${l.manualFinalPrice??''}"></div></div>`}
function resultStripHTML(l){return `<div class="pline-result four"><div class="pline-erp">اسم ERP<b data-mobile-erp>${erpNameCellHTML(l)}</b></div><div class="pline-erp">تكلفة القطعة<b data-mobile-cost>${money(l.costPerPiece)}</b></div><div class="pline-price">سعر البيع<b data-mobile-price>${moneyOrDash(l.finalPrice)}</b></div><div class="pline-total">الإجمالي<b data-mobile-total>${money(l.total)}</b></div></div>`}
function detailsHTML(l){return `<details class="pline-details"><summary>تفاصيل الحساب</summary><div class="info-list tiny"><div>سعر الشراء/قطعة: <b>${money(l.purchasePerPiece)}</b></div><div>التكلفة/قطعة: <b>${money(l.costPerPiece)}</b></div><div>أساس التسعير: <b>${money(l.basisPrice)}</b></div><div>السعر قبل التقريب: <b>${moneyOrDash(l.prePrice)}</b></div><div>الباركود: <b>${esc(l.barcode||'—')}</b></div><div>الاي دي: <b>${esc(l.itemId||'—')}</b></div><div class="field"><label>ملاحظات</label><input data-k="notes" value="${esc(l.notes||'')}" placeholder="ملاحظة على الصنف ده"></div></div></details>`}
function composeCardHTML(l){
 const cls=lineStatusClass(l);
 return `<article class="pline pline-${cls}" id="composeCard"><div class="pline-head"><b>➕ إضافة صنف جديد</b><span data-mobile-status>${statusHTML(l)}</span></div>${fieldsHTML(l)}${resultStripHTML(l)}${detailsHTML(l)}<button class="btn primary" id="commitLine" style="margin-top:10px;width:100%">✅ تأكيد وإضافة للفاتورة</button></article>`
}
function lineRowCompact(l,i){
 const cls=lineStatusClass(l);
 const title=l.status==='multiple-match'?'يحتاج اختيار الصنف':(l.erpName||'صنف بدون مطابقة');
 return `<article class="itemrow itemrow-${cls}" data-line="${esc(l.id)}"><div class="itemrow-summary"><span class="itemrow-num">#${i+1}</span><span class="itemrow-name">${esc(title)}</span><span class="itemrow-mini">${num(l.pieces)} قطعة</span><span class="itemrow-mini">تكلفة <b data-mobile-cost>${money(l.costPerPiece)}</b></span><span class="itemrow-mini">${moneyOrDash(l.finalPrice)}</span><span class="itemrow-mini strong">${money(l.total)}</span><span data-mobile-status>${statusHTML(l)}</span><button class="btn danger small" data-del>حذف</button></div><details><summary>تعديل الصنف</summary>${fieldsHTML(l)}${l.status==='multiple-match'?resultStripHTML(l):''}${detailsHTML(l)}</details></article>`
}
let composeLine=null;
function blankComposeLine(type,carry={}){return {id:'compose',type,unit:num(carry.unit)||12,qty:1,purchaseCartonPrice:0,discountRate:num(carry.discountRate)||0,manualFinalPrice:'',notes:''}}

async function renderInvoice(){
 const d=await ensureDraft();recalcDraft(d);
 if(!d.invoiceDate)d.invoiceDate=todayISO();
 if(!composeLine)composeLine=blankComposeLine(defaultCategory());
 const composeCalc=calcLine(composeLine,state.settings,state.tiers,state.items);
 const supplierOptions=state.suppliers.map(s=>`<option value="${esc(s.id)}" ${s.id===d.supplierId?'selected':''}>${esc(s.name)}${s.code?` — ${esc(s.code)}`:''}</option>`).join('');
 app.innerHTML=`<section class="grid"><div class="card hero-card"><div class="toolbar space"><div><h2>🧾 فاتورة تسعير شراء</h2><div class="muted">سعر الشراء → الخصم → التكلفة → أساس التسعير → الشريحة → سعر المستهلك</div></div><div class="toolbar"><span class="status ${d.saved?'ok':'warn'}">${d.saved?'محفوظ نهائيًا':'مسودة محفوظة تلقائيًا'}</span><button class="btn" id="newInv">فاتورة جديدة</button><button class="btn primary" id="saveInv">${d.saved?'حفظ التعديلات':'حفظ نهائي'}</button></div></div><div class="invoice-head" style="margin-top:12px"><div class="field"><label>رقم الفاتورة</label><input value="${esc(d.invoiceNo)}" readonly></div><div class="field"><label>التاريخ</label><input id="invoiceDate" type="date" value="${esc(d.invoiceDate)}"></div><div class="field"><label>المورد</label><select id="supplier"><option value="">اختر المورد</option>${supplierOptions}</select></div><div class="field"><label>حالة ERP</label><select id="erpEntered"><option value="false" ${!d.erpEntered?'selected':''}>لم تدخل ERP بعد</option><option value="true" ${d.erpEntered?'selected':''}>تم إدخالها في ERP</option></select></div><div class="field"><label>رقم فاتورة ERP</label><input id="erpInvoiceNo" value="${esc(d.erpInvoiceNo||'')}" placeholder="مثال: 25114" ${d.erpEntered?'':'disabled'}></div></div><div class="note" style="margin-top:10px">كل حرف تكتبه في الفاتورة يُحفظ محليًا تلقائيًا. لو قفل التطبيق فجأة، تستعيد آخر مسودة. التاريخ قابل للتعديل لو بتسجّل فاتورة قديمة.</div></div>
 <div class="summary"><div class="card"><div class="muted">إجمالي الفاتورة</div><div class="stat" id="sumTotal">${money(invoiceTotal(d))}</div></div><div class="card"><div class="muted">عدد الأصناف</div><div class="stat" id="sumCount">${d.lines.length}</div></div><div class="card"><div class="muted">الكمية بالقطعة</div><div class="stat" id="sumPieces">${piecesTotal(d)}</div></div><div class="card"><div class="muted">أساس الربح</div><div><span class="pill">${state.settings.marginBasis==='purchase'?'سعر الشراء':'التكلفة الفعلية'}</span></div></div></div>
 <div class="card"><h3>تفاصيل الفاتورة</h3><div class="muted tiny" style="margin-bottom:10px">املأ بيانات الصنف هنا فوق، تأكد إنه اتربط بالصنف الصح، وبعدين اضغط "تأكيد وإضافة". الأصناف المُضافة بترتيب تسلسلي تحت.</div>${composeCardHTML(composeCalc)}<div class="line-cards" style="margin-top:14px">${d.lines.length?d.lines.map(lineRowCompact).join(''):`<div class="empty">لسه مفيش أصناف مُضافة.</div>`}</div></div>
 <div class="card"><div class="toolbar space"><div><b>📎 الفاتورة الأصلية</b><div class="muted tiny">${d.attachmentName?esc(d.attachmentName):'ارفع صورة أو PDF، وسيُحفظ محليًا مع الفاتورة.'}</div></div><div class="toolbar"><button class="btn" id="attach">${d.attachmentId?'استبدال المرفق':'رفع الفاتورة'}</button>${d.attachmentId?'<button class="btn" id="openAttachment">فتح المرفق</button>':''}</div></div></div>
 <div class="card"><div class="toolbar"><button class="btn accent" id="image">📷 صورة ومشاركة</button><button class="btn" id="imageSave">💾 حفظ الصورة بدون مشاركة</button><button class="btn" id="print">🖨️ طباعة حرارية 80مم</button><button class="btn" id="erpExport">📤 تصدير ERP (xlsx)</button></div><div class="muted tiny" style="margin-top:8px">المشاركة تعمل عبر Share في iPhone/Android عند توفرها.</div></div></section>`;
 bindInvoice(d);
 const snapshot=()=>({...d,supplierName:supplierName(d.supplierId),invoiceDate:d.invoiceDate||todayISO()});
 document.getElementById('newInv').onclick=async()=>{if(draftWorthSaving(d)&&!d.saved&&!confirm('المسودة الحالية محفوظة تلقائيًا. بدء فاتورة جديدة؟'))return;await startNewDraft();state.invoices=await listInvoices();render()};
 document.getElementById('saveInv').onclick=async()=>{if(!d.supplierId){toast('اختر المورد أولًا','error');return}if(!d.lines.length){toast('أضف صنفًا واحدًا على الأقل','error');return}recalcDraft(d);if(d.erpEntered&&!String(d.erpInvoiceNo||'').trim()){toast('اكتب رقم فاتورة ERP قبل الحفظ','error');return}const bad=d.lines.filter(x=>!['ok','manual'].includes(x.status));if(bad.length&&!confirm(`هناك ${bad.length} سطر يحتاج مراجعة. هل تريد الحفظ رغم ذلك؟`))return;d.supplierName=supplierName(d.supplierId);d.invoiceDate=d.invoiceDate||todayISO();d.saved=true;await saveInvoice(d);state.invoices=await listInvoices();toast('تم حفظ الفاتورة نهائيًا','ok');render()};
 document.getElementById('attach').onclick=()=>document.getElementById('attachmentInput').click();
 document.getElementById('image').onclick=()=>shareImage(snapshot(),state.settings.fontFamily);
 document.getElementById('imageSave').onclick=()=>saveImageOnly(snapshot(),state.settings.fontFamily);
 document.getElementById('print').onclick=()=>printInvoice(snapshot(),state.settings.fontFamily);
 document.getElementById('erpExport').onclick=()=>{if(!d.lines.length){toast('لا يوجد أصناف للتصدير','error');return}const bad=d.lines.filter(x=>!['ok','manual'].includes(x.status));if(bad.length&&!confirm(`هناك ${bad.length} صنف محتاج مراجعة (بدون شريحة سعر أو بدون صنف ERP مطابق). تصدّر الفاتورة برضه؟`))return;exportERP(snapshot(),state.erpColumns)};
 const fileInput=document.getElementById('attachmentInput');
 fileInput.onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>12*1024*1024){toast('حجم المرفق أكبر من 12MB','error');return}if(d.attachmentId)await del('attachments',d.attachmentId).catch(()=>{});const id=uid('att');await put('attachments',{id,invoiceId:d.id,name:f.name,type:f.type,size:f.size,blob:f,createdAt:new Date().toISOString()});d.attachmentId=id;d.attachmentName=f.name;d.attachmentType=f.type;await autoSave(true);toast('تم حفظ الفاتورة الأصلية','ok');render()};
 document.getElementById('openAttachment')?.addEventListener('click',()=>openAttachment(d.attachmentId));
}
function bindInvoice(d){
 const set=(key,val)=>{d[key]=val;d.updatedAt=new Date().toISOString();scheduleAuto()};
 document.getElementById('supplier').onchange=e=>set('supplierId',e.target.value);
 document.getElementById('invoiceDate').onchange=e=>set('invoiceDate',e.target.value||todayISO());
 document.getElementById('erpEntered').onchange=e=>{d.erpEntered=e.target.value==='true';if(!d.erpEntered)d.erpInvoiceNo='';scheduleAuto();render()};
 document.getElementById('erpInvoiceNo').oninput=e=>set('erpInvoiceNo',e.target.value);
 const updateSummary=()=>{const t=document.getElementById('sumTotal'),c=document.getElementById('sumCount'),p=document.getElementById('sumPieces');if(t)t.textContent=money(invoiceTotal(d));if(c)c.textContent=d.lines.length;if(p)p.textContent=piecesTotal(d)};
 // نموذج الإضافة في الأعلى: لا يلمس d.lines إلا لحظة الضغط على "تأكيد وإضافة".
 const composeCard=document.getElementById('composeCard');
 const onCompose=e=>{const el=e.target.closest('[data-k]');if(!el)return;composeLine[el.dataset.k]=el.value;updateLineUI(composeCard,calcLine(composeLine,state.settings,state.tiers,state.items),true)};
 composeCard.addEventListener('input',onCompose);
 composeCard.addEventListener('change',onCompose);
 document.getElementById('commitLine').onclick=async()=>{
  const calc=calcLine(composeLine,state.settings,state.tiers,state.items);
  if(!['ok','manual'].includes(calc.status)){
   const msg={'no-tier':'مفيش شريحة سعر تغطي السعر ده.','no-item':'مفيش صنف ERP بنفس السعر.','multiple-match':'محتاج تختار الصنف الصحيح الأول (فيه أكتر من صنف بنفس السعر).','manual-no-item':'السعر اليدوي مش مطابق لأي صنف ERP.'}[calc.status]||'الصنف محتاج مراجعة.';
   if(!confirm(`${msg}\nتضيفه للفاتورة برضه؟`))return;
  }
  d.lines.push({...composeLine,id:uid('line')});
  d.type=calc.type||d.type;
  if(calc.type&&calc.type!==state.settings.defaultType){await setSetting('defaultType',calc.type);state.settings.defaultType=calc.type}
  // الوحدة ونسبة الخصم بتفضل زي ما هي — عادة ثابتة لكل أصناف نفس المورد.
  composeLine=blankComposeLine(calc.type,{unit:composeLine.unit,discountRate:composeLine.discountRate});
  scheduleAuto();render();
 };
 const bindLine=(card,id)=>{
  const l=d.lines.find(x=>x.id===id);
  if(!l)return;
  const onchg=e=>{const el=e.target.closest('[data-k]');if(!el)return;l[el.dataset.k]=el.value;Object.assign(l,calcLine(l,state.settings,state.tiers,state.items));updateLineUI(card,l,false);updateSummary();scheduleAuto()};
  card.addEventListener('input',onchg);card.addEventListener('change',onchg);
  card.querySelector('[data-del]')?.addEventListener('click',()=>{d.lines=d.lines.filter(x=>x.id!==id);scheduleAuto();render()});
 };
 document.querySelectorAll('.itemrow[data-line]').forEach(card=>bindLine(card,card.dataset.line));
}
function updateLineUI(card,l,isCompose){
 const cls=lineStatusClass(l);
 if(isCompose){card.className=`pline pline-${cls}`}
 else{
  card.className=`itemrow itemrow-${cls}`;
  const nameEl=card.querySelector('.itemrow-name');if(nameEl)nameEl.textContent=l.status==='multiple-match'?'يحتاج اختيار الصنف':(l.erpName||'صنف بدون مطابقة');
  const mini=card.querySelectorAll('.itemrow-summary > .itemrow-mini');
  if(mini[0])mini[0].textContent=`${num(l.pieces)} قطعة`;
  if(mini[2])mini[2].textContent=moneyOrDash(l.finalPrice);
  if(mini[3])mini[3].textContent=money(l.total);
 }
 // querySelectorAll لأن الحقول دي ممكن تتكرر (الملخص + شريط النتيجة في حالة "أكثر من صنف").
 const setAll=(sel,fn)=>card.querySelectorAll(sel).forEach(fn);
 setAll('[data-mobile-status]',el=>el.innerHTML=statusHTML(l));
 setAll('[data-mobile-erp]',el=>el.innerHTML=erpNameCellHTML(l));
 setAll('[data-mobile-cost]',el=>el.textContent=money(l.costPerPiece));
 setAll('[data-mobile-price]',el=>el.textContent=moneyOrDash(l.finalPrice));
 setAll('[data-mobile-total]',el=>el.textContent=money(l.total));
 const info=card.querySelectorAll('.pline-details .info-list b');
 if(info[0])info[0].textContent=money(l.purchasePerPiece);
 if(info[1])info[1].textContent=money(l.costPerPiece);
 if(info[2])info[2].textContent=money(l.basisPrice);
 if(info[3])info[3].textContent=moneyOrDash(l.prePrice);
 if(info[4])info[4].textContent=l.barcode||'—';
 if(info[5])info[5].textContent=l.itemId||'—';
}

async function renderSaved(){
 const invs=await listInvoices();state.invoices=invs;
 const q=String(state.filters.saved||'').trim().toLowerCase();
 const st=state.filters.savedStatus||'';
 const rows=invs.filter(i=>{
  if(st==='draft'&&i.saved)return false;
  if(st==='final'&&!i.saved)return false;
  return !q||[i.invoiceNo,i.invoiceDate,i.supplierName,i.type,i.erpInvoiceNo].join(' ').toLowerCase().includes(q);
 });
 const emptyDrafts=invs.filter(i=>!i.saved&&!i.lines?.length&&!i.supplierId);
 const rowActions=i=>`<button class="btn small" data-open="${i.id}">فتح</button><button class="btn small" data-image="${i.id}">صورة</button><button class="btn small" data-export="${i.id}">ERP</button><button class="btn danger small" data-delete="${i.id}">حذف</button>`;
 app.innerHTML=`<section class="grid"><div class="card"><div class="toolbar space"><div><h2>📚 الفواتير المحفوظة</h2><div class="muted">المسودات، الفواتير النهائية، وحالة ERP.</div></div><button class="btn primary" id="newSaved">+ فاتورة جديدة</button></div>
 <div class="toolbar" style="margin-top:10px"><input id="savedSearch" class="search" placeholder="بحث برقم الفاتورة أو المورد أو ERP" value="${esc(state.filters.saved)}" style="flex:1;min-width:180px"><select id="savedFilter" style="max-width:170px"><option value="" ${st===''?'selected':''}>الكل (${invs.length})</option><option value="draft" ${st==='draft'?'selected':''}>مسودات</option><option value="final" ${st==='final'?'selected':''}>نهائية</option></select>${emptyDrafts.length?`<button class="btn danger" id="cleanDrafts">🧹 حذف ${emptyDrafts.length} مسودة فاضية</button>`:''}</div>
 <div class="desktop-only table-wrap" style="margin-top:12px"><table class="data-table"><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>المورد</th><th>النوع</th><th>الإجمالي</th><th>ERP</th><th>المرفق</th><th>آخر تعديل</th><th>إجراءات</th></tr></thead><tbody>${rows.map(i=>`<tr><td>${esc(i.invoiceNo)}</td><td>${esc(i.invoiceDate)}</td><td>${esc(i.supplierName||supplierName(i.supplierId))}</td><td>${esc(i.type)}</td><td>${money(invoiceTotal(i))}</td><td>${i.erpEntered?`تم · ${esc(i.erpInvoiceNo||'—')}`:'لم تدخل'}</td><td>${i.attachmentId?'نعم':'لا'}</td><td>${esc(String(i.updatedAt||'').slice(0,16).replace('T',' '))}</td><td class="row-actions">${rowActions(i)}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">لا توجد فواتير مطابقة.</td></tr>'}</tbody></table></div>
 <div class="mobile-only card-list">${rows.map(i=>`<article class="record-card"><div><b>${esc(i.invoiceNo)}</b><span class="pill">${esc(i.type)}</span>${i.saved?'':'<span class="status warn">مسودة</span>'}</div><div>${esc(i.supplierName||supplierName(i.supplierId))}</div><div class="muted">${esc(i.invoiceDate)} · ${money(invoiceTotal(i))}</div><div>${i.erpEntered?`ERP: ${esc(i.erpInvoiceNo||'—')}`:'ERP: لم تدخل'}</div><div class="toolbar">${rowActions(i)}</div></article>`).join('')||'<div class="empty">لا توجد فواتير مطابقة.</div>'}</div></div></section>`;
 document.getElementById('newSaved').onclick=async()=>{await startNewDraft();state.view='invoice';syncTabs();render()};
 document.getElementById('savedSearch').oninput=debounce(e=>{state.filters.saved=e.target.value;renderSaved()},250);
 document.getElementById('savedFilter').onchange=e=>{state.filters.savedStatus=e.target.value;renderSaved()};
 document.getElementById('cleanDrafts')?.addEventListener('click',async()=>{
  if(!confirm(`حذف ${emptyDrafts.length} مسودة فاضية (بدون أصناف وبدون مورد)؟`))return;
  const ids=emptyDrafts.map(x=>x.id);
  if(ids.includes(state.draft?.id))state.draft=null;
  await delMany('invoices',ids);state.invoices=await listInvoices();toast('تم تنظيف المسودات','ok');renderSaved();
 });
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{const inv=await getInvoice(b.dataset.open);if(!inv){toast('الفاتورة مش موجودة','error');return}state.draft=inv;composeLine=null;state.view='invoice';syncTabs();render()});
 const freshCopy=id=>{const i=invs.find(x=>x.id===id);if(!i)return null;const fresh={...i,lines:[...(i.lines||[])],supplierName:i.supplierName||supplierName(i.supplierId)};recalcDraft(fresh);return fresh};
 document.querySelectorAll('[data-image]').forEach(b=>b.onclick=()=>{const fresh=freshCopy(b.dataset.image);if(fresh)shareImage(fresh,state.settings.fontFamily)});
 document.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>{const fresh=freshCopy(b.dataset.export);if(!fresh)return;if(!fresh.lines.length){toast('لا يوجد أصناف للتصدير','error');return}const bad=fresh.lines.filter(x=>!['ok','manual'].includes(x.status));if(bad.length&&!confirm(`هناك ${bad.length} صنف محتاج مراجعة. تصدّر الفاتورة برضه؟`))return;exportERP(fresh,state.erpColumns)});
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف الفاتورة؟'))return;await deleteInvoice(b.dataset.delete);if(state.draft?.id===b.dataset.delete)state.draft=null;state.invoices=await listInvoices();renderSaved()});
}

function itemCardHTML(x){
 return `<article class="pline pline-ok"><div class="pline-head"><input type="checkbox" class="isel" data-isel="${x.id}" style="width:auto;min-height:auto"><b>${esc(x.name||'بدون اسم')}</b><span class="pill">${esc(x.subCategory||'—')}</span><button class="btn danger small" data-ri="${x.id}">حذف</button></div><div class="pline-result four"><div class="pline-erp"><span>الاي دي</span><b>${esc(x.itemId||'—')}</b></div><div class="pline-erp"><span>الباركود</span><b>${esc(x.barcode||'—')}</b></div><div class="pline-erp"><span>المورد</span><b>${esc(x.supplier||'—')}</b></div><div class="pline-price"><span>سعر البيع بعد الخصم</span><b>${money(itemSalePrice(x))}</b></div></div><details class="pline-details"><summary>تفاصيل الصنف</summary><div class="info-list tiny"><div>القسم الرئيسي: <b>${esc(x.mainCategory||'—')}</b></div><div>سعر البيع قبل الخصم: <b>${money(x.salePriceBeforeDiscount)}</b></div><div>نسبة الخصم: <b>${x.discountRate?num(x.discountRate).toFixed(1)+'%':'—'}</b></div><div>قيمة الخصم: <b>${x.discountValue?money(x.discountValue):'—'}</b></div></div></details></article>`
}

async function renderCatalog(){
 const iq=String(state.filters.items||'').toLowerCase();
 const matched=state.items.filter(x=>!iq||[x.name,x.itemId,x.barcode,x.supplier,x.mainCategory,x.subCategory].join(' ').toLowerCase().includes(iq));
 // عرض على دفعات — ملف ERP فيه آلاف الأصناف كان بيتحول لآلاف الكروت مرة واحدة.
 const shown=Math.min(state.itemsShown,matched.length);
 const items=matched.slice(0,shown);
 app.innerHTML=`<section class="grid"><div class="card hero-card"><div class="toolbar space"><div><h2>📦 البيانات الأساسية</h2><div class="muted">النظام يبدأ بدون موردين أو أصناف. استورد ملف ERP وحدد بنفسك الورقة وصف العناوين وربط الحقول.</div></div><div class="toolbar"><button class="btn primary" id="importMaster">📥 استيراد بيانات ERP</button></div></div><div class="note" style="margin-top:10px">لا توجد بيانات تجريبية. كل الموردين والأصناف والأكواد والأسعار تأتي من ملفك أنت.</div></div>
 <div class="card"><div class="toolbar space"><h3>بحث في الأصناف</h3><span class="pill">${state.items.length} صنف${iq?` · ${matched.length} مطابق`:''}</span></div><input id="itemSearch" class="search" placeholder="اسم الصنف / الاي دي / باركود / مورد / قسم" value="${esc(state.filters.items)}"><div class="toolbar" style="margin-top:10px"><button class="btn danger" id="delSelectedItems">🗑️ حذف المحدد</button><button class="btn danger" id="delAllItems">🗑️ حذف كل الأصناف</button></div><div class="line-cards" style="margin-top:10px">${items.map(itemCardHTML).join('')||'<div class="empty">لا توجد بيانات.</div>'}</div>${shown<matched.length?`<div class="toolbar" style="margin-top:10px;justify-content:center"><button class="btn" id="showMoreItems">عرض المزيد (${shown} من ${matched.length})</button></div>`:''}</div>
 <div class="card"><h3>👥 الموردون</h3><div class="muted tiny">يتم إنشاء الموردين تلقائيًا من ملف الأصناف بعد الاستيراد، ويمكنك أيضًا إضافة مورد يدويًا هنا.</div><div class="toolbar" style="margin:10px 0"><input id="newSupplierName" class="search" placeholder="اسم المورد الجديد" style="flex:1"><button class="btn primary" id="addSupplier">+ إضافة مورد</button></div><div class="supplier-cards">${state.suppliers.map(s=>`<span class="pill">${esc(s.name)}${s.code?` · ${esc(s.code)}`:''} <button data-delsup="${s.id}" style="border:0;background:none;cursor:pointer;color:var(--danger);font-weight:900;margin-inline-start:4px">×</button></span>`).join('')||'<span class="muted">لا يوجد موردون بعد.</span>'}</div>${state.suppliers.length?'<button class="btn danger small" id="delAllSuppliers" style="margin-top:8px">🗑️ حذف كل الموردين</button>':''}</div></section>`;
 document.getElementById('importMaster').onclick=()=>openImportWizard();
 document.getElementById('itemSearch').oninput=debounce(e=>{state.filters.items=e.target.value;state.itemsShown=ITEMS_PAGE;renderCatalog()},250);
 document.getElementById('showMoreItems')?.addEventListener('click',()=>{state.itemsShown+=ITEMS_PAGE;renderCatalog()});
 document.querySelectorAll('[data-ri]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف الصنف؟'))return;await removeItem(b.dataset.ri);state.items=await all('items');renderCatalog()});
 document.getElementById('addSupplier').onclick=async()=>{const name=document.getElementById('newSupplierName').value.trim();if(!name){toast('اكتب اسم المورد','error');return}if(state.suppliers.some(s=>s.name.trim()===name)){toast('المورد ده موجود بالفعل','error');return}await saveSupplier({name,code:''});state.suppliers=await all('suppliers');toast('تم إضافة المورد','ok');renderCatalog()};
 document.querySelectorAll('[data-delsup]').forEach(b=>b.onclick=async e=>{e.stopPropagation();if(!confirm('حذف المورد؟'))return;await removeSupplier(b.dataset.delsup);state.suppliers=await all('suppliers');renderCatalog()});
 document.getElementById('delSelectedItems').onclick=async()=>{const ids=[...document.querySelectorAll('[data-isel]:checked')].map(c=>c.dataset.isel);if(!ids.length){toast('حدد أصناف الأول','error');return}if(!confirm(`حذف ${ids.length} صنف محدد؟`))return;await delMany('items',ids);state.items=await all('items');toast('تم الحذف','ok');renderCatalog()};
 document.getElementById('delAllItems').onclick=async()=>{if(!state.items.length){toast('لا توجد أصناف','error');return}if(!confirm(`حذف كل الأصناف (${state.items.length})؟ ده مش قابل للتراجع.`))return;await clear('items');state.items=[];state.itemsShown=ITEMS_PAGE;toast('تم حذف كل الأصناف','ok');renderCatalog()};
 document.getElementById('delAllSuppliers')?.addEventListener('click',async()=>{if(!confirm(`حذف كل الموردين (${state.suppliers.length})؟ ده مش قابل للتراجع.`))return;await clear('suppliers');state.suppliers=[];toast('تم حذف كل الموردين','ok');renderCatalog()});
}

let importSession=null;
async function readWorkbook(file){
 const XLSX=await ensureXLSX();
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
 return {sheets:wb.SheetNames.map(name=>({name,matrix:XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false})}))};
}
function guessMapping(headers){
 const norm=headers.map(normalizeKey);
 const claimed=new Set();
 const find=(patterns)=>{const i=norm.findIndex((h,idx)=>!claimed.has(idx)&&patterns.some(p=>h.includes(normalizeKey(p))));if(i>=0)claimed.add(i);return i>=0?String(i):''};
 // من الأكثر تحديدًا إلى الأعم، عشان الأعمدة العامة (زي "القسم") متاخدش عمود عمود تاني أدق منها.
 const itemId=find(['itemid','كودالصنف','الايدي','ايدي','id']);
 const barcode=find(['barcode','باركود']);
 const mainCategory=find(['القسمالرئيسي','maincategory']);
 const salePriceAfterDiscount=find(['السعربعدالخصم','بعدالخصم','discountedprice','netprice']);
 const salePriceBeforeDiscount=find(['سعرالبيع','قبلالخصم','saleprice','listprice']);
 const supplier=find(['المورد','supplier']);
 const name=find(['اسمالصنف','الصنف','itemname','name']);
 const subCategory=find(['القسمالفرعي','القسم','subcategory']);
 return {name,itemId,barcode,supplier,mainCategory,subCategory,salePriceBeforeDiscount,salePriceAfterDiscount};
}
function mappingOptions(headers,selected){return `<option value="">— غير مربوط —</option>`+headers.map((h,i)=>`<option value="${i}" ${String(selected)===String(i)?'selected':''}>${esc(h||`عمود ${i+1}`)}</option>`).join('')}
const IMPORT_STEPS=['الملف','الورقة','العناوين','الربط','المعاينة'];
function setImportStep(n){document.querySelectorAll('.import-steps span').forEach((el,i)=>el.classList.toggle('active',i===n-1))}
function openImportWizard(){
 importSession=null;
 const overlay=document.createElement('div');overlay.className='modal-backdrop';overlay.id='importModal';
 overlay.innerHTML=`<div class="modal"><div class="toolbar space"><div><h2>📥 استيراد البيانات الأساسية</h2><div class="muted tiny">اختر الملف → الورقة → صف العناوين → اربط الحقول → راجع المعاينة → استيراد.</div></div><button class="btn" id="closeImport">إغلاق</button></div><div class="import-steps">${IMPORT_STEPS.map((s,i)=>`<span>${i+1} ${s}</span>`).join('')}</div><div id="importBody"></div></div>`;
 document.body.appendChild(overlay);
 const close=()=>{overlay.remove();document.removeEventListener('keydown',onKey)};
 const onKey=e=>{if(e.key==='Escape')close()};
 document.addEventListener('keydown',onKey);
 document.getElementById('closeImport').onclick=close;
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 renderImportStep1();
}
function renderImportStep1(){setImportStep(1);const body=document.getElementById('importBody');body.innerHTML=`<div class="drop big-drop"><input id="masterFile" type="file" accept=".xlsx,.xls"><h3>اختر ملف البيانات الأساسية (Excel)</h3><p class="muted">يمكن أن يحتوي الملف على أعمدة كثيرة؛ أنت ستحدد بنفسك أي عمود يمثل كل حقل.</p></div>`;document.getElementById('masterFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{importSession={file:f,workbook:await readWorkbook(f),sheetIndex:0,headerRow:0,mapping:null};renderImportStep2()}catch(err){console.error(err);toast(err.message||'تعذر قراءة الملف','error')}}}
function renderImportStep2(){
 setImportStep(2);
 const body=document.getElementById('importBody');
 body.innerHTML=`<div class="field"><label>ورقة العمل</label><select id="sheetSelect">${importSession.workbook.sheets.map((s,i)=>`<option value="${i}" ${i===importSession.sheetIndex?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="note" style="margin-top:10px">كل صنف هيتحط في القسم الفرعي بتاعه بالظبط زي ما هو مكتوب في الملف (عمود "القسم الفرعي")، وهيُستخدم هو نفسه كنوع تسعير الصنف — بدون أي تصنيف أو تخمين تلقائي.</div><div id="sheetPreview" class="preview-grid" style="margin-top:12px"></div><div class="toolbar" style="margin-top:12px"><button class="btn" id="backToFile">رجوع</button><button class="btn primary" id="toHeaders">التالي: اختيار صف العناوين</button></div>`;
 const update=()=>{
  const idx=Number(document.getElementById('sheetSelect').value);
  // تغيير الورقة بيلغي الربط القديم — أرقام الأعمدة مش بتنفع لورقة تانية.
  if(idx!==importSession.sheetIndex){importSession.mapping=null;importSession.headerRow=0}
  importSession.sheetIndex=idx;
  document.getElementById('sheetPreview').innerHTML=renderMatrixPreview(importSession.workbook.sheets[idx].matrix,0,8,8);
 };
 document.getElementById('sheetSelect').onchange=update;
 document.getElementById('backToFile').onclick=renderImportStep1;
 document.getElementById('toHeaders').onclick=renderImportStep3;
 update();
}
function renderImportStep3(){
 setImportStep(3);
 const s=importSession.workbook.sheets[importSession.sheetIndex];const max=Math.min(s.matrix.length,30);
 document.getElementById('importBody').innerHTML=`<div class="note">حدد الصف الذي يحتوي على أسماء الأعمدة. لا يشترط أن يكون الصف الأول.</div><div class="header-row-list">${Array.from({length:max},(_,i)=>`<label class="header-row-choice"><input type="radio" name="headerRow" value="${i}" ${i===importSession.headerRow?'checked':''}> الصف ${i+1}<span>${esc((s.matrix[i]||[]).slice(0,8).join(' | '))}</span></label>`).join('')}</div><div class="toolbar" style="margin-top:12px"><button class="btn" id="backToSheet">رجوع</button><button class="btn primary" id="toMapping">التالي: ربط الحقول</button></div>`;
 document.getElementById('backToSheet').onclick=renderImportStep2;
 document.getElementById('toMapping').onclick=()=>{const picked=Number(document.querySelector('input[name="headerRow"]:checked').value);if(picked!==importSession.headerRow)importSession.mapping=null;importSession.headerRow=picked;renderImportStep4()};
}
function renderImportStep4(){
 setImportStep(4);
 const s=importSession.workbook.sheets[importSession.sheetIndex];
 const headers=(s.matrix[importSession.headerRow]||[]).map(v=>String(v??''));
 importSession.headers=headers;
 importSession.mapping=importSession.mapping||guessMapping(headers);
 document.getElementById('importBody').innerHTML=`<div class="mapping-grid">${IMPORT_FIELDS.map(([key,label])=>`<div class="mapping-row"><b>${label}</b><select data-map="${key}">${mappingOptions(headers,importSession.mapping[key])}</select></div>`).join('')}</div><div class="field" style="margin-top:12px"><label>هل أستبدل بيانات الأصناف الموجودة بنفس الاي دي؟</label><select id="upsertMode"><option value="update" ${importSession.upsert!=='append'?'selected':''}>تحديث الموجود وإضافة الجديد</option><option value="append" ${importSession.upsert==='append'?'selected':''}>إضافة فقط</option></select></div><div class="toolbar" style="margin-top:12px"><button class="btn" id="backToHeaders">رجوع</button><button class="btn primary" id="toPreview">التالي: معاينة البيانات</button></div>`;
 document.querySelectorAll('[data-map]').forEach(sel=>sel.onchange=e=>importSession.mapping[e.target.dataset.map]=e.target.value);
 document.getElementById('backToHeaders').onclick=renderImportStep3;
 document.getElementById('toPreview').onclick=()=>{importSession.upsert=document.getElementById('upsertMode').value;renderImportStep5()};
}
function renderImportStep5(){
 setImportStep(5);
 const s=importSession.workbook.sheets[importSession.sheetIndex],m=importSession.mapping;
 const rows=s.matrix.slice(importSession.headerRow+1).filter(r=>r.some(v=>String(v??'').trim()));
 importSession.rows=rows;
 const sample=rows.slice(0,10);
 const val=(r,k)=>{const i=m[k];return i===''||i==null?'':r[Number(i)]??''};
 const catCounts={};rows.forEach(r=>{const c=String(val(r,'subCategory')).trim()||'(بدون قسم فرعي)';catCounts[c]=(catCounts[c]||0)+1});
 const noName=rows.filter(r=>!String(val(r,'name')).trim()).length;
 document.getElementById('importBody').innerHTML=`<div class="summary">${Object.entries(catCounts).map(([c,n])=>`<div class="card"><div class="muted">${esc(c)}</div><div class="stat">${n}</div></div>`).join('')||`<div class="card"><div class="muted">عدد الصفوف</div><div class="stat">${rows.length}</div></div>`}</div>${noName?`<div class="note" style="margin-top:10px">⚠️ فيه ${noName} صف بدون اسم صنف — هيتم تجاهلهم.</div>`:''}<div class="table-wrap" style="margin-top:12px"><table class="data-table"><thead><tr><th>اسم الصنف</th><th>الاي دي</th><th>الباركود</th><th>المورد</th><th>القسم الفرعي (= النوع)</th><th>قبل الخصم</th><th>بعد الخصم</th></tr></thead><tbody>${sample.map(r=>`<tr><td>${esc(val(r,'name'))}</td><td>${esc(val(r,'itemId'))}</td><td>${esc(val(r,'barcode'))}</td><td>${esc(val(r,'supplier'))}</td><td>${esc(val(r,'subCategory'))}</td><td>${esc(val(r,'salePriceBeforeDiscount'))}</td><td>${esc(val(r,'salePriceAfterDiscount'))}</td></tr>`).join('')}</tbody></table></div><div class="note" style="margin-top:12px">هيتم إنشاء الموردين تلقائيًا من عمود المورد، مع منع التكرار. نسبة الخصم وقيمته هيتحسبوا تلقائيًا من الفرق بين السعر قبل وبعد الخصم.</div><div class="toolbar" style="margin-top:12px"><button class="btn" id="backMap">رجوع</button><button class="btn primary" id="confirmImport">✅ تأكيد الاستيراد</button></div>`;
 document.getElementById('backMap').onclick=renderImportStep4;
 document.getElementById('confirmImport').onclick=commitImport;
}
async function commitImport(){
 const m=importSession.mapping,rows=importSession.rows;
 const val=(r,k)=>{const i=m[k];return i===''||i==null?'':String(r[Number(i)]??'').trim()};
 let added=0,updated=0,skipped=0,ignored=0;
 // مفتاح موحّد: الاي دي لو موجود، وإلا (الاسم + القسم + السعر) — عشان الصفوف
 // اللي مالهاش كود ما تتكررش مع كل إعادة استيراد لنفس الملف.
 const keyOf=(itemId,name,sub,price)=>itemId?`id:${itemId}`:`k:${normalizeKey(name)}|${normalizeKey(sub)}|${price}`;
 const index=new Map();
 for(const x of await all('items'))index.set(keyOf(String(x.itemId||''),x.name,x.subCategory,itemSalePrice(x)),x);
 const suppliersByKey=new Map((await all('suppliers')).map(x=>[x.name,x]));
 const newItems=[],newSuppliers=[];
 for(const r of rows){
  const name=val(r,'name');
  if(!name){ignored++;continue}
  const itemId=val(r,'itemId'),supplier=val(r,'supplier'),subCategory=val(r,'subCategory'),mainCategory=val(r,'mainCategory');
  const before=num(val(r,'salePriceBeforeDiscount')),after=num(val(r,'salePriceAfterDiscount'));
  const key=keyOf(itemId,name,subCategory,after);
  const old=index.get(key);
  if(old&&importSession.upsert!=='update'){skipped++;continue}
  if(supplier&&!suppliersByKey.has(supplier)){const sp={id:uid('sup'),name:supplier,code:''};suppliersByKey.set(supplier,sp);newSuppliers.push(sp)}
  const discountValue=before>after?before-after:0;
  const discountRate=before>0?(discountValue/before*100):0;
  const item={id:old?old.id:uid('item'),name,itemId,barcode:val(r,'barcode'),supplier,mainCategory,subCategory,salePriceBeforeDiscount:before,salePriceAfterDiscount:after,discountRate,discountValue,sellPrice:after};
  if(old)updated++;else added++;
  index.set(key,item);   // يمنع تكرار نفس المفتاح مرتين داخل نفس الملف
  newItems.push(item);
 }
 if(newSuppliers.length)await putMany('suppliers',newSuppliers);
 if(newItems.length)await putMany('items',newItems);
 state.suppliers=await all('suppliers');state.items=await all('items');state.itemsShown=ITEMS_PAGE;
 document.getElementById('importModal')?.remove();
 const bits=[`${added} جديد`,`${updated} تحديث`];
 if(skipped)bits.push(`${skipped} متجاهل (موجود)`);
 if(ignored)bits.push(`${ignored} صف بدون اسم`);
 toast(`تم الاستيراد: ${bits.join(' · ')}`,'ok');
 render();
}
function renderMatrixPreview(matrix,start,count,cols){return `<div class="table-wrap"><table class="data-table"><tbody>${matrix.slice(start,start+count).map((r,i)=>`<tr><th>صف ${start+i+1}</th>${r.slice(0,cols).map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}

const tierMatches=t=>matchTierItems(t,state.items);
function tierItemOptions(t){
 const matches=tierMatches(t);
 if(!matches.length)return `<option value="">${num(t.price)?'لا يوجد صنف بنفس السعر':'حدد السعر أولًا'}</option>`;
 return `<option value="">— اختر —</option>`+matches.map(m=>`<option value="${esc(m.id)}" ${t.itemId===m.id?'selected':''}>${esc(m.name)}${matches.length>1?` (${esc(m.supplier||'')})`:''}</option>`).join('');
}
function tierState(t){
 if(num(t.from)>num(t.to))return'<span class="status danger">الحدود خطأ</span>';
 const same=state.tiers.filter(x=>x.id!==t.id&&x.type===t.type&&x.enabled!==false);
 const overlap=same.some(x=>Math.max(num(t.from),num(x.from))<=Math.min(num(t.to),num(x.to)));
 return overlap?'<span class="status warn">تداخل</span>':'<span class="status ok">سليم</span>';
}
function tierCardHTML(t){
 const linkedName=tierMatches(t).find(m=>m.id===t.itemId)?.name;
 return `<div class="tier-card" data-tiercard="${esc(t.id)}"><div class="tier-row" style="grid-template-columns:26px 1fr 1fr 1fr"><input type="checkbox" class="tsel" data-tsel="${t.id}" style="width:auto;min-height:auto;margin-top:12px"><div class="field"><label>النوع (القسم الفرعي)</label><select data-t="type" data-id="${t.id}">${itemTypeOptions(t.type)}</select></div><div class="field"><label>من</label><input data-t="from" data-id="${t.id}" type="number" step="0.01" value="${t.from}"></div><div class="field"><label>إلى</label><input data-t="to" data-id="${t.id}" type="number" step="0.01" value="${t.to}"></div></div><div class="tier-row" style="grid-template-columns:1fr 1fr"><div class="field"><label>سعر البيع بعد الخصم</label><input data-t="price" data-id="${t.id}" type="number" step="0.01" value="${t.price}"></div><div class="field"><label>مفعلة</label><input data-t="enabled" data-id="${t.id}" type="checkbox" ${t.enabled!==false?'checked':''} style="width:auto;min-height:auto;margin-top:10px"></div></div><div class="field"><label>الصنف المرتبط في ERP${linkedName?' (ثابت، غيّره لو حبيت)':''}</label><select data-t="itemId" data-id="${t.id}">${tierItemOptions(t)}</select></div><div class="tier-foot"><span data-tierstate>${tierState(t)}</span><button class="btn danger small" data-dt="${t.id}">حذف</button></div></div>`;
}
async function renderPricing(){
 const tiers=[...state.tiers].sort((a,b)=>String(a.type).localeCompare(String(b.type))||num(a.from)-num(b.from));
 const cats=knownCategories();
 const pricingCat=state.pricingCat||defaultCategory()||cats[0]||'';
 const marginFor=c=>num(state.settings.marginRates?.[c]??state.settings.marginRate??.35)*100;
 app.innerHTML=`<section class="grid"><div class="card"><h2>🎨 مظهر النظام</h2><div class="field"><label>خط النظام</label><select id="fontPick">${FONT_OPTIONS.map(f=>`<option value="${f.id}" ${((state.settings.fontFamily||'tahoma')===f.id)?'selected':''}>${esc(f.label)}</option>`).join('')}</select></div><div id="fontPreview" class="note" style="margin-top:10px;font-size:16px">مثال: فاتورة تسعير شراء — 350 قطعة إجمالي 12,500</div><div class="muted tiny" style="margin-top:6px">الخط بيتطبق على النظام كله والطباعة الحرارية والصورة المشتركة. الخطوط غير Tahoma محتاجة إنترنت أول مرة بس لتحميلها، وبعدها تفضل شغالة.</div></div>
 <div class="card"><h2>⚙️ إعدادات التسعير</h2><div class="grid grid-2"><div class="field"><label>القسم</label><select id="marginCategory">${itemTypeOptions(pricingCat)}</select><div class="muted tiny">اختيار القسم هنا للعرض فقط ومش بيغيّر افتراضي الفاتورة.</div></div><div class="field"><label>نسبة الربح لهذا القسم</label><input id="margin" type="number" min="0" step="0.01" value="${marginFor(pricingCat)}"><div class="muted tiny">مثال 35 = 35%. كل قسم له نسبته الخاصة.</div></div><div class="field"><label>أساس حساب نسبة الربح</label><select id="marginBasis"><option value="cost" ${state.settings.marginBasis!=='purchase'?'selected':''}>التكلفة الفعلية</option><option value="purchase" ${state.settings.marginBasis==='purchase'?'selected':''}>سعر الشراء</option></select><div class="muted tiny">مثال: شراء 50 وخصم 5% ⇒ التكلفة 47.50. اختر على أيهما تحسب النسبة.</div></div><div class="field"><label>بادئة أرقام الفواتير</label><input id="prefix" value="${esc(state.settings.invoicePrefix||'INV')}"></div></div><button class="btn primary" id="saveSettings" style="margin-top:10px">حفظ الإعدادات</button><div class="note" style="margin-top:10px">سعر الشراء والتكلفة وسعر البيع قبل الخصم والسعر بعد الخصم حقول منفصلة. البحث عن صنف ERP يعتمد على السعر بعد الخصم، وكل شريحة تربط تلقائيًا بصنف ERP له نفس السعر بعد الخصم — لو أكتر من صنف بنفس السعر، هيُطلب منك تختار الصنف الصحيح من قائمة عند إضافة الفاتورة.</div></div>
 <div class="card"><div class="toolbar space"><h2>شرائح الأسعار</h2><div class="toolbar"><button class="btn danger" id="delSelectedTiers">🗑️ حذف المحدد</button><button class="btn danger" id="delAllTiers">🗑️ حذف الكل</button><button class="btn primary" id="addTier">+ شريحة</button></div></div>
 <div class="tier-template"><div class="field"><label>القسم اللي هتتحمّل عليه الشرائح</label><input id="tierTemplateCat" list="tierCatList" value="${esc(pricingCat)}" placeholder="اكتب اسم القسم زي ما هو في ملفك"><datalist id="tierCatList">${cats.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist></div><div class="field"><label>القالب</label><select id="tierTemplateSrc">${Object.entries(TIER_TEMPLATES).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div><button class="btn" id="loadTierTemplate">⬇️ تحميل القالب</button></div>
 <div class="muted tiny" style="margin:6px 0 10px">القوالب مأخوذة من معادلة الإكسل القديمة. الأقسام عندك بتيجي من ملف الـERP، فاكتب اسم القسم بالظبط زي ما هو مكتوب في العمود "القسم الفرعي".</div>
 <div class="tier-cards">${tiers.map(tierCardHTML).join('')||'<div class="empty">لا توجد شرائح أسعار بعد. أضف شرائحك الفعلية أو حمّل القالب.</div>'}</div><div class="note" style="margin-top:10px">الحدود مكتوبة بأرقام صحيحة، والقيم العشرية اللي بينها بتروح للشريحة الأعلى تلقائيًا — زي المعادلة الأصلية بالظبط. الصنف المرتبط يُقترح تلقائيًا أول مرة فقط ويظل ثابتًا بعدها حتى تغيّره بنفسك.</div></div></section>`;
 document.getElementById('fontPick').onchange=async e=>{const id=e.target.value;applyFont(id);await setSetting('fontFamily',id);state.settings.fontFamily=id;toast(`تم تفعيل خط ${fontOption(id).label}`,'ok')};
 document.getElementById('marginCategory').onchange=e=>{state.pricingCat=e.target.value;document.getElementById('margin').value=marginFor(e.target.value);document.getElementById('tierTemplateCat').value=e.target.value};
 // ملاحظة: الشاشة دي مبتغيّرش defaultType — ده بيتحدد من آخر صنف تضيفه في الفاتورة.
 document.getElementById('saveSettings').onclick=async()=>{
  const cat=document.getElementById('marginCategory').value;
  const rates={...(state.settings.marginRates||{}),[cat]:num(document.getElementById('margin').value)/100};
  await setSetting('marginRates',rates);
  await setSetting('marginBasis',document.getElementById('marginBasis').value);
  await setSetting('invoicePrefix',document.getElementById('prefix').value.trim()||'INV');
  state.settings=await getSettings();state.pricingCat=cat;
  toast(`تم حفظ نسبة الربح لقسم "${cat}"`,'ok');render();
 };
 document.getElementById('addTier').onclick=async()=>{await saveTier({type:document.getElementById('tierTemplateCat').value.trim()||pricingCat,from:0,to:0,price:0,enabled:true});state.tiers=(await loadPricing()).tiers;render()};
 document.getElementById('loadTierTemplate').onclick=async()=>{
  const type=document.getElementById('tierTemplateCat').value.trim();
  if(!type){toast('اكتب اسم القسم الأول','error');return}
  const tpl=TIER_TEMPLATES[document.getElementById('tierTemplateSrc').value];
  const existing=state.tiers.filter(x=>x.type===type);
  if(existing.length&&!confirm(`يوجد بالفعل ${existing.length} شريحة لقسم "${type}". تضيف ${tpl.rows.length} شريحة فوقها (بدون حذف الموجود)؟`))return;
  await putMany('tiers',tpl.rows.map(([from,to,price])=>({id:uid('tier'),type,from,to,price,enabled:true})));
  state.tiers=(await loadPricing()).tiers;
  toast(`تم تحميل ${tpl.rows.length} شريحة لقسم "${type}"`,'ok');render();
 };
 document.querySelectorAll('[data-dt]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف شريحة الأسعار؟'))return;await removeTier(b.dataset.dt);state.tiers=(await loadPricing()).tiers;render()});
 document.getElementById('delSelectedTiers').onclick=async()=>{const ids=[...document.querySelectorAll('[data-tsel]:checked')].map(c=>c.dataset.tsel);if(!ids.length){toast('حدد شرائح الأول','error');return}if(!confirm(`حذف ${ids.length} شريحة محددة؟`))return;await delMany('tiers',ids);state.tiers=(await loadPricing()).tiers;toast('تم الحذف','ok');render()};
 document.getElementById('delAllTiers').onclick=async()=>{if(!state.tiers.length){toast('لا توجد شرائح','error');return}if(!confirm(`حذف كل الشرائح (${state.tiers.length})؟ ده مش قابل للتراجع.`))return;await clear('tiers');state.tiers=[];toast('تم حذف كل الشرائح','ok');render()};
 // تعديل في المكان: من غير render() كامل، عشان الكارت ما يقفزش والفوكس ما يضيعش.
 document.querySelectorAll('[data-t]').forEach(inp=>inp.onchange=async()=>{
  const t=state.tiers.find(x=>x.id===inp.dataset.id);
  if(!t)return;
  const k=inp.dataset.t;
  if(k==='enabled')t.enabled=inp.checked;
  else if(k==='type'){t.type=inp.value;t.itemId=''}
  else if(k==='itemId')t.itemId=inp.value;
  else{t[k]=num(inp.value);if(k==='price')t.itemId=''}
  if(!t.itemId){const m=tierMatches(t);if(m.length)t.itemId=m[0].id}
  await saveTier(t);
  const card=document.querySelector(`[data-tiercard="${CSS.escape(t.id)}"]`);
  if(card){
   const stateEl=card.querySelector('[data-tierstate]');if(stateEl)stateEl.innerHTML=tierState(t);
   if(k==='type'||k==='price'){const sel=card.querySelector('[data-t="itemId"]');if(sel)sel.innerHTML=tierItemOptions(t)}
  }
 });
}

function erpKeys(){return [{key:'itemId',label:'الاي دي'},{key:'barcode',label:'الباركود'},{key:'itemName',label:'اسم الصنف'},{key:'unitLabel',label:'الوحدة (قطعة - ثابتة)'},{key:'cost',label:'السعر (التكلفة/قطعة)'},{key:'purchasePrice',label:'سعر الشراء/قطعة'},{key:'qty',label:'الكمية'},{key:'sellPrice',label:'سعر البيع (بعد الخصم)'},{key:'saleBeforeDiscount',label:'سعر البيع / قبل الخصم'},{key:'seq',label:'مسلسل'},{key:'invoiceNo',label:'رقم الفاتورة'},{key:'date',label:'التاريخ'},{key:'supplier',label:'المورد'},{key:'type',label:'قسم الصنف'},{key:'unit',label:'كمية القطع بالدستة/الكرتونة (داخلي)'},{key:'cartonQty',label:'كمية الدستة/الكرتونة'},{key:'purchaseCartonPrice',label:'سعر الشراء/الدستة أو الكرتونة'},{key:'total',label:'إجمالي الشراء (السطر)'},{key:'profit',label:'الربح/قطعة'},{key:'totalProfit',label:'إجمالي الربح (السطر)'},{key:'margin',label:'نسبة الربح %'},{key:'notes',label:'ملاحظات'}]}
// أي تعديل في الترتيب لازم يقرا الحقول من الشاشة الأول، وإلا تعديلات الأسماء بتضيع.
function syncErpColsFromDOM(){
 const rows=[...document.querySelectorAll('[data-erprow]')];
 if(!rows.length)return;
 state.erpColumns=rows.map(row=>({key:row.querySelector('[data-ek="key"]').value,label:row.querySelector('[data-ek="label"]').value.trim()||'حقل'}));
}
async function renderERP(){
 const cols=state.erpColumns;
 app.innerHTML=`<section class="grid grid-2"><div class="card"><h2>📤 ترتيب أعمدة ERP</h2><div class="note">ده ترتيب التصدير فقط. قاعدة البيانات الداخلية لها ترتيبها الخاص، أما ملف Excel النهائي فيخرج بنفس تسلسل شاشة ERP الذي ستحدده هنا.</div><div id="erpCols" class="grid" style="margin-top:10px">${cols.map((c,i)=>`<div class="erp-row" data-erprow="${i}"><span class="drag-num">${i+1}</span><input data-ek="label" value="${esc(c.label)}" aria-label="اسم العمود"><select data-ek="key" aria-label="الحقل">${erpKeys().map(k=>`<option value="${k.key}" ${k.key===c.key?'selected':''}>${k.label}</option>`).join('')}</select><div class="erp-move"><button class="btn small" data-mvup="${i}" ${i===0?'disabled':''} title="تحريك لأعلى">▲</button><button class="btn small" data-mvdn="${i}" ${i===cols.length-1?'disabled':''} title="تحريك لأسفل">▼</button><button class="btn danger small" data-delcol="${i}">حذف</button></div></div>`).join('')||'<div class="empty">لا توجد أعمدة. اضغط "القالب الافتراضي".</div>'}</div><div class="toolbar" style="margin-top:10px"><button class="btn" id="addCol">+ عمود</button><button class="btn" id="resetCols">القالب الافتراضي</button><button class="btn primary" id="saveCols">حفظ الترتيب</button></div><div class="muted tiny" style="margin-top:8px">استخدم ▲▼ لتغيير ترتيب الأعمدة. لازم تضغط "حفظ الترتيب" عشان يتخزن.</div></div><div class="card"><h2>معنى الحقول المالية</h2><div class="info-list"><div><b>سعر الشراء:</b> السعر الذي تشتري به قبل الخصم.</div><div><b>التكلفة:</b> التكلفة الفعلية بعد خصم المورد والتسويات.</div><div><b>سعر البيع / قبل الخصم:</b> نفس القيمة عندك، وليسا حقلين مختلفين.</div><div><b>السعر بعد الخصم:</b> السعر الذي يدفعه المستهلك، وهو مفتاح البحث عن صنف ERP.</div></div></div></section>`;
 const move=(from,to)=>{syncErpColsFromDOM();const c=state.erpColumns;if(to<0||to>=c.length)return;[c[from],c[to]]=[c[to],c[from]];renderERP()};
 document.querySelectorAll('[data-mvup]').forEach(b=>b.onclick=()=>move(Number(b.dataset.mvup),Number(b.dataset.mvup)-1));
 document.querySelectorAll('[data-mvdn]').forEach(b=>b.onclick=()=>move(Number(b.dataset.mvdn),Number(b.dataset.mvdn)+1));
 document.querySelectorAll('[data-delcol]').forEach(b=>b.onclick=()=>{syncErpColsFromDOM();state.erpColumns.splice(Number(b.dataset.delcol),1);renderERP()});
 document.getElementById('addCol').onclick=()=>{syncErpColsFromDOM();state.erpColumns.push({key:'notes',label:'ملاحظات'});renderERP()};
 document.getElementById('resetCols').onclick=()=>{if(!confirm('استرجاع القالب الافتراضي؟ التعديلات غير المحفوظة هتضيع.'))return;state.erpColumns=DEFAULT_ERP_COLUMNS.map(x=>({...x}));renderERP()};
 document.getElementById('saveCols').onclick=async()=>{syncErpColsFromDOM();await put('meta',{id:'erpColumns',value:state.erpColumns});toast('تم حفظ ترتيب ERP','ok')};
}

const fmtBytes=b=>b>=1048576?`${(b/1048576).toFixed(1)} ميجا`:`${Math.max(1,Math.round(b/1024))} كيلو`;
async function renderBackup(){
 let attBytes=0;
 try{attBytes=await attachmentsSize()}catch(e){console.error(e)}
 const heavy=attBytes>25*1024*1024;
 app.innerHTML=`<section class="grid grid-2"><div class="card"><h2>💾 النسخ الاحتياطي والاستعادة</h2><p>كل بيانات النظام محلية. استخدم النسخ الاحتياطي قبل أي تحديث أو تغيير كبير.</p><div class="toolbar"><button class="btn primary" id="backupOut">تصدير نسخة كاملة</button><button class="btn" id="backupLight">تصدير بدون المرفقات</button><button class="btn" id="backupIn">استعادة نسخة</button></div><div class="note" style="margin-top:12px">النسخة الكاملة تشمل الموردين، الأصناف، الشرائح، الإعدادات، الفواتير والمرفقات.<br>حجم المرفقات حاليًا: <b>${attBytes?fmtBytes(attBytes):'لا يوجد'}</b>.${heavy?'<br>⚠️ المرفقات كبيرة — لو التصدير الكامل فشل أو علّق المتصفح، استخدم "بدون المرفقات".':''}</div><div class="note" style="margin-top:10px">الاستعادة بتتحقق من الملف بالكامل قبل ما تمسح أي حاجة — لو الملف تالف بياناتك الحالية تفضل زي ما هي.</div><input id="backupFile" type="file" accept="application/json,.json" hidden></div><div class="card"><h2>ℹ️ معلومات النسخة</h2><div class="info-list"><div><b>الإصدار:</b> v${APP_VERSION}</div><div><b>المنشئ:</b> ${esc(CREATOR)}</div><div><b>Build:</b> ${BUILD_DATE}</div><div><b>التخزين:</b> IndexedDB Local-First</div><div><b>المعمارية:</b> Modular PWA</div><div><b>البيانات:</b> ${state.items.length} صنف · ${state.suppliers.length} مورد · ${state.tiers.length} شريحة · ${state.invoices.length} فاتورة</div></div></div></section>`;
 const runExport=async opts=>{try{await exportBackup(opts);toast('تم تصدير النسخة الاحتياطية','ok')}catch(err){console.error(err);toast('فشل التصدير — جرّب "بدون المرفقات"','error')}};
 document.getElementById('backupOut').onclick=()=>runExport({includeAttachments:true});
 document.getElementById('backupLight').onclick=()=>runExport({includeAttachments:false});
 document.getElementById('backupIn').onclick=()=>document.getElementById('backupFile').click();
 document.getElementById('backupFile').onchange=async e=>{
  const f=e.target.files?.[0];e.target.value='';
  if(!f)return;
  if(!confirm('الاستعادة ستستبدل البيانات المحلية الحالية. هل تريد المتابعة؟'))return;
  try{const counts=await importBackup(f);state.draft=null;await load();toast(`تمت الاستعادة: ${counts.items||0} صنف · ${counts.invoices||0} فاتورة`,'ok');render()}
  catch(err){console.error(err);toast(err.message||'ملف النسخة الاحتياطية غير صالح','error')}
 };
}
async function openAttachment(id){const a=await get('attachments',id);if(!a?.blob){toast('المرفق غير موجود','error');return}const url=URL.createObjectURL(a.blob);const w=window.open(url,'_blank');if(!w)toast('اسمح بفتح نافذة جديدة لعرض المرفق','error');setTimeout(()=>URL.revokeObjectURL(url),60000)}

const flushDraft=()=>{if(draftWorthSaving(state.draft)){try{recalcDraft(state.draft);autosaveInvoice(state.draft)}catch{}}};
addEventListener('beforeunload',flushDraft);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushDraft()});

let dbReady=false,bootError=null;
function renderDbStatus(){
  const el=document.getElementById('dbStatus');
  if(!el)return;
  if(dbReady){el.textContent='● التخزين المحلي جاهز';el.className='db-status ok'}
  else if(bootError){el.textContent='● وضع مؤقت — قاعدة البيانات لم تجهز';el.className='db-status warn'}
  else{el.textContent='● جاري تجهيز التخزين المحلي';el.className='db-status loading'}
}
function renderSafeFallback(){
  app.innerHTML=`<section class="grid"><div class="card hero-card"><div class="toolbar space"><div><h2>نظام تسعير السليبر</h2><div class="muted">النظام يعمل الآن، ويمكنك فتح الشاشات. يتم تجهيز التخزين المحلي في الخلفية.</div></div><span id="dbStatus" class="db-status loading">● جاري تجهيز التخزين المحلي</span></div><div class="note" style="margin-top:12px">لن يتم فقد أي بيانات. إذا تعذر تشغيل IndexedDB سيظهر لك السبب بدل توقف الشاشة.</div><div id="dbError" class="note" style="display:none;margin-top:10px"></div></div><div class="card"><h3>ابدأ من هنا</h3><div class="grid grid-2"><button class="btn primary" id="safeInvoice">🧾 فتح الفاتورة</button><button class="btn" id="safeCatalog">📦 البيانات الأساسية</button><button class="btn" id="safePricing">⚙️ التسعير</button><button class="btn" id="safeERP">📤 ERP</button></div></div></section>`;
  renderDbStatus();
  document.getElementById('safeInvoice').onclick=()=>{state.view='invoice';if(dbReady)render();else renderInvoiceSafe()};
  document.getElementById('safeCatalog').onclick=()=>{state.view='catalog';renderSafeView('catalog')};
  document.getElementById('safePricing').onclick=()=>{state.view='pricing';renderSafeView('pricing')};
  document.getElementById('safeERP').onclick=()=>{state.view='export';renderSafeView('export')};
  if(bootError){const e=document.getElementById('dbError');e.style.display='block';e.innerHTML=`<b>مشكلة التخزين:</b> ${esc(bootError.message||String(bootError))}<div class="toolbar" style="margin-top:8px"><button class="btn danger" id="resetLocal">تهيئة التخزين المحلي من جديد</button><button class="btn" id="retryLocal">إعادة المحاولة</button></div>`;document.getElementById('resetLocal').onclick=resetLocalDb;document.getElementById('retryLocal').onclick=()=>location.reload()}
}
function renderInvoiceSafe(){
  app.innerHTML=`<section class="grid"><div class="card hero-card"><div class="toolbar space"><div><h2>🧾 فاتورة تسعير شراء</h2><div class="muted">وضع تشغيل مؤقت: التخزين المحلي لم يجهز بعد.</div></div><span id="dbStatus" class="db-status warn">● وضع مؤقت</span></div><div class="note" style="margin-top:10px">الشاشة اتفتحت بدل ما النظام يتجمد، لكن الحفظ متوقف لحد ما التخزين المحلي يجهز. مفيش أي بيانات هتضيع — استنى لحظات أو اضغط إعادة المحاولة.</div><div class="toolbar" style="margin-top:10px"><button class="btn primary" id="retrySafeInv">إعادة المحاولة</button></div></div></section>`;
  document.getElementById('retrySafeInv').onclick=()=>location.reload();
}
function renderSafeView(view){
  const titles={catalog:'📦 البيانات الأساسية',pricing:'⚙️ التسعير',export:'📤 ERP'};
  app.innerHTML=`<section class="grid"><div class="card"><h2>${titles[view]||'النظام'}</h2><p>الشاشة متاحة، لكن التخزين المحلي لم يجهز بعد. انتظر لحظات أو استخدم إعادة المحاولة.</p><div class="toolbar"><button class="btn primary" id="retrySafe">إعادة المحاولة</button></div></div></section>`;
  document.getElementById('retrySafe').onclick=()=>location.reload();
}
async function resetLocalDb(){
  if(!confirm('ده هيمسح كل البيانات المحلية على الجهاز ده نهائيًا. متأكد؟'))return;
  try{localStorage.clear();sessionStorage.clear();const req=indexedDB.deleteDatabase('slipperPricingDB_v14');req.onsuccess=()=>location.reload();req.onerror=()=>location.reload();req.onblocked=()=>{alert('أغلق أي تبويب آخر للنظام ثم اضغط موافق.');location.reload()}}catch(e){location.reload()}
}
async function boot(){
  renderSafeFallback();
  const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('انتهت مهلة تهيئة قاعدة البيانات المحلية (5 ثوانٍ).')),5000));
  try{
    await Promise.race([load(),timeout]);
    dbReady=true;bootError=null;renderDbStatus();
    await render();
  }catch(e){
    bootError=e;dbReady=false;console.error('Startup error:',e);renderSafeFallback();
    if(window.__showFatalError)window.__showFatalError('فشل تشغيل قاعدة البيانات المحلية عند الإقلاع: '+(e&&e.message||e));
  }
  // محاولة تانية في الخلفية بعد لحظات، من غير ما توقف الواجهة.
  if(!dbReady){setTimeout(async()=>{try{await load();dbReady=true;bootError=null;renderDbStatus();await render()}catch(e){bootError=e;renderSafeFallback();if(window.__showFatalError)window.__showFatalError('فشلت المحاولة الثانية لتشغيل قاعدة البيانات: '+(e&&e.message||e))}},2500)}
}
boot();
addEventListener('error',e=>{if(e?.error)console.error('Global error',e.error)});
addEventListener('unhandledrejection',e=>console.error('Unhandled promise',e.reason));
if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v='+APP_VERSION,{updateViaCache:'none'});
      await reg.update().catch(()=>{});
    }catch(e){console.warn('Service worker setup skipped',e)}
  });
}
