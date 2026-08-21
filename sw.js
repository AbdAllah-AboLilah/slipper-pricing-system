// رقم الإصدار بييجي من رابط التسجيل نفسه (app.js بيسجّل ./sw.js?v=APP_VERSION)،
// فمفيش رقم إصدار مكتوب باليد هنا.
const VERSION=new URL(self.location.href).searchParams.get('v')||'dev';
const CACHE=`slipper-pricing-${VERSION}`;
const CORE=['./','./index.html','./manifest.webmanifest','./src/styles.css','./src/app.js','./src/core/db.js','./src/core/state.js','./src/core/utils.js','./src/modules/invoices.js','./src/modules/pricing.js','./src/modules/catalog.js','./src/modules/settings.js','./src/modules/export.js','./src/modules/receipt.js','./src/modules/backup.js','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-180.png'];

// كل ملف لوحده — عشان فشل ملف واحد ما يبطّلش التثبيت كله.
self.addEventListener('install',event=>event.waitUntil(
 caches.open(CACHE)
  .then(cache=>Promise.all(CORE.map(url=>cache.add(url).catch(()=>{}))))
  .then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
 caches.keys()
  .then(keys=>Promise.all(keys.filter(k=>k.startsWith('slipper-pricing-')&&k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())
));

// ignoreSearch مهم: الملفات مخزّنة بدون ?v=… لكنها بتتطلب بالـ query،
// ومن غيره الـ precache ما كانش بيتستخدم في وضع عدم الاتصال أبدًا.
const cacheLookup=request=>caches.match(request,{ignoreSearch:true});

self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET') return;
 const url=new URL(event.request.url);
 if(url.origin!==location.origin) return;
 const isAppFile=event.request.mode==='navigate'||/\.(js|css|html|webmanifest)$/.test(url.pathname);
 if(isAppFile){
  // شبكة أولًا عشان التحديثات توصل فورًا، والكاش احتياطي لما مفيش نت.
  event.respondWith(
   fetch(event.request)
    .then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});return response})
    .catch(()=>cacheLookup(event.request).then(r=>r||cacheLookup('./index.html')))
  );
 } else {
  event.respondWith(
   cacheLookup(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});return response}))
  );
 }
});
