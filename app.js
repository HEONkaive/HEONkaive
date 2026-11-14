/* HEON ARCHIVE · browser-only, GitHub Pages compatible.
 * Stable question IDs, per-question localStorage, isolated professor JSON.
 */
(() => {
  'use strict';
  const KEY = 'heon.archive.learning.v1';
  const root = document.getElementById('app');
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const circles = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
  const TALLY_FORM_ID = '6DjZg5';
  const PUBLIC_VERSION = '1.3.2';
  const PUBLIC_RELEASE_DATE = '2026-11-13';
  const LEADERBOARD_IMAGE_BY_RANK = {1:'assets/ui/rank-first.png',2:'assets/ui/rank-second.png',3:'assets/ui/rank-third.png'};
  // Keep the underlying provenance, but omit internal answer-approval workflow from study copy.
  function studyCopy(v) {
    return String(v == null ? '' : v)
      .replace(/사용자의 요청으로 정답을 확정했으며 채점과 Review에 반영됩니다\.?/g,'')
      .replace(/강의안 이중검증 채택 결과는 아닙니다\.?/g,'')
      .replace(/사용자가? \d+번을 정답으로 확정했습니다\.?/g,'')
      .replace(/사용자가? [①②③④⑤⑥⑦⑧⑨⑩]을 정답으로 확정했습니다\.?/g,'')
      .replace(/강의안 이중검증을 통과한 답안이라고 표시하지 않습니다\.?/g,'')
      .replace(/강의안 이중검증 정답과는 별도로 사용자 확정 정답으로 표시합니다\.?/g,'')
      .replace(/강의안 이중검증을 통과한 것으로 표시하지 않습니다\.?/g,'')
      .replace(/기출 원본 강조 표시로 지정된 잠정 사용자 정답\.?/g,'')
      .replace(/정답은 사용자가 직접 지정\.?/g,'')
      .replace(/사용자가? [①②③④⑤⑥⑦⑧⑨⑩]번 정답을 직접 확정했습니다\.?/g,'')
      .replace(/사용자 (?:확정|지정) 정답/g,'정답')
      .replace(/사용자 (?:확정|지정) 답안/g,'정답')
      .replace(/사용자 정답/g,'정답')
      .replace(/사용자 지정/g,'정답')
      .replace(/사용자 확정/g,'정답 확인')
      .replace(/사용자의 요청/g,'정답 기준')
      .replace(/사용자가 확인한/g,'확인한')
      .trim();
  }
  function formatPrompt(value){return String(value||'').replace(/\s+(?=(?:Lab(?:oratory)?(?:\s+data|\s+results)?|검사\s*결과|혈액\s*검사|CBC)\s*[:：])/gi,'\n').replace(/\s+(?=(?:WBC|Hb|Hgb|Platelet|PLT|Na|K|Cr|BUN)\s*[:：]\s*\d)/g,'\n');}
  function studyAiExplanation(q) {
    const txt=studyCopy(q.aiExplanation||'');
    if(q.choiceExplanations && (/사용자 요청|정답 확정|형광펜|이 문항\(/.test(txt) || txt.startsWith('판단 포인트:')))return ''; 
    // Old automatically generated placeholders contradict the newer sourced answer and per-choice analysis.
    if(/현재 해당 문항에 검증된 단일 정답 해설이 없으므로/.test(txt)||/이 문항\([^)]*\)의 판단에서는/.test(txt))return '';
    return txt;
  }
  function studyNote(q) {
    const raw=String(q.notes||'');
    if (/사용자 요청|형광펜 선택지 대조|잠정 고정|정답으로 확정|정답 기준에 따라|사용자가/.test(raw)) return ''; 
    if(/^(사용자가? .*정답으로 확정했습니다|기출 원본 강조 표시로 지정된 잠정 사용자 정답|정답은 사용자가 직접 지정)/.test(raw)&&raw.length<145)return '';
    return studyCopy(raw);
  }
  function choiceReasonList(q) {
    if (!q.choiceExplanations || !Object.keys(q.choiceExplanations).length || !q.choices?.length) return '';
    return `<section class="choice-reason-list"><h4>선택지별 해설</h4>${q.choices.map(ch=>{
       const answer=effectiveAnswer(q), right=answer!=null && (Array.isArray(answer)?answer.includes(ch.number):answer===ch.number);
       const reason=q.choiceExplanations[String(ch.number)] || '이 선택지를 판단할 직접 근거를 충분히 확보하지 못했습니다.';
       return `<div class="choice-reason ${right?'right':''}"><p><b>${circles[ch.number-1]||ch.number}</b> ${esc(studyCopy(reason))}</p></div>`;
    }).join('')}</section>`;
  }

  const emptyState = () => ({version:1,records:{},yearExamRecords:{},predictionRecords:{},unitRecords:{},bookmarks:{},yearExamBookmarks:{},predictionBookmarks:{},unitBookmarks:{},dailyGoals:{},customAnswers:{},customMulti:{},lastVisited:{},reviewSchedule:{},bookmarkChanges:{},recordChanges:{},customAnswerChanges:{},lastProfessor:null,prefs:{theme:'dark',explanationWidth:450,nickname:'',playerId:''}});
  let state = emptyState();
  let catalog = null;
  const professorCache = new Map();
  let currentProfessor = null;
  let selectedSubject = 'hematology-1';
  let view = 'home';
  let currentYear = 'all';
  let currentId = null;
  let studyMode = 'professor'; // 'professor', 'year-exam', 'unit', 'prediction'
  let selectedExamYear = null;
  let homeStudyType = 'professor';
  let chosenUnitProfessor = null;
  let selectedUnitId = null;
  let selectedReviewId = null;
  let examDuplicateLabels = [];
  let filter = 'all';
  let reviewFilter = 'all';
  let infoExpanded = false;
  let lastRenderedQuizId = null;
  let mobileMenuOpen = false;
  let restoringReview = false;
  let toastTimer = null;
  // Search is a UI preference only: it never alters or overwrites saved answers.
  let searchText = '';
  // null = the subject currently selected in the study menu. 'all' = every subject.
  let searchSubjectOverride = null;
  let searchOpen = false;
  let searchLoading = false;
  let searchIndexLoaded = false;
  let searchIndexPromise = null;
  let searchLoadErrors = 0;

  function readState() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        state = {...emptyState(),...raw,
          records:raw.records && typeof raw.records==='object' ? raw.records : {},
          yearExamRecords:raw.yearExamRecords || {},predictionRecords:raw.predictionRecords || {},unitRecords:raw.unitRecords || {},
          yearExamBookmarks:raw.yearExamBookmarks || {},predictionBookmarks:raw.predictionBookmarks || {},unitBookmarks:raw.unitBookmarks || {},dailyGoals:raw.dailyGoals || {},
          bookmarks:raw.bookmarks || {},customAnswers:raw.customAnswers || {},
          customMulti:raw.customMulti || {},lastVisited:raw.lastVisited || {},reviewSchedule:raw.reviewSchedule || {},bookmarkChanges:raw.bookmarkChanges || {},recordChanges:raw.recordChanges || {},customAnswerChanges:raw.customAnswerChanges || {},
          prefs:{...emptyState().prefs,...(raw.prefs||{})}};

        // v10.1: modern course ownership correction — non-emergency questions
        // previously listed under Lee Seungshin are now Park Murim questions.
        // Copy, never remove, historical submissions so users cannot lose work.
        // The year-exam records remain independently stored from professor records.
        if (!state.prefs.v10_1_lee_nonemergency_to_park) {
          const transferred=['17-18','17-19','17-20','17-21','17-22',
              '17-주3','17-주4','17-주5','18-19','18-20','18-61',
              '19-50','19-51','20-3','20-4','21-7','21-주1','21-주3','21-주4'];
          const sameQuestionAlreadyInPark=new Set(['17-18','17-19','17-21','20-3','20-4']);
          for (const label of transferred) {
            const oldId='lee-seungshin:'+label, newId='park-murim:'+label;
            for (const group of ['records','yearExamRecords']) {
              const bucket=state[group];
              const previous=bucket[oldId], dest=bucket[newId];
              if (!previous) continue;
              if (!dest || (previous.submitted && !dest.submitted)) {
                bucket[newId]=JSON.parse(JSON.stringify(previous));
              }
            }
            for (const group of ['bookmarks','yearExamBookmarks']) {
              const bucket=state[group];
              if (bucket[oldId]) bucket[newId]=true;
            }
            // Where Park has already confirmed the answer, it takes precedence.
            // For genuinely new Park IDs, preserve the student's custom key.
            if (!sameQuestionAlreadyInPark.has(label)) {
              for (const group of ['customAnswers','customMulti']) {
                const bucket=state[group];
                if (Object.prototype.hasOwnProperty.call(bucket,oldId) &&
                    !Object.prototype.hasOwnProperty.call(bucket,newId)) {
                  bucket[newId]=JSON.parse(JSON.stringify(bucket[oldId]));
                }
              }
            }
            for (const key of Object.keys(state.lastVisited)) {
              if (state.lastVisited[key]===oldId) {
                if (key.startsWith('exam:')) state.lastVisited[key]=newId;
                if (key==='lee-seungshin' && !state.lastVisited['park-murim'])
                  state.lastVisited['park-murim']=newId;
              }
            }
          }
          state.prefs.v10_1_lee_nonemergency_to_park=true;
          try {localStorage.setItem(KEY,JSON.stringify(state));}
          catch(err){console.warn('v10.1 기존 학습기록 이전을 저장하지 못했습니다.',err);}
        }
        // v10: Choi 20-14 is user-confirmed as option ②. Clear only an
        // outdated browser-local answer override once, never student submissions.
        if (!state.prefs.v10_choi_20_14_answer) {
          delete state.customAnswers['choi-duyoung:20-14'];
          delete state.customMulti['choi-duyoung:20-14'];
          state.prefs.v10_choi_20_14_answer=true;
          try {localStorage.setItem(KEY,JSON.stringify(state));}catch(e){console.warn(e);}
        }
        // v9: respect the user's corrections for Kim Hyewon without deleting submitted records.
        if (!state.prefs.v9_kim_user_answers) {
          for (const label of ['20-6','21-2']) {
            delete state.customAnswers['kim-hyewon:'+label];
            delete state.customMulti['kim-hyewon:'+label];
          }
          state.prefs.v9_kim_user_answers = true;
          try {localStorage.setItem(KEY,JSON.stringify(state));} catch(err) {console.warn(err);}
        }
        // v8: when the 13 Lee Seoul keys are updated by the user, clear only
        // their obsolete locally overridden answer keys once. Preserve all
        // submitted selections, bookmarks, and other professors' records.
        if (!state.prefs.v8_lee_answer_corrections) {
          for (const label of ['17-67','18-02','18-05','18-41','19-56','19-57',
                               '19-59','20-67','20-68','20-70','21-65','21-69','21-70']) {
            delete state.customAnswers['lee-seoul:'+label];
            delete state.customMulti['lee-seoul:'+label];
          }
          state.prefs.v8_lee_answer_corrections = true;
          try { localStorage.setItem(KEY, JSON.stringify(state)); }
          catch (err) { console.warn('v8 이서울 사용자 확정 답안 상태 저장 실패',err); }
        }
        // v7: apply the user's ten new Park answer corrections once, without
        // altering submitted choices, bookmark flags, question IDs, or other professors.
        if (!state.prefs.v7_park_user_answer_corrections) {
          for (const label of ['17-15','17-19','17-21','17-56','19-10','19-11','19-14','19-49','20-3','21-39']) {
            delete state.customAnswers['park-murim:'+label];
            delete state.customMulti['park-murim:'+label];
          }
          state.prefs.v7_park_user_answer_corrections = true;
          try { localStorage.setItem(KEY,JSON.stringify(state)); }
          catch (err) { console.warn('v7 답안 갱신 기록을 저장하지 못했습니다.',err); }
        }
        // v6.4: migrate two historically separate entries to Park's present-day course.
        // Never overwrite an already-existing Park record or custom answer.
        if (!state.prefs.v6_4_merge_past_professor) {
          for (const label of ['18-4','18-6']) {
            const oldId='lee-seokyoung:'+label, newId='park-murim:'+label;
            for (const field of ['records','bookmarks','customAnswers','customMulti']) {
              const bucket=state[field];
              if (Object.prototype.hasOwnProperty.call(bucket,oldId) && !Object.prototype.hasOwnProperty.call(bucket,newId))
                bucket[newId]=bucket[oldId];
            }
            if (state.lastVisited['lee-seokyoung']===oldId && !state.lastVisited['park-murim'])
              state.lastVisited['park-murim']=newId;
          }
          if (state.lastProfessor==='lee-seokyoung')state.lastProfessor='park-murim';
          state.prefs.v6_4_merge_past_professor=true;
          try { localStorage.setItem(KEY,JSON.stringify(state)); } catch(err) { console.warn(err); }
        }
        // v6.4: user-confirmed answer 20-37 replaces old browser-local guess once;
        // selected answers and completed progress stay untouched.
        if (!state.prefs.v6_4_park_20_37_confirmed) {
          delete state.customAnswers['park-murim:20-37'];
          delete state.customMulti['park-murim:20-37'];
          state.prefs.v6_4_park_20_37_confirmed=true;
          try { localStorage.setItem(KEY,JSON.stringify(state)); } catch(err) { console.warn(err); }
        }
        // v6 answer correction takes precedence over old browser-local guesses once.
        // Preserve all submitted choices/bookmarks; later user edits remain possible.
        if (!state.prefs.v6_park_18_39_confirmed) {
          delete state.customAnswers['park-murim:18-39'];
          delete state.customMulti['park-murim:18-39'];
          state.prefs.v6_park_18_39_confirmed = true;
          try { localStorage.setItem(KEY, JSON.stringify(state)); }
          catch (err) { console.warn('18-39 정답 기준 마이그레이션을 저장하지 못했습니다.',err); }
        }
        // v6.3: newly user-confirmed answers should replace previous local guesses.
        // Existing submitted selections, bookmarks and progress remain unchanged.
        if (!state.prefs.v6_3_park_21_answer_update) {
          for (const id of ['park-murim:21-43','park-murim:21-49','park-murim:21-52']) {
            delete state.customAnswers[id];
            delete state.customMulti[id];
          }
          state.prefs.v6_3_park_21_answer_update = true;
          try { localStorage.setItem(KEY, JSON.stringify(state)); }
          catch (err) { console.warn('v6.3 사용자 지정 정답 마이그레이션 실패',err); }
        }
        if (!state.prefs.v6_2_park_answer_update) {
          for (const id of ['park-murim:17-13','park-murim:18-23','park-murim:18-50','park-murim:18-74']) {
            delete state.customAnswers[id];
            delete state.customMulti[id];
          }
          state.prefs.v6_2_park_answer_update = true;
          try { localStorage.setItem(KEY, JSON.stringify(state)); }
          catch (err) { console.warn('v6.2 사용자 확정 정답 변경을 기록하지 못했습니다.',err); }
        }
      }
    } catch (err) { console.warn('기록을 읽지 못했습니다.',err); }
  }
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); window.HeonStudyAccount?.scheduleSync(); }
    catch (err) { toast('저장 공간 문제로 기록을 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.'); console.error(err); }
  }
  function theme() {
    document.documentElement.dataset.theme = state.prefs.theme === 'light' ? 'light' : 'dark';
    document.documentElement.style.setProperty('--evidence-width', `${Math.min(690,Math.max(340,Number(state.prefs.explanationWidth)||450))}px`);
  }
  function toast(message) {
    document.querySelector('.toast')?.remove();
    const el=document.createElement('div');el.className='toast';el.textContent=message;
    document.body.append(el);clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),/실패|오류|문제|차단/.test(message)?9000:3000);
  }
  // Smart review schedule: independent per mode / question. No answer-key changes.
  const SMART_STEPS=[1,3,7,14,30,60];
  const smartKey=(q,mode=studyMode)=>`${mode}::${q.id}`;
  function initializeLegacyReviewSchedule(){
    const groups={records:'professor',yearExamRecords:'year-exam',predictionRecords:'prediction',unitRecords:'unit'};
    for(const [bucket,mode] of Object.entries(groups)){
      for(const [id,r] of Object.entries(state[bucket]||{})){
        const key=`${mode}::${id}`;
        if(!r?.submitted || state.reviewSchedule[key]) continue;
        const date=Date.parse(r.submittedAt||r.updatedAt||'')||Date.now();
        state.reviewSchedule[key]={streak:0,reviewCount:0,lastResult:'기존 기록',lastReviewedAt:new Date(date).toISOString(),
          dueAt:new Date(date+86400000).toISOString(),updatedAt:new Date(date).toISOString()};
      }
    }
  }
  function markRecordChange(q,mode=studyMode,value=true){
    state.recordChanges[`${mode}::${q.id}`]={value,updatedAt:new Date().toISOString()};
  }
  function clearModeRecord(q,mode=studyMode){
    const buckets={professor:'records','year-exam':'yearExamRecords',unit:'unitRecords',prediction:'predictionRecords'};
    const marks={professor:'bookmarks','year-exam':'yearExamBookmarks',unit:'unitBookmarks',prediction:'predictionBookmarks'};
    delete state[buckets[mode]][q.id];delete state[marks[mode]][q.id];
    markRecordChange(q,mode,false);
    state.bookmarkChanges[`${mode}::${q.id}`]={value:false,updatedAt:new Date().toISOString()};
    state.reviewSchedule[`${mode}::${q.id}`]={deleted:true,dueAt:null,streak:0,updatedAt:new Date().toISOString()};
  }
  function smartReviewStatus(q,mode=studyMode){
    return state.reviewSchedule?.[smartKey(q,mode)]||null;
  }
  function isDueForReview(q,mode=studyMode){
    const r=smartReviewStatus(q,mode);
    return !!r?.dueAt && Date.parse(r.dueAt)<=Date.now() && submission(q,mode);
  }
  function dueReviewCount(qs=questions(),mode=studyMode){return qs.filter(q=>isDueForReview(q,mode)).length;}
  function markSmartReview(q,mode=studyMode){
    if(!submission(q,mode))return;
    const status=evaluation(q,mode);
    const key=smartKey(q,mode);
    const previous=state.reviewSchedule[key]||{};
    const correct=status==='correct';
    const streak=correct?(Number(previous.streak||0)+1):0;
    const days=correct?SMART_STEPS[Math.min(streak-1,SMART_STEPS.length-1)]:1;
    const now=new Date();
    state.reviewSchedule[key]={streak,lastResult:status,reviewCount:Number(previous.reviewCount||0)+1,
      lastReviewedAt:now.toISOString(),dueAt:new Date(now.getTime()+days*86400000).toISOString(),updatedAt:now.toISOString()};
  }
  function questionAuditHTML(q){
    const status=q.validation?.stage;
    const label=status==='accepted'?'강의안 검증':status==='exam_answer_key'?'공식 정답표':
      status==='user_confirmed'?'정답 확인':status==='highlight_reviewed'?'기출 원본 대조':'근거 재검토';
    const corrections=(window.HEON_CORRECTION_LEDGER?.items||[]).filter(it=>it.id===q.id);
    const remote=(questionAuditEvents.get(q.id)||[]);
    const all=[...corrections,...remote];
    return `<details class="question-audit-history"><summary>문항 검증: ${esc(label)}${all.length?' · 수정/검토 이력 '+all.length+'건':''}</summary>
      <p>현재 문제 상태는 강의안 원문 검증·기출 정답표·수정 검토 여부에 따라 구분됩니다. 개인 지정 답안은 공용 정답에 반영되지 않습니다.</p>
      ${all.map(it=>`<div class="question-audit-event"><strong>${esc(it.status||it.kind||'검토')}</strong><span>${esc(it.version_tag||it.version||'')} ${esc(it.created_at||it.date||'')}</span><p>${esc(it.summary||'')}</p>${it.evidence_reference?`<small>근거: ${esc(it.evidence_reference)}</small>`:''}</div>`).join('')||'<p>별도의 수정 이력이 없습니다.</p>'}</details>`;
  }
  const questionAuditEvents=new Map();
  async function loadQuestionAuditEvents(){
    const client=sharedLeaderboardClient();if(!client)return;
    const {data,error}=await client.from('heon_question_audits').select('question_id,status,kind,summary,evidence_reference,version_tag,created_at').eq('published',true).order('created_at',{ascending:false}).limit(250);
    if(error){console.info('문항 검증 이력 DB는 아직 설치되지 않았습니다.',error.message);return;}
    questionAuditEvents.clear();
    for(const it of data||[]){const arr=questionAuditEvents.get(it.question_id)||[];arr.push(it);questionAuditEvents.set(it.question_id,arr);}
    if(catalog)render();
  }
  // Shared leaderboard via Supabase (GitHub Pages remains a static site).
  // No browser-local rankings are displayed as public records.
  const sharedBoards=new Map();
  const sharedBoardStatus=new Map();
  const sharedBoardErrors=new Map();
  let sharedClient=null;
  let sharedAuthPromise=null;
  let awaitingRank=null;
  function leaderboardKey(subjectId=selectedSubject,year='22'){return `${subjectId}:${year}`;}
  function leaderboardConfigured(){
    const c=window.HEON_LEADERBOARD_CONFIG;
    return !!(c&&/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.url||'')&&typeof c.publishableKey==='string'&&c.publishableKey.length>15);
  }
  function sharedErrorText(err){
    const message=String(err?.message||err||'알 수 없는 오류');
    const status=Number(err?.status||0);
    if(/failed to fetch|network|fetch failed|load failed|networkerror|timeout/i.test(message))return '인터넷 연결 또는 브라우저의 Supabase 접속 차단 문제';
    if(/invalid api key|invalid.*key|apikey|jwt.*invalid|jwt expired/i.test(message)||status===401)return 'Supabase 공개 키 또는 인증 토큰 문제';
    if(/anonymous.*disabled|anonymous.*not.*enabled|signups.*disabled/i.test(message))return 'Supabase에서 익명 로그인이 비활성화됨';
    if(/captcha|turnstile|hcaptcha/i.test(message))return 'Supabase CAPTCHA 설정 확인 필요';
    if(/permission denied|row.level|rls|42501/i.test(message)||status===403)return '리더보드 테이블 읽기 권한(RLS) 문제';
    if(/could not find.*table|relation.*does not exist|pgrst205|42p01/i.test(message)||status===404)return 'SQL 테이블 생성 또는 Data API 노출 설정 문제';
    return `Supabase 응답: ${message.slice(0,180)}`;
  }
  function sharedDiagnostic(stage, err){
    return `${stage}: ${sharedErrorText(err)}`;
  }
  function sharedLeaderboardClient(){
    // One verified, approved study-account session; no anonymous Auth identities.
    return window.HeonStudyAccount?.client || null;
  }
  function canUseLeaderboard(subjectId=selectedSubject,year='22'){
    return String(year)==='22' && yearQuestionsForSubject(subjectId,22).items.length>0;
  }
  async function loadSharedLeaderboard(subjectId=selectedSubject,year='22',rerender=true){
    if(!canUseLeaderboard(subjectId,year))return [];
    const key=leaderboardKey(subjectId,year);
    const client=sharedLeaderboardClient();
    if(!client){
      const detail=leaderboardConfigured()? 'Supabase 자바스크립트 라이브러리를 불러오지 못했습니다. 광고 차단 또는 CDN 연결을 확인하세요.' : 'GitHub 최상위 폴더의 leaderboard-config.js 설정 파일이 누락되었거나 올바르지 않습니다.';
      sharedBoardErrors.set(key,detail);
      sharedBoardStatus.set(key,leaderboardConfigured()?'error':'unconfigured');
      if(rerender&&view==='home')render();return [];
    }
    sharedBoardStatus.set(key,'loading');
    try{
      const {data,error}=await client.from('heon_leaderboard')
        .select('user_id,nickname,score,total,achieved_at')
        .eq('subject_id',subjectId).eq('exam_year',String(year))
        .order('score',{ascending:false}).order('achieved_at',{ascending:true}).limit(3);
      if(error)throw error;
      sharedBoards.set(key,data||[]);
      sharedBoardErrors.delete(key);
      sharedBoardStatus.set(key,'ready');
      return data||[];
    }catch(err){
      console.error('공용 리더보드 읽기 오류',err);
      sharedBoardErrors.set(key,sharedDiagnostic('데이터 조회 실패',err));
      sharedBoardStatus.set(key,'error');
      return [];
    }finally{if(rerender&&view==='home'&&selectedSubject===subjectId)render();}
  }
  async function ensureSharedUser(){
    const client=sharedLeaderboardClient();
    if(!client)throw Error(leaderboardConfigured()?'Supabase 자바스크립트 라이브러리가 로드되지 않았습니다.':'leaderboard-config.js 파일이 없거나 설정이 잘못되었습니다.');
    if(sharedAuthPromise)return sharedAuthPromise;
    sharedAuthPromise=(async()=>{
      const {data,error}=await client.auth.getUser();
      if(error || !data?.user || data.user.is_anonymous)throw Error('승인된 학습 계정으로 로그인해야 합니다.');
      if(!window.HeonProtected?.authorized)throw Error('회원 접근 권한이 없습니다.');
      return data.user;
    })();
    try{return await sharedAuthPromise;}finally{sharedAuthPromise=null;}
  }
  function buildPublicCandidate(){
    if(studyMode!=='year-exam'||!canUseLeaderboard(selectedSubject,selectedExamYear))return null;
    const all=questions();
    if(!all.length||!all.every(q=>submission(q,'year-exam')))return null;
    const s=stats(all,'year-exam');
    const answers={};
    for(const q of all){
      const selected=record(q,'year-exam').selected;
      answers[q.id]=q.type==='short'?String(selected??''):(Array.isArray(selected)?selected:[selected]).map(Number).sort((a,b)=>a-b);
    }
    return {subjectId:selectedSubject,year:String(selectedExamYear),score:s.correct,total:s.total,answers};
  }
  async function maybeOfferPublicRank(){
    // v1.1.10: mobile intentionally has no leaderboard, including automatic ranking popups.
    if(window.matchMedia?.('(max-width: 760px)').matches)return;
    const candidate=buildPublicCandidate();
    if(!candidate || !leaderboardConfigured())return;
    try{
      const user=await ensureSharedUser();
      const board=await loadSharedLeaderboard(candidate.subjectId,candidate.year,false);
      if(sharedBoardStatus.get(leaderboardKey(candidate.subjectId,candidate.year))!=='ready')throw Error(sharedBoardErrors.get(leaderboardKey(candidate.subjectId,candidate.year))||'리더보드를 불러오지 못했습니다.');
      const old=board.find(e=>e.user_id===user.id);
      if(old&&old.score>=candidate.score)return;
      const rivals=board.filter(e=>e.user_id!==user.id);
      const rank=1+rivals.filter(e=>e.score>=candidate.score).length;
      if(rank>3)return;
      awaitingRank={...candidate,rank,userId:user.id};
      showRankCelebration({rank,candidate:{score:candidate.score,total:candidate.total,percent:Math.round(100*candidate.score/candidate.total)}});
    }catch(err){
      console.error('리더보드 등수 계산 실패',err);
      toast('공용 리더보드 연결 실패 · '+sharedErrorText(err));
    }
  }
  function renderLeaderboardPanel(subjectId=selectedSubject){
    const subject=subjectById(subjectId);
    if(!subject)return '';
    const questionsReady=canUseLeaderboard(subjectId,'22');
    const key=leaderboardKey(subjectId,'22');
    const status=questionsReady ? (sharedBoardStatus.get(key)||(leaderboardConfigured()?'loading':'unconfigured')) : 'not-ready';
    const board=sharedBoards.get(key)||[];
    const notes={loading:'전체 사용자 공용 기록을 불러오는 중…',error:sharedBoardErrors.get(key)||'서버 연결 실패 · 새로고침 버튼으로 다시 시도하세요.',unconfigured:sharedBoardErrors.get(key)||'Supabase 연결 설정이 없습니다.',ready:'닉네임으로 참여하며, 참여는 자율입니다. 22학번 연도별 풀이에만 해당합니다.', 'not-ready':'아직 22학번 문제와 채점 기준이 등록되지 않은 과목입니다. 등록 후 공용 랭킹이 활성화됩니다.'};
    return `<section class="leaderboard-card" aria-label="${esc(subject.name)} 22학번 공용 리더보드"><div class="leaderboard-head"><div><div class="eyebrow">${esc(subject.name)} · 22학번</div><h3>🏆 TOP 3 LEADERBOARD</h3></div>${questionsReady?'<button class="button secondary tiny" data-action="refresh-leaderboard" aria-label="순위 새로고침">↻</button>':''}</div><div class="leaderboard-list">${[1,2,3].map(rank=>{const item=board[rank-1];return `<div class="leaderboard-row rank-${rank}"><div class="leaderboard-rank">${rank}</div><div class="leaderboard-meta"><strong>${item?esc(item.nickname):'기록 대기 중'}</strong><small>${item?`${item.score}/${item.total}문항 정답`:'공용 기록 없음'}</small></div><div class="leaderboard-score">${item?`${item.score}점`:'—'}</div></div>`;}).join('')}</div><p class="leaderboard-help">${esc(notes[status]||notes.loading)}</p>${status==='unconfigured'?'<p class="leaderboard-help">※ 아직 공용 DB가 연결되지 않아 다른 사람의 기록을 보여줄 수 없습니다.</p>':''}</section>`;
  }
  function closeDialog() { document.querySelector('.custom-dialog-overlay')?.remove(); }
  function openDialog(contentHTML, options={}) {
    closeDialog();
    const overlay=document.createElement('div');
    overlay.className='custom-dialog-overlay';
    overlay.innerHTML=`<div class="custom-dialog ${options.className||''}" role="dialog" aria-modal="true">${contentHTML}</div>`;
    overlay.addEventListener('click',e=>{ if(e.target===overlay) closeDialog(); });
    document.body.append(overlay);
    return overlay;
  }
  async function submitPublicRank(btn){
    const preview=awaitingRank;
    const input=document.querySelector('#leaderboard-name');
    if(!preview||!input)return;
    const name=input.value.trim();
    if(!name){toast('닉네임을 입력해주세요.');input.focus();return;}
    btn.disabled=true;btn.textContent='등록 중…';
    try{
      const client=sharedLeaderboardClient();
      await ensureSharedUser();
      const {data,error}=await client.rpc('heon_secure_submit_score',{
        p_subject_id:preview.subjectId,p_exam_year:preview.year,
        p_nickname:name,p_answers:preview.answers
      });
      if(error)throw error;
      state.prefs.nickname=name;saveState();awaitingRank=null;closeDialog();
      await loadSharedLeaderboard(preview.subjectId,preview.year,false);
      const rank=Array.isArray(data)?data[0]?.rank:data?.rank;
      toast(rank&&rank<=3?`${rank}등! 공용 리더보드에 등록됐습니다.`:'점수를 저장했습니다. 현재 상위 3위 밖입니다.');
    }catch(err){
      console.error('공용 점수 제출 실패',err);
      toast('점수 저장 실패: '+(err.message||'네트워크 오류'));
      btn.disabled=false;btn.textContent='다시 등록';
    }
  }
  // Format the completed exam score for the rank celebration dialog.
  function leaderboardSummaryText(entry) {
    const score=Number(entry?.score)||0;
    const total=Number(entry?.total)||0;
    const percent=Number.isFinite(Number(entry?.percent)) ? Number(entry.percent) : (total ? Math.round(score / total * 100) : 0);
    return `${score}점 / ${total}문항 · ${percent}%`;
  }
  function showRankCelebration(preview) {
    if(!preview) return;
    const image=LEADERBOARD_IMAGE_BY_RANK[preview.rank] || LEADERBOARD_IMAGE_BY_RANK[3];
    const titles={1:'1등 축하드려요!',2:'2등 축하드려요!',3:'3등 축하드려요!'};
    const overlay=openDialog(`<button class="dialog-close" data-dialog-close>✕</button><div class="rank-dialog-media"><img src="${esc(image)}" alt="${esc(titles[preview.rank])}"></div><div class="rank-dialog-body"><div class="eyebrow">YEAR 22 LEADERBOARD</div><h2>${titles[preview.rank]}</h2><p class="rank-score-line">이번 점수는 <b>${esc(leaderboardSummaryText(preview.candidate))}</b> 입니다. (채점 보류 문항은 점수에서 제외)</p><p class="rank-help">리더보드에 표시할 이름(닉네임)을 입력해주세요.</p><label class="dialog-label" for="leaderboard-name">닉네임</label><input id="leaderboard-name" class="dialog-input" maxlength="24" placeholder="예: 열공왕" value="${esc(state.prefs.nickname||'')}" /><div class="dialog-actions"><button class="button secondary small" data-dialog-close>나중에</button><button class="button small" data-action="save-leaderboard-rank">리더보드에 저장</button></div></div>`,{className:'rank-dialog'});
    overlay.querySelectorAll('[data-dialog-close]').forEach(el=>el.addEventListener('click',closeDialog));
    overlay.querySelector('[data-action=save-leaderboard-rank]')?.addEventListener('click',e=>submitPublicRank(e.currentTarget));
  }
  function openReportPopup(questionId='') {
    const q=questionId?questions().find(item=>item.id===questionId):view==='quiz'?currentQuestion():view==='review'?questions().find(item=>item.id===selectedReviewId):null;
    const professor=q?profMeta(q.professor)?.name||q.professor:'';
    const context={questionId:q?.id||'',questionNumber:q?.label||'',professor,
      subject:subjectById(selectedSubject)?.name||'',studyMode:q?studyMode:'',siteVersion:PUBLIC_VERSION};
    const params=new URLSearchParams(Object.entries(context).filter(([_,v])=>v));
    const fallback=`https://tally.so/r/${TALLY_FORM_ID}${params.size?'?'+params.toString():''}`;
    try {
      if(window.Tally && typeof window.Tally.openPopup==='function') {
        window.Tally.openPopup(TALLY_FORM_ID, {layout:'default', width:375, hideTitle:true, overlay:false, autoClose:0, hiddenFields:context});
      } else {
        window.open(fallback,'_blank','noopener');
      }
    } catch(err) {
      console.warn(err);
      window.open(fallback,'_blank','noopener');
    }
  }
  function questions(prof = currentProfessor) { return prof ? (prof.questions||[]) : []; }
  const yearSortValue = y => (y == null || y === 'unknown' || y === '연도미상') ? Number.MAX_SAFE_INTEGER : (Number.isFinite(Number(y)) ? Number(y) : Number.MAX_SAFE_INTEGER);
  const yearName = y => String(y)==='predicted' ? 'AI 예상문제' : yearSortValue(y) === Number.MAX_SAFE_INTEGER ? '연도미상' : `${y}학번`;
  // Professor, class-year exam and AI practice are separate learning sessions.
  // Global answer-key corrections remain shared; student answers never leak across modes.
  function recordBucket(mode=studyMode) { return mode==='year-exam' ? state.yearExamRecords : mode==='prediction' ? state.predictionRecords : mode==='unit' ? state.unitRecords : state.records; }
  function bookmarkBucket(mode=studyMode) { return mode==='year-exam' ? state.yearExamBookmarks : mode==='prediction' ? state.predictionBookmarks : mode==='unit' ? state.unitBookmarks : state.bookmarks; }
  function record(q,mode=studyMode) { if(mode==='goal'){const own=state.records[q.id];if(own?.submitted)return own;return [state.yearExamRecords[q.id],state.unitRecords[q.id],own].find(r=>r?.submitted)||own||{selected:[],submitted:false};}return recordBucket(mode)[q.id] || {selected:[],submitted:false}; }
  function isBookmark(q,mode=studyMode) { return !!bookmarkBucket(mode)[q.id]; }
  function submission(q,mode=studyMode) { return !!record(q,mode).submitted; }
  function effectiveAnswer(q) { if(q.lectureAudit?.gradingHold)return null;if(q.answerConfirmation?.status==='confirmed')return q.answer;if(q.lectureAudit&&(q.lectureAudit.answerRevised||q.answerKey))return q.answer;if(q.validation?.stage==='exam_answer_key')return q.answer;return Object.prototype.hasOwnProperty.call(state.customAnswers,q.id) ? state.customAnswers[q.id] : q.answer; }
  const normalizeText = s => String(s||'').toLowerCase().replace(/[\s.!?,'"’‘“”\-_:;]+/g,'');
  function arraysEqual(a,b) { const sa=[...(Array.isArray(a)?a:[a])].map(String).sort();const sb=[...(Array.isArray(b)?b:[b])].map(String).sort();return sa.length===sb.length && sa.every((x,i)=>x===sb[i]); }
  function evaluation(q,mode=studyMode) {
    if (!submission(q,mode)) return 'not-started';
    if(q.lectureAudit?.gradingHold || (q.subject==='hematology-1' && q.type==='short')) return 'pending';
    const known = effectiveAnswer(q);
    if (known === null || known === undefined || (Array.isArray(known) && !known.length)) return 'pending';
    const picked = record(q,mode).selected;
    if (q.type === 'short') {
      if (q.gradingMode==='manual') return 'pending'; // essay answers are not automatically marked wrong
      const typed=normalizeText(picked);
      if (q.shortRequiredTerms?.length) return q.shortRequiredTerms.every(term=>typed.includes(normalizeText(term)))?'correct':'wrong';
      const aliases=Array.isArray(known)?known:[known];
      return aliases.some(item=>typed===normalizeText(item)) ? 'correct':'wrong';
    }
    if (picked==null || (Array.isArray(picked) && !picked.length)) return 'pending';
    return arraysEqual(picked,known) ? 'correct':'wrong';
  }
  function stats(list,mode=studyMode) {
    const result={total:list.length,completed:0,correct:0,wrong:0,pending:0};
    for(const q of list) {
      if(submission(q,mode)) {
        result.completed++;
        const e=evaluation(q,mode);
        if(e==='correct')result.correct++;
        else if(e==='wrong')result.wrong++;
        else result.pending++;
      }
    }
    return result;
  }
  function stage(list) {
    const s=stats(list);
    if(!s.total || !s.completed)return 'empty';
    return s.completed===s.total?'complete':'partial';
  }
  function statusDot(s) { return `<span class="status-dot ${s==='complete'?'complete':s==='partial'?'partial':''}">${s==='complete'?'✓':''}</span>`; }
  function professorCourseStats(meta,loaded) {
    if (loaded) { const qs=(loaded.questions||[]).filter(q=>!q.isPrediction); const a=stats(qs,'professor'); return {...a, unresolved:qs.filter(q=>effectiveAnswer(q)==null).length}; }
    const total=Number(meta.questionCount)||0;
    const movedQuestionId = 'park-murim:22-주2';
    const completed=Object.entries(state.records).filter(([id,r])=>{
      const owner=id===movedQuestionId?'lee-seungshin':id.split(':')[0];
      return owner===meta.id && r?.submitted;
    }).length;
    return {total,completed,unresolved:Number(meta.pendingCount)||0};
  }
  function professorCourseStage(meta,loaded) {
    const s=professorCourseStats(meta,loaded);
    return !s.total||!s.completed?'empty':(s.completed>=s.total?'complete':'partial');
  }
  function subjectById(id) { return catalog.subjects.find(s=>s.id===id); }
  function yearExamTeacherLabel(id) { return id === "won-taewan" ? "원태완(최운정 기출)" : id === "choi-geumha" ? "최금하(김헌수 기출)" : (profMeta(id)?.name||""); }
  function profMeta(id) {
    for (const sub of catalog.subjects) for(const p of sub.professors)if(p.id===id)return {...p,subjectId:sub.id,subjectName:sub.name};
    return null;
  }
  // Plain script files load from both GitHub Pages (https:) and a local file (file:).
  // PDF/exam data stays in separate professor files, so adding new professors
  // does not require editing this HTML or application logic.
  function addDataScript(src) {
    return new Promise((resolve,reject) => {
      const script=document.createElement('script');
      script.src=src;
      script.onload=()=>resolve();
      script.onerror=()=>reject(new Error(`문제 파일을 찾지 못했습니다: ${src}`));
      document.head.appendChild(script);
    });
  }
  async function getProfessorData(meta) {
    const registry=window.HEON_ARCHIVE_DATA;
    if (!registry?.professors?.[meta.id]) {
      // Mirrors of JSON files are generated by tools/sync_offline_data.py.
      // Script loading, unlike fetch(JSON), also works when index.html is double-clicked.
      const jsPath=meta.data.replace(/\.json(?=\?|$)/i,'.js');
      if(!window.HeonProtected?.loadScript)throw Error('보호된 문제은행 로더가 없습니다.');
      await window.HeonProtected.loadScript(jsPath);
    }
    const data=window.HEON_ARCHIVE_DATA?.professors?.[meta.id];
    if(!data)throw Error(`문제 데이터가 비어 있습니다: ${meta.id}`);
    return data;
  }
  async function loadProfessor(id) {
    if(professorCache.has(id)) return professorCache.get(id);
    const meta=profMeta(id);if(!meta)throw Error('교수님 정보를 찾을 수 없습니다.');
    const data=await getProfessorData(meta);
    if(!Array.isArray(data.questions))throw Error('교수님 JSON에 questions 배열이 없습니다.');
    const ids=new Set();
    for(const q of data.questions){if(ids.has(q.id))throw Error(`중복 문제 ID: ${q.id}`);ids.add(q.id);}
    data.questions.sort((a,b)=>(yearSortValue(a.year)-yearSortValue(b.year))||(a.number-b.number)||a.id.localeCompare(b.id));
    professorCache.set(id,data);return data;
  }
  async function selectProfessor(id, keepYear=false) {
    try {
      const prof=await loadProfessor(id);const meta=profMeta(id);
      currentProfessor={...prof,questions:prof.questions.filter(q=>!q.isPrediction)};selectedSubject=meta.subjectId;state.lastProfessor=id;studyMode='professor';selectedExamYear=null;examDuplicateLabels=[];
      if(!keepYear)currentYear='all';filter='all';view='quiz';infoExpanded=false;restoringReview=false;
      const candidate=state.lastVisited[id];
      currentId=questions(currentProfessor).some(q=>q.id===candidate && (currentYear==='all'||String(q.year)===currentYear)) ? candidate : (questions(currentProfessor)[0]?.id||null);
      saveState();mobileMenuOpen=false;render();window.scrollTo({top:0,behavior:'instant'});
    } catch(err){toast(`문제 데이터를 불러올 수 없습니다: ${err.message}`);console.error(err);}
  }
  // Exam mode keeps stable question IDs but its submissions/bookmarks are isolated from professor records.
  function yearQuestionsForSubject(subjectId,year) {
    const subject=subjectById(subjectId);if(!subject)return {items:[],duplicates:[]};
    const collected=[], duplicate=[];
    for(const meta of subject.professors){
      const prof=professorCache.get(meta.id);if(!prof)continue;
      for(const q of prof.questions||[]){
        if(q.professorOnly || q.isPrediction || String(q.year)!==String(year))continue;
        const prev=collected.find(other=>other.label===q.label && normalizeText(other.prompt).slice(0,42)===normalizeText(q.prompt).slice(0,42));
        if(prev) {duplicate.push({label:q.label,kept:prev.id,other:q.id});continue;}
        // Different questions sharing a number remain separate. Never silently drop a professor's material.
        collected.push(q);
      }
    }
    // 모성과 신생아 학번별 문제는 교수님 단위로 묶어 표시한다.
    // 등록 순서(홍기연 → 최두영 → 이후 추가되는 교수님)를 따르며,
    // 혈액과 종양 등 다른 과목은 기존 번호 정렬을 유지한다.
    const items=collected.sort(subjectId==='maternal-newborn'
      ?(a,b)=>subject.professors.findIndex(p=>p.id===a.professor)-subject.professors.findIndex(p=>p.id===b.professor)
        ||(a.number-b.number)||a.id.localeCompare(b.id)
      :(a,b)=>(a.number-b.number)||a.professor.localeCompare(b.professor));
    return {items,duplicates:duplicate};
  }
  async function selectSubjectExam(year){
    try{
      const subject=subjectById(selectedSubject);
      await Promise.all(subject.professors.map(meta=>loadProfessor(meta.id)));
      const result=yearQuestionsForSubject(subject.id,year);
      if(!result.items.length){toast('이 학번에 등록된 문항이 없습니다.');return;}
      studyMode='year-exam';selectedExamYear=String(year);examDuplicateLabels=result.duplicates;
      const id='exam:'+subject.id+':'+year;
      currentProfessor={professor:{id,name:`${subject.name} · ${yearName(year)} 통합 시험`,subjectId:subject.id,description:'교수님 전체 · 해당 학번 기출만 순서대로'},questions:result.items};
      currentYear='all';filter='all';reviewFilter='all';view='quiz';restoringReview=false;infoExpanded=false;
      const previous=state.lastVisited[id];
      currentId=result.items.some(q=>q.id===previous)?previous:(result.items.find(q=>!submission(q))||result.items[0]).id;
      state.lastProfessor=id;saveState();render();window.scrollTo(0,0);
    }catch(err){console.error(err);toast('학번별 문제를 불러오지 못했습니다: '+err.message);}
  }
  // Unit selection: identical question IDs, entirely different submission/bookmark stores.
  function unitGroups(profId) {
    const data=professorCache.get(profId);
    if(!data)return [];
    const map=new Map();
    for (const q of (data.questions||[]).filter(q=>!q.isPrediction&&!q.professorOnly)){
      const title=q.unitTitle||'기타 · 단원 검토';
      const id=q.unitId||title;
      if(!map.has(id))map.set(id,{id,title,items:[]});
      map.get(id).items.push(q);
    }
    return [...map.values()].sort((a,b)=>a.title.localeCompare(b.title,'ko'));
  }
  async function startUnit(profId,unitId){
    try{
      await loadProfessor(profId);
      const group=unitGroups(profId).find(g=>g.id===unitId);
      if(!group||!group.items.length){toast('해당 단원에 문제가 없습니다.');return;}
      const meta=profMeta(profId);
      studyMode='unit';selectedUnitId=unitId;chosenUnitProfessor=profId;
      selectedExamYear=null;examDuplicateLabels=[];
      currentProfessor={professor:{...meta,id:'unit:'+profId+':'+unitId,name:meta.name+' 교수님 · '+group.title,description:'단원별 학습 · 교수님별·학번별 기록과 완전히 분리'},questions:group.items};
      currentYear='all';filter='all';reviewFilter='all';view='quiz';restoringReview=false;
      const key='unit:'+profId+':'+unitId;
      const old=state.lastVisited[key];
      currentId=group.items.some(q=>q.id===old)?old:(group.items.find(q=>!submission(q,'unit'))||group.items[0]).id;
      infoExpanded=submission(group.items.find(q=>q.id===currentId),'unit');
      state.lastProfessor=key;saveState();render();window.scrollTo(0,0);
    }catch(err){console.error(err);toast('단원 불러오기 실패: '+err.message);}
  }
  async function startPredictions(){
    try {
      const prof=await loadProfessor('lee-kanggyu');
      const items=prof.questions.filter(q=>q.isPrediction);
      if(!items.length){toast('예상문제가 준비되지 않았습니다.');return;}
      studyMode='prediction';selectedExamYear=null;
      currentProfessor={professor:{...prof.professor,id:'practice-lee-kanggyu',name:'이강규 예상문제',description:'AI 제작 연습문제 · 실제 기출이나 교수님 출제예고가 아닙니다.'},questions:items};
      selectedSubject='hematology-1';currentYear='all';filter='all';reviewFilter='all';view='quiz';restoringReview=false;
      currentId=items.find(q=>!submission(q))?.id||items[0].id;
      infoExpanded=submission(items.find(q=>q.id===currentId));render();window.scrollTo(0,0);
    } catch(err){console.error(err);toast('예상문제를 불러오지 못했습니다: '+err.message);}
  }
  function renderYearHeader(){
    const all=questions(), s=stats(all), pct=s.total?Math.round(100*s.completed/s.total):0;
    const teachers=new Set(all.map(q=>q.professor)).size;
    return `<div class="course-header compact-course-header exam-mode-header"><div class="course-identity"><div class="eyebrow">YEAR EXAM · ${esc(selectedExamYear)} CLASS</div><div class="course-title-line"><h1>${esc(subjectById(selectedSubject)?.name||'')} · ${esc(yearName(selectedExamYear))} 모의고사</h1><p>여러 교수님 문항을 통합 · 문제번호 중복 제외 · ${teachers}명</p></div></div><div class="course-header-right"><div class="header-pills"><span class="pill blue">${all.length}문항</span><span class="pill ok">제출 ${s.completed}</span><span class="pill warn">채점 보류 ${s.pending}</span><button class="button secondary small" data-action="open-review">${s.completed===s.total?'최종 결과':'현재 결과'} ↗</button></div><div class="header-study-controls"><button class="button secondary small" data-action="reset-year-exam">이 학번 시험 기록 초기화</button><div class="study-progress"><span>시험 진행률</span><div class="progress-track"><div class="progress-fill ${s.completed===s.total?'done':''}" style="width:${pct}%"></div></div><strong>${pct}%</strong></div></div></div></div>`;
  }
  let editingQuestionKey='', evidenceCollapsedKey='', evidenceDisplayKey='';
  function questionViewKey(q){return q?studyMode+'::'+q.id:'';}
  function hasSubmittedBefore(q){if(!q)return false;const r=record(q);return !!(r.submitted||r.submittedAt||r.hasSubmitted);}
  function syncExplanation(q){
    const key=questionViewKey(q);
    if(evidenceDisplayKey!==key){evidenceCollapsedKey='';evidenceDisplayKey=key;}
    if(hasSubmittedBefore(q)&&evidenceCollapsedKey!==key)infoExpanded=true;
  }
  function scopedQuestions() {
    let arr=questions().filter(q=>currentYear==='all'||String(q.year)===currentYear);
    if(filter==='bookmarked')arr=arr.filter(q=>isBookmark(q));
    if(filter==='wrong')arr=arr.filter(q=>evaluation(q)==='wrong'||(editingQuestionKey===questionViewKey(q)&&hasSubmittedBefore(q)));
    return arr;
  }
  function currentQuestion() {
    const items=scopedQuestions();
    return items.find(q=>q.id===currentId)||items[0]||null;
  }
  function goQuestion(id) {
    const q=questions().find(q=>q.id===id);if(!q)return;
    editingQuestionKey='';evidenceCollapsedKey='';currentId=id;currentYear='all';filter='all';view='quiz';infoExpanded=hasSubmittedBefore(q);state.lastVisited[currentProfessor.professor.id]=id;saveState();
    render();window.scrollTo({top:0,behavior:'instant'});
  }
  function selectCurrent(id) {
    editingQuestionKey='';evidenceCollapsedKey='';
    infoExpanded=hasSubmittedBefore(questions().find(q=>q.id===id));
    currentId=id;
    if(currentProfessor)state.lastVisited[currentProfessor.professor.id]=id;
    saveState();render();window.scrollTo({top:0,behavior:'instant'});
  }
  function selectYear(y) {editingQuestionKey='';evidenceCollapsedKey='';infoExpanded=false;currentYear=y;filter='all';currentId=scopedQuestions()[0]?.id||null;view='quiz';render();}
  function activeSearchSubject() {
    return searchSubjectOverride===null ? selectedSubject : searchSubjectOverride;
  }
  function searchEntries() {
    const query=searchText.trim();
    if(!query || !catalog)return [];
    const terms=query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const compressed=normalizeText(query);
    const found=[];
    for(const sub of catalog.subjects)for(const meta of sub.professors){
      if(activeSearchSubject()!=='all' && sub.id!==activeSearchSubject())continue;
      const data=professorCache.get(meta.id);
      if(!data)continue;
      for(const q of data.questions){
        if(q.isPrediction)continue;
        const choices=(q.choices||[]).map(c=>c.text).join(' ');
        const label=String(q.label||'').toLocaleLowerCase();
        const prompt=String(q.prompt||'');
        const material=[label,meta.name,sub.name,prompt,choices].join(' ').toLocaleLowerCase();
        const simple=normalizeText(material);
        const fullMatch=terms.every(term=>material.includes(term)||simple.includes(normalizeText(term)));
        if(!fullMatch && !(compressed && simple.includes(compressed)))continue;
        const numberExact=label===query.toLocaleLowerCase();
        const numberStart=label.startsWith(query.toLocaleLowerCase());
        const promptMatch=normalizeText(prompt).includes(compressed);
        const choiceMatch=normalizeText(choices).includes(compressed);
        const score=(numberExact?1200:0)+(numberStart?600:0)+(promptMatch?120:0)+(choiceMatch?80:0)+
          (meta.id===currentProfessor?.professor.id?25:0);
        found.push({q,meta,subjectName:sub.name,score});
      }
    }
    return found.sort((a,b)=>b.score-a.score||(yearSortValue(a.q.year)-yearSortValue(b.q.year))||(a.q.number-b.q.number)).slice(0,30);
  }
  function searchSuggestionsHTML(){
    if(!searchText.trim()) return '<div class="search-message"><strong>문항 빠른 검색</strong><p>과목을 선택한 뒤 문제 번호(예: 22-10), 지문·약물명으로 검색하세요. 전체 과목 검색도 가능합니다.</p></div>';
    const hits=searchEntries();
    const pending=searchLoading?'<span class="fine"> · 다른 교수님 자료 검색 중…</span>':'';
    const header=`<div class="search-results-head">검색 결과 ${hits.length>=30?'30개 이상':hits.length+'개'}${pending}</div>`;
    const rows=hits.slice(0,12).map(({q,meta,subjectName})=>{
      const preview=String(q.prompt||q.choices?.map(c=>c.text).join(' / ')||'원본 이미지 참고').replace(/\s+/g,' ').slice(0,92);
      return `<button class="search-result" type="button" role="option" data-action="search-result" data-professor="${esc(meta.id)}" data-id="${esc(q.id)}"><span class="search-result-top"><strong>${esc(q.label)}</strong><span>${esc(subjectName)} · ${esc(meta.name)} 교수님 · ${esc(yearName(q.year))}</span></span><span class="search-result-text">${esc(preview)}</span></button>`;
    }).join('');
    if(!hits.length) return header+`<div class="search-message"><strong>${searchLoading?'검색 범위를 확장하고 있습니다':'일치하는 문제가 없습니다'}</strong><p>${searchLoading?'등록 교수님 데이터를 불러오는 중입니다.':'번호나 다른 키워드로 다시 검색해 보세요.'}${searchLoadErrors?' 일부 교수님 파일을 읽지 못했습니다.':''}</p></div>`;
    return header+rows+(hits.length>12?`<div class="search-foot">상위 12개 결과를 표시 중입니다. 검색어를 더 구체적으로 입력하세요.</div>`:'');
  }
  function updateSearchSuggestions(){
    const panel=root.querySelector('#search-suggestions');
    const field=root.querySelector('#global-search-input');
    if(!panel)return;
    panel.hidden=!searchOpen;
    panel.innerHTML=searchOpen?searchSuggestionsHTML():'';
    field?.setAttribute('aria-expanded',String(searchOpen));
  }
  function loadSearchIndex(){
    if(searchIndexPromise || !catalog)return searchIndexPromise;
    searchLoading=true;
    updateSearchSuggestions();
    const ids=catalog.subjects.flatMap(s=>s.professors.map(p=>p.id));
    searchIndexPromise=Promise.allSettled(ids.map(id=>loadProfessor(id))).then(results=>{
      searchLoadErrors=results.filter(r=>r.status==='rejected').length;
      searchIndexLoaded=true;
    }).finally(()=>{searchLoading=false;updateSearchSuggestions();});
    return searchIndexPromise;
  }
  async function openSearchQuestion(profId,qId){
    try{
      const prof=await loadProfessor(profId);
      if(!prof.questions.some(q=>q.id===qId&&!q.isPrediction)) throw Error('검색 결과의 문항이 없습니다.');
      currentProfessor={...prof,questions:prof.questions.filter(q=>!q.isPrediction)};studyMode='professor';selectedExamYear=null;examDuplicateLabels=[];
      selectedSubject=profMeta(profId).subjectId;
      currentYear='all';filter='all';view='quiz';infoExpanded=false;restoringReview=false;
      currentId=qId;state.lastProfessor=profId;state.lastVisited[profId]=qId;
      searchText='';searchOpen=false;searchSubjectOverride=null;mobileMenuOpen=false;
      saveState();render();window.scrollTo({top:0,behavior:'instant'});
    }catch(err){toast('검색한 문제를 열지 못했습니다: '+err.message);}
  }
  function resetProfessorProgress(){
    if(!currentProfessor)return;
    const name=currentProfessor.professor.name;
    const profId=currentProfessor.professor.id;
    if(studyMode==='prediction') {
      if(!confirm('이강규 예상문제 풀이 기록만 초기화할까요?'))return;
      for(const q of questions())clearModeRecord(q,'prediction');
      view='quiz';currentId=questions()[0]?.id;infoExpanded=false;saveState();render();return;
    }
    if(!confirm(`${name} 교수님의 학습 기록만 초기화할까요?\n\n제출 답안, 풀이 진행률, 북마크, 직접 지정한 정답, 마지막 문제 위치가 초기화됩니다.\n다른 교수님의 기록은 그대로 유지됩니다.\n(문제 데이터에 등록된 정답 기준은 변경되지 않습니다.)`))return;
    const ids=new Set(questions().map(q=>q.id));
    for(const q of questions()){
      clearModeRecord(q,'professor');
      state.customAnswerChanges[q.id]={value:false,updatedAt:new Date().toISOString()};
    }
    for(const group of [state.customAnswers,state.customMulti]){
      for(const id of ids)delete group[id];
    }
    delete state.lastVisited[profId];
    currentYear='all';filter='all';reviewFilter='all';view='quiz';
    currentId=questions()[0]?.id||null;infoExpanded=false;restoringReview=false;
    saveState();render();window.scrollTo({top:0,behavior:'instant'});
    toast(`${name} 교수님의 학습 기록만 초기화했습니다.`);
  }
  function render() {
    if(!catalog)return;
    const quizQuestion = view==='quiz' ? currentQuestion() : null;
    const nextQuizId = quizQuestion?.id || null;
    if (nextQuizId && nextQuizId !== lastRenderedQuizId) {
      infoExpanded = restoringReview || submission(quizQuestion);
    }
    lastRenderedQuizId = nextQuizId;
    // When a user changes a selection, keep the reading position in long questions.
    // Going to another question deliberately starts at that new question's top.
    const previousPanel=root.querySelector('.exam-panel');
    const previousId=previousPanel?.dataset.questionId;
    const keepPanelScroll=!!previousId && view==='quiz' && previousId===currentQuestion()?.id;
    const questionScroll=keepPanelScroll?previousPanel.scrollTop:0;
    const evidenceScroll=keepPanelScroll?root.querySelector('.evidence-panel')?.scrollTop||0:0;
    theme();
    const meta=currentProfessor?profMeta(currentProfessor.professor.id):null;
    const currSubject=subjectById(selectedSubject);
    root.innerHTML=`<div class="site ${view==='quiz'?'quiz-mode':view==='home'?'home-mode':'review-mode'}">
      <main class="workspace">
        <header class="topbar">
          <div class="topbar-navigation"><button class="topbar-brand" data-action="home" aria-label="HEON ARCHIVE 처음 화면"><span class="topbar-mark">H</span><span>HEON <b>ARCHIVE</b></span></button>
            <nav class="quick-nav" aria-label="빠른 메뉴">
              <button data-action="nav-quiz" class="nav-tab ${view==='quiz'?'active':''}">문제 풀이</button>
              <button data-action="home" class="nav-tab ${view==='home'?'active':''}">문제집</button>
              <button data-action="nav-wrong" class="nav-tab ${view==='review'&&reviewFilter==='wrong'?'active':''}">오답 노트</button><button data-action="nav-bookmarks" class="nav-tab ${view==='review'&&reviewFilter==='bookmarks'?'active':''}">북마크</button><button data-action="nav-stats" class="nav-tab ${view==='review'&&reviewFilter!=='wrong'?'active':''}">학습 통계</button><button class="nav-tab goal-nav" data-action="open-goals">◎ 학습 목표</button><button class="nav-tab goal-today-nav" data-action="open-goals" title="오늘 학습목표 달성률 보기">${todayGoalStatusHTML()}</button><button class="nav-tab report-nav" data-action="report-popup" title="문항 번호와 설명, 10MB 이하 이미지 파일을 첨부해 오류를 제보할 수 있어요">✎ 오류 제보하기</button>
            </nav>
          </div>
          <div class="topbar-tools"><div class="global-search" role="search"><div class="search-control-group"><label class="search-subject-filter" title="검색할 과목 선택"><span class="visually-hidden">검색 과목 선택</span><select id="global-search-subject" class="search-subject-select" aria-label="검색할 과목 선택"><option value="current" ${searchSubjectOverride===null?'selected':''}>${esc(currSubject?.name||'현재 과목')}</option><option value="all" ${searchSubjectOverride==='all'?'selected':''}>전체 과목</option>${(catalog?.subjects||[]).filter(sub=>sub.id!==selectedSubject).map(sub=>`<option value="${esc(sub.id)}" ${searchSubjectOverride===sub.id?'selected':''}>${esc(sub.name)}</option>`).join('')}</select></label><label class="search-shell" for="global-search-input"><span class="search-icon" aria-hidden="true">⌕</span><input type="search" id="global-search-input" autocomplete="off" spellcheck="false" value="${esc(searchText)}" placeholder="문제 번호, 키워드, 약물명 검색..." aria-label="선택한 과목 문제 검색" aria-controls="search-suggestions" aria-expanded="${searchOpen}"/></label></div><div id="search-suggestions" class="search-suggestions" role="listbox" ${searchOpen?'':'hidden'}>${searchOpen?searchSuggestionsHTML():''}</div></div>
            <div class="header-actions"><button data-action="study-account-open" class="account-nav-btn" title="학습기록 계정·동기화">${esc(window.HeonStudyAccount?.statusLabel?.()||'학습 기록 계정')}</button>${view!=='home'?'<button class="button secondary small return-home" data-action="home" title="과목·교수님 선택 화면으로 돌아가기" aria-label="홈으로 · 교수님 선택"><svg class="return-home-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7"/><path d="M5.5 9.5V20h13V9.5M9.5 20v-6h5v6"/></svg><span class="return-home-label">교수님 선택</span></button>':''}<button class="icon-btn theme-btn" data-action="theme" title="라이트 / 다크모드 변경" aria-label="테마 전환">${state.prefs.theme==='dark'?'☀':'☾'}</button></div>
          </div>
        </header>
        <div class="content ${view==='quiz'?'quiz-content':''}">${view==='home'?renderHome():view==='review'?renderReview():renderQuiz()}</div>
      </main>
    </div>`;
    // A single rounded evidence card with two balanced text columns.
    const evidenceCard=root.querySelector('.quiz-mode .evidence-panel');
    if(evidenceCard && !evidenceCard.querySelector('.evidence-flow')){
      const header=evidenceCard.querySelector('.evidence-head');
      const flow=document.createElement('div');flow.className='evidence-flow';
      for(const node of [...evidenceCard.childNodes])if(node!==header)flow.appendChild(node);
      evidenceCard.appendChild(flow);
    }
    window.HeonInk?.mount();
    ensureTodayGoalLoaded();
    if(keepPanelScroll) {
      const nextPanel=root.querySelector('.exam-panel');
      const nextEvidence=root.querySelector('.evidence-panel');
      if(nextPanel)nextPanel.scrollTop=questionScroll;
      if(nextEvidence)nextEvidence.scrollTop=evidenceScroll;
    }
  }
  // v1.2.0 · personal daily plan, unique questions across overlapping targets.
  const EXAM_DAYS={'2026-11-20':'혈액과 종양 1차 시험','2026-11-27':'성장과 노화 시험',
    '2026-12-04':'모성과 신생아 시험','2026-12-11':'혈액과 종양 2차 시험'};
  const studyDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const shiftDay=(date,delta)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);};
  let plannerDate=studyDate(),goalSessionDate=null;
  const targetKey=(kind,a,b)=>`${kind}|${a}|${b||''}`;
  const activeGoal=date=>state.dailyGoals?.[date]||{subjectId:selectedSubject,targets:[],done:{},updatedAt:null};
  function goalQuestionList(goal){
    const unique=new Map();
    for(const key of goal.targets||[]){
      const [type,a,b]=key.split('|');let found=[];
      if(type==='prof')found=(professorCache.get(a)?.questions||[]).filter(q=>!q.isPrediction);
      if(type==='unit'){
        found=unitGroups(a).find(x=>x.id===b)?.items||[];
        // Preserve pre-v1.2.2 saved study goals pointing to the original,
        // more granular chapter IDs, without broadening their question scope.
        if(!found.length)found=(professorCache.get(a)?.questions||[]).filter(q=>q.legacyUnitId===b);
      }
      if(type==='year')found=yearQuestionsForSubject(a,b).items||[];
      for(const q of found)unique.set(q.id,q);
    }
    return [...unique.values()];
  }
  const goalCompleted=q=>['professor','unit','year-exam','prediction'].some(mode=>submission(q,mode));
  function goalProgress(date){const goal=activeGoal(date),items=goalQuestionList(goal);
    const completed=items.filter(q=>!!goal.done?.[q.id]||goalCompleted(q)).length;
    return {total:items.length,completed,pct:items.length?Math.round(completed/items.length*100):0,items};
  }
  async function loadGoalSubject(subjectId){
    const sub=subjectById(subjectId);if(!sub)return;
    await Promise.allSettled((sub.professors||[]).map(p=>loadProfessor(p.id)));
  }
  function goalLabel(key){const [kind,a,b]=key.split('|');
    if(kind==='prof')return `${profMeta(a)?.name||a} 교수님 전체`;
    if(kind==='unit')return `${profMeta(a)?.name||a} · ${unitGroups(a).find(u=>u.id===b)?.title||((professorCache.get(a)?.questions||[]).find(q=>q.legacyUnitId===b)?.legacyUnitTitle||b)}`;
    return `${subjectById(a)?.name||a} · ${b}학번 통합`;
  }
  function todayGoalStatusHTML(){
    const g=activeGoal(studyDate());
    if(!g.targets?.length)return '<span class="goal-today-label is-unset">학습목표 미설정</span>';
    const total=goalProgress(studyDate());
    const loaded=(subjectById(g.subjectId)?.professors||[]).every(prof=>professorCache.has(prof.id));
    if(!loaded)return '<span class="goal-today-label">오늘 목표 불러오는 중…</span>';
    return `<span class="goal-today-label">오늘 목표 <b>${total.completed}/${total.total}문항</b> · <b>${total.pct}%</b></span>`;
  }
  // Lazy non-blocking load supports a goal from another subject after cloud login.
  const loadingTodayGoals=new Set();
  function ensureTodayGoalLoaded(){
    const g=activeGoal(studyDate());
    if(!g.targets?.length || !g.subjectId || loadingTodayGoals.has(g.subjectId))return;
    const subject=subjectById(g.subjectId);
    if(!subject || subject.professors.every(prof=>professorCache.has(prof.id)))return;
    loadingTodayGoals.add(g.subjectId);
    loadGoalSubject(g.subjectId).then(()=>{if(catalog)render();})
      .catch(err=>console.warn('오늘 학습목표 문항 로딩 실패',err))
      .finally(()=>loadingTodayGoals.delete(g.subjectId));
  }
  function goalPlannerHTML(){
    const day=activeGoal(plannerDate),subject=subjectById(day.subjectId)||subjectById(selectedSubject);
    const d=studyDate(),yesterday=shiftDay(d,-1),yProgress=goalProgress(yesterday),todayProgress=goalProgress(d);
    const monday=shiftDay(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));
    const dates=Array.from({length:14},(_,i)=>shiftDay(monday,i));
    const subjectGoals=(subject?.professors||[]).flatMap(p=>{
      const groups=unitGroups(p.id);
      return [{key:targetKey('prof',p.id),text:`${p.name} 교수님 전체`,count:(professorCache.get(p.id)?.questions||[]).filter(q=>!q.isPrediction).length},
        ...groups.map(g=>({key:targetKey('unit',p.id,g.id),text:`${p.name} · ${g.title}`,count:g.items.length}))];
    });
    const years=[...new Set((subject?.professors||[]).flatMap(p=>(professorCache.get(p.id)?.questions||[]).filter(q=>!q.isPrediction&&!q.professorOnly&&Number.isFinite(Number(q.year))).map(q=>q.year)))].sort();
    const selected=new Set(day.targets||[]),p=goalProgress(plannerDate);
    const cards=dates.map(date=>{const a=goalProgress(date),event=EXAM_DAYS[date];
      return `<button type="button" class="goal-day ${date===plannerDate?'active':''} ${date===d?'today':''}" data-goal-date="${date}"><span>${date.slice(5)} ${['일','월','화','수','목','금','토'][new Date(date+'T12:00:00Z').getUTCDay()]}</span><strong>${a.total?a.pct+'%':'계획 없음'}</strong>${event?`<small>${esc(event)}</small>`:''}</button>`;}).join('');
    return `<div class="goal-overlay" role="presentation"><section class="goal-dialog" role="dialog" aria-modal="true" aria-label="일일 학습 목표 설정">
      <div class="goal-head"><div><div class="eyebrow">WEEKLY STUDY PLAN</div><h2>학습 목표 설정</h2><p>이번 주와 다음 주, 총 14일의 목표를 설정할 수 있어요.</p></div><button class="icon-btn" data-goal-close aria-label="닫기">✕</button></div>
      <div class="goal-calendar">${cards}</div>
      <div class="goal-overview"><div><b>${plannerDate} · ${esc(EXAM_DAYS[plannerDate]||'오늘의 과제')}</b><small>${p.completed}/${p.total}문제 완료 · 목표에 중복 문항은 한 번만 포함돼요.</small></div><div class="goal-meter"><i style="width:${p.pct}%"></i></div><strong>${p.pct}%</strong></div>
      <div class="goal-controls"><label>계획할 과목 <select id="goal-subject">${catalog.subjects.map(s=>`<option value="${esc(s.id)}" ${subject.id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>
        <div class="goal-pick"><h3>교수님별로 풀기</h3>${subjectGoals.filter(t=>t.key.startsWith('prof|')).map(t=>`<label><input type="checkbox" data-goal-target="${esc(t.key)}" ${selected.has(t.key)?'checked':''}> ${esc(t.text)} <small>${t.count}문항</small></label>`).join('')||'<p>등록된 문항 없음</p>'}</div>
        <div class="goal-pick goal-unit-picker"><h3>단원별로 풀기</h3><p class="goal-unit-hint">교수님을 누르면 해당 단원이 펼쳐져요. 여러 단원을 선택할 수 있어요.</p>${(subject?.professors||[]).map(prof=>{
          const units=unitGroups(prof.id);
          const legacy=(day.targets||[]).filter(k=>k.startsWith('unit|'+prof.id+'|')&&!units.some(u=>k==='unit|'+prof.id+'|'+u.id)).map(k=>{
            const oldId=k.split('|')[2],oldQs=(professorCache.get(prof.id)?.questions||[]).filter(q=>q.legacyUnitId===oldId);
            return {key:k,title:oldQs[0]?.legacyUnitTitle||oldId,count:oldQs.length};
          });
          if(!units.length&&!legacy.length)return '';
          return `<details class="goal-unit-prof" ${[...units.map(g=>targetKey('unit',prof.id,g.id)),...legacy.map(x=>x.key)].some(k=>selected.has(k))?'open':''}><summary><strong>${esc(prof.name)} 교수님</strong><small>${units.length}개 단원</small><span class="goal-unit-chevron" aria-hidden="true">⌄</span></summary><div class="goal-unit-options">${units.map(g=>{const key=targetKey('unit',prof.id,g.id);return `<label><input type="checkbox" data-goal-target="${esc(key)}" ${selected.has(key)?'checked':''}> <span>${esc(g.title)}</span> <small>${g.items.length}문항</small></label>`;}).join('')}${legacy.map(old=>`<label><input type="checkbox" data-goal-target="${esc(old.key)}" checked><span>이전 목표 · ${esc(old.title)}</span><small>${old.count}문항</small></label>`).join('')}</div></details>`;
        }).join('')||'<p>등록된 단원 없음</p>'}</div>
        <div class="goal-pick"><h3>학번별로 풀기</h3>${years.map(year=>{const key=targetKey('year',subject.id,year),n=yearQuestionsForSubject(subject.id,year).items.length;
          return `<label><input type="checkbox" data-goal-target="${esc(key)}" ${selected.has(key)?'checked':''}> ${esc(year)}학번 통합 <small>${n}문항</small></label>`;}).join('')||'<p>등록된 학번 없음</p>'}</div>
      </div>
      <div class="goal-actions"><button class="button" data-goal-save>선택한 목표 저장</button><button class="button secondary" data-goal-start="${plannerDate}" ${p.total?'':'disabled'}>선택 날짜 목표만 풀기</button>
      ${yProgress.total&&yProgress.completed<yProgress.total?`<button class="button secondary" data-goal-start="${yesterday}">전날 하지 못한 과제 마무리하기 (${yProgress.total-yProgress.completed}문제)</button>`:''}
      ${todayProgress.total&&plannerDate!==d?`<button class="button ghost" data-goal-start="${d}">오늘 목표 풀기 →</button>`:''}</div>
    </section></div>`;
  }
  async function openGoalPlanner(date=studyDate()){
    plannerDate=date;
    const d=studyDate(),monday=shiftDay(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));
    const calendarDates=[...Array.from({length:14},(_,i)=>shiftDay(monday,i)),shiftDay(d,-1),date];
    const subjects=new Set([activeGoal(date).subjectId||selectedSubject]);
    for(const day of calendarDates){const g=activeGoal(day);if(g.targets?.length&&g.subjectId)subjects.add(g.subjectId);}
    await Promise.allSettled([...subjects].map(loadGoalSubject));
    document.querySelector('.goal-overlay')?.remove();document.body.insertAdjacentHTML('beforeend',goalPlannerHTML());
  }
  async function startGoalSession(date){
    const g=activeGoal(date);await loadGoalSubject(g.subjectId||selectedSubject);const items=goalQuestionList(g);
    if(!items.length){toast('먼저 목표 문항을 선택해주세요.');return;}
    goalSessionDate=date;studyMode='goal';selectedSubject=g.subjectId||selectedSubject;
    selectedUnitId=null;selectedExamYear=null;currentYear='all';filter='all';reviewFilter='all';
    currentProfessor={professor:{id:'goal:'+date,name:`${date} 학습 목표`,subjectId:selectedSubject,description:'선택한 교수님·단원·학번별 학습 목표'},questions:items};
    currentId=items.find(q=>!goalCompleted(q))?.id||items[0].id;infoExpanded=false;view='quiz';
    document.querySelector('.goal-overlay')?.remove();render();window.scrollTo(0,0);
  }
  // Submitting in the daily goal or any regular mode advances every plan containing
  // the same stable question ID. Target modes receive their own submitted copy,
  // while already submitted answers in other modes are never overwritten.
  function completeGoalQuestion(q,result){
    if(!state.dailyGoals)return;
    for(const [date,g] of Object.entries(state.dailyGoals)){
      if(!g.targets?.length||!goalQuestionList(g).some(item=>item.id===q.id))continue;
      g.done ||= {};g.done[q.id]=new Date().toISOString();g.updatedAt=new Date().toISOString();
      for(const target of g.targets){
        const [kind,a,b]=target.split('|');const matches=kind==='prof'?q.professor===a:
          kind==='unit'?q.professor===a&&unitGroups(a).some(u=>u.id===b&&u.items.some(item=>item.id===q.id)):
          kind==='year'?goalQuestionList({targets:[target]}).some(item=>item.id===q.id):false;
        if(!matches)continue;
        const mode=kind==='year'?'year-exam':kind==='unit'?'unit':'professor';
        if(!record(q,mode).submitted){recordBucket(mode)[q.id]={...result};markRecordChange(q,mode);}
      }
    }
  }
  document.addEventListener('click',async e=>{
    const box=e.target.closest('.goal-overlay');if(!box)return;
    if(e.target===box||e.target.closest('[data-goal-close]')){box.remove();return;}
    const day=e.target.closest('[data-goal-date]');if(day){await openGoalPlanner(day.dataset.goalDate);return;}
    const start=e.target.closest('[data-goal-start]');if(start){await startGoalSession(start.dataset.goalStart);return;}
    const save=e.target.closest('[data-goal-save]');if(save){
      const date=plannerDate,old=activeGoal(date);
      const targets=[...box.querySelectorAll('[data-goal-target]:checked')].map(x=>x.dataset.goalTarget);
      state.dailyGoals[date]={subjectId:box.querySelector('#goal-subject')?.value||selectedSubject,targets,done:old.done||{},updatedAt:new Date().toISOString()};
      saveState();render();await openGoalPlanner(date);toast('학습 목표를 저장했어요.');return;
    }
  });
  document.addEventListener('change',async e=>{
    if(e.target?.id!=='goal-subject')return;
    const date=plannerDate,newSubject=e.target.value;
    const old=activeGoal(date);
    // Changing the displayed subject must not silently delete targets until saved.
    state.dailyGoals[date]={...old,subjectId:newSubject};
    await loadGoalSubject(newSubject);document.querySelector('.goal-overlay')?.remove();
    document.body.insertAdjacentHTML('beforeend',goalPlannerHTML());
  });

  function renderHome() {
    const subs=catalog.subjects;
    const selected=subjectById(selectedSubject);
    const profs=selected?.professors||[];
    const yrs=[...new Set(profs.flatMap(p=>(professorCache.get(p.id)?.questions||[]).filter(q=>!q.isPrediction&&!q.professorOnly && Number.isFinite(Number(q.year))).map(q=>Number(q.year))))].sort((a,b)=>a-b);
    return `<div class="home-selector-layout"><aside class="home-subjects"><div class="eyebrow">SUBJECTS · ${subs.length}</div>
      ${subs.map((s,i)=>`<button class="home-subject ${s.id===selectedSubject?'selected':''}" data-action="subject-home" data-id="${esc(s.id)}"><span class="home-subject-index">0${i+1}</span><span class="home-subject-label"><strong>${esc(s.name)}</strong><small>${s.professors.length?`${s.professors.length}명의 교수님`:'등록 예정'}</small></span><span class="home-subject-arrow">${s.id===selectedSubject?'●':'›'}</span></button>`).join('')}${renderLeaderboardPanel(selectedSubject)}</aside>
      <section class="home-pick-panel"><div class="home-pick-heading"><div><div class="eyebrow">${esc(selected?.name||'')} · SELECT STUDY MODE</div><h2>어떻게 공부할까요?</h2></div><div class="home-pick-tools"><span class="pill blue">${profs.length}명 등록</span><button class="button secondary small" data-action="open-goals">◎ 학습 목표</button><button class="home-today-goal" data-action="open-goals" title="오늘 학습목표 열기">${todayGoalStatusHTML()}</button></div></div>
      <div class="study-mode-tabs" role="tablist" aria-label="문제풀이 방식"><button role="tab" aria-selected="${homeStudyType==='professor'}" class="mode-tab ${homeStudyType==='professor'?'active':''}" data-action="home-mode" data-mode="professor">교수님별로 풀기</button><button role="tab" aria-selected="${homeStudyType==='unit'}" class="mode-tab ${homeStudyType==='unit'?'active':''}" data-action="home-mode" data-mode="unit">단원별로 풀기</button><button role="tab" aria-selected="${homeStudyType==='year'}" class="mode-tab ${homeStudyType==='year'?'active':''}" data-action="home-mode" data-mode="year">학번별로 풀기</button></div>
      ${!profs.length?`<div class="empty home-empty">아직 등록된 문제가 없는 과목입니다.</div>`:
       homeStudyType==='professor'?`<p class="home-pick-hint">교수님을 선택하면 전체 또는 특정 학번 문제를 풀 수 있습니다.</p><div class="home-course-list">${profs.map(p=>courseCard(p)).join('')}${selectedSubject==='hematology-1'&&profs.some(p=>p.id==='lee-kanggyu')?predictionCard():''}</div>`:homeStudyType==='unit'?`<p class="home-pick-hint">교수님을 선택하면 하단에 해당 강의안 주제별 단원이 나타납니다. 단원별 기록은 독립적으로 저장됩니다.</p><div class="home-unit-prof-grid">${profs.filter(p=>!p.professorOnly).map(p=>`<button class="home-unit-prof ${chosenUnitProfessor===p.id?'selected':''}" data-action="choose-unit-professor" data-id="${esc(p.id)}"><strong>${esc(p.name)} 교수님</strong><small>${unitGroups(p.id).length}개 단원</small></button>`).join('')}</div>${chosenUnitProfessor&&profs.some(p=>p.id===chosenUnitProfessor)?`<div class="unit-results-heading"><h3>${esc(profMeta(chosenUnitProfessor).name)} 교수님 단원 선택</h3><small>같은 교수님 전체 학습과는 별도 저장</small></div><div class="home-unit-grid">${unitGroups(chosenUnitProfessor).map(g=>{const a=stats(g.items,'unit');const pct=a.total?Math.round(100*a.completed/a.total):0;return `<button class="unit-card" data-action="start-unit" data-id="${esc(chosenUnitProfessor)}" data-unit="${esc(g.id)}"><strong>${esc(g.title)}</strong><small>${a.completed}/${a.total} 문제 · ${pct}% ${a.completed===a.total&&a.total?'✓':''}</small><span class="progress-track"><span class="progress-fill" style="width:${pct}%"></span></span></button>`}).join('')}</div>`:''}`:
       `<p class="home-pick-hint">해당 학번의 모든 교수님 기출을 통합하여 풉니다. 완료하면 시험 결과를 확인할 수 있습니다.</p><div class="home-year-list">${yrs.map(year=>{const r=yearQuestionsForSubject(selectedSubject,year);const s=stats(r.items,'year-exam');const pct=s.total?Math.round(s.completed/s.total*100):0;const leaderboardBadge=String(year)==='22'?'<span class="year-special-badge">Leaderboard</span>':'';return `<button class="home-year-card ${s.total&&s.completed===s.total?'complete':s.completed?'partial':''}" data-action="start-year-exam" data-year="${year}" ${s.total?'':'disabled'}><span class="home-year-label"><strong>${year}학번 통합 기출 ${leaderboardBadge}</strong><small>${s.total}문항 · ${s.completed}문항 풀이 완료</small></span><span class="home-year-right"><strong>${pct}%${s.total&&s.completed===s.total?' ✓':''}</strong><span>${s.total?'시험 시작 →':'문항 없음'}</span></span><span class="home-year-progress"><i style="width:${pct}%"></i></span></button>`}).join('')}</div>`}
      <p class="home-disclaimer">학습 기록은 브라우저에 자동 저장됩니다. 교수님별·단원별·학번별·AI 예상문제의 제출 답안과 북마크는 모두 독립 저장됩니다.</p></section></div>`;
  }
  function courseCard(p) {
    const data=professorCache.get(p.id);
    const s=professorCourseStats(p,data);
    const pct=s.total?Math.round(s.completed/s.total*100):0;
    return `<button class="course-card" data-action="professor" data-id="${esc(p.id)}"><div class="course-big-icon">${esc(p.name.slice(0,1))}</div><div class="course-main"><h3>${esc(p.displayName||`${p.name} 교수님`)} ${statusDot(professorCourseStage(p,data))}</h3><p>${s.total}문제 · ${s.unresolved}문항 정답 검토 필요</p><div class="progress-track"><div class="progress-fill ${s.total&&s.completed>=s.total?'done':''}" style="width:${pct}%"></div></div></div><div class="course-right"><strong>${pct}%</strong>${s.completed} / ${s.total} 완료</div></button>`;
  }
  function predictionCard(){
    const data=professorCache.get('lee-kanggyu');
    const items=(data?.questions||[]).filter(q=>q.isPrediction);
    const a=stats(items,'prediction');const pct=a.total?Math.round(a.completed/a.total*100):0;
    return `<button class="prediction-home-card" data-action="start-predictions"><strong>✦ 이강규 교수님 AI 예상문제 25제</strong><small>기출·학번별 시험과 분리 · ${a.completed}/${a.total||25} 풀이 완료 · ${pct}% →</small><span class="progress-track"><i class="progress-fill" style="width:${pct}%"></i></span></button>`;
  }
  function renderCourseHeader() {
    if(studyMode==='goal'){const s=stats(questions()),gp=goalProgress(goalSessionDate||studyDate());return `<div class="course-header compact-course-header"><div class="course-identity"><div class="eyebrow">DAILY STUDY GOAL</div><h1>${esc(goalSessionDate||studyDate())} 학습 목표</h1><p>${s.completed}/${s.total}문항 완료 · 선택한 교수님·단원·학번 중복 제외</p></div><div class="course-header-right"><div class="header-pills"><span class="pill blue">${s.total}문항</span><span class="pill ok">${gp.pct}% 달성</span><button class="button secondary small" data-action="open-goals">목표 편집</button></div></div></div>`;}
    if(studyMode==='year-exam')return renderYearHeader();
    const l=questions();const s=stats(l);const pending=l.filter(q=>effectiveAnswer(q)==null).length;
    const verified=l.filter(q=>q.validation?.stage==='accepted').length;
    const manual=l.filter(q=>q.validation?.stage==='user_confirmed').length;
    const percentage=s.total ? Math.round(s.completed/s.total*100) : 0;
    const subjectTitle=({ 'hematology-1':'HEMATOLOGY I', 'hematology-2':'HEMATOLOGY II', 'maternal-newborn':'MATERNAL · NEWBORN', 'growth-aging':'GROWTH · AGING' })[currentProfessor.professor.subjectId]||'MEDICAL';
    return `<div class="course-header compact-course-header"><div class="course-identity"><div class="eyebrow">${studyMode==='prediction'?'AI GENERATED PRACTICE · NOT PAST EXAMS':esc(subjectTitle)+' · EXAM LIBRARY'}</div><div class="course-title-line"><h1>${esc(currentProfessor.professor.name)}${['prediction','unit','year-exam'].includes(studyMode)?'':' 교수님'}</h1><p>${esc(currentProfessor.professor.description||'교수님별 기출 문제')} &nbsp; / &nbsp; 연도별 또는 전체 문항 풀이</p></div></div>
      <div class="course-header-right"><div class="header-pills"><span class="pill blue">${s.total}문제</span><span class="pill ok">근거 검증 ${verified}건</span>${manual?`<span class="pill blue">정답 확인 ${manual}건</span>`:''}<button type="button" class="pill warn unresolved-button" data-action="nav-unresolved">미확정 ${pending}건</button><button class="button secondary small" data-action="open-review">Review ↗</button></div>
      <div class="header-study-controls"><div class="study-progress" aria-label="${esc(currentProfessor.professor.name)} 교수님 학습 진행률 ${percentage}%"><span>진행률</span><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}" aria-label="교수님별 진행률"><div class="progress-fill ${s.total&&s.completed===s.total?'done':''}" style="width:${percentage}%"></div></div><strong>${percentage}%</strong></div>
        <button class="study-reset" data-action="${studyMode==='unit'?'reset-unit':'reset-professor'}" title="${esc(currentProfessor.professor.name)} ${studyMode==='unit'?'단원':'교수님'} 기록만 초기화 · 다른 교수님 기록 유지" aria-label="${esc(currentProfessor.professor.name)} 교수님 학습 기록 초기화">↺ <span>기록 초기화</span></button></div></div>
    </div>`;
  }
  function years() {return [...new Set(questions().map(q=>q.year))].sort((a,b)=>yearSortValue(a)-yearSortValue(b));}
  function renderFilterbar() {
    if(studyMode==='goal')return `<div class="filterbar"><div class="year-chips"><span class="pill blue">선택한 목표 문제만</span><span class="fine">${questions().length}문항</span></div><div class="filter-actions"><select class="select" data-action="number-select" aria-label="학습 목표 문제 선택">${questions().map(q=>`<option value="${esc(q.id)}" ${currentQuestion()?.id===q.id?'selected':''}>${esc(q.label)} · ${esc(yearExamTeacherLabel(q.professor))}</option>`).join('')}</select></div></div>`;
    if(studyMode==='year-exam'){const q=scopedQuestions();return `<div class="filterbar year-exam-filterbar"><div class="year-chips"><span class="pill blue">${esc(yearName(selectedExamYear))} 전체</span><span class="fine">${q.length}문항 · 중복번호 ${examDuplicateLabels.length}건 통합</span></div><div class="filter-actions"><button class="chip ${filter==='wrong'?'active':''}" data-action="filter" data-filter="wrong">↺ 오답만</button><select class="select" data-action="number-select" aria-label="학번별 문제 선택">${q.map(item=>`<option value="${esc(item.id)}" ${currentQuestion()?.id===item.id?'selected':''}>${esc(item.label)} · ${esc(yearExamTeacherLabel(item.professor))} · ${submission(item)?'풀이완료':'미완료'}</option>`).join('')}</select></div></div>`;}
    const q=scopedQuestions();
    return `<div class="filterbar"><div class="year-chips"><button class="chip ${currentYear==='all'?'active':''}" data-action="year" data-year="all">전체 <span class="count">${questions().length}</span>${stage(questions())==='complete'?'<span class="check">✓</span>':''}</button>${years().map(y=>{const yy=questions().filter(q=>q.year===y);return `<button class="chip ${currentYear===String(y)?'active':''}" data-action="year" data-year="${y}">${esc(yearName(y))} <span class="count">${yy.length}</span>${stage(yy)==='complete'?'<span class="check">✓</span>':''}</button>`}).join('')}</div>
      <div class="filter-actions"><button class="chip ${filter==='bookmarked'?'active':''}" data-action="filter" data-filter="bookmarked">☆ 북마크</button><button class="chip ${filter==='wrong'?'active':''}" data-action="filter" data-filter="wrong">↺ 오답만</button><select class="select" data-action="number-select" aria-label="문제 번호 선택">${q.length?q.map(item=>`<option value="${esc(item.id)}" ${currentQuestion()?.id===item.id?'selected':''}>${esc(item.label)} · ${submission(item)?'풀이완료':'미완료'}</option>`).join(''):'<option>해당 문항 없음</option>'}</select></div></div>`;
  }
  function renderQuiz() {
    if(!currentProfessor)return `<div class="empty">교수님을 선택해주세요.</div>`;
    const l=questions();const qs=scopedQuestions();const q=currentQuestion();const s=stats(l);
    syncExplanation(q);
    return `${renderCourseHeader()}${studyMode==='prediction'?'<div class="prediction-notice">✦ AI가 강의안을 바탕으로 작성한 연습문제입니다. <b>실제 기출·교수님 출제 예고가 아니며 학번별 시험에는 포함되지 않습니다.</b></div>':''}${renderFilterbar()}
    ${q?`<div class="exam-layout">${renderQuestionPanel(q,qs)}<div class="divider-grip fixed-divider" aria-hidden="true"></div>${infoExpanded?renderEvidencePanel(q):renderEvidenceClosed()}</div>${renderQuizDock(q,qs)}`:`<div class="empty"><p>조건에 맞는 문제가 없습니다.</p><button class="button secondary small" data-action="clear-filter">전체 문제로 돌아가기</button></div>`}
    <p class="help-text">정답 검토 필요 문항은 사용자가 정답을 지정하기 전까지 정오답 통계에 포함되지 않습니다. 학습 기록과 북마크는 이 브라우저에만 저장됩니다.</p>`;
  }
  // Separate desktop action dock: navigation and submit stay on screen for long questions.
  // Mobile retains the original in-card actions and page scrolling.
  function renderQuizDock(q,scope) {
    const index=scope.findIndex(x=>x.id===q.id);
    const r=record(q);
    const ready=q.archiveUnrecovered || (q.type==='short'?!!String(r.selected||'').trim():!!(Array.isArray(r.selected)?r.selected.length:r.selected));
    return `<div class="quiz-dock" role="group" aria-label="문제 이동 및 답안 제출">
      <div class="dock-position"><span class="dock-heading">NOW STUDYING</span><strong>${esc(q.label)}</strong><span>${index+1} / ${scope.length}</span></div>
      <div class="dock-controls"><button class="button secondary small dock-nav" data-action="step" data-direction="-1" ${index===0?'disabled':''}>← 이전 문제</button><button class="button secondary small dock-nav" data-action="step" data-direction="1" ${index===scope.length-1?'disabled':''}>다음 문제 →</button>
      ${restoringReview?'<button class="button ghost small" data-action="back-review">← Review</button>':''}${studyMode==='year-exam'&&(index===scope.length-1||stats(scope).completed===scope.length)?'<button class="button secondary small" data-action="open-review">시험 결과 보기 ↗</button>':''}
      <button class="button dock-submit ${r.submitted?'secondary':''}" data-action="submit" ${ready?'':'disabled'}>${q.archiveUnrecovered?'미복원 확인 완료':hasSubmittedBefore(q)?'다시 제출':'답안 제출'} ✓</button></div>
    </div>`;
  }
  function renderEvidenceClosed() {
    return `<aside class="evidence-placeholder" aria-label="해설창 닫힘">
      <div class="closed-evidence-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="10" width="13" height="10.5" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/></svg></div>
      <div class="evidence-kicker">EXPLANATION LOCKED</div>
      <h3>아직 문제를 풀지 않았습니다.</h3>
      <p>답안을 제출하면 정답과 해설, 검증된 강의안 원본을 이곳에서 확인할 수 있습니다.</p>
      <button class="button ghost small" data-action="toggle-evidence">해설 직접 열기 ↗</button>
    </aside>`;
  }
  // Real exam figures are displayed *inside the question*, not hidden behind
  // the collapsible full-source screenshot. Original images are never AI-generated.
  // New professors can use figureImages: [{src,alt,caption}, ...] in JSON.
  function renderInlineQuestionFigures(q) {
    const files=Array.isArray(q.figureImages)?q.figureImages:
      q.figureImage?[{src:q.figureImage,alt:q.figureAlt,caption:q.figureCaption}]:[];
    const figures=files.filter(item=>item && (item.src||item.image));
    if (!figures.length) return '';
    return `<div class="inline-question-figures" aria-label="문제 원본 그림">
      ${figures.map((f,i)=>`<figure class="question-figure">
        <img class="question-figure-img" src="${esc(f.src||f.image)}" alt="${esc(f.alt||q.label+'번 기출문제 원본 그림 '+(i+1))}" loading="eager" decoding="async" data-action="zoom" data-caption="${esc(f.caption||q.label+'번 기출 원본 그림')}" />
        <figcaption>${esc(f.caption||'기출 원본 이미지')}</figcaption>
      </figure>`).join('')}
    </div>`;
  }
  function renderQuestionPanel(q,scope) {
    const curr=scope.findIndex(x=>x.id===q.id);const r=record(q);const grading=evaluation(q);
    const checked=Array.isArray(r.selected)?r.selected:r.selected?[r.selected]:[];
    const answer=effectiveAnswer(q);const answers=answer==null?[]:Array.isArray(answer)?answer:[answer];
    const maxSelection=Number(q.maxSelections)||1;
    // This badge is a concise display label only. The underlying validation stage,
    // pending/manual grading decisions, and evidence remain unchanged.
    const status=q.validation?.stage||'pending';
    const ungradedArchive=!!q.archivePdf && (status==='pending'||q.archiveUnrecovered);
    const verifiedLabel=!!q.archivePdf ? !ungradedArchive :
      (status==='accepted'||status==='exam_answer_key'||
       (status==='user_confirmed'&&q.validation?.supplemental2026?.status==='conflict'));
    const verifiedDisplay=q.lectureAudit?lectureAuditLabel(q):q.isPrediction?'✦ AI 예상문제 · 강의안 기반':
      ungradedArchive?'! 정답 판정 보류':verifiedLabel?'✓ 검증 완료':
      status==='highlight_reviewed'?'✓ 정답 확인':
      status==='user_confirmed'&&q.validation?.supplemental2026?.status==='match'?'✓ 정답 확인 · 2026 강의안 비교':
      status==='user_confirmed'?'✓ 정답 확인':'! 정답 검토 필요';
    const validationPillClass=q.lectureAudit?(q.lectureAudit.status==='matched'?'ok':'warn'):q.isPrediction?'blue':
      (ungradedArchive||status==='pending'?'warn':'ok');
    return `<section class="exam-panel" data-question-id="${esc(q.id)}"><div class="question-header">
      <div class="question-heading-line"><div class="question-heading-text"><div class="question-id">${studyMode==='year-exam'?esc(yearExamTeacherLabel(q.professor))+' 교수님 · ':''}QUESTION / ${esc(q.label)}</div><h2 class="question-num">${esc(q.label)} <span class="question-index">${curr+1} / ${scope.length}</span></h2></div>${matchMedia('(max-width:760px)').matches?'':(window.HeonInk?.controls(q.id)||'')}</div>
      <div class="question-info-line"><div class="question-meta"><span class="pill ${validationPillClass}">${verifiedDisplay}</span><span class="pill">${esc(yearName(q.year))}</span>${submission(q)?`<span class="pill blue">제출 완료</span>`:''}</div>
      <div class="question-head-actions"><button class="bookmark" data-action="bookmark" data-id="${esc(q.id)}" title="북마크" aria-pressed="${isBookmark(q)}">${isBookmark(q)?'★':'☆'}</button><button class="icon-btn report-question-btn" data-action="report-popup" data-question-id="${esc(q.id)}" title="문항 번호·설명·이미지를 첨부해 오류 제보" aria-label="${esc(q.label)}번 문제 오류 제보하기">✎ 제보하기</button><button class="icon-btn" data-action="toggle-evidence">${infoExpanded?'해설 접기':'해설 열기'}</button></div></div></div>
      <div class="prompt">${esc(formatPrompt(q.prompt||'원본 이미지에서 문제 본문을 확인하세요.'))}</div>
      ${renderInlineQuestionFigures(q)}
      ${q.type==='short'?`<label class="muted" for="short-answer">주관식 답안</label><textarea class="short-input" id="short-answer" data-question="${esc(q.id)}" placeholder="답안을 입력하세요. 입력하는 즉시 저장됩니다.">${esc(typeof r.selected==='string'?r.selected:'')}</textarea>`:
      q.choices?.length?`<div class="options">${q.choices.map(ch=>{const selected=checked.includes(ch.number);const correct=submission(q)&&answer!=null&&answers.includes(ch.number);const wrong=submission(q)&&selected&&!answers.includes(ch.number)&&answer!=null;return `<button class="option ${selected?'selected':''} ${correct?'correct-choice':''} ${wrong?'wrong-choice':''}" data-action="choose" data-number="${ch.number}" aria-pressed="${selected}"><span class="option-letter">${circles[ch.number-1]||ch.number}</span><span class="option-text">${esc(ch.text)}</span>${correct?'<span class="option-flag">정답</span>':wrong?'<span class="option-flag">선택 오답</span>':''}</button>`}).join('')}</div>${maxSelection>1?`<p class="help-text">이 문항은 정답 ${maxSelection}개를 선택합니다.</p>`:''}`:
      q.archiveUnrecovered?`<p class="review-note">제공 PDF에서 해당 문항이 미복원으로 표시되어 있습니다. 문제와 보기를 임의로 만들지 않았습니다.</p>`:
      `<p class="review-note">텍스트 선택지의 판독이 불완전합니다. 아래 원본에서 선택지 번호와 문장을 확인한 후 답 번호를 선택하세요.</p><div class="options">${circles.map((v,i)=>`<button class="option ${checked.includes(i+1)?'selected':''} ${submission(q)&&answer!=null&&answers.includes(i+1)?'correct-choice':''}" data-action="choose" data-number="${i+1}"><span class="option-letter">${v}</span><span class="option-text">${i+1}번 선택지 — 원본 캡처 확인</span></button>`).join('')}</div>`}
      ${renderResult(q,grading)}
      ${q.source?.image?`<details class="source-card"><summary>기출 원본 이미지 보기 · ${esc(q.source.name)}${q.source.page?' · PDF '+q.source.page+'페이지':''}</summary><img class="source-image" src="${esc(q.source.image)}" alt="${esc(q.label)} 기출 원본 캡처" loading="lazy" data-action="zoom" data-caption="${esc(q.source.name)}${q.source.page?' · PDF '+q.source.page+'페이지':''}"><p class="source-warning">기출 원본에는 기존 필기와 정답 표기가 포함되어 있을 수 있습니다. 채점 기준과 해설은 오른쪽 정답 근거 영역에서 확인할 수 있습니다.</p>${q.transcriptionWarning?`<p class="source-warning">${esc(q.transcriptionWarning)}</p>`:''}</details>`:`<div class="review-note" style="margin-top:15px">기출 원본 파일의 별도 이미지가 제공되지 않았습니다. 문제와 선택지는 사용자가 제공한 원문을 기준으로 입력했습니다.</div>`}
      <div class="question-footer"><div class="quiz-actions"><div class="row"><button class="button secondary small" data-action="step" data-direction="-1" ${curr<=0?'disabled':''}>← 이전</button><button class="button secondary small" data-action="step" data-direction="1" ${curr===scope.length-1?'disabled':''}>다음 →</button></div><div class="row">${restoringReview?'<button class="button ghost small" data-action="back-review">← Review</button>':''}<button class="button ${r.submitted?'secondary':''}" data-action="submit" ${q.archiveUnrecovered?'':q.type==='short'?(!String(r.selected||'').trim()?'disabled':''):(!checked.length?'disabled':'')}>${q.archiveUnrecovered?'미복원 확인 완료':hasSubmittedBefore(q)?'다시 제출':'답안 제출'} &nbsp; ✓</button></div></div>${saysAllCompleted()?`<div class="result-box correct"><b>전체 문항 풀이가 완료되었습니다.</b><p>정답 검토 필요 문항을 제외한 결과는 Review에서 확인할 수 있습니다.</p><button class="button small review-button" data-action="open-review" style="margin-top:11px">최종 Review 열기 →</button></div>`:''}</div>
    </section>`;
  }
  function saysAllCompleted() {const s=stats(questions());return !!s.total&&s.completed===s.total;}
  function renderResult(q,grade) {
    if(!submission(q))return '';
    const label=q.archiveUnrecovered?'미복원 문항 · 확인 완료':grade==='correct'?'정답입니다':grade==='wrong'?'오답입니다':q.gradingMode==='manual'?'채점 보류 · 서술형 수동 채점':'채점 보류 · 정답 미확정';
    const description=q.lectureAudit?.gradingHold?'문항 또는 근거의 충돌로 자동채점을 보류했습니다. 해설에서 검토 사유를 확인하세요.':q.archiveUnrecovered?'원문에 문제·선택지가 복원되지 않아 채점하지 않습니다.':grade==='pending'?(q.gradingMode==='manual'?'강의안 모범답안과 비교할 수 있지만 서술형은 문자열 자동 채점하지 않습니다.':'강의안에서 정답을 확정하지 못했습니다. 해설창을 열고 직접 지정할 수 있습니다.'):grade==='correct'?'제출한 선택지가 현재 확정된 정답과 일치합니다.':q.validation?.stage==='user_confirmed'?'정답과 다른 답안을 선택했습니다.':'강의안에 근거한 정답과 다른 답안을 선택했습니다.';
    return `<div class="result-box ${grade==='not-started'?'':grade}"><b>${label}</b><p>${description}</p></div>`;
  }
  // Additional images supplied with a correction report. They are learning
  // references and are not promoted to verified lecture evidence without an
  // identified original file and page number.
  function renderExplanationImages(q) {
    const images=(q.explanationImages||[]).filter(item=>item.src||item.image);
    if(!images.length)return '';
    return `<section class="supplemental-explanation-images"><div class="section-head"><h4 class="section-title" style="font-size:14px">추가 해설 참고 이미지</h4><span class="fine">사용자 제공 · 출처 확인 전</span></div>${images.map(item=>`<article class="evidence-item"><div class="evidence-meta"><p class="file-name">${esc(item.caption||'사용자 제공 해설 참고 이미지')}</p></div><img class="evidence-image" src="${esc(item.src||item.image)}" alt="${esc(item.alt||'해설 참고 이미지')}" loading="lazy" data-action="zoom" data-caption="${esc(item.caption||'해설 참고 이미지')}"><div class="zoom-label">이미지를 누르면 확대됩니다 ⤢</div></article>`).join('')}</section>`;
  }
  // PDF archive: display the supplied explanation as text, and the embedded
  // *lecture image only* as image evidence. Do not repeat the full answer pane screenshot.
  function renderPdfArchiveEvidence(q) {
    const meta=q.archivePdf;
    const pending=q.validation?.stage==='pending';
    const choices=Object.entries(q.choiceExplanations||{}).map(([n,t])=>
      `<div class="archive-choice-reason"><p><b>${esc(circles[Number(n)-1]||n)}</b> ${esc(t)}</p></div>`).join('');
    const refs=meta.lectureReferences||[];
    const lectures=meta.lectureImages||[];
    const evidences=lectures.map((fig,i)=>`<article class="evidence-item archive-lecture-item">
      <img class="evidence-image" src="${esc(fig.src)}" alt="${esc(fig.alt||'PDF 원본 강의안 부분 발췌')}" loading="lazy" data-action="zoom" data-caption="홍기연 22학번 · PDF ${meta.pdfPage}페이지 · 강의안 근거 ${i+1}"/>
      <div class="zoom-label">이미지를 누르면 확대됩니다 ⤢</div></article>`).join('');
    return `<aside class="evidence-panel pdf-archive-evidence"><div class="evidence-head"><div><div class="evidence-kicker">USER-PROVIDED PDF · v1.3</div><h3>원문 정답 및 해설</h3></div><button class="icon-btn" data-action="toggle-evidence" title="해설 접기">✕</button></div>
      <div class="question-meta" style="margin-top:12px"><span class="pill ${pending?'warn':'blue'}">${pending?'⚠ PDF 원문에서 판정 보류':'● 제공 PDF에 수록된 답안'}</span><span class="pill">22학번 · 홍기연</span></div>
      <div class="result-box ${pending?'pending':'correct'}"><b>PDF 원문 답안 · ${esc(meta.answerText||'판정 불가')}</b>${pending?'<p>PDF에 명시된 판정 유보 상태를 그대로 유지합니다.</p>':''}</div>
      ${q.explanation?`<p class="evidence-explanation">${esc(q.explanation)}</p>`:''}
      ${lectures.length?`<section class="archive-lecture-section"><h4>정답의 강의안 근거</h4>${evidences}${refs.map(v=>`<p class="file-name">${esc(v)}</p>`).join('')}</section>`:''}
      ${choices?`<section class="choice-reason-list archive-choice-list"><h4>나머지 보기 · PDF 원문 정정</h4>${choices}</section>`:''}
      <p class="help-text"><a href="${esc(meta.pdfFile)}" target="_blank" rel="noopener">전체 원본 PDF 열기 ↗</a></p>
    </aside>`;
  }
  function lectureAuditLabel(q) {
    if(q.answerConfirmation?.status==='confirmed')return q.answerConfirmation.basis==='user_kmle'?'✓ 정답 확정 · KMLE 기출 (사용자 확인)':'✓ 정답 채택 · 근거와 한계 확인';
    return {matched:'✓ 검증 완료',owner:'운영자 지정 답안',partial:'◐ 관련 근거 확인 · 일부 검토 필요',missing:'! 같은 교수님 강의안 근거 미확보',unresolved:'! 정답 미확정 · 채점 보류',conflict:'! 문항·정답 충돌 · 채점 보류'}[q.lectureAudit?.status]||'근거 재검토';
  }
  function lecturePageLabel(e) {
    if(e.sourceType==='user_supplied_image')return '사용자 제공 강의안 이미지';
    return `${e.pageBasis?.startsWith('단원')?'단원':'PDF'} ${e.page}쪽`;
  }
  function auditAnswerText(q,answer) {
    if(answer==null)return '미확정';
    if(q.type==='short')return (Array.isArray(answer)?answer:[answer]).join(' / ');
    return (Array.isArray(answer)?answer:[answer]).map(n=>`${circles[n-1]||n} ${q.choices?.find(c=>c.number===n)?.text||''}`).join(' / ');
  }
  function renderLectureAudit(q) {
    const audit=q.lectureAudit, answer=effectiveAnswer(q), refs=q.evidence||[];
    const matched=audit.status==='matched';
    const custom=q.answerConfirmation?.status!=='confirmed'&&!q.answerKey&&!audit.answerRevised&&!audit.gradingHold&&Object.prototype.hasOwnProperty.call(state.customAnswers,q.id);
    const title=q.type==='short'?'참고답안 · 서술형 수동 채점':q.answerConfirmation?.status==='confirmed'?(q.answerConfirmation.basis==='user_kmle'?'확정 정답 · 해당 연도 KMLE 답안':'채택 정답 · 재검토 결과'):custom?'내가 지정한 답안':matched?'강의안 대조 정답':'기존 답안 · 강의안 검증 제한';
    const prior=audit.referenceAnswer!=null && (audit.gradingHold||audit.answerRevised);
    const explain=q.explanation||audit.reason;
    return `<aside class="evidence-panel"><div class="evidence-head"><div><div class="evidence-kicker">EVIDENCE & EXPLANATION</div><h3>정답 근거 및 해설</h3></div><button class="icon-btn" data-action="toggle-evidence" title="해설 접기">✕</button></div>
      <div class="question-meta" style="margin-top:12px"><span class="pill ${matched?'ok':'warn'}">${esc(lectureAuditLabel(q))}</span>${q.type==='short'?'<span class="pill blue">채점 보류 · 서술형 수동 채점</span>':''}</div>
      ${answer!=null?`<div class="result-box ${matched&&!custom?'correct':'pending'}"><b>${esc(title)}</b><p>${esc(auditAnswerText(q,answer))}</p></div>`:'<div class="review-note">정답 미확정 · 이 문항은 자동으로 정답·오답을 판정하지 않습니다.</div>'}
      ${q.explanationNotice?`<p class="review-note">${esc(q.explanationNotice)}</p>`:''}
      ${q.explanation?`<p class="evidence-explanation">${esc(q.explanation)}</p>`:''}
      ${audit.limitations&&audit.limitations!==explain?`<p class="review-note"><b>근거의 한계</b> · ${esc(audit.limitations)}</p>`:''}
      ${audit.reason&&audit.reason!==explain&&audit.reason!==audit.limitations&&!audit.reason.startsWith('같은 교수님 강의안')?`<p class="review-note">${esc(audit.reason)}</p>`:''}
      ${prior?`<details class="source-card"><summary>${audit.gradingHold?'이전 답안 기록 (채점에 사용하지 않음)':'정답 변경 기록'}</summary><p>이전: ${esc(auditAnswerText(q,audit.referenceAnswer))}</p>${audit.answerRevised?`<p>재검토: ${esc(auditAnswerText(q,q.answer))}</p>`:''}</details>`:''}
      ${q.reconstruction?`<details class="source-card"><summary>임의복원 전 선택지 확인</summary><p>${esc(q.reconstruction.notice)}</p>${q.reconstruction.originalChoices.map(c=>`<p>${esc(c.number)}. ${esc(c.text)}</p>`).join('')}</details>`:''}
      ${(q.externalEvidence||[]).map(e=>`<p class="review-note">외부 보완근거 · <a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">자료 열기 ↗</a> (강의안 직접 근거와 구분)</p>`).join('')}
      ${choiceReasonList(q)}${renderExplanationImages(q)}
      ${(q.annualSources||[]).map(a=>`<details class="source-card"><summary>${esc(a.file.includes('수정사항')?'교수님 수정사항':'해당 연도 해설·복원자료')} · PDF ${esc(a.page)}쪽</summary><p class="file-name">${esc(a.file)}</p><p class="fine">당시 해설 원문입니다. 오류·정정 내용은 위 재검토 해설을 함께 확인하세요.</p><img class="source-image" src="${esc(a.image)}" alt="${esc(a.file)} PDF ${esc(a.page)}쪽" loading="lazy" data-action="zoom" data-caption="${esc(a.file)} · PDF ${esc(a.page)}쪽"></details>`).join('')}
      <div class="section-head"><h4 class="section-title" style="font-size:14px">${matched?'확인한 강의안 원본':'검토한 강의안 원본'}</h4><span class="fine">${refs.length}페이지</span></div>
      ${refs.map(e=>`<article class="evidence-item"><div class="evidence-meta"><div class="lecture-source-line"><span class="file-page">${esc(lecturePageLabel(e))}${e.lectureYear?' · '+esc(e.lectureYear)+'년':''}</span><span class="file-name">${esc(e.file)}</span></div></div><img class="evidence-image" src="${esc(e.image)}" alt="${esc(e.lectureTitle)} · ${esc(lecturePageLabel(e))}" loading="lazy" data-action="zoom" data-caption="${esc(e.file)} · ${esc(lecturePageLabel(e))}"><div class="zoom-label">이미지를 누르면 확대됩니다 ⤢</div></article>`).join('')||'<div class="empty" style="padding:21px">첨부된 같은 교수님 자료에서 직접 근거를 확보하지 못했습니다.</div>'}
      ${q.answerKey?.image?`<details class="source-card exam-answer-key"><summary>기출 공식 정답표 원본 · 강의안 검토와 구분</summary><img class="source-image" src="${esc(q.answerKey.image)}" alt="기출 공식 정답표" loading="lazy" data-action="zoom" data-caption="기출 공식 정답표"></details>`:''}
      ${q.answerConfirmation?.status!=='confirmed'&&!q.answerKey&&!audit.gradingHold&&!audit.answerRevised&&!matched?`<section class="user-answer"><h4>직접 정답 지정</h4><p>개인 지정 답안은 강의안 검증 결과와 별개입니다.${q.type==='short'?' 주관식은 지정해도 수동채점을 유지합니다.':''}</p>${q.type==='short'?`<input class="search" id="custom-short" type="text" placeholder="참고답안 입력" value="${esc(custom?String(answer):'')}" style="width:100%;margin-bottom:8px"><button class="button small secondary" data-action="save-custom-short">정답 저장</button>`:`<div class="custom-answers">${(q.choices||[]).map(c=>`<button class="number-pill ${(Array.isArray(answer)?answer:[answer]).includes(c.number)?'active':''}" data-action="custom-answer" data-number="${c.number}">${circles[c.number-1]||c.number}</button>`).join('')}</div><label class="fine"><input type="checkbox" data-action="custom-multi" ${state.customMulti[q.id]?'checked':''}> 복수 정답 지정</label>`}${custom?'<button class="button ghost tiny" data-action="remove-custom">내 지정 정답 해제</button>':''}</section>`:''}
      <details class="question-audit-history"><summary>재검토 기록 · ${esc(audit.version)}</summary><p>1차: 같은 교수님·단원·연도·근거 위치 대조. 2차: 선택지와 정답·전사 및 근거의 충분성 재검토.</p><p>동일 AI가 두 차례 검토했습니다. 부분 근거나 충돌이 남은 문항은 검증 완료로 표시하지 않습니다.</p></details>
    </aside>`;
  }

  function renderEvidencePanel(q) {
    if(q.lectureAudit)return renderLectureAudit(q);
    if(q.archivePdf)return renderPdfArchiveEvidence(q);
    const accepted=q.validation.stage==='accepted';const officialKey=q.validation.stage==='exam_answer_key';const highlighted=q.validation.stage==='highlight_reviewed';const userConfirmed=q.validation.stage==='user_confirmed';const ans=effectiveAnswer(q);const audit2026=q.validation?.supplemental2026;const sourceMatch2026=userConfirmed&&audit2026?.status==='match';
    const usedCustom=Object.prototype.hasOwnProperty.call(state.customAnswers,q.id);
    const userEvidence=Array.isArray(q.evidence)&&q.evidence.length>0;
    const refs=(accepted||sourceMatch2026||userConfirmed&&userEvidence)?q.evidence:q.candidateEvidence||[];
    const confirmed=(accepted||sourceMatch2026)&&!usedCustom;const userDesignated=userConfirmed||usedCustom;const originalAccepted=accepted&&!usedCustom;
    const answerText=(a)=>q.type==='short'?String(a):[...(Array.isArray(a)?a:[a])].map(n=>{
      const item=q.choices.find(c=>c.number===n);return `${circles[n-1]||n} ${item?item.text:''}`;
    }).join(' / ');
    return `<aside class="evidence-panel"><div class="evidence-head"><div><div class="evidence-kicker">EVIDENCE & EXPLANATION</div><h3>정답 근거 및 해설</h3></div><button class="icon-btn" data-action="toggle-evidence" title="해설 접기">✕</button></div>
      <div class="question-meta" style="margin-top:12px">${confirmed?(sourceMatch2026?'<span class="pill ok">✓ 2026 강의안 대조 완료</span>':'<span class="pill ok">✓ 1차 원문 확인</span><span class="pill ok">✓ 2차 보기 검증</span>'):audit2026?.status==='conflict'?'<span class="pill ok">✓ 정답 확인 · 강의안 내용 비교 필요</span>':audit2026?.status==='partial'?'<span class="pill ok">✓ 정답 확인 · 관련 강의안 참고</span>':userDesignated?'<span class="pill ok">✓ 정답 확인</span>':highlighted?'<span class="pill ok">✓ 기출·해설 정답 확인</span>':officialKey?'<span class="pill blue">● 22학번 시험지 정답표 확인 · 강의안 근거 별도</span>':'<span class="pill warn">! 근거 미채택</span>'}</div>
      ${ans!=null?`<div class="result-box ${confirmed||userDesignated||highlighted||officialKey?'correct':'pending'}"><b>${userDesignated?'정답':officialKey?'시험 정답표':highlighted?'정답':'강의안 검증 정답'} · ${esc(answerText(ans))}</b><p>${userDesignated?(usedCustom?'현재 정답 기준으로 채점하며, 직접 변경한 답은 이 브라우저에 저장됩니다.':sourceMatch2026?'2026년 강의안의 관련 내용을 다시 확인했습니다.':'아래 강의안과 선택지별 해설을 함께 확인하세요.'):officialKey?'22학번 시험지의 공식 정답표에 기재된 답안입니다.':highlighted?'기출 원본과 별도 해설의 정답 표시를 비교했습니다.':'강의안 원문을 대조해 채택한 답안입니다.'}</p></div>`:
      '<div class="review-note">정답 검토 필요: 강의안에서 확실한 정답 근거를 확인하지 못하여 정답을 지정하지 않았습니다.</div>'}
      ${studyAiExplanation(q)?`<div class="ai-study-explanation"><b>✦ AI 학습 해설 · 강의안 검증 근거와 구분</b><p>${esc(studyAiExplanation(q))}</p></div>`:''}${q.explanation?`<p class="evidence-explanation">${!accepted&&!sourceMatch2026?'<b>'+(officialKey?'22학번 시험지 정답표 기준 · 강의안 검증과 구분':highlighted?'형광펜·별도 해설 대조 · 강의안 검증과 구분':userConfirmed?'선택지 및 근거 해설':'검토용 해설 · 정답 미확정')+'</b> · ':''}${esc(studyCopy(q.explanation))}</p>`:''}${choiceReasonList(q)}${renderExplanationImages(q)}${questionAuditHTML(q)}${!accepted&&!sourceMatch2026&&studyNote(q)?`<p class="review-note">${esc(studyNote(q))}</p>`:''}${audit2026&&audit2026.status!=='match'?`<p class="review-note">2026 강의안 재검토: ${esc(studyCopy(audit2026.decisionReason))}</p>`:''}
      ${officialKey&&q.answerKey?.image?`<details class="source-card exam-answer-key"><summary>22학번 공식 정답표 원본 · PDF 마지막 7페이지 (클릭하여 보기)</summary><p class="source-warning">왼쪽 1~5번·오른쪽 6~10번을 묶어 읽는 표입니다. 8번은 ①·②·④ 복수 정답입니다. 강의안 근거 이미지와는 별개입니다.</p><img class="source-image" src="${esc(q.answerKey.image)}" alt="22학번 시험지 7쪽 공식 정답표" loading="lazy" data-action="zoom" data-caption="22학번 시험지 PDF 7쪽 · 객관식 1~68번 공식 정답표"></details>`:''}
      <div class="section-head"><h4 class="section-title" style="font-size:14px">${confirmed?'채택된 강의안 원본':userConfirmed&&userEvidence?'해설 참고 강의안':'검토용 강의안 원본'}</h4><span class="fine">${refs.length}페이지</span></div>
      ${refs.length?refs.map(e=>`<article class="evidence-item"><div class="evidence-meta"><div class="lecture-source-line"><span class="file-page">PDF ${e.page}페이지${e.lectureYear?' · '+esc(e.lectureYear)+'년':''}</span><span class="file-name">${esc(e.file)}</span></div>${confirmed&&e.quote?`<div class="quote">원문 확인 기준: ${esc(e.quote)}</div>`:''}</div><img class="evidence-image" src="${esc(e.image)}" alt="${esc(e.file)} ${e.page}페이지 ${confirmed?'검증 근거':'검토용 자료'}" loading="lazy" data-action="zoom" data-caption="${esc(e.file)} · PDF ${e.page}페이지"><div class="zoom-label">이미지를 누르면 확대됩니다 ⤢</div></article>`).join(''):'<div class="empty" style="padding:21px">일치하는 강의안 페이지를 확보하지 못했습니다. 관련 없는 이미지로 근거를 대체하지 않았습니다.</div>'}
      ${!confirmed&&!officialKey?`<section class="user-answer"><h4>직접 정답 지정</h4><p>강의안을 확인한 후 정답을 직접 지정할 수 있습니다. 선택 즉시 자동 저장되며 제출한 답안의 채점 상태가 변경됩니다.</p>${q.type==='short'?`<input class="search" id="custom-short" type="text" placeholder="정답 문장을 입력하세요" value="${esc(usedCustom?String(ans):'')}" style="width:100%;margin-bottom:8px"><button class="button small secondary" data-action="save-custom-short">정답 저장</button>`:
      `<div class="custom-answers">${Array.from({length:Math.max(5,q.choices?.length||5)},(_,i)=>{const a=i+1;const sel=ans!=null&&(Array.isArray(ans)?ans.includes(a):ans===a);return `<button class="number-pill ${sel?'active':''}" data-action="custom-answer" data-number="${a}" aria-pressed="${sel}">${circles[i]||i+1}</button>`}).join('')}</div><div class="row" style="margin-top:12px"><label class="fine"><input type="checkbox" data-action="custom-multi" ${state.customMulti[q.id]?'checked':''}> 복수 정답 지정</label></div>`}
      ${usedCustom?`<button class="button ghost tiny" data-action="remove-custom" style="margin-top:11px">내 지정 정답 해제</button>`:''}</section>`:''}
      <div class="help-text">강의안 파일명과 페이지 번호는 PDF 파일의 실제 1부터 시작하는 페이지를 기준으로 기록했습니다. 원본 확인에 사용된 이미지 자체가 그대로 포함되어 있습니다.</div>
    </aside>`;
  }
  function renderReviewQuestion(q){
    const status=evaluation(q),r=record(q),a=effectiveAnswer(q);
    const answerArr=a===null||a===undefined?[]:Array.isArray(a)?a:[a];
    const chosen=Array.isArray(r.selected)?r.selected:(r.selected==null?[]:[r.selected]);
    const symbol={correct:'정답',wrong:'오답',pending:'채점 보류','not-started':'미제출'}[status];
    const answerText=answerArr.length?answerArr.map(n=>q.type==='short'?String(n):(circles[n-1]||n)).join(' · '):'미확정';
    const imgs=(q.figureImages||[]).filter(x=>x.src||x.image);
    const refs=q.lectureAudit||q.validation?.stage==='accepted'||(q.validation?.supplemental2026?.status==='match')?q.evidence||[]:q.candidateEvidence||[];
    return `<article class="review-detail" aria-live="polite"><div class="review-detail-head"><div><small>${esc(yearExamTeacherLabel(q.professor))} 교수님 · ${esc(q.label)}</small><h2>${studyMode==='year-exam'?(q.type==='short'?esc('주'+q.label.split('주').pop()):esc(String(q.number))):esc(q.label)}번 문제 <span class="review-status-badge ${status}">${symbol}</span></h2></div><button class="button secondary small" data-action="report-popup" data-question-id="${esc(q.id)}" title="문항 번호·설명·이미지를 첨부할 수 있어요">✎ 오류 제보하기</button><button class="button secondary small" data-action="review-question" data-id="${esc(q.id)}">문제풀이로 ↗</button></div>
      <div class="review-detail-prompt">${esc(formatPrompt(q.prompt))}</div>
      ${imgs.map(f=>`<img class="review-detail-figure" src="${esc(f.src||f.image)}" alt="${esc(f.alt||'문제 원본')}" loading="lazy" data-action="zoom" data-caption="${esc(f.caption||q.label+' 문제 원본')}"/>`).join('')}
      ${q.type==='short'?`<div class="review-readonly-choice"><b>내 답안</b> ${esc(chosen.join('')||'미제출')}</div>`:`<div class="review-readonly-choices">${(q.choices||[]).map(ch=>`<div class="review-readonly-choice ${answerArr.includes(ch.number)?'correct':chosen.includes(ch.number)?'wrong':''}"><span>${circles[ch.number-1]||ch.number}</span>${esc(ch.text)} ${answerArr.includes(ch.number)?' ✓ 정답':''}${chosen.includes(ch.number)?' · 내 선택':''}</div>`).join('')}</div>`}
      <div class="review-key-line"><strong>정답: ${esc(answerText)}</strong> <span>내 답안: ${esc(chosen.length?chosen.map(n=>typeof n==='number'?(circles[n-1]||n):String(n)).join(', '):'미제출')}</span></div>
      </article><section class="review-detail-explanation" aria-label="선택한 문제의 해설 및 근거"><h3>해설 및 근거</h3>${q.explanationNotice?`<p class="review-note">${esc(q.explanationNotice)}</p>`:''}${q.lectureAudit?`<p class="review-note">${esc(lectureAuditLabel(q))}${q.lectureAudit.limitations?' · '+esc(q.lectureAudit.limitations):''}</p>`:''}<p>${esc(q.explanation||'등록된 해설이 없습니다. 관련 강의안과 기출 원본을 직접 대조해야 합니다.')}</p>${studyAiExplanation(q)?`<div class="ai-study-explanation"><b>✦ AI 학습 보충 (검증된 강의안과 구분)</b><p>${esc(studyAiExplanation(q))}</p></div>`:''}
      ${refs.map(e=>`<div class="review-evidence-card"><small>${q.validation?.stage==='accepted'?'채택된 강의안 근거':'검토용 강의안 · 미채택'} · ${esc(e.file||'')} · ${esc(e.pageBasis?lecturePageLabel(e):'PDF '+e.page+'쪽')}</small><img src="${esc(e.image||'')}" alt="${esc(e.file||'강의안')} ${esc(e.page||'')}쪽" loading="lazy" data-action="zoom" data-caption="${esc(e.file||'')} · PDF ${esc(e.page)}쪽"/></div>`).join('')}
      ${choiceReasonList(q)}${renderExplanationImages(q)}${questionAuditHTML(q)}${q.answerKey?.image?`<details class="source-card exam-answer-key"><summary>시험지 마지막 PDF 7페이지 정답표 (원본 보기)</summary><img class="source-image" src="${esc(q.answerKey.image)}" alt="공식 정답표" loading="lazy" data-action="zoom" data-caption="22학번 기출 공식 정답표 · 7페이지"/></details>`:''}
      ${q.source?.image?`<details class="source-card"><summary>기출 원본 확인</summary><img class="source-image" src="${esc(q.source.image)}" alt="기출 원본" loading="lazy" data-action="zoom" data-caption="${esc(q.label)} 원본"/></details>`:''}</section>`;
  }
  function renderReview() {
    const all=questions(),s=stats(all);
    const list=all.filter(q=>reviewFilter==='wrong'?evaluation(q)==='wrong':reviewFilter==='unresolved'?effectiveAnswer(q)==null:reviewFilter==='pending'?evaluation(q)==='pending'||effectiveAnswer(q)==null:reviewFilter==='bookmarks'?isBookmark(q):reviewFilter==='due'?isDueForReview(q):true);
    if(!list.some(q=>q.id===selectedReviewId))selectedReviewId=list[0]?.id||null;
    const focus=list.find(q=>q.id===selectedReviewId);
    return `${renderCourseHeader()}<div class="review-compact-title"><div><div class="eyebrow">${studyMode==='year-exam'?'YEAR EXAM RESULTS':'LEARNING REVIEW'}</div><h1>${studyMode==='year-exam'?esc(selectedExamYear)+'학번 시험 결과':({wrong:'오답 노트',bookmarks:'북마크',unresolved:'미확정 문항'}[reviewFilter]||'최종 Review')}</h1><p>문제 번호를 누르면 오른쪽에 지문·정답·내 선택·해설·강의안 근거가 표시됩니다.</p></div><div class="review-export-actions">${studyMode==='year-exam'&&canUseLeaderboard(selectedSubject,selectedExamYear)&&stats(questions(),'year-exam').completed===questions().length?'<button class="button small" data-action="enter-leaderboard">🏆 리더보드 참가</button>':''}${['wrong','bookmarks'].includes(reviewFilter)?`<button class="button secondary small print-nav" data-action="save-collection-pdf" data-kind="${reviewFilter}">${reviewFilter==='wrong'?'오답':'북마크'} PDF 저장</button>`:''}<button class="button secondary small" data-action="back-quiz">← 문제풀이로 돌아가기</button></div></div>
      <div class="review-score-strip">${[['전체',s.total],['제출',s.completed],['정답',s.correct],['오답',s.wrong],['채점 보류',s.pending],['미제출',s.total-s.completed]].map(([name,n])=>`<span>${name} <b>${n}</b></span>`).join('')}</div>
      <div class="review-layout"><aside class="review-number-sidebar"><div class="review-side-heading"><b>문제 번호</b><small>${list.length}문항</small></div><div class="review-side-filters">${[['all','전체'],['wrong','오답'],['pending','보류'],['bookmarks','북마크'],['due','오늘 복습']].map(([f,l])=>`<button class="chip ${reviewFilter===f?'active':''}" data-action="review-filter" data-filter="${f}">${l}</button>`).join('')}</div><div class="review-number-grid">${list.map(q=>{const status=evaluation(q);const statusText={'correct':'정답','wrong':'오답','pending':'채점 보류','not-started':'미풀이'}[status]||status;return `<button class="review-number-button ${status} ${q.id===selectedReviewId?'active':''}" data-action="review-select" data-id="${esc(q.id)}" title="${esc(q.label)} · ${esc(yearExamTeacherLabel(q.professor))} 교수님 · ${statusText}" aria-label="${esc(q.label)}번 · ${statusText}" aria-pressed="${q.id===selectedReviewId}"><strong>${esc(q.label)}</strong></button>`}).join('')}</div></aside>
      <section class="review-detail-pane">${focus?renderReviewQuestion(focus):'<div class="empty">선택한 조건에 해당하는 문제가 없습니다.</div>'}</section></div>`;
  }

  // v12.8.2: produce an actual PDF Blob locally. Safari on iPad can hand the
  // generated File directly to the system share sheet -> "파일에 저장".
  // No printing, account, server, upload, or CDN dependency is required.
  function printRecordsMode() {
    return studyMode === 'year-exam' ? 'year-exam'
      : studyMode === 'unit' ? 'unit'
      : studyMode === 'prediction' ? 'prediction' : 'professor';
  }
  let pdfExportBusy = false;
  let pdfExportObjectUrl = null;
  let pdfExportDialog = null;

  function closePdfDialog() {
    if (pdfExportBusy) return;
    pdfExportDialog?.remove();
    pdfExportDialog = null;
    // Delay revocation so Safari's "Download" and "Open" handlers can finish.
    if (pdfExportObjectUrl) {
      const oldUrl=pdfExportObjectUrl;
      pdfExportObjectUrl=null;
      setTimeout(() => URL.revokeObjectURL(oldUrl), 120000);
    }
  }
  function openPdfDialog(kind) {
    if (pdfExportDialog) pdfExportDialog.remove();
    const overlay=document.createElement('div');
    overlay.className='pdf-export-backdrop';
    overlay.innerHTML=`<section class="pdf-export-card" role="dialog" aria-modal="true" aria-label="PDF 파일 저장">
      <div class="pdf-export-heading"><div><div class="eyebrow">HEON ARCHIVE</div><h2>${kind==='wrong'?'오답노트':'북마크'} PDF 저장</h2></div><button class="pdf-export-close" type="button" aria-label="닫기" disabled>×</button></div>
      <p class="pdf-export-status" role="status" aria-live="polite">저장할 문제를 불러오는 중…</p>
      <progress class="pdf-export-progress" max="100" value="0"></progress>
      <div class="pdf-export-actions" hidden>
        <button class="button primary pdf-export-share" type="button" hidden>↗ 아이패드 파일 앱에 저장</button>
        <a class="button primary pdf-export-download" href="#" download>↓ PDF 다운로드</a>
        <button class="button secondary pdf-export-preview" type="button">PDF 열기</button>
      </div>
      <p class="pdf-export-hint">아이패드: 파일 앱에 저장을 누르고 공유 메뉴에서 <b>파일에 저장</b>을 선택하세요. 공유 기능을 지원하지 않는 브라우저에서는 PDF 다운로드 또는 PDF 열기를 이용할 수 있습니다.</p>
    </section>`;
    document.body.appendChild(overlay);
    pdfExportDialog=overlay;
    overlay.querySelector('.pdf-export-close').addEventListener('click',closePdfDialog);
    overlay.addEventListener('click', e=>{if(e.target===overlay)closePdfDialog();});
    return overlay;
  }
  function pdfProgress(dialog,message,current=0,total=0) {
    const status=dialog.querySelector('.pdf-export-status');
    if(status)status.textContent=message;
    const bar=dialog.querySelector('.pdf-export-progress');
    if(bar){bar.max=Math.max(1,total);bar.value=current;}
  }
  async function exportCollection(kind) {
    if(pdfExportBusy){toast('다른 PDF 파일을 생성하고 있습니다.');return;}
    if(!window.HeonPdfExport?.generate){toast('PDF 저장 모듈을 불러오지 못했습니다. 새로고침해 주세요.');return;}
    if(!window.confirm(`${kind==='wrong'?'현재 교수님/단원/학번 풀이의 오답노트':'현재 과목의 북마크'} PDF를 생성하시겠습니까?`))return;
    pdfExportBusy=true;
    const dialog=openPdfDialog(kind);
    try {
      const mode=printRecordsMode();
      const metas=subjectById(selectedSubject)?.professors||[];
      const docs=await Promise.all(metas.map(p=>loadProfessor(p.id).catch(()=>null)));
      let all=docs.flatMap(x=>x?.questions||[]);
      if(mode==='prediction') all=all.filter(q=>q.isPrediction);
      else all=all.filter(q=>!q.isPrediction);
      // Wrong-note PDFs are restricted to the exact study scope entered by the user.
      // Bookmarks deliberately retain the existing subject-wide collection behavior.
      if(kind==='wrong'){
        const allowed=new Set(questions().map(q=>q.id));
        all=all.filter(q=>allowed.has(q.id));
      }
      // Never mix saved submissions, wrong-answer results, or bookmarks between modes.
      const bucket=mode==='year-exam'?state.yearExamRecords
        :mode==='unit'?state.unitRecords
        :mode==='prediction'?state.predictionRecords:state.records;
      const bm=mode==='year-exam'?state.yearExamBookmarks
        :mode==='unit'?state.unitBookmarks
        :mode==='prediction'?state.predictionBookmarks:state.bookmarks;
      const unique=new Map();
      for(const q of all) unique.set(q.id,q);
      const selected=[...unique.values()].filter(q=>{
        if(kind==='bookmarks') return !!bm[q.id];
        const rec=bucket[q.id];
        if(!rec?.submitted) return false;
        const answer=effectiveAnswer(q);
        if(answer===null||answer===undefined||q.gradingMode==='manual'||q.type==='short')return false;
        const want=Array.isArray(answer)?answer:[answer];
        const chosen=Array.isArray(rec.selected)?rec.selected:[rec.selected];
        return !(want.length===chosen.length&&want.every(n=>chosen.includes(n)));
      }).sort((a,b)=>Number(a.year)-Number(b.year)||Number(a.number)-Number(b.number)||a.professor.localeCompare(b.professor));
      if(!selected.length) {
        pdfProgress(dialog,kind==='wrong'?'현재 학습 모드에 저장된 오답이 없습니다.':'현재 학습 모드에 저장된 북마크가 없습니다.');
        return;
      }
      const teacherMap=new Map(metas.map(p=>[p.id,p.name]));
      const subj=subjectById(selectedSubject);
      const scopeName=kind==='wrong'?(currentProfessor?.professor?.name||subj?.name):(subj?.name||'혈액과 종양 1차');
      const title=(kind==='wrong'?'오답노트':'북마크')+' · '+scopeName;
      const modeLabel={'professor':'교수님별 학습','year-exam':'학번별 시험','unit':'단원별 학습','prediction':'AI 예상문제',goal:'학습 목표'}[mode];
      const answerLine=q=>{
        const a=effectiveAnswer(q);
        if(a===null||a===undefined)return '정답 미확정';
        return (Array.isArray(a)?a:[a]).map(n=>q.type==='short'?String(n):circles[n-1]||String(n)).join(' / ');
      };
      const items=await Promise.all(selected.map(async q=>{
        const picked=bucket[q.id]?.selected||[];
        const pickedList=Array.isArray(picked)?picked:[picked];
        const wanted=effectiveAnswer(q);
        const correctList=wanted==null?[]:Array.isArray(wanted)?wanted:[wanted];
        const evidence=(q.lectureAudit||q.validation?.stage==='accepted'?q.evidence:q.candidateEvidence||q.evidence||[])||[];

        return {
          teacher:teacherMap.get(q.professor)||q.professor,
          label:q.label,tag:kind==='wrong'?'오답':'북마크',prompt:formatPrompt(q.prompt),ink:await window.HeonInk?.getExport(q.id),
          choices:q.type==='short'?[]:(q.choices||[]).map(c=>({
            symbol:circles[c.number-1]||String(c.number),text:c.text,
            correct:correctList.includes(c.number)
          })),
          figures:(q.figureImages||[]).filter(x=>x.src||x.image).slice(0,2).map(x=>({
            src:x.src||x.image,label:x.alt||'문제 이미지'
          })),
          answer:answerLine(q),
          picked:pickedList.length?pickedList.map(n=>typeof n==='number'?(circles[n-1]||n):n).join(', '):'미제출',
          explanation:studyAiExplanation(q)||studyCopy(q.explanation)||'관련 강의안과 원본 문제를 비교해 확인하세요.',
          reasons:(q.choices||[]).filter(c=>q.choiceExplanations?.[String(c.number)]).map(c=>({
            symbol:circles[c.number-1]||String(c.number),
            text:studyCopy(q.choiceExplanations[String(c.number)])
          })),
          explanationImages:(q.explanationImages||[]).filter(x=>x.src||x.image).map(x=>({
            src:x.src||x.image,label:x.caption||'사용자 제공 해설 참고 이미지'
          })),
          evidence:evidence.map(lecture=>({
            label:`${lecture.file||'강의안'} · ${lecturePageLabel(lecture)}${lecture.lectureYear?' · '+lecture.lectureYear+'년':''}`,src:lecture.image||lecture.src||''
          }))
        };
      }));
      pdfProgress(dialog,`전체 ${selected.length}문항의 PDF를 생성하고 있습니다…`,0,selected.length);
      const result=await window.HeonPdfExport.generate({
        title,modeLabel,items,
        onProgress:(current,total)=>pdfProgress(dialog,`${current}/${total}문항 생성 완료…`,current,total)
      });
      const date=new Date().toLocaleDateString('en-CA').replace(/\//g,'-');
      const fileName=`HEON_ARCHIVE_${kind==='wrong'?'오답노트':'북마크'}_${scopeName.replace(/[\\/:*?"<>|\s]+/g,'_')}_${date}.pdf`;
      if(pdfExportObjectUrl)URL.revokeObjectURL(pdfExportObjectUrl);
      pdfExportObjectUrl=URL.createObjectURL(result.blob);
      const download=dialog.querySelector('.pdf-export-download');
      download.href=pdfExportObjectUrl;
      download.download=fileName;
      const preview=dialog.querySelector('.pdf-export-preview');
      preview.addEventListener('click',()=>window.open(pdfExportObjectUrl,'_blank','noopener'));
      const share=dialog.querySelector('.pdf-export-share');
      if(typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&typeof File!=='undefined'){
        const file=new File([result.blob],fileName,{type:'application/pdf'});
        if(navigator.canShare({files:[file]})){
          share.hidden=false;
          share.addEventListener('click',()=>{
            // MUST be invoked on the tap itself (iPad Safari user activation).
            navigator.share({files:[file],title}).catch(err=>{
              if(err?.name!=='AbortError')toast('공유가 열리지 않았습니다. PDF 다운로드를 이용해 주세요.');
            });
          });
        }
      }
      pdfProgress(dialog,`PDF 파일 준비 완료 · ${selected.length}문항, ${result.pages}페이지 (${(result.blob.size/1048576).toFixed(1)}MB)`,selected.length,selected.length);
      dialog.querySelector('.pdf-export-actions').hidden=false;
    } catch(err) {
      console.error('PDF 저장 실패',err);
      pdfProgress(dialog,'PDF 생성에 실패했습니다. 브라우저를 새로고침하고 다시 시도해 주세요.');
      toast('PDF 파일을 생성할 수 없었습니다.');
    } finally {
      pdfExportBusy=false;
      dialog.querySelector('.pdf-export-close').disabled=false;
    }
  }

  // Event delegation: no inline JavaScript handlers inside content.
  root.addEventListener('click',async(e)=>{
    const btn=e.target.closest('[data-action]');if(!btn)return;
    if(btn.matches('input[type=checkbox]'))return; // change listener handles checkbox
    const action=btn.dataset.action;
    switch(action) {
      case 'print-collection':await exportCollection(btn.dataset.kind==='bookmarks'?'bookmarks':'wrong');break;
      case 'save-collection-pdf':await exportCollection(btn.dataset.kind==='bookmarks'?'bookmarks':'wrong');break;
      case 'report-popup':openReportPopup(btn.dataset.questionId||'');break;
      case 'open-goals':await openGoalPlanner();break;
      case 'study-account-open':window.HeonStudyAccount?.open();break;
      case 'refresh-leaderboard':await loadSharedLeaderboard(selectedSubject,'22');break;
      case 'enter-leaderboard':await maybeOfferPublicRank();break;
      case 'save-leaderboard-rank':await submitPublicRank(btn);break;
      case 'mobile-menu':mobileMenuOpen=!mobileMenuOpen;render();break;
      case 'home':view='home';mobileMenuOpen=false;render();if(leaderboardConfigured())loadSharedLeaderboard(selectedSubject,'22');window.scrollTo(0,0);break;
      case 'scroll-courses':root.querySelector('#professor-picker')?.scrollIntoView({behavior:'smooth',block:'start'});break;
      case 'subject':selectedSubject=btn.dataset.id;currentProfessor=null;view='home';mobileMenuOpen=false;render();break;
      case 'subject-home':selectedSubject=btn.dataset.id;currentProfessor=null;view='home';render();if(leaderboardConfigured())loadSharedLeaderboard(selectedSubject,'22');window.scrollTo(0,0);break;
      case 'home-mode':homeStudyType=['professor','unit','year'].includes(btn.dataset.mode)?btn.dataset.mode:'professor';render();break;
      case 'start-year-exam':await selectSubjectExam(btn.dataset.year);break;
      case 'choose-unit-professor':chosenUnitProfessor=btn.dataset.id;await loadProfessor(chosenUnitProfessor);render();break;
      case 'start-unit':await startUnit(btn.dataset.id,btn.dataset.unit);break;
      case 'start-predictions':await startPredictions();break;
      case 'professor':await selectProfessor(btn.dataset.id);break;
      case 'theme':state.prefs.theme=state.prefs.theme==='dark'?'light':'dark';saveState();render();break;
      case 'reset-professor':resetProfessorProgress();break;
      case 'reset-unit':{if(studyMode!=='unit')break;if(!confirm('현재 단원만 초기화할까요? 교수님별·학번별 기록은 보존됩니다.'))break;for(const q of questions())clearModeRecord(q,'unit');currentId=questions()[0]?.id;view='quiz';infoExpanded=false;saveState();render();break;}
      case 'reset-year-exam':{
        if(studyMode!=='year-exam')break;
        if(!confirm(selectedExamYear+'학번 시험의 답안·북마크만 초기화할까요? 교수님별 기록은 보존됩니다.'))break;
        for(const q of questions())clearModeRecord(q,'year-exam');
        delete state.lastVisited[currentProfessor.professor.id];
        currentId=questions()[0]?.id;view='quiz';infoExpanded=false;saveState();render();break;
      }
      case 'nav-quiz':{
        if(!currentProfessor){view='home';render();toast('첫 화면에서 과목과 교수님을 선택해주세요.');}
        else{view='quiz';reviewFilter='all';restoringReview=false;infoExpanded=false;render();window.scrollTo(0,0);}
        break;
      }
      case 'nav-unresolved':
      case 'nav-bookmarks':
      case 'nav-wrong':{
        if(!currentProfessor){toast('먼저 교수님을 선택해주세요.');break;}
        reviewFilter=({ 'nav-wrong':'wrong', 'nav-bookmarks':'bookmarks', 'nav-unresolved':'unresolved' })[action];selectedReviewId=null;view='review';restoringReview=false;render();window.scrollTo(0,0);break;
      }
      case 'nav-stats':{
        if(!currentProfessor){toast('학습 통계를 보려면 먼저 교수님을 선택해주세요.');break;}
        reviewFilter='all';view='review';restoringReview=false;render();window.scrollTo(0,0);break;
      }
      case 'search-result':await openSearchQuestion(btn.dataset.professor,btn.dataset.id);break;
      case 'year':selectYear(btn.dataset.year);break;
      case 'filter':editingQuestionKey='';evidenceCollapsedKey='';infoExpanded=false;filter=filter===btn.dataset.filter?'all':btn.dataset.filter;currentId=scopedQuestions()[0]?.id||null;render();break;
      case 'clear-filter':editingQuestionKey='';evidenceCollapsedKey='';infoExpanded=false;filter='all';currentYear='all';currentId=scopedQuestions()[0]?.id||null;render();break;
      case 'bookmark':{
        const q=questions().find(x=>x.id===btn.dataset.id);if(!q)break;
        const newValue=!isBookmark(q);
        if(!newValue)delete bookmarkBucket()[q.id];else bookmarkBucket()[q.id]=true;
        state.bookmarkChanges[`${studyMode}::${q.id}`]={value:newValue,updatedAt:new Date().toISOString()};
        saveState();render();break;
      }
      case 'choose':{
        const q=currentQuestion();if(!q)break;const n=Number(btn.dataset.number);
        const r={...record(q)};let selected=Array.isArray(r.selected)?[...r.selected]:[];
        if((q.maxSelections||1)>1) {
          if(selected.includes(n)) selected=selected.filter(x=>x!==n);
          else if(selected.length<(q.maxSelections||1))selected.push(n);
          else {selected.shift();selected.push(n);}
        } else selected=selected.length===1&&selected[0]===n?[]:[n];
        r.hasSubmitted=hasSubmittedBefore(q);editingQuestionKey=questionViewKey(q);evidenceCollapsedKey='';r.selected=selected;r.submitted=false;infoExpanded=r.hasSubmitted;r.updatedAt=new Date().toISOString();recordBucket()[q.id]=r;markRecordChange(q);saveState();render();break;
      }
      case 'submit':{
        const q=currentQuestion();if(!q)break;const wasSubmitted=hasSubmittedBefore(q);const r={...record(q)};
        if(!q.archiveUnrecovered&&q.type==='short'&&!String(r.selected||'').trim())break;
        if(!q.archiveUnrecovered&&q.type!=='short'&&!r.selected?.length)break;
        r.submitted=true;r.hasSubmitted=true;evidenceCollapsedKey='';r.submittedAt=new Date().toISOString();r.updatedAt=r.submittedAt;recordBucket()[q.id]=r;markSmartReview(q);markRecordChange(q);completeGoalQuestion(q,r);infoExpanded=true;saveState();
        const finishedYearExam=studyMode==='year-exam'&&questions().length>0&&questions().every(item=>submission(item,'year-exam'));
        const shouldCheckRank=finishedYearExam && canUseLeaderboard(selectedSubject, selectedExamYear);
        if(finishedYearExam&&!wasSubmitted) {view='review';reviewFilter='all';restoringReview=false;}
        render();
        if(shouldCheckRank) await maybeOfferPublicRank();
        // On mobile, the right-side explanation becomes a card below the question.
        // Move it into view after the submitted result is displayed.
        if(matchMedia('(max-width:1020px)').matches){requestAnimationFrame(()=>root.querySelector('.evidence-panel')?.scrollIntoView({behavior:'smooth',block:'start'}));}
        break;
      }
      case 'step':{
        const arr=scopedQuestions();const idx=arr.findIndex(q=>q.id===currentQuestion()?.id);const nx=arr[idx+Number(btn.dataset.direction)];if(nx)selectCurrent(nx.id);break;
      }
      case 'toggle-evidence':infoExpanded=!infoExpanded;evidenceCollapsedKey=infoExpanded?'':questionViewKey(currentQuestion());render();break;
      case 'zoom':openModal(btn.getAttribute('src'),btn.dataset.caption||btn.alt);break;
      case 'open-review':reviewFilter='all';selectedReviewId=null;view='review';restoringReview=false;render();window.scrollTo(0,0);break;
      case 'review-filter':reviewFilter=btn.dataset.filter;selectedReviewId=null;render();break;
      case 'review-select':{const side=root.querySelector('.review-number-sidebar'),pane=root.querySelector('.review-detail-pane');const position=side?.scrollTop||0;selectedReviewId=btn.dataset.id;render();const next=root.querySelector('.review-number-sidebar');if(next)next.scrollTop=position;const detail=root.querySelector('.review-detail-pane');if(detail)detail.scrollTop=0;break;}
      case 'review-question':goQuestion(btn.dataset.id);restoringReview=true;infoExpanded=true;render();break;
      case 'back-review':view='review';restoringReview=false;render();break;
      case 'back-quiz':view='quiz';restoringReview=false;render();break;
      case 'custom-answer':{
        const q=currentQuestion();if(!q)break;const n=Number(btn.dataset.number);
        if(state.customMulti[q.id]) {
          let a=state.customAnswers[q.id];a=Array.isArray(a)?[...a]:a===null||a===undefined?[]:[a];
          a=a.includes(n)?a.filter(x=>x!==n):[...a,n];
          if(a.length)state.customAnswers[q.id]=a;else delete state.customAnswers[q.id];
        } else state.customAnswers[q.id]=n;
        state.customAnswerChanges[q.id]={value:true,updatedAt:new Date().toISOString()};
        saveState();render();break;
      }
      case 'remove-custom':{
        const q=currentQuestion();if(!q)break;delete state.customAnswers[q.id];state.customAnswerChanges[q.id]={value:false,updatedAt:new Date().toISOString()};saveState();render();break;
      }
      case 'save-custom-short':{
        const q=currentQuestion();const value=$('#custom-short')?.value.trim();
        if(q&&value){state.customAnswers[q.id]=value;state.customAnswerChanges[q.id]={value:true,updatedAt:new Date().toISOString()};saveState();render();toast('정답을 저장했습니다.');}break;
      }
      default:break;
    }
  });
  root.addEventListener('change',(e)=>{
    const el=e.target;
    if(el.id==='global-search-subject'){
      searchSubjectOverride=el.value==='current'?null:el.value;
      searchOpen=!!searchText.trim();
      updateSearchSuggestions();
      return;
    }
    if(el.dataset.action==='number-select'&&el.value)selectCurrent(el.value);
    if(el.dataset.action==='custom-multi'){
      const q=currentQuestion();if(!q)return;state.customMulti[q.id]=el.checked;
      if(!el.checked&&Array.isArray(state.customAnswers[q.id]))state.customAnswers[q.id]=state.customAnswers[q.id][0]||null;
      saveState();render();
    }
  });
  root.addEventListener('input', e=>{
    const el=e.target;
    if(el.id==='global-search-input'){
      searchText=el.value;searchOpen=true;updateSearchSuggestions();loadSearchIndex();return;
    }
    if(el.id==='short-answer'){
      const q=currentQuestion();if(!q)return;
      const r={...record(q),hasSubmitted:hasSubmittedBefore(q),selected:el.value,submitted:false,updatedAt:new Date().toISOString()};
      editingQuestionKey=questionViewKey(q);evidenceCollapsedKey='';
      recordBucket()[q.id]=r;markRecordChange(q);saveState();
      if(r.hasSubmitted&&!infoExpanded){infoExpanded=true;
        // Do not replace the textarea the user is currently typing into.
        // The expanded explanation is rendered on the next explicit navigation.
      }
      root.querySelectorAll('[data-action=submit]').forEach(btn=>btn.disabled=!el.value.trim());
    }
  });
  root.addEventListener('focusin',e=>{
    if(e.target?.id==='global-search-input'){
      searchOpen=true;updateSearchSuggestions();loadSearchIndex();
    }
  });
  root.addEventListener('keydown',e=>{
    if(e.target?.id==='global-search-input'){
      if(e.key==='Escape'){e.preventDefault();searchOpen=false;updateSearchSuggestions();e.target.blur();}
      if(e.key==='ArrowDown'){
        const first=root.querySelector('.search-result');if(first){e.preventDefault();first.focus();}
      }
      if(e.key==='Enter'){
        const first=searchEntries()[0];if(first){e.preventDefault();openSearchQuestion(first.meta.id,first.q.id);}
      }
    }
    if(e.target?.matches('.search-result')&&e.key==='Escape'){
      e.preventDefault();searchOpen=false;updateSearchSuggestions();root.querySelector('#global-search-input')?.focus();
    }
  });
  document.addEventListener('pointerdown',e=>{
    if(searchOpen&&!e.target.closest('.global-search')){searchOpen=false;updateSearchSuggestions();}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','TEXTAREA'].includes(e.target?.tagName)&&!e.target?.isContentEditable){
      const input=root.querySelector('#global-search-input');if(input){e.preventDefault();input.focus();}
    }
  });
  // Pointer-based resizable evidence panel. Persists its width in the same local record.
  let moving=false;
  root.addEventListener('pointerdown',e=>{
    const grip=e.target.closest('#resizer');if(!grip||matchMedia('(max-width:1020px)').matches)return;
    e.preventDefault();moving=true;grip.setPointerCapture?.(e.pointerId);
  });
  root.addEventListener('pointermove',e=>{
    if(!moving)return;
    const container=$('.exam-layout');if(!container)return;
    const box=container.getBoundingClientRect();
    const w=Math.max(340,Math.min(690,box.right-e.clientX));
    document.documentElement.style.setProperty('--evidence-width',`${Math.round(w)}px`);state.prefs.explanationWidth=Math.round(w);
  });
  root.addEventListener('pointerup',()=>{if(moving){moving=false;saveState();}});
  root.addEventListener('pointercancel',()=>{moving=false;});
  function openModal(src,caption) {
    document.querySelector('.image-modal')?.remove();
    const modal=document.createElement('div');modal.className='image-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const close=document.createElement('button');close.type='button';close.textContent='닫기 ✕';close.addEventListener('click',()=>modal.remove());
    const image=document.createElement('img');image.src=src;image.alt=caption;
    const captionEl=document.createElement('div');captionEl.className='image-caption';captionEl.textContent=caption;
    modal.append(close,image,captionEl);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});document.body.append(modal);close.focus();
  }
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){document.querySelector('.image-modal')?.remove();closeDialog();if(mobileMenuOpen){mobileMenuOpen=false;render();}}
    if(e.key==='Enter'&&e.target.matches('.brand')){view='home';render();}
  });
  window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue!==e.oldValue){readState();render();toast('다른 탭에서 변경된 학습 기록을 반영했습니다.');}});
  async function init() {
    readState();initializeLegacyReviewSchedule();theme();
    try {
      catalog=window.HEON_ARCHIVE_DATA?.catalog;
      if(!catalog?.subjects?.length)throw Error('비공개 문제은행을 불러오지 못했습니다. Supabase Storage와 접근 권한을 확인하세요.');
      // Always start with the course/professor selector. Never discard existing records.
      // Previously visited question stays in lastVisited and resumes on professor click.
      view='home'; currentProfessor=null; infoExpanded=false;
      const chosen=subjectById(selectedSubject) || catalog.subjects.find(s=>s.professors.length);
      if(chosen) {
        selectedSubject=chosen.id;
        await Promise.allSettled(chosen.professors.map(p=>loadProfessor(p.id)));
      }
      render();
      // Compare synced state by content (not object insertion order). Network
      // focus/visibility syncs must NEVER wipe textarea focus or image nodes.
      const syncKeys=['records','yearExamRecords','predictionRecords','unitRecords',
        'bookmarks','yearExamBookmarks','predictionBookmarks','unitBookmarks',
        'customAnswers','customMulti','lastVisited','reviewSchedule',
        'bookmarkChanges','recordChanges','customAnswerChanges','dailyGoals'];
      function contentEqual(a,b){
        if(a===b)return true;
        if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
        if(Array.isArray(a)!==Array.isArray(b))return false;
        const ka=Object.keys(a),kb=Object.keys(b);
        return ka.length===kb.length&&ka.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&contentEqual(a[k],b[k]));
      }
      let inkAccountSeen=null;
      function refreshAccountStatusOnly(){
        const badge=root.querySelector('[data-action="study-account-open"]');
        if(badge)badge.textContent=window.HeonStudyAccount?.statusLabel?.()||'학습 기록 계정';
        const uid=window.HeonStudyAccount?.userId||'';
        if(uid!==inkAccountSeen){inkAccountSeen=uid;window.HeonInk?.setAccount();}
      }
      window.HeonStudyAccount?.init(
        ()=>state,
        snapshot=>{
          const localPrefs=state.prefs||{};
          // Theme, preferred layout, and nickname are browser-local settings.
          const next={...emptyState(),...state,...snapshot,
            prefs:{...localPrefs,...(snapshot.prefs||{}),theme:localPrefs.theme,
              explanationWidth:localPrefs.explanationWidth,playerId:localPrefs.playerId,nickname:localPrefs.nickname}};
          const changed=syncKeys.some(k=>!contentEqual(state[k]||{},next[k]||{}))||
            !contentEqual(state.prefs||{},next.prefs||{});
          if(!changed)return; // keep image elements and current typing focus intact
          state=next;
          try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){console.warn(e);}
          if(catalog)render();
        },
        refreshAccountStatusOnly
      );
      if(leaderboardConfigured()){loadSharedLeaderboard(selectedSubject,'22');loadQuestionAuditEvents();}
    }catch(err){
      root.innerHTML=`<div style="max-width:680px;margin:9vh auto;padding:30px;border:1px solid #35465d;border-radius:18px;background:#101d30;color:#ecf2fb"><h2>HEON ARCHIVE 데이터를 불러오지 못했습니다</h2><p>${esc(err.message)}</p><p>ZIP 전체를 먼저 압축 해제한 후, 승인된 회원 계정과 Supabase 비공개 자료 저장소 설정을 확인하세요.</p></div>`;
      console.error(err);
    }
  }
  init();
})();
