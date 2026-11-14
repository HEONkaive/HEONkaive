/* v1.3.0 — public shell only; protected data is never cached by Service Worker. */
const CACHE='heon-public-v1.3.2-jo';
const SHELL=['./','./index.html','./styles.css','./auth-gate.js','./secure-content.js','./app.js','./study-account.js','./pdf-export.js','./ink.js','./leaderboard-config.js','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('heon-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const r=event.request;
  if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;
  const path=new URL(r.url).pathname;
  // No private data or asset paths may be served from an old browser cache.
  if(/\/data\/|\/assets\/(?!ui\/)/.test(path)){
    event.respondWith(new Response('Protected resource', {status:403,headers:{'Cache-Control':'no-store'}}));return;
  }
  if(r.mode==='navigate')event.respondWith(fetch(r,{cache:'no-store'}).catch(()=>caches.match('./index.html')));
});
