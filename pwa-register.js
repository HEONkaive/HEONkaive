/* v1.1.2 · Installable iPadOS PWA. iPad: Safari → Share → Add to Home Screen. */
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js?v=1.3.0-loginfix1',{scope:'./'}).catch(error=>console.warn('PWA service worker:',error));
  });
}
