/* HEON ARCHIVE v1.1.1 - independent study account and encrypted-in-transit cloud sync.
 * Public leaderboard anonymous auth uses a DIFFERENT Supabase session key.
 * Passwords are handled only by Supabase Auth; never stored in app state.
 */
(() => {
  'use strict';
  const OWNER_KEY='heon.study.local.owner.v1';
  const PENDING_NAME_KEY='heon.study.pending.username.v1';
  const STUDY_CLIENT_STORAGE='heon.study.auth.session.v1';
  const DATA_FIELDS=['records','yearExamRecords','predictionRecords','unitRecords',
    'bookmarks','yearExamBookmarks','predictionBookmarks','unitBookmarks',
    'customAnswers','customMulti','lastVisited','reviewSchedule','bookmarkChanges','recordChanges','customAnswerChanges','dailyGoals'];
  const RECORD_FIELDS=new Set(['records','yearExamRecords','predictionRecords','unitRecords']);
  const BOOKMARK_FIELDS=new Set(['bookmarks','yearExamBookmarks','predictionBookmarks','unitBookmarks']);
  const $=(q,ctx=document)=>ctx.querySelector(q);
  const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let client=null,initStarted=false,enabled=false,active=false,blocked=false;
  let user=null,profile=null,getState=()=>({}),applyState=()=>{},updateUI=()=>{};
  let pending=false,syncTimer=null,running=false,lastError='',revision=0;
  let lastSyncAt=null,currentModal=null;
  let ownedBeforeLogin='';
  let claimPromise=null;
  function configure(){
    const config=window.HEON_LEADERBOARD_CONFIG;
    if(!config?.url || !config?.publishableKey || !window.supabase?.createClient) return null;
    if(!client){
      client=window.supabase.createClient(config.url,config.publishableKey,{
        auth:{storageKey:STUDY_CLIENT_STORAGE,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
    }
    enabled=true;
    return client;
  }
  function messageFor(err){return String(err?.message||err||'알 수 없는 오류').slice(0,260);}
  function hasRecords(value){
    return DATA_FIELDS.some(k=>Object.keys(value?.[k]||{}).length>0);
  }
  function getRemoteState(){
    const raw=getState()||{};
    const snap={version:1};
    for(const k of DATA_FIELDS) snap[k]=raw[k]&&typeof raw[k]==='object'&&!Array.isArray(raw[k])?raw[k]:{};
    snap.prefs={...(raw.prefs||{})};
    delete snap.prefs.theme;
    delete snap.prefs.explanationWidth;
    delete snap.prefs.playerId;
    delete snap.prefs.nickname; // leaderboard nickname is unrelated to study account
    return snap;
  }
  const stamp=o=>Date.parse(o?.updatedAt||o?.submittedAt||o?.lastReviewedAt||o?.reviewedAt||0)||0;
  function mergeSnapshots(local,remote){
    const result={version:1};
    for(const field of DATA_FIELDS){
      const a=local?.[field]&&typeof local[field]==='object'?local[field]:{};
      const b=remote?.[field]&&typeof remote[field]==='object'?remote[field]:{};
      const out={...b};
      for(const [k,v] of Object.entries(a)){
        if(!Object.prototype.hasOwnProperty.call(b,k)){out[k]=v;continue;}
        if(RECORD_FIELDS.has(field)){
          const left=stamp(v),right=stamp(b[k]);
          out[k]=left>right?v:right>left?b[k]:(v?.submitted&&!b[k]?.submitted?v:b[k]);
        } else if(field==='reviewSchedule'||field==='bookmarkChanges'||field==='recordChanges'||field==='customAnswerChanges'||field==='dailyGoals') {
          out[k]=stamp(v)>=stamp(b[k])?v:b[k];
        } else if(BOOKMARK_FIELDS.has(field)) {
          // Keep legacy bookmarks even when they were created before change timestamps existed.
          out[k]=!!(v||b[k]);
        } else out[k]=v;
      }
      result[field]=out;
    }
    // Explicit bookmark deletion tombstones take precedence over boolean union.
    const bmGroup={bookmarks:'professor',yearExamBookmarks:'year-exam',predictionBookmarks:'prediction',unitBookmarks:'unit'};
    for(const [bucket,mode] of Object.entries(bmGroup)){
      for(const [q,change] of Object.entries(result.bookmarkChanges||{})){
        if(!q.startsWith(mode+'::')) continue;
        const id=q.slice(mode.length+2);
        if(change && change.value===false) delete result[bucket][id];
        else if(change?.value===true) result[bucket][id]=true;
      }
    }
    for(const [k,change] of Object.entries(result.recordChanges||{})){
      const m=k.match(/^(professor|year-exam|prediction|unit)::(.+)$/);
      if(!m)continue;
      const bucket={professor:'records','year-exam':'yearExamRecords',prediction:'predictionRecords',unit:'unitRecords'}[m[1]];
      if(change?.value===false){
        const rec=result[bucket][m[2]];
        if(!rec || (Date.parse(change.updatedAt||0)||0)>=(stamp(rec)||0))delete result[bucket][m[2]];
      }
    }
    for(const [k,change] of Object.entries(result.customAnswerChanges||{})){
      if(change?.value===false){delete result.customAnswers[k];delete result.customMulti[k];}
    }
    result.prefs={...(remote?.prefs||{}),...(local?.prefs||{})};
    return result;
  }
  function showStatus(msg,type='info'){
    lastError=type==='error'?msg:'';
    const status=currentModal?.querySelector('.heon-account-status');if(status)status.textContent=msg;
    document.dispatchEvent(new CustomEvent('heon:account-message',{detail:{text:msg,type}}));
  }
  function notify(){try{updateUI();}catch(err){console.warn(err);}}
  async function _claimSession(){
    const session=await client.auth.getSession();
    if(session.error)throw session.error;
    const acc=session.data?.session?.user;
    if(!acc||acc.is_anonymous){active=false;user=null;profile=null;blocked=false;notify();return;}
    user=acc;
    const label=/iPad/i.test(navigator.userAgent)?'iPad':/iPhone/i.test(navigator.userAgent)?'iPhone':/Android/i.test(navigator.userAgent)?'Android':'컴퓨터';
    const username=localStorage.getItem(PENDING_NAME_KEY)||'';
    const res=await client.rpc('heon_study_claim_session',{p_username:username,p_device_label:label});
    if(res.error){
      active=false;blocked=/DEVICE_LIMIT_2/.test(res.error.message);
      lastError=messageFor(res.error);notify();return;
    }
    localStorage.removeItem(PENDING_NAME_KEY);
    profile=res.data;blocked=false;active=true;lastError='';
    notify();
    await firstSync();
  }
  async function claimSession(){
    if(claimPromise)return claimPromise;
    claimPromise=_claimSession();
    try{return await claimPromise;}finally{claimPromise=null;}
  }
  async function firstSync(){
    if(!active||!user)return;
    const cloud=await client.rpc('heon_study_get_snapshot');
    if(cloud.error){lastError=messageFor(cloud.error);notify();return;}
    const row=cloud.data?.[0];revision=Number(row?.revision||0);
    const remote=row?.snapshot||{};
    const local=getRemoteState();
    ownedBeforeLogin=localStorage.getItem(OWNER_KEY)||'';
    const foreign=ownedBeforeLogin && ownedBeforeLogin!==user.id;
    const existingLocal=hasRecords(local);
    let importLocal=false;
    if(existingLocal && (foreign || !ownedBeforeLogin)) {
      importLocal=window.confirm(foreign
        ? '이 브라우저에 다른 계정 또는 소유자가 확인되지 않은 학습 기록이 있습니다. 현재 계정으로 가져오시겠습니까? 취소하면 기존 기록을 임시 백업한 뒤 현재 계정 기록으로 전환합니다.'
        : '현재 브라우저에 저장된 학습 기록을 이 계정으로 가져와 백업하시겠습니까?');
    } else importLocal=ownedBeforeLogin===user.id;
    if(!importLocal && existingLocal && (foreign || !ownedBeforeLogin)) {
      try{localStorage.setItem('heon.study.previousLocal.'+Date.now(),JSON.stringify(getState()));}catch(e){console.warn(e);}
    }
    const merged=mergeSnapshots(importLocal?local:{},remote);
    applyState(merged);
    localStorage.setItem(OWNER_KEY,user.id);
    if(JSON.stringify(merged)!==JSON.stringify(remote))scheduleSync();
    lastSyncAt=new Date();notify();
  }
  async function syncNow(){
    if(!active||!client||running)return;
    running=true;pending=false;
    try{
      for(let attempt=0;attempt<3;attempt++){
        const remoteRes=await client.rpc('heon_study_get_snapshot');
        if(remoteRes.error)throw remoteRes.error;
        const row=remoteRes.data?.[0];
        const server=row?.snapshot||{};
        const rev=Number(row?.revision||0);
        const merged=mergeSnapshots(getRemoteState(),server);
        if(JSON.stringify(merged)!==JSON.stringify(getRemoteState()))applyState(merged);
        if(JSON.stringify(merged)===JSON.stringify(server)){
          revision=rev;lastSyncAt=new Date();lastError='';notify();return;
        }
        const response=await client.rpc('heon_study_put_snapshot',{p_snapshot:merged,p_revision:rev});
        if(!response.error){
          revision=Number(response.data?.[0]?.revision||rev+1);
          lastSyncAt=new Date();lastError='';notify();return;
        }
        if(!/REVISION_CONFLICT/.test(messageFor(response.error)))throw response.error;
      }
      throw Error('동기화 경합이 발생했습니다. 다시 시도하세요.');
    } catch(err){
      lastError=messageFor(err);console.warn('HEON study sync error',err);notify();
    } finally{
      running=false;
      if(pending){pending=false;scheduleSync();}
    }
  }
  function scheduleSync(){
    if(!active)return;
    pending=true;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>{pending=false;syncNow();},1200);
  }
  function clearModal(){currentModal?.remove();currentModal=null;}
  function open(mode='login'){
    clearModal();
    const wrapper=document.createElement('div');wrapper.className='heon-account-overlay';
    wrapper.setAttribute('role','presentation');
    wrapper.innerHTML=`<section class="heon-account-dialog" role="dialog" aria-modal="true" aria-label="학습 기록 계정">
      <button class="heon-close" type="button" data-account="close" aria-label="닫기">✕</button>
      <div class="eyebrow">STUDY CLOUD · LEADERBOARD와 별도</div>
      <h2>학습 기록 계정</h2>
      <p class="heon-account-intro">같은 계정으로 컴퓨터와 아이패드에서 학습 기록을 이어서 사용합니다. 최대 두 로그인 세션을 허용합니다.</p>
      <div class="heon-account-status"></div>
      <div class="heon-account-body"></div>
    </section>`;
    wrapper.addEventListener('click',e=>{if(e.target===wrapper)clearModal();});
    wrapper.addEventListener('click',async e=>{
      const button=e.target.closest('[data-account]');if(!button)return;
      const action=button.dataset.account;
      if(action==='close'){clearModal();return;}
      if(action==='login'||action==='signup'||action==='password-reset'||action==='devices'||action==='master'||action==='home')return drawModal(action);
      if(action==='logout')return logout();
      if(action==='sync')return syncNow();
      if(action==='download')return exportLocal();
      if(action==='upload')return $('#heon-import-file',wrapper)?.click();
      if(action==='revoke')return revokeDevice(button.dataset.session);
    });
    wrapper.addEventListener('submit',async e=>{
      e.preventDefault();
      const form=e.target;if(!form.matches('[data-account-form]'))return;
      const action=form.dataset.accountForm;
      const data=Object.fromEntries(new FormData(form));
      const status=$('.heon-account-status',wrapper);
      status.textContent='처리 중…';
      try{
        if(action==='signup')await signup(String(data.email||''),String(data.password||''),String(data.username||''));
        if(action==='login')await login(String(data.email||''),String(data.password||''));
        if(action==='password-reset')await resetPassword(String(data.email||''));
        if(action==='change-password')await changePassword(String(data.password||''));
        if(action!=='signup'||active)status.textContent=lastError||'처리 완료';
      }catch(err){status.textContent=messageFor(err);if(blocked){drawModal('blocked');return;}}
      if(active){drawModal('home');}
    });
    wrapper.addEventListener('change',async e=>{
      if(e.target.id==='heon-import-file'){
        const file=e.target.files?.[0];if(file)await importLocal(file);
      }
    });
    document.body.append(wrapper);currentModal=wrapper;drawModal(mode);
  }
  function drawModal(mode='home'){
    if(!currentModal)return;
    const body=$('.heon-account-body',currentModal);
    const status=$('.heon-account-status',currentModal);
    status.textContent=lastError||'';
    if(blocked && mode!=='devices')mode='blocked';
    if(active && !['devices','password-reset','master'].includes(mode))mode='home';
    const form=(action,username=false)=>`<form data-account-form="${action}" class="heon-account-form">
      ${username?'<label>학습용 아이디<input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" placeholder="영문·숫자 3~24자"></label>':''}
      <label>이메일<input name="email" type="email" autocomplete="email" required placeholder="email@example.com"></label>
      ${action==='password-reset'?'':`<label>비밀번호<input name="password" type="password" autocomplete="${action==='signup'?'new-password':'current-password'}" required minlength="8" placeholder="8자 이상"></label>`}
      <button type="submit" class="button">${action==='signup'?'회원가입':action==='login'?'로그인':'재설정 메일 보내기'}</button></form>`;
    if(mode==='login') body.innerHTML=form('login')+'<div class="heon-account-links"><button data-account="password-reset">비밀번호 찾기</button></div>';
    else if(mode==='signup') body.innerHTML='<p>신규 회원가입이 종료되었습니다. 관리자에게 문의하세요.</p><button data-account="login" class="button secondary">로그인하기</button>';
    else if(mode==='password-reset')body.innerHTML=form('password-reset')+'<button data-account="login" class="button secondary">로그인 화면</button>';
    else if(mode==='devices'){
      body.innerHTML=`<h3>등록된 기기 (${profile?.role==='master'?'마스터 계정 · 제한 없음':'최대 2개'})</h3><div id="heon-device-list">불러오는 중…</div><button class="button secondary" data-account="home">돌아가기</button>`;
      listDevices();
    } else if(mode==='master') {
      body.innerHTML=`<h3>문항 검증·수정 이력 등록</h3><p class="fine">이력만 등록됩니다. 정답이나 문제 본문을 수정하려면 소스 데이터와 서버 정답표를 별도로 검토·배포해야 합니다.</p>
        <form id="heon-master-form" class="heon-account-form"><label>문항 ID<input name="question_id" required placeholder="park-murim:17-46"></label>
        <label>분류<select name="kind"><option value="source">강의안 근거</option><option value="answer">정답</option><option value="explanation">해설</option><option value="figure">이미지</option><option value="typo">오타</option><option value="other">기타</option></select></label>
        <label>상태<select name="status"><option value="under_review">검토 중</option><option value="verified">검증 완료</option><option value="corrected">수정 완료</option><option value="rejected">반려</option></select></label>
        <label>수정·검토 내용<textarea name="summary" required minlength="5" maxlength="600"></textarea></label>
        <label>근거 파일명·페이지<input name="evidence_reference" maxlength="500"></label>
        <label>버전<input name="version_tag" value="v1.1.0" maxlength="50"></label>
        <label><input type="checkbox" name="published" value="true"> 이용자에게 검토 이력 공개</label>
        <button class="button" type="submit">검토 이력 등록</button></form>
        <button data-account="home" class="button secondary">돌아가기</button>`;
      $('#heon-master-form',body).addEventListener('submit',addAudit);
    } else if(blocked){
      body.innerHTML='<p>이미 등록된 기기 2개가 있습니다. 기존 세션을 하나 해제하면 이 기기에서 동기화할 수 있어요.</p><button class="button" data-account="devices">등록 기기 관리</button><button class="button secondary" data-account="logout">로그아웃</button>';
    } else if(active) {
      body.innerHTML=`<div class="heon-account-ok"><strong>${esc(profile?.username||user?.email||'')}</strong><small>${esc(user?.email||'')}</small><p>동기화 ${lastError?'문제: '+esc(lastError):lastSyncAt?lastSyncAt.toLocaleString('ko-KR'):'대기 중'}</p></div>
        ${profile?.role==='master'?'<p class="fine">마스터 계정 · 로그인 기기 수 제한 없음</p>':''}
        <div class="heon-account-actions"><button class="button" data-account="sync">지금 동기화</button><button class="button secondary" data-account="devices">기기 관리</button><button class="button secondary" data-account="download">기록 JSON 백업</button><button class="button secondary" data-account="upload">기록 JSON 복원</button>${profile?.role==='master'?'<button class="button secondary" data-account="master">문항 검증 관리</button>':''}<button class="button secondary" data-account="logout">로그아웃</button></div>
        <input id="heon-import-file" type="file" accept=".json,application/json" hidden>`;
    } else body.innerHTML=form('login');
  }
  async function signup(){throw Error('신규 회원가입이 종료되었습니다. 관리자에게 문의하세요.');}
  async function login(email,password){
    if(!configure())throw Error('Supabase를 불러오지 못했습니다.');
    const {error}=await client.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
    await claimSession();
    if(blocked)throw Error('등록 가능한 로그인 세션은 최대 2개입니다. 기기 관리에서 이전 기기를 해제하세요.');
    if(!active)throw Error(lastError||'계정 연결에 실패했습니다.');
  }
  async function resetPassword(email){
    const {error}=await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});
    if(error)throw error;lastError='';showStatus('비밀번호 재설정 이메일을 보냈습니다.');
  }
  async function changePassword(password){
    const {error}=await client.auth.updateUser({password});if(error)throw error;
    showStatus('비밀번호를 변경했습니다.');
  }
  async function logout(){
    clearTimeout(syncTimer);
    if(active)await syncNow();
    const {data}=await client.auth.getSession();
    if(data?.session){
      try{const claim=JSON.parse(atob(data.session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        if(claim.session_id)await client.rpc('heon_study_revoke_session',{p_session_id:claim.session_id});
      }catch(e){console.warn(e);}
    }
    await client.auth.signOut();
    active=false;user=null;profile=null;blocked=false;lastError='';notify();drawModal('login');
  }
  async function listDevices(){
    const box=$('#heon-device-list',currentModal);if(!box||!client)return;
    const {data,error}=await client.rpc('heon_study_list_sessions');
    if(error){box.textContent=messageFor(error);return;}
    box.innerHTML=(data||[]).map(s=>`<div class="heon-device-row"><span><b>${esc(s.device_label)} ${s.is_current?'(현재 기기)':''}</b><small>${new Date(s.last_seen).toLocaleString('ko-KR')}</small></span><button class="button secondary tiny" data-account="revoke" data-session="${esc(s.session_id)}">해제</button></div>`).join('')||'등록된 기기가 없습니다.';
  }
  async function revokeDevice(id){
    const {data,error}=await client.rpc('heon_study_revoke_session',{p_session_id:id});
    if(error){lastError=messageFor(error);drawModal('devices');return;}
    if(data&&blocked){await claimSession();if(active){drawModal('home');return;}}
    await listDevices();
  }
  function exportLocal(){
    const content=JSON.stringify(getState(),null,2);
    const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='HEON_ARCHIVE_학습기록_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  async function importLocal(file){
    if(file.size>5*1024*1024){showStatus('JSON 파일은 5MB 이하만 지원합니다.','error');return;}
    try{
      const raw=JSON.parse(await file.text());
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||!raw.records||typeof raw.records!=='object')throw Error('올바른 학습 기록 JSON이 아닙니다.');
      if(!confirm('JSON 백업 파일을 현재 학습 기록과 합칠까요?'))return;
      applyState(mergeSnapshots(raw,getRemoteState()));scheduleSync();showStatus('백업 기록을 합쳤습니다.');
    }catch(err){showStatus(messageFor(err),'error');}
  }
  async function addAudit(event){
    event.preventDefault();
    if(!active||profile?.role!=='master')return;
    const f=event.target,d=Object.fromEntries(new FormData(f));
    const {error}=await client.rpc('heon_master_add_audit',{
      p_question_id:String(d.question_id||''),p_kind:d.kind,p_status:d.status,
      p_summary:String(d.summary||''),p_evidence_reference:String(d.evidence_reference||''),
      p_version_tag:String(d.version_tag||''),p_published:!!d.published
    });
    const status=$('.heon-account-status',currentModal);
    status.textContent=error?messageFor(error):'검토 이력을 등록했습니다. 반영된 기록은 새로고침 후 표시됩니다.';
    if(!error){f.reset();document.dispatchEvent(new Event('heon:audit-updated'));}
  }
  function statusLabel(){return !enabled?'계정 설정 필요':blocked?'기기 2대 제한':active?'학습 동기화 '+(lastError?'오류':'ON'):'학습 기록 계정';}
  function init(getter,setter,reread){
    if(initStarted)return;initStarted=true;
    getState=getter;applyState=setter;updateUI=reread;
    if(!configure()){notify();return;}
    client.auth.onAuthStateChange((event)=>{
      if(event==='SIGNED_IN'&&!active&&!blocked){
        setTimeout(()=>claimSession().catch(err=>{lastError=messageFor(err);notify();}),0);
      }
      if(event==='PASSWORD_RECOVERY'){
        setTimeout(()=>{
          open('password-reset');
          const body=$('.heon-account-body',currentModal);
          if(body)body.innerHTML='<form data-account-form="change-password" class="heon-account-form"><label>새 비밀번호<input name="password" type="password" minlength="8" required></label><button class="button" type="submit">비밀번호 변경</button></form>';
        },100);
      }
      // ACCOUNT client only; leaderboard client's anonymous session is untouched.
    });
    claimSession().catch(err=>{lastError=messageFor(err);notify();});
    window.addEventListener('online',()=>{if(active)syncNow();});
    window.addEventListener('focus',()=>{if(active)syncNow();});
    window.addEventListener('storage',e=>{if(e.key===STUDY_CLIENT_STORAGE&&!active)claimSession().catch(console.warn);});
  }
  window.HeonStudyAccount={init,open,scheduleSync,syncNow,statusLabel,
    get active(){return active;},get master(){return active&&profile?.role==='master';},
    get profile(){return profile;},get userId(){return active?user?.id:null;},get blocked(){return blocked;},get lastError(){return lastError;},
    get client(){return configure();}};
})();
