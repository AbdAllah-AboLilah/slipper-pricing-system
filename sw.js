const VERSION='1.3.3';
const CACHE=`slipper-pricing-${VERSION}`;
const CORE=['./','./index.html','./manifest.webmanifest','./src/styles.css','./src/app.js','./src/core/db.js','./src/core/state.js','./src/core/utils.js','./src/modules/invoices.js','./src/modules/pricing.js','./src/modules/catalog.js','./src/modules/settings.js','./src/modules/export.js','./src/modules/receipt.js','./src/modules/backup.js','./src/modules/version.js','./assets/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('slipper-pricing-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET') return;
 const url=new URL(event.request.url);
 if(url.origin!==location.origin) return;
 const isAppFile=event.request.mode==='navigate'||/\.(js|css|html|webmanifest)$/.test(url.pathname);
 if(isAppFile){
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});return response}).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));
 } else {
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});return response})));
 }
});
