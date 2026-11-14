/* HEON ARCHIVE v1.2.5 — stationary marker hold for straight lines.
 * Notes are saved per question in IndexedDB, including independent question and
 * explanation overlays; existing v1.2.0 stroke data is retained unchanged.
 * Apple Pencil draws on the page itself. Solve mode restores native interaction.
 */
(()=>{'use strict';
  const DB='heon.archive.ink.v1', STORE='notes', W=1000;
  let dbPromise=null, active=null, loadToken=0, owner='guest', cloudTimer=null, cloudError='';
  let drawingMode=false, selectedTool='pen', penColor='#2457bb', markerColor='#ffdf59', perfect=null;
  const WIDTHS={pen:[0.3,0.4,0.5,0.6,0.7],marker:[2,3,4],erase:[6,12,20]};
  const COLORS={pen:[['빨강','#e24646'],['주황','#ed8729'],['초록','#26985e'],['파랑','#2457bb'],['검정','#252a35'],['보라','#9355be'],['갈색','#84563f']],marker:[['핑크','#fc75b1'],['하늘','#7bd9f6'],['노랑','#ffdf59']]};
  const sizes={pen:0.5,marker:3,erase:12};
  let openSize='',openPalette=false;
  import('https://cdn.jsdelivr.net/npm/perfect-freehand@1.2.3/dist/esm/index.mjs')
    .then(m=>{if(typeof m.getStroke==='function')perfect=m.getStroke;}).catch(()=>{});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function db(){return dbPromise ||= new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(Error('IndexedDB 미지원'));return;}
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
    req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
  });}
  async function storage(itemKey,value){
    const database=await db();return new Promise((resolve,reject)=>{
      const tx=database.transaction(STORE,value===undefined?'readonly':'readwrite');
      const req=value===undefined?tx.objectStore(STORE).get(itemKey):tx.objectStore(STORE).put(value,itemKey);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  const account=()=>window.HeonStudyAccount;
  const key=q=>`${owner}::${q}`;
  const empty=()=>({strokes:[],explanationStrokes:[],sizes:{},updatedAt:null});
  function fallback(points,opts){
    const size=opts.size||5,poly=[];
    if(!points.length)return poly;
    for(let i=0;i<points.length;i++){
      const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
      const radius=size*(.28+.26*(p[2]||.5));
      poly.push([p[0]-dy/len*radius,p[1]+dx/len*radius]);
    }
    for(let i=points.length-1;i>=0;i--){
      const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
      const radius=size*(.28+.26*(p[2]||.5));
      poly.push([p[0]+dy/len*radius,p[1]-dx/len*radius]);
    }
    return poly;
  }
  function outline(stroke){
    const opts={size:stroke.width||5,thinning:stroke.tool==='marker'?0:.5,
      smoothing:.55,streamline:.45,simulatePressure:false,last:true,start:{cap:true},end:{cap:true}};
    const pts=(stroke.points||[]).map(p=>[p[0],p[1],p[2]??.5]);
    try{return perfect?perfect(pts,opts):fallback(pts,opts);}catch(_){return fallback(pts,opts);}
  }
  function path(stroke){
    const shape=outline(stroke);
    if(!shape.length)return '';
    if(shape.length===1){const p=shape[0];return `M${p[0]-2},${p[1]}a2,2 0 1,0 4,0a2,2 0 1,0 -4,0`;}
    return 'M'+shape.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')+'Z';
  }
  function asSvg(stroke){return `<path d="${path(stroke)}" fill="${esc(stroke.color||'#2457bb')}" opacity="${stroke.tool==='marker'?.27:1}"/>`;}
  function toolIcon(tool){
    const shapes={pen:'<path d="m4 16 12-12 4 4-12 12-5 1 1-5Z"/><path d="m13 7 4 4M4 16l4 4"/>',marker:'<path d="m6 13 9-10 6 6-9 9-6-5Z"/><path d="m6 13-3 5 4 3 5-3M3 21h7M13 5l6 6"/>',erase:'<path d="m3 14 10-11a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3L11 21H8l-5-5a2 2 0 0 1 0-2Z"/><path d="m8 9 9 9M10 21h11"/>'};
    return `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[tool]}</svg>`;
  }
  // Segment distance makes fast eraser sweeps hit sparse as well as dense strokes.
  function pointSegmentDistance(p,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
    const t=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  function segmentsDistance(a,b,c,d){
    const cross=(p,q,t)=>(q[0]-p[0])*(t[1]-p[1])-(q[1]-p[1])*(t[0]-p[0]);
    const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);
    if(((x<0&&y>0)||(x>0&&y<0))&&((u<0&&v>0)||(u>0&&v<0)))return 0;
    return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
  }
  function sizeMenu(tool){
    if(tool==='erase')return `<div class="ink-size-popover ink-eraser-sizes" data-ink-size-menu="erase" hidden role="group" aria-label="지우개 크기 선택">${WIDTHS.erase.map((mm,i)=>`<button type="button" data-ink-width="${mm}" data-ink-width-tool="erase" title="${['작게','중간','크게'][i]} · 지름 ${mm}mm · 획 단위 지우개" aria-label="지우개 ${['작게','중간','크게'][i]} · ${mm}mm"><span class="ink-eraser-size-circle" style="width:${10+i*9}px;height:${10+i*9}px"></span></button>`).join('')}</div>`;
    return `<div class="ink-size-popover" data-ink-size-menu="${tool}" hidden role="group" aria-label="${tool==='pen'?'펜':'형광펜'} 굵기 선택">
      <div class="ink-menu-label">굵기 · ${tool==='pen'?'0.1mm 간격':'3단계'}</div>
      ${WIDTHS[tool].map(mm=>`<button type="button" data-ink-width="${mm}" data-ink-width-tool="${tool}" aria-label="${mm.toFixed(1)}mm">
        <span class="ink-size-line" style="height:${Math.max(2,mm*(tool==='pen'?5:2))}px"></span><span>${mm.toFixed(1)}mm</span></button>`).join('')}
    </div>`;
  }
  function controls(q){
    return `<div class="ink-toolbar" role="toolbar" aria-label="문항 필기 도구" data-ink-tools="${esc(q)}">
      <div class="ink-tools" ${drawingMode?'':'hidden'}>
        <div class="ink-tool-group"><button type="button" data-ink-tool="pen" title="펜 · 다시 누르면 굵기 선택 (P)" aria-label="펜" aria-expanded="false">${toolIcon('pen')}</button>${sizeMenu('pen')}</div>
        <div class="ink-tool-group"><button type="button" data-ink-tool="marker" title="형광펜 · 다시 누르면 굵기 선택 (H)" aria-label="형광펜" aria-expanded="false">${toolIcon('marker')}</button>${sizeMenu('marker')}</div>
        <div class="ink-tool-group"><button type="button" data-ink-tool="erase" title="지우개 · 다시 누르면 크기 선택 (E)" aria-label="지우개" aria-expanded="false">${toolIcon('erase')}</button>${sizeMenu('erase')}</div>
        <div class="ink-color-group"><button type="button" class="ink-color-current" data-ink-action="palette" title="색상 팔레트 펼치기" aria-label="현재 색상 · 색상 선택" aria-expanded="false"><span class="ink-color-dot"></span></button>
          <div class="ink-color-popover" hidden role="group" aria-label="필기 색상 선택">
            ${['pen','marker'].map(tool=>`<div class="ink-color-options" data-ink-colors="${tool}" hidden>${COLORS[tool].map(([label,color])=>`<button type="button" class="ink-color-choice" data-ink-color-choice="${color}" data-ink-color-tool="${tool}" aria-label="${label}" title="${label}" style="--swatch:${color}"><span></span></button>`).join('')}</div>`).join('')}
          </div>
        </div>
        <button type="button" data-ink-action="undo" title="실행 취소 (Ctrl+Z)" aria-label="실행 취소">↶</button>
        <button type="button" data-ink-action="redo" title="다시 실행 (Ctrl+Shift+Z)" aria-label="다시 실행">↷</button>
      </div>
      <button type="button" class="ink-mode-toggle" data-ink-action="mode" title="필기/풀이 모드 전환" aria-pressed="${drawingMode}">${drawingMode?'✓ 풀이모드':'✎ 필기모드'}</button>
    </div>`;
  }
  // Kept as an empty compatibility hook; no separate writing area is rendered.
  function board(){return '';}
  async function getExport(q){
    if(active?.q===q && active.savePending)await active.savePending();
    const note=await storage(key(q)).catch(()=>null);
    if(!note)return null;
    const question=note.strokes||[],evidence=note.explanationStrokes||[];
    if(!question.length&&!evidence.length)return null;
    return {regions:{question:{width:W,height:note.sizes?.question?.height||1050,strokes:question},
      evidence:{width:W,height:note.sizes?.evidence?.height||1050,strokes:evidence}},
      width:W,height:note.sizes?.question?.height||1050,strokes:question};
  }
  function renderControls(){
    for(const t of document.querySelectorAll('.ink-toolbar')){
      const button=t.querySelector('[data-ink-action="mode"]');
      if(button){button.textContent=drawingMode?'✓ 풀이모드':'✎ 필기모드';button.setAttribute('aria-pressed',String(drawingMode));}
      const tools=t.querySelector('.ink-tools');if(tools)tools.hidden=!drawingMode;
      t.querySelectorAll('[data-ink-tool]').forEach(b=>{
        b.classList.toggle('active',b.dataset.inkTool===selectedTool);
        b.setAttribute('aria-expanded',String(drawingMode&&openSize===b.dataset.inkTool));
      });
      t.querySelectorAll('[data-ink-size-menu]').forEach(el=>{el.hidden=!(drawingMode&&selectedTool===el.dataset.inkSizeMenu&&openSize===el.dataset.inkSizeMenu);});
      t.querySelectorAll('[data-ink-width]').forEach(b=>{const chosen=Number(b.dataset.inkWidth)===sizes[b.dataset.inkWidthTool];b.classList.toggle('selected',chosen);b.setAttribute('aria-pressed',String(chosen));});
      const color=t.querySelector('.ink-color-current');
      const current=selectedTool==='marker'?markerColor:penColor;
      if(color){color.hidden=selectedTool==='erase'||!drawingMode;color.querySelector('.ink-color-dot').style.backgroundColor=current;color.setAttribute('aria-expanded',String(openPalette&&drawingMode));}
      const palette=t.querySelector('.ink-color-popover');if(palette)palette.hidden=!(openPalette&&drawingMode&&selectedTool!=='erase');
      t.querySelectorAll('[data-ink-colors]').forEach(el=>{el.hidden=el.dataset.inkColors!==selectedTool;});
      t.querySelectorAll('[data-ink-color-choice]').forEach(b=>b.classList.toggle('selected',b.dataset.inkColorTool===selectedTool&&b.dataset.inkColorChoice===current));
    }
    for(const region of active?.regions||[]){region.layer.classList.toggle('is-writing',drawingMode);region.layer.classList.toggle('is-erasing',drawingMode&&selectedTool==='erase');if(!drawingMode||selectedTool!=='marker')region.cancelPause?.();}
    if(active?.cursor){active.cursor.hidden=true;active.cursor.style.width=active.cursor.style.height=(sizes.erase*96/25.4)+'px';}
    document.querySelector('.quiz-mode')?.classList.toggle('ink-writing-mode',drawingMode);
  }
  function useTool(value){if(!['pen','marker','erase'].includes(value))return;selectedTool=value;openSize='';openPalette=false;renderControls();}
  function clickTool(value){
    if(!drawingMode)return;
    if(selectedTool===value){openSize=openSize===value?'':value;openPalette=false;renderControls();}
    else useTool(value);
  }
  function toggleMode(){drawingMode=!drawingMode;openSize='';openPalette=false;renderControls();}
  function setColor(tool,color){
    if(!COLORS[tool]?.some(([,c])=>c===color))return;
    if(tool==='pen')penColor=color;else markerColor=color;
    selectedTool=tool;openSize='';openPalette=false;renderControls();
  }
  async function attach(q){
    const token=++loadToken;
    const previous=active;
    if(previous?.controller)previous.controller.abort();
    if(previous?.savePending)await previous.savePending();
    if(token!==loadToken)return; // A newer question was opened while a save flushed.
    const controller=new AbortController(),signal=controller.signal;
    const data=empty(),history=[],redo=[];
    const session={q,data,controller,regions:[],history,redo,ready:false,savePending:null};active=session;
    const cursor=document.createElement('div');cursor.className='ink-eraser-cursor';cursor.hidden=true;cursor.setAttribute('aria-hidden','true');document.body.appendChild(cursor);session.cursor=cursor;
    signal.addEventListener('abort',()=>cursor.remove(),{once:true});
    function showCursor(e){if(!drawingMode||selectedTool!=='erase')return;cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';cursor.hidden=false;}
    const keyFor=key(q);
    const regionDefinitions=[['question',document.querySelector('.exam-panel')],['evidence',document.querySelector('.evidence-panel')]];
    let writeQueue=Promise.resolve(), saveTimer=0, frame=0;
    function queueSave(){
      data.updatedAt=new Date().toISOString();
      clearTimeout(saveTimer);
      saveTimer=setTimeout(()=>saveNow(),90);
    }
    function saveNow(){
      clearTimeout(saveTimer);saveTimer=0;
      const snapshot=structuredClone({strokes:data.strokes,explanationStrokes:data.explanationStrokes,sizes:data.sizes,updatedAt:data.updatedAt});
      writeQueue=writeQueue.catch(()=>{}).then(()=>storage(keyFor,snapshot));
      writeQueue.then(()=>scheduleCloud()).catch(err=>console.warn('필기 저장 실패',err));
      return writeQueue;
    }
    session.savePending=async()=>{if(saveTimer)await saveNow();return writeQueue.catch(()=>{});};
    function dataStrokes(name){return name==='question'?data.strokes:data.explanationStrokes;}
    function regionHeight(region){
      const h=Math.max(1,region.panel.scrollHeight-region.top);
      return Math.max(250,Math.round(h/Math.max(1,region.panel.clientWidth)*W));
    }
    function layout(region){
      const heading=region.panel.querySelector(region.name==='question'?'.question-header':'.evidence-head');
      region.top=heading?heading.offsetTop+heading.offsetHeight+8:0;
      const newHeight=regionHeight(region),current=data.sizes[region.name]?.height||newHeight;
      // Scale the saved vertical coordinates whenever content reflows to keep ink anchored proportionally.
      if(Math.abs(newHeight-current)>1){
        const ratio=newHeight/current;
        for(const stroke of dataStrokes(region.name))for(const p of stroke.points||[])p[1]*=ratio;
        data.sizes[region.name]={width:W,height:newHeight};queueSave();
        region.saved.innerHTML=dataStrokes(region.name).map(asSvg).join('');
      } else if(!data.sizes[region.name])data.sizes[region.name]={width:W,height:newHeight};
      region.layer.style.top=region.top+'px';
      region.layer.style.height=Math.max(1,region.panel.scrollHeight-region.top)+'px';
      region.svg.setAttribute('viewBox',`0 0 ${W} ${data.sizes[region.name].height}`);
    }
    function paint(region){region.saved.innerHTML=dataStrokes(region.name).map(asSvg).join('');}
    function pointerPos(e,region){
      const rect=region.svg.getBoundingClientRect(),height=data.sizes[region.name]?.height||1050;
      return [Math.max(0,Math.min(W,(e.clientX-rect.left)/rect.width*W)),
        Math.max(0,Math.min(height,(e.clientY-rect.top)/rect.height*height)),
        Math.max(.1,Math.min(1,e.pressure||.5))];
    }
    function strokeSize(mm,region){
      // Logical stroke width calculated from the displayed panel width: approximate physical mm.
      const displayedWidth=region.svg.getBoundingClientRect().width||400;
      return Number((mm*96/25.4*W/displayedWidth).toFixed(3));
    }
    function pushHistory(name){history.push({name,strokes:JSON.stringify(dataStrokes(name))});if(history.length>40)history.shift();redo.length=0;}
    function refreshAll(){for(const region of session.regions)paint(region);}
    function undoAction(){
      if(!history.length)return;
      const old=history.pop(),current=dataStrokes(old.name);
      redo.push({name:old.name,strokes:JSON.stringify(current)});
      data[old.name==='question'?'strokes':'explanationStrokes']=JSON.parse(old.strokes);
      refreshAll();queueSave();
    }
    function redoAction(){
      if(!redo.length)return;
      const old=redo.pop(),current=dataStrokes(old.name);
      history.push({name:old.name,strokes:JSON.stringify(current)});
      data[old.name==='question'?'strokes':'explanationStrokes']=JSON.parse(old.strokes);
      refreshAll();queueSave();
    }
    for(const [name,panel] of regionDefinitions){
      if(!panel)continue;
      panel.classList.add('ink-overlay-parent');
      const layer=document.createElement('div');layer.className='ink-overlay';layer.setAttribute('data-ink-region',name);
      layer.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" class="ink-overlay-svg" preserveAspectRatio="none"><g class="ink-saved"></g><g class="ink-live"></g></svg>';
      panel.appendChild(layer);
      const svg=layer.querySelector('svg');
      const region={name,panel,layer,svg,saved:svg.querySelector('.ink-saved'),live:svg.querySelector('.ink-live'),drawing:null,erasing:null,finger:null,activePointer:null,stylusTouch:null,pauseTimer:0,pauseAnchor:null,top:0};
      session.regions.push(region);layout(region);
      const touchToPoint=t=>pointerPos({clientX:t.clientX,clientY:t.clientY,pressure:t.force&&t.force>0?t.force:.5},region);
      function cancelPause(){clearTimeout(region.pauseTimer);region.pauseTimer=0;}
      region.cancelPause=cancelPause;
      signal.addEventListener('abort',cancelPause,{once:true});
      function armStraightHold(pt){
        const drawing=region.drawing;
        if(!drawing||drawing.tool!=='marker')return;
        const pixels=svg.getBoundingClientRect().width/W;
        const anchor=region.pauseAnchor;
        // Ignore sub-pixel Pencil noise, but restart the full second on movement.
        if(anchor&&Math.hypot(pt[0]-anchor[0],pt[1]-anchor[1])*pixels<0.75)return;
        cancelPause();region.pauseAnchor=[pt[0],pt[1]];
        drawing.straightened=false;
        region.pauseTimer=setTimeout(()=>{
          region.pauseTimer=0;
          if(active!==session||!drawingMode||selectedTool!=='marker'||region.drawing!==drawing)return;
          if(drawing.points.length<2)return;
          drawing.straightened=true;schedulePreview();
        },1000);
        schedulePreview();
      }
      function previewStroke(drawing){
        return drawing.straightened?{...drawing,points:[drawing.points[0],drawing.points.at(-1)]}:drawing;
      }
      function schedulePreview(){
        if(frame)return;
        frame=requestAnimationFrame(()=>{
          frame=0;
          if(active!==session)return;
          for(const item of session.regions)item.live.innerHTML=item.drawing?asSvg(previewStroke(item.drawing)):'';
        });
      }
      function eraseAt(pt){
        const gesture=region.erasing;if(!gesture)return;
        const rect=svg.getBoundingClientRect(),height=data.sizes[name]?.height||1050;
        const pixel=p=>[p[0]*rect.width/W,p[1]*rect.height/height];
        const a=pixel(gesture.last||pt),b=pixel(pt),radius=sizes.erase*96/25.4/2;
        const strokes=dataStrokes(name);
        const hit=s=>{
          const pts=s.points||[];if(!pts.length)return false;
          const reach=radius+(s.width||5)*rect.width/W/2;
          if(pts.length===1)return pointSegmentDistance(pixel(pts[0]),a,b)<=reach;
          for(let i=1;i<pts.length;i++)if(segmentsDistance(a,b,pixel(pts[i-1]),pixel(pts[i]))<=reach)return true;
          return false;
        };
        const kept=strokes.filter(s=>!hit(s));
        if(kept.length!==strokes.length){
          if(!gesture.saved){pushHistory(name);gesture.saved=true;}
          data[name==='question'?'strokes':'explanationStrokes']=kept;paint(region);queueSave();
        }
        gesture.last=pt;
      }
      function movePoint(pt){
        if(region.erasing){eraseAt(pt);return;}
        const drawing=region.drawing;if(!drawing)return;
        armStraightHold(pt);
        const last=drawing.points.at(-1);
        if(drawing.points.length<7000&&Math.hypot(pt[0]-last[0],pt[1]-last[1])>=1.35){drawing.points.push(pt);schedulePreview();}
      }
      function begin(pt,source,id){
        if(!drawingMode||!session.ready)return;
        if(region.drawing||region.erasing)return;
        const strokes=dataStrokes(name);
        if(selectedTool==='erase'){region.erasing={last:pt,saved:false};eraseAt(pt);return;}
        pushHistory(name);
        const marker=selectedTool==='marker';
        region.drawing={tool:marker?'marker':'pen',color:marker?markerColor:penColor,
          width:strokeSize(sizes[marker?'marker':'pen'],region),widthMm:sizes[marker?'marker':'pen'],
          points:[pt],source,id};
        region.pauseAnchor=null;armStraightHold(pt);
      }
      function finish(commit=true){
        cancelPause();region.pauseAnchor=null;
        if(region.erasing){region.erasing=null;cursor.hidden=true;return;}
        const drawing=region.drawing;
        if(!drawing)return;
        region.drawing=null;region.live.innerHTML='';
        if(commit){
          if(drawing.straightened&&drawing.points.length>1)drawing.points=[drawing.points[0],drawing.points.at(-1)];
          delete drawing.straightened;
          if(drawing.points.length===1){const p=drawing.points[0];drawing.points.push([p[0]+.5,p[1]+.5,p[2]]);}
          dataStrokes(name).push(drawing);region.saved.insertAdjacentHTML('beforeend',asSvg(drawing));queueSave();
        }
      }
      function scrollFinger(y){
        if(!region.finger)return;
        const delta=region.finger.y-y;region.finger.y=y;
        const parent=[region.panel,region.panel.parentElement,document.querySelector('.quiz-content'),document.querySelector('.workspace')].find(el=>el&&el.scrollHeight>el.clientHeight+3&&getComputedStyle(el).overflowY!=='hidden');
        if(parent)parent.scrollTop+=delta;else window.scrollBy(0,delta);
      }
      svg.addEventListener('pointerdown',e=>{
        if(!drawingMode||!session.ready)return;
        if(e.pointerType==='touch'){
          if(region.stylusTouch!==null)return;
          // iPad stylus can arrive as a TouchEvent after pointerdown; only fingers scroll.
          region.finger={y:e.clientY,id:e.pointerId};
          return;
        }
        if(e.pointerType==='mouse'&&e.button!==0)return;
        if(region.stylusTouch!==null)return;
        region.activePointer=e.pointerId;showCursor(e);
        begin(pointerPos(e,region),'pointer',e.pointerId);
        try{svg.setPointerCapture(e.pointerId);}catch(_){}
        e.preventDefault();
      },{signal});
      function pointerMove(e){
        if(!drawingMode||active!==session)return;
        if(e.pointerType!=='touch'&&(e.target===svg||svg.contains(e.target)||region.activePointer===e.pointerId))showCursor(e);
        if(e.pointerType==='touch'&&region.finger?.id===e.pointerId){
          if(region.stylusTouch===null&&region.finger.touchId===undefined){scrollFinger(e.clientY);e.preventDefault();}
          return;
        }
        if(region.activePointer!==e.pointerId||region.drawing?.source==='touch')return;
        const coalesced=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
        const events=coalesced.length?coalesced:[e];
        for(const ev of events)movePoint(pointerPos(ev,region));
        e.preventDefault();
      }
      function pointerEnd(e){
        if(region.finger?.id===e.pointerId)region.finger=null;
        if(region.activePointer!==e.pointerId)return;
        region.activePointer=null;
        if(region.erasing||region.drawing?.source==='pointer'){
          if(e.type==='pointerup')movePoint(pointerPos(e,region));
          // A cancelled gesture may be rescued by the stylus TouchEvent stream.
          if(region.stylusTouch===null)finish(true);
        }
        try{if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);}catch(_){}
      }
      svg.addEventListener('pointerleave',()=>{cursor.hidden=true;},{signal});
      window.addEventListener('pointermove',pointerMove,{signal});
      window.addEventListener('pointerup',pointerEnd,{signal});
      window.addEventListener('pointercancel',pointerEnd,{signal});
      // WebKit can hand over a Pencil stroke to native scrolling and emit pointercancel.
      // The non-passive native stylus touch stream keeps the same stroke alive in Safari.
      svg.addEventListener('touchstart',e=>{
        if(!drawingMode||!session.ready)return;
        for(const touch of e.changedTouches){
          if(touch.touchType==='stylus'){
            region.finger=null;
            region.stylusTouch=touch.identifier;showCursor(touch);
            if(region.drawing){region.drawing.source='touch';region.drawing.id=touch.identifier;}
            else begin(touchToPoint(touch),'touch',touch.identifier);
            e.preventDefault();
            return;
          }
          if(region.stylusTouch===null){
            if(!region.finger)region.finger={y:touch.clientY,touchId:touch.identifier};
            else {region.finger.y=touch.clientY;region.finger.touchId=touch.identifier;}
          }
        }
      },{signal,passive:false});
      function nativeTouchMove(e){
        if(active!==session||!drawingMode)return;
        for(const touch of e.changedTouches){
          if(region.stylusTouch===touch.identifier){
            showCursor(touch);
            if(region.erasing||region.drawing?.source==='touch')movePoint(touchToPoint(touch));
            e.preventDefault();return;
          }
          if(region.finger?.touchId===touch.identifier){
            scrollFinger(touch.clientY);e.preventDefault();return;
          }
        }
      }
      function nativeTouchEnd(e){
        for(const touch of e.changedTouches){
          if(region.stylusTouch===touch.identifier){
            if(region.erasing||region.drawing?.source==='touch'){
              if(e.type==='touchend')movePoint(touchToPoint(touch));
              finish(true);
            }
            region.stylusTouch=null;region.activePointer=null;
            e.preventDefault();
          }
          if(region.finger?.touchId===touch.identifier)region.finger=null;
        }
      }
      window.addEventListener('touchmove',nativeTouchMove,{signal,passive:false});
      window.addEventListener('touchend',nativeTouchEnd,{signal,passive:false});
      window.addEventListener('touchcancel',nativeTouchEnd,{signal,passive:false});
      panel.addEventListener('dragstart',e=>{if(drawingMode)e.preventDefault();},{signal});
      panel.addEventListener('contextmenu',e=>{if(drawingMode)e.preventDefault();},{signal});
      // Images can expand explanation height after initial mount.
      panel.addEventListener('load',()=>requestAnimationFrame(()=>{if(active===session)layout(region);}),{capture:true,signal});
    }
    const app=document.getElementById('app');
    app?.addEventListener('click',e=>{
      const button=e.target.closest('[data-ink-action],[data-ink-tool],[data-ink-width],[data-ink-color-choice]');
      if(!button||active!==session)return;
      e.stopPropagation();
      if(button.dataset.inkTool){clickTool(button.dataset.inkTool);return;}
      if(button.dataset.inkWidth){
        const tool=button.dataset.inkWidthTool,mm=Number(button.dataset.inkWidth);
        if(WIDTHS[tool]?.includes(mm)){sizes[tool]=mm;selectedTool=tool;openSize='';renderControls();}
        return;
      }
      if(button.dataset.inkColorChoice){setColor(button.dataset.inkColorTool,button.dataset.inkColorChoice);return;}
      if(button.dataset.inkAction==='palette'){
        openPalette=!openPalette;openSize='';renderControls();return;
      }
      if(button.dataset.inkAction==='mode')toggleMode();
      if(button.dataset.inkAction==='undo')undoAction();
      if(button.dataset.inkAction==='redo')redoAction();
    },{signal});
    document.addEventListener('pointerdown',e=>{
      if(active!==session||(!openPalette&&!openSize))return;
      if(e.target.closest('.ink-color-group,.ink-tool-group'))return;
      openPalette=false;openSize='';renderControls();
    },{signal});
    document.addEventListener('keydown',e=>{
      if(active!==session||!drawingMode)return;
      if(e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      const key=e.key.toLowerCase();
      if((e.ctrlKey||e.metaKey)&&key==='z'){
        e.preventDefault();e.shiftKey?redoAction():undoAction();return;
      }
      if(e.ctrlKey||e.altKey||e.metaKey)return;
      if(key==='p'||key==='h'||key==='e'){
        useTool({p:'pen',h:'marker',e:'erase'}[key]);e.preventDefault();
      }
    },{signal});
    window.addEventListener('resize',()=>{
      if(active!==session)return;
      for(const region of session.regions)layout(region);
    },{signal});
    try{
      const stored=await storage(keyFor);
      if(active!==session||token!==loadToken)return;
      if(stored){data.strokes=stored.strokes||[];data.explanationStrokes=stored.explanationStrokes||[];data.sizes=stored.sizes||{};data.updatedAt=stored.updatedAt||null;}
      for(const region of session.regions){layout(region);paint(region);}
      session.ready=true;renderControls();
    }catch(err){console.warn('필기를 불러오지 못했습니다',err);session.ready=false;}
  }
  function mount(){
    const q=document.querySelector('.exam-panel')?.dataset.questionId;
    if(!q){loadToken++;if(active?.controller)active.controller.abort();active?.savePending?.();active=null;return;}
    attach(q).catch(console.warn);
  }
  async function allLocal(ownerKey){
    const database=await db();return new Promise((resolve,reject)=>{
      const tx=database.transaction(STORE,'readonly'),req=tx.objectStore(STORE).openCursor(),out=[];
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve(out);return;}if(String(cursor.key).startsWith(ownerKey+'::'))out.push({q:String(cursor.key).slice(ownerKey.length+2),data:cursor.value});cursor.continue();};
      req.onerror=()=>reject(req.error);
    });
  }
  async function cloudSync(){
    const auth=account(),client=auth?.client,userId=auth?.userId;
    if(!auth?.active||!client||!userId)return;
    const currentOwner=owner;
    // Fetch first to avoid replacing more recent cloud strokes with an old device.
    const remote=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await client.from('heon_ink_notes').select('question_id,payload,updated_at').range(offset,offset+499);
      if(error){cloudError=error.message;return;}
      remote.push(...(data||[]));if(!data||data.length<500)break;
    }
    if(owner!==currentOwner)return;
    const remoteMap=new Map(remote.map(row=>[row.question_id,row]));
    const notes=await allLocal(currentOwner).catch(()=>[]);
    const changes=[];let updatedActive=false;
    for(const note of notes){
      const r=remoteMap.get(note.q);
      const localTime=Date.parse(note.data.updatedAt||0)||0;
      const remoteTime=Date.parse(r?.updated_at||0)||0;
      if(remoteTime>localTime){await storage(currentOwner+'::'+note.q,r.payload);if(active?.q===note.q)updatedActive=true;}
      else if(!r||localTime>remoteTime)changes.push({user_id:userId,question_id:note.q,payload:note.data,updated_at:note.data.updatedAt||new Date().toISOString()});
      remoteMap.delete(note.q);
    }
    for(const row of remoteMap.values()){await storage(currentOwner+'::'+row.question_id,row.payload);if(active?.q===row.question_id)updatedActive=true;}
    for(let i=0;i<changes.length;i+=60){
      const {error}=await client.from('heon_ink_notes').upsert(changes.slice(i,i+60),{onConflict:'user_id,question_id'});
      if(error){cloudError=error.message;return;}
    }
    cloudError='';
    if(updatedActive&&active?.q&&owner===currentOwner)mount();
  }
  function scheduleCloud(){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>cloudSync().catch(console.warn),2200);}
  function setAccount(){
    const auth=account(),next=auth?.active&&auth?.userId?auth.userId:'guest';
    if(owner!==next){
      const prior=owner;owner=next;mount();
      if(prior==='guest'&&next!=='guest'){
        const mark='heon.ink.guest.import.decision.'+next;
        if(!localStorage.getItem(mark)){
          allLocal('guest').then(async notes=>{
            if(!notes.length)return;
            const accept=window.confirm('로그인 전에 이 기기에 작성한 필기가 있습니다. 현재 계정의 필기로 가져오시겠습니까?');
            localStorage.setItem(mark,accept?'yes':'no');
            if(!accept)return;
            for(const note of notes){const dst=await storage(next+'::'+note.q);
              if(!dst||Date.parse(note.data.updatedAt||0)>Date.parse(dst.updatedAt||0))await storage(next+'::'+note.q,note.data);
            }
            scheduleCloud();if(active?.q)mount();
          }).catch(console.warn);
        }
      }
    }
    if(auth?.active)scheduleCloud();
  }
  window.HeonInk={controls,board,mount,getExport,setAccount,cloudSync,outline,get cloudError(){return cloudError;}};
  window.addEventListener('online',()=>scheduleCloud());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleCloud();});
})();
