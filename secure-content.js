/* HEON ARCHIVE 1.3.0: authenticated protected data / original images loader.
 * Never place problem data or lecture images in the public Pages release.
 */
(()=>{
  'use strict';
  const BUCKET='heon-private-content';
  const MAX_CACHE_BYTES=72*1024*1024;
  let authorized=false,client=null,cacheBytes=0;
  const blobs=new Map(),inflight=new Map();
  let observer=null,intersection=null;
  const isProtectedPath=p=>typeof p==='string'&&(/^(assets\/(?!ui\/)|data\/)/.test(p.replace(/^\.\//,'')));
  const pathOf=value=>{
    const s=String(value||'').replace(/^\.\//,'').split(/[?#]/)[0];
    if(!isProtectedPath(s))return null;
    if(s.includes('..')||s.startsWith('/'))throw Error('Invalid protected asset path');
    return s;
  };
  function assertAuthorized(){if(!authorized||!client)throw Error('승인된 로그인 이후에만 자료를 불러올 수 있습니다.');}
  // Supabase Storage rejects non-ASCII object keys. Keep original Korean file
  // references in question data, but request the matching safe server key.
  // Keep this mapping IDENTICAL to storage_key() in the admin uploader.
  const storageKey=path=>Array.from(path,ch=>/^[A-Za-z0-9/._-]$/.test(ch)
    ?ch:'_u'+ch.codePointAt(0).toString(16)+'_').join('');
  async function downloadBlob(path){
    assertAuthorized();
    const {data,error}=await client.storage.from(BUCKET).download(storageKey(path));
    if(error||!data)throw Error(`${path}: ${error?.message||'자료를 찾지 못했습니다.'}`);
    return data;
  }
  function cacheSet(path,url,size){
    blobs.delete(path);blobs.set(path,{url,size});cacheBytes+=size;
    // Preserve URLs still used by visible images. Recently used URLs remain in LRU order.
    let checked=0;
    while(cacheBytes>MAX_CACHE_BYTES&&blobs.size>1&&checked++<blobs.size){
      const [key,item]=blobs.entries().next().value;
      if(key.toLowerCase().endsWith('.pdf')||[...document.images].some(img=>img.src===item.url)){
        blobs.delete(key);blobs.set(key,item);continue;
      }
      blobs.delete(key);cacheBytes-=item.size;URL.revokeObjectURL(item.url);
    }
  }
  async function getAssetURL(value){
    const path=pathOf(value);
    if(!path)return String(value||'');
    assertAuthorized();
    if(blobs.has(path)){
      const hit=blobs.get(path);blobs.delete(path);blobs.set(path,hit);return hit.url;
    }
    if(inflight.has(path))return inflight.get(path);
    const task=(async()=>{
      const blob=await downloadBlob(path),url=URL.createObjectURL(blob);
      cacheSet(path,url,blob.size);return url;
    })();
    inflight.set(path,task);
    try{return await task;}finally{inflight.delete(path);}
  }
  async function loadScript(path){
    if(!/^data\/[a-z0-9/_-]+\.js$/i.test(path))throw Error('잘못된 문제은행 경로입니다.');
    const scriptURL=await getAssetURL(path);
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=scriptURL;s.async=false;
      s.onload=()=>{s.remove();resolve();};
      s.onerror=()=>{s.remove();reject(Error('보호된 문제은행을 읽을 수 없습니다: '+path));};
      document.head.append(s);
    });
  }
  function prepareImage(el){
    if(!(el instanceof HTMLImageElement))return;
    const raw=el.getAttribute('data-protected-src')||el.getAttribute('src');
    const path=pathOf(raw);
    if(!path||el.dataset.protectedReady==='1'||el.dataset.protectedBusy==='1')return;
    el.dataset.protectedSrc=path;
    // Avoid 404 requests to Pages; their absence is by design.
    if(el.getAttribute('src')===raw)el.removeAttribute('src');
    if(!authorized)return;
    if(intersection)intersection.observe(el);
    else void loadImage(el);
  }
  async function loadImage(el){
    if(!el.isConnected||el.dataset.protectedBusy==='1'||el.dataset.protectedReady==='1')return;
    const path=el.dataset.protectedSrc;
    if(!path)return;
    el.dataset.protectedBusy='1';
    try{
      const url=await getAssetURL(path);
      if(el.isConnected&&el.dataset.protectedSrc===path){
        el.setAttribute('src',url);el.dataset.protectedReady='1';
      }
    }catch(error){
      console.warn('보호된 이미지 불러오기 실패',error);
      el.alt=(el.alt||'이미지')+' · 불러오기 실패';
    }finally{delete el.dataset.protectedBusy;}
  }
  function scan(node){
    if(!node||node.nodeType!==1)return;
    if(node instanceof HTMLImageElement)prepareImage(node);
    node.querySelectorAll?.('img').forEach(prepareImage);
  }
  // Raw PDF documents linked by archived questions must also use a member-only
  // authenticated Blob URL; never let the browser request the old public path.
  document.addEventListener('click',async event=>{
    const link=event.target?.closest?.('a[href^="assets/"]');
    if(!link || !pathOf(link.getAttribute('href')))return;
    event.preventDefault();
    const popup=window.open('about:blank','_blank');
    try{
      const href=await getAssetURL(link.getAttribute('href'));
      if(popup)popup.location.href=href;
      else{const a=document.createElement('a');a.href=href;a.download=link.getAttribute('href').split('/').pop();document.body.append(a);a.click();a.remove();}
    }catch(error){popup?.close();alert('보호된 PDF 자료를 불러오지 못했습니다: '+error.message);}
  });
  function startImages(){
    if(intersection||observer)return;
    if('IntersectionObserver' in window){
      intersection=new IntersectionObserver((entries)=>{
        for(const entry of entries)if(entry.isIntersecting){intersection.unobserve(entry.target);void loadImage(entry.target);}
      },{rootMargin:'500px'});
    }
    observer=new MutationObserver(entries=>{
      for(const rec of entries){
        if(rec.type==='childList')for(const n of rec.addedNodes)scan(n);
        if(rec.type==='attributes')prepareImage(rec.target);
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
    scan(document.body);
  }
  function activate(c){
    if(!c)throw Error('Supabase 연결을 확인하세요.');
    client=c;authorized=true;startImages();
  }
  function reset(){
    authorized=false;client=null;
    observer?.disconnect();observer=null;
    intersection?.disconnect();intersection=null;
    for(const item of blobs.values())URL.revokeObjectURL(item.url);
    blobs.clear();inflight.clear();cacheBytes=0;
  }
  window.HeonProtected={activate,reset,getAssetURL,loadScript,prepareImage,
    get authorized(){return authorized;},get bucket(){return BUCKET;}};
})();
