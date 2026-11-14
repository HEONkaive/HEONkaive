/* HEON ARCHIVE 1.3.0 — fail-closed authentication gate.
 * Only the UI shell is public. Problems and lecture files are in a private bucket.
 */
(()=>{
  'use strict';
  const root=document.getElementById('app');
  const client=window.HeonStudyAccount?.client;
  let started=false,booted=false,busy=false,recovering=false;
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const device=()=>/iPad/i.test(navigator.userAgent)?'iPad':/iPhone/i.test(navigator.userAgent)?'iPhone':/Android/i.test(navigator.userAgent)?'Android':'컴퓨터';
  function show(message='',kind='info',nickname=false){
    if(booted)return;
    root.className='heon-locked';
    root.innerHTML=`<main class="heon-access-card"><div class="heon-access-icon">H</div><div class="eyebrow">MEMBERS ONLY · HEON ARCHIVE</div><h1>회원 전용 학습 아카이브</h1><p>승인된 기존 회원만 기출문제와 강의안 자료를 열람할 수 있습니다. 신규 회원가입은 종료되었습니다.</p>
    ${nickname?`<form id="heon-access-nickname"><label>처음 사용하는 학습용 아이디<input id="access-username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocomplete="off" placeholder="영문·숫자·밑줄 3~24자"></label><button type="submit" ${busy?'disabled':''}>아이디 설정 후 입장</button></form>`:
    `<form id="heon-access-login"><label>이메일<input id="access-email" type="email" required autocomplete="email" placeholder="가입된 이메일"></label><label>비밀번호<input id="access-password" type="password" required autocomplete="current-password" placeholder="비밀번호"></label><button type="submit" ${busy?'disabled':''}>기존 회원 로그인</button></form>`}
    <div class="heon-access-actions"><button type="button" id="heon-access-reset">비밀번호 재설정</button><button type="button" id="heon-access-logout">다른 계정으로 로그인</button></div>
    <p class="heon-access-message ${kind==='error'?'error':''}" role="status">${esc(message)}</p>
    <small>학습 기록·필기·북마크는 승인된 계정에 연결됩니다.</small></main>`;
    root.querySelector('#heon-access-login')?.addEventListener('submit',submitLogin);
    root.querySelector('#heon-access-nickname')?.addEventListener('submit',submitNickname);
    root.querySelector('#heon-access-reset')?.addEventListener('click',sendReset);
    root.querySelector('#heon-access-logout')?.addEventListener('click',async()=>{await client?.auth.signOut();show();});
  }
  async function sessionAuthorized(){
    if(!client)throw Error('Supabase 설정이나 연결 라이브러리를 불러오지 못했습니다.');
    const {data,error}=await client.auth.getUser();
    if(error||!data?.user||data.user.is_anonymous)return false;
    const {data:entry,error:accessError}=await client.from('heon_allowed_users').select('user_id,active')
      .eq('user_id',data.user.id).eq('active',true).maybeSingle();
    if(accessError)throw Error('접근 권한 확인 실패: '+accessError.message+' (v1.3.0 SQL 설치 확인)');
    if(!entry)throw Error('이 계정은 승인 명단에 없습니다. 관리자에게 문의하세요.');
    return true;
  }
  async function claim(username=''){
    const {error}=await client.rpc('heon_study_claim_session',{p_username:username,p_device_label:device()});
    if(error)throw error;
  }
  async function finish(){
    if(booted)return;
    window.HeonProtected.activate(client);
    await window.HeonProtected.loadScript('data/catalog.js');
    await window.HeonProtected.loadScript('data/correction-ledger.js');
    booted=true;root.className='loading-shell';
    root.innerHTML='<div class="loading-card"><p>HEON ARCHIVE</p><small>승인된 문제은행을 불러오는 중...</small></div>';
    const app=document.createElement('script');app.src='app.js?v=1.3.0';app.defer=true;
    document.head.appendChild(app);
  }
  async function check(userInitiated=false){
    if(busy||recovering)return;busy=true;
    try{
      const ok=await sessionAuthorized();
      if(recovering)return;
      if(!ok){show('로그인해주세요.');return;}
      try{await claim('');}
      catch(err){
        const msg=String(err.message||err);
        if(/아이디는 영문|아이디 형식/.test(msg)){show('첫 입장을 위해 학습용 아이디를 설정해주세요.','info',true);return;}
        throw err;
      }
      await finish();
    }catch(err){
      console.error('회원 접근 확인 실패',err);
      if(userInitiated)show(err.message||'회원 인증에 실패했습니다.','error');
      else show(err.message||'접근을 확인할 수 없습니다.','error');
    }finally{busy=false;}
  }
  async function submitLogin(e){
    e.preventDefault();if(busy)return;
    const email=root.querySelector('#access-email')?.value.trim(),password=root.querySelector('#access-password')?.value;
    if(!email||!password)return;
    busy=true;show('로그인 중…');
    try{const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;}
    catch(err){busy=false;show('로그인에 실패했습니다: '+(err.message||err),'error');return;}
    busy=false;await check(true);
  }
  async function submitNickname(e){
    e.preventDefault();if(busy)return;
    const username=root.querySelector('#access-username')?.value.trim();
    if(!/^[A-Za-z0-9_]{3,24}$/.test(username||'')){show('아이디 형식을 확인해주세요.','error',true);return;}
    busy=true;
    try{await claim(username);await finish();}
    catch(err){show('아이디를 설정하지 못했습니다: '+(err.message||err),'error',true);}
    finally{busy=false;}
  }
  function showRecovery(message='새 비밀번호를 입력하세요.'){
    root.className='heon-locked';
    root.innerHTML=`<main class="heon-access-card"><div class="heon-access-icon">H</div><h1>비밀번호 재설정</h1><p>이메일 인증을 완료한 계정의 비밀번호를 변경합니다.</p><form id="heon-recovery-form"><label>새 비밀번호<input id="access-new-password" type="password" minlength="8" required autocomplete="new-password"></label><button type="submit">비밀번호 변경</button></form><p class="heon-access-message" role="status">${esc(message)}</p></main>`;
    root.querySelector('#heon-recovery-form').addEventListener('submit',async e=>{
      e.preventDefault();const password=root.querySelector('#access-new-password').value;
      const {error}=await client.auth.updateUser({password});
      if(error){showRecovery('변경 실패: '+error.message);return;}
      recovering=false;await client.auth.signOut();show('비밀번호를 변경했습니다. 새 비밀번호로 로그인해주세요.');
    });
  }
  async function sendReset(){
    const email=root.querySelector('#access-email')?.value.trim()||prompt('비밀번호를 재설정할 기존 회원 이메일을 입력해주세요.');
    if(!email)return;
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    show(error?'재설정 요청 실패: '+error.message:'비밀번호 재설정 안내를 요청했습니다. 이메일을 확인해주세요.',error?'error':'info');
  }
  async function start(){
    if(started)return;started=true;
    show('회원 인증을 확인하고 있어요.');
    if(!client){show('Supabase 연결 설정을 찾지 못했습니다.','error');return;}
    client.auth.onAuthStateChange((event)=>{
      if(event==='PASSWORD_RECOVERY'&&!booted){recovering=true;showRecovery();}
      if(event==='SIGNED_OUT'&&booted){window.HeonProtected?.reset();location.reload();}
    });
    await check(false);
    if(recovering)showRecovery();
  }
  start();
})();
