const app=document.querySelector('#app');
const notice=document.querySelector('#notice');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Intl.DateTimeFormat('ta-LK',{timeZone:'Asia/Colombo',dateStyle:'medium'}).format(new Date(value));
const statuses={correct:'சரி',incorrect:'தவறு',skipped:'தவிர்க்கப்பட்டது',unsubmitted:'சமர்ப்பிக்கப்படவில்லை'};
let attempt, position=0, challenge, students, locale='ta', pending={}, saving, timer;
const api=async(action,data={})=>{
  const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error);
  return result;
};
function signIn(signup=false){
  app.innerHTML=`<section><h1>${signup?'மாணவர் கணக்கை உருவாக்குக':'மாணவர் உள்நுழைவு'}</h1>
  <form data-form="send">
  ${signup?'<label>மாணவர் பெயர்<input name="name" required maxlength="80"></label><label>தரம்<select name="grade"><option value="5">தரம் 5</option></select></label>':''}
  <label>பெற்றோர் அல்லது பாதுகாவலரின் கைப்பேசி எண்<input name="phone" type="tel" required placeholder="077 123 4567"></label>
  <p>கைப்பேசி எண்ணின் கட்டுப்பாட்டை உறுதிப்படுத்த ஒருமுறை குறியீடு பயன்படுகிறது. இந்த மாதிரித் தளத்தில் உண்மையான தகவல்களை உள்ளிட வேண்டாம்.</p>
  ${signup?'<label><input type="checkbox" name="confirmed" required> நான் மாணவரின் பெற்றோர் அல்லது பாதுகாவலர்.</label>':''}
  <div class="row"><button lang="en">Send Code</button><button type="button" data-action="${signup?'signin':'signup'}" lang="en">${signup?'Sign In':'Create Student Account'}</button></div></form></section>`;
}
async function dashboard(){
  students=await api('students');
  const chosen=students.students.find(row=>row.id===students.selected);
  const history=chosen?await api('history'):[];
  const recommendations=chosen?await api('recommendations'):[];
  app.innerHTML=`<section><h1>${chosen?esc(chosen.name):'மாணவரைத் தெரிவு செய்க'}</h1>
  <div class="row">${students.students.map(s=>`<button data-action="select" data-id="${s.id}">${esc(s.name)}</button>`).join('')}
  <button data-action="add" lang="en">Add Student</button><button data-action="logout" lang="en">Log Out</button></div>
  ${chosen?'<p>தரம் 5 · இலவச 20 வினாக்கள்</p><label>மொழி<select id="locale"><option value="ta">தமிழ்</option><option value="en">English (preview)</option></select></label><p><button data-action="start" lang="en">Start or Resume Sample</button> <button data-action="billing" lang="en">Manage Subscription</button></p>':''}</section>
  ${chosen?'<section><h2>ஆசிரியர் பகிர்வு</h2><p>அனுமதித்தால் ஆசிரியர் தவறான மற்றும் தவிர்க்கப்பட்ட விடைகளைப் பார்க்கலாம்.</p><div class="row"><button data-action="share" lang="en">Enable Sharing</button><button data-action="unshare" lang="en">Withdraw Sharing</button></div>'+recommendations.map(r=>'<p>'+esc(r.name_ta)+' · '+esc(r.state)+'</p>').join('')+'</section>':''}
  ${chosen?'<section><h2>பயிற்சி வரலாறு</h2>'+(history.length?history.map(a=>`<p><button data-action="read" data-id="${a.id}">${date(a.started_at)} · ${a.submitted_at?'பெறுபேறு':'வரைவு'}</button></p>`).join(''):'<p>இன்னும் முயற்சிகள் இல்லை.</p>')+'</section>':''}`;
}
function showAttempt(){
  const english=locale==='en';
  if(attempt.submittedAt){
    const score=attempt.items.filter(i=>i.status==='correct').length;
    app.innerHTML=`<section><button data-action="dashboard" lang="en">Back to Dashboard</button><h1>${english?'Results':'பெறுபேறு'} · ${score} / ${attempt.items.length}</h1></section>`+
      attempt.items.map(i=>`<article lang="${locale}"><h2>${i.position}. ${esc(i.prompt)}</h2><p class="tag">${english?i.status:statuses[i.status]}</p><p>${english?'Your answer':'உங்கள் விடை'} — ${esc(i.options?.[i.response]??i.response)||'—'}</p><p>${english?'Correct answer':'சரியான விடை'} — ${esc(i.solution)}</p><ol>${i.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol></article>`).join('');
    return;
  }
  const item=attempt.items[position];
  const answer=pending[item.position]??item.response??'';
  app.innerHTML=`<section><button data-action="dashboard" lang="en">Back to Dashboard</button><p><span lang="en">Question</span> ${item.position} / ${attempt.items.length}</p>
  <h1 lang="${locale}">${esc(item.prompt)}</h1>
  ${item.options?item.options.map((o,i)=>`<label class="option" lang="${locale}"><input type="radio" name="answer" value="${i}" ${String(i)===answer?'checked':''}>${esc(o)}</label>`).join(''):`<label>${english?'Your answer':'உங்கள் விடை'}<input name="answer" value="${esc(answer)}" maxlength="128"></label>`}
  <div class="row"><button data-action="previous" lang="en" ${position===0?'disabled':''}>Previous</button>
  <button data-action="next" lang="en" ${position===attempt.items.length-1?'disabled':''}>Next</button>
  <button data-action="review" lang="en">Review and Submit</button></div>
  <div class="questions" aria-label="வினாக்கள்">${attempt.items.map((i,j)=>`<button data-action="jump" data-position="${j}" ${j===position?'aria-current="step"':''}>${i.position}</button>`).join('')}</div></section>`;
}
async function save(){
  if(saving) await saving;
  if(!attempt||!Object.keys(pending).length) return;
  const responses={...pending};
  const id=attempt.id;
  saving=api('save',{id,revision:attempt.revision,responses});
  try {
    attempt=await saving;
    for(const [key,value] of Object.entries(responses)) if(pending[key]===value) delete pending[key];
    notice.textContent='வரைவு சேமிக்கப்பட்டது.';
  } catch(error) {
    notice.textContent='சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.';
    throw error;
  } finally { saving=null; }
}
app.addEventListener('input',event=>{
  if(event.target.name!=='answer'||!attempt) return;
  pending[attempt.items[position].position]=event.target.value;
  notice.textContent='சேமிக்கப்படுகிறது…';
  clearTimeout(timer);
  timer=setTimeout(()=>save().catch(()=>{}),450);
});
async function loadAttempt(action, data){
  if(action==='read'){
    const history=await api('history');
    locale=history.find(item=>item.id===data.id)?.locale||'ta';
  }
  attempt=await api(action,data);
  pending={};position=0;showAttempt();
}
async function run(work,button){
  notice.textContent='';
  if(button) button.disabled=true;
  try{await work();}
  catch(error){
    const messages={invalid_mobile:'செல்லுபடியான இலங்கை கைப்பேசி எண்ணை உள்ளிடவும்.',invalid_code:'குறியீடு தவறானது அல்லது காலாவதியானது.',try_later:'சிறிது நேரம் கழித்து மீண்டும் முயல்க.',revision_conflict:'வேறு சாதனத்தில் வரைவு மாறியுள்ளது. சமீபத்திய முயற்சியைத் திறக்கவும்.'};
    notice.textContent=messages[error.message]||'செயலை முடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.';
  }finally{if(button)button.disabled=false;}
}
app.addEventListener('submit',event=>{
  const form=event.target;
  if(!form.dataset.form) return;
  event.preventDefault();
  const values=Object.fromEntries(new FormData(form));
  run(async()=>{
    if(form.dataset.form==='send'){
      challenge=await api('send',{...values,grade:Number(values.grade),confirmed:values.confirmed==='on'});
      app.innerHTML=`<section><h1>கைப்பேசி சரிபார்ப்பு</h1><p lang="en">Test code: <strong>${challenge.simulationCode}</strong></p><form data-form="verify"><label>ஒருமுறை குறியீடு<input name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="6"></label><div class="row"><button lang="en">Verify</button><button type="button" data-action="signin" lang="en">Back</button></div></form></section>`;
    }else if(form.dataset.form==='verify'){
      await api('verify',{id:challenge.id,code:values.code});await dashboard();
    }else if(form.dataset.form==='teacher-login'){
      await api('teacher-login',{password:values.password});await teacherReview();
    }else if(form.dataset.form==='teacher-note'){
      await api('teacher-note',{id:form.dataset.id,position:Number(form.dataset.position),note:values.note});
      await teacherReview(form.dataset.status);
    }else if(form.dataset.form==='add'){
      await api('add',{id:form.dataset.id,name:values.name,grade:5});await dashboard();
    }
  },event.submitter);
});
app.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(!button)return;
  run(async()=>{
    switch(button.dataset.action){
      case 'billing':return billing();
      case 'paid-start':return loadAttempt('start',{locale,setId:'preview-mixed'});
      case 'order':await api('order',{plan:button.dataset.plan});return billing();
      case 'simulate-payment':
        await api('simulate-payment',{id:button.dataset.id,kind:button.dataset.kind});return billing();
      case 'share':case 'unshare':
        await api('share',{enabled:button.dataset.action==='share'});
        notice.textContent=button.dataset.action==='share'?'பகிர்வு இயக்கப்பட்டது.':'பகிர்வு திரும்பப் பெறப்பட்டது.';return;
      case 'teacher-incorrect':return teacherReview();
      case 'teacher-skipped':return teacherReview('skipped');
      case 'teacher-logout':await api('teacher-logout');return teacherLogin();
      case 'recommend':
        await api('teacher-recommend',{id:button.dataset.id,position:Number(button.dataset.position)});
        notice.textContent='பயிற்சி பரிந்துரைக்கப்பட்டது.';return;
      case 'signup':return signIn(true);
      case 'signin':return signIn();
      case 'logout':await api('logout');attempt=null;return signIn();
      case 'select':await api('select',{id:button.dataset.id});return dashboard();
      case 'add':
        app.innerHTML=`<section><h1>மாணவரைச் சேர்க்கவும்</h1><form data-form="add" data-id="${crypto.randomUUID()}"><label>மாணவர் பெயர்<input name="name" maxlength="80" required></label><p>தரம் 5</p><button lang="en">Add Student</button></form></section>`;return;
      case 'start':locale=document.querySelector('#locale').value;return loadAttempt('start',{locale});
      case 'read':return loadAttempt('read',{id:button.dataset.id});
      case 'dashboard':await save();return dashboard();
      case 'previous':position--;return showAttempt();
      case 'next':position++;return showAttempt();
      case 'jump':position=Number(button.dataset.position);return showAttempt();
      case 'review': {
        const answered=attempt.items.filter(item=>(pending[item.position]??item.response??'').trim()).length;
        app.innerHTML=`<section><h1>சமர்ப்பிக்கும் முன் சரிபார்க்கவும்</h1><p>${answered} / ${attempt.items.length} விடையளித்தவை</p><div class="row"><button data-action="continue" lang="en">Keep Working</button><button data-action="submit" lang="en">Submit</button></div></section>`;return;
      }
      case 'continue':return showAttempt();
      case 'submit':
        await save();
        attempt=await api('submit',{id:attempt.id,revision:attempt.revision,responses:{}});
        return showAttempt();
    }
  },button);
});

async function billing(){
  const {plans,entitlement,order}=await api('billing');
  const money=minor=>'Rs. '+(minor/100).toLocaleString('en-LK',{minimumFractionDigits:2});
  const monthly=plans.find(p=>p.id==='monthly');
  const annual=plans.find(p=>p.id==='annual');
  const actions=order?.status==='pending'?['paid','failed']:['active','cancelled'].includes(order?.status)?(order.status==='active'?['cancel','refund']:['refund']):[];
  app.innerHTML='<section><h1>சந்தா நிர்வாகம்</h1><p lang="en">Payment simulation only. No card, charge or automatic renewal.</p><p>ஆண்டுச் சேமிப்பு '+money(monthly.amount_minor*12-annual.amount_minor)+'</p>'+
    plans.map(plan=>'<p>'+money(plan.amount_minor)+' LKR · '+plan.period_months+' மாதம் <button data-action="order" data-plan="'+plan.id+'" lang="en">Create Test Order</button></p>').join('')+
    (order?'<p>கொள்முதல் நிலை — '+esc(order.status)+'</p>':'')+
    (entitlement?'<p>அணுகல் — '+esc(entitlement.state)+' · '+date(entitlement.paid_through)+'</p>':'')+
    (entitlement&&['active','cancelled'].includes(entitlement.state)&&new Date(entitlement.paid_through)>new Date()?'<p><button data-action="paid-start" lang="en">Start or Resume Test Challenge</button></p>':'')+
    '<div class="row">'+actions.map(kind=>'<button data-action="simulate-payment" data-id="'+order.id+'" data-kind="'+kind+'" lang="en">Simulate '+kind+'</button>').join('')+
    '<button data-action="dashboard" lang="en">Back to Dashboard</button></div></section>';
}
function teacherLogin(){
  app.innerHTML='<section><h1>ஆசிரியர் உள்நுழைவு</h1><form data-form="teacher-login"><label>கடவுச்சொல்<input name="password" type="password" autocomplete="current-password" required></label><div class="row"><button lang="en">Log In</button></div></form></section>';
}
async function teacherReview(status='incorrect'){
  const rows=await api('teacher-review',{status});
  const controls='<div class="row"><button data-action="teacher-incorrect">தவறானவை</button><button data-action="teacher-skipped">தவிர்க்கப்பட்டவை</button><button data-action="teacher-logout" lang="en">Log Out</button></div>';
  app.innerHTML='<section><h1>மீளாய்வு செய்ய வேண்டிய வினாக்கள்</h1>'+controls+'<p>'+statuses[status]+' · '+new Set(rows.map(r=>r.student_id)).size+' மாணவர்கள் · '+new Set(rows.map(r=>r.attempt_id)).size+' முயற்சிகள்</p></section>'+
    (rows.length?rows.map(r=>`<article><h2>${esc(r.name)} · ${esc(r.question_id)} v${r.version}</h2><p>${date(r.submitted_at)} · ${esc(r.skill_id)}</p><p>${esc(r.prompt)}</p><p>மாணவரின் விடை — ${esc(r.options?.[r.response]??r.response)||'—'}</p><p>சரியான விடை — ${esc(r.solution)}</p><ol>${r.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><button data-action="recommend" data-id="${r.attempt_id}" data-position="${r.position}" lang="en">Recommend Skill</button><form data-form="teacher-note" data-id="${r.attempt_id}" data-position="${r.position}" data-status="${status}"><label>ஆசிரியரின் தனிப்பட்ட குறிப்பு<textarea name="note" required maxlength="800"></textarea></label><button lang="en">Save Private Note</button></form>${r.notes.map(note=>`<p>${esc(note)}</p>`).join('')}</article>`).join(''):'<section>பதிவுகள் இல்லை.</section>');
}

const publicCopy={
  '/how-it-works':['பயிற்சி செய்வது எப்படி?','பாதுகாவலர் கைப்பேசியை உறுதிப்படுத்திய பின் மாணவரைத் தெரிவு செய்யுங்கள். வரைவாகச் சேமித்த பயிற்சியைத் தொடரலாம். சமர்ப்பித்ததும் எல்லா விளக்கங்களும் ஒரே பக்கத்தில் தெரியும்.'],
  '/topics':['தரம் 5 பயிற்சித் தலைப்புகள்','எண்களும் கணக்கீடும், பின்னங்கள், அளவீடு, வாழ்க்கைக் கணிதம். பாடத்திட்டப் பொருத்தமும் வினாக்களும் ஆசிரியர் மதிப்பாய்வில் உறுதிப்படுத்தப்பட வேண்டும்.'],
  '/free-sample':['இலவச மாதிரிப் பயிற்சி','நேர வரம்பில்லாத 20 வினாக்கள். அட்டை தேவையில்லை. தானாகக் கட்டணத் திட்டம் தொடங்காது.'],
  '/pricing':['முன்மொழியப்பட்ட கட்டணங்கள்','மாணவர் ஒருவருக்கு மாதம் Rs. 990 அல்லது ஆண்டு Rs. 7,990. முன்மொழியப்பட்ட ஆண்டுச் சேமிப்பு Rs. 3,890. விலைகளுக்கு உரிமையாளர் ஒப்புதல் தேவை. இந்த மாதிரியில் உண்மையான கட்டணம் இல்லை.'],
  '/faq':['அடிக்கடி கேட்கப்படும் கேள்விகள்','ஒரே பாதுகாவலர் பல மாணவர்களைச் சேர்க்கலாம். ஒவ்வொரு மாணவரின் வரலாறும் அணுகலும் தனித்தனியாக இருக்கும்.'],
  '/contact':['தொடர்பு','அதிகாரப்பூர்வ ஆதரவு தொடர்பை வெளியீட்டுக்கு முன் உரிமையாளர் உறுதிப்படுத்த வேண்டும்.'],
  '/privacy':['தனியுரிமை வரைவு','மாணவர் பெயர், தரம், உறுதிப்படுத்தப்பட்ட பாதுகாவலர் கணக்கு மற்றும் பயிற்சிப் பதிவுகளைப் பயன்படுத்தத் திட்டமிடப்பட்டுள்ளது. பகிர்வை அனுமதித்தால் மட்டுமே ஆசிரியருக்குத் தவறான மற்றும் தவிர்க்கப்பட்ட விடைகள் தெரியும். உண்மையான தகவல்களை இங்கு உள்ளிட வேண்டாம்.'],
  '/terms':['விதிமுறைகள் வரைவு','இது செயற்கைத் தகவல்களுக்கான சோதனை மாதிரி. பயிற்சிப் பொருட்களும் வணிக நிபந்தனைகளும் வெளியீட்டுக்கு முன் மதிப்பாய்வு செய்யப்படும்.'],
  '/refunds':['பணத்திருப்பக் கொள்கை வரைவு','இந்த மாதிரியில் உண்மையான கட்டணம் அல்லது பணத்திருப்பம் இல்லை. இறுதி விதிமுறைகள் உரிமையாளர் ஒப்புதலுக்குப் பிறகு வெளியிடப்படும்.']
};
if(location.pathname==='/student') dashboard().catch(error=>error.message==='login_required'?signIn():notice.textContent='மீண்டும் முயற்சிக்கவும்.');
else if(location.pathname==='/teacher') teacherReview().catch(()=>teacherLogin());
else if(publicCopy[location.pathname]){
  const [title,copy]=publicCopy[location.pathname];
  app.innerHTML='<section><h1>'+title+'</h1><p>'+copy+'</p>'+(location.pathname==='/free-sample'?'<a href="/student">மாணவர் பகுதி</a>':'')+'</section>';
}
else app.innerHTML='<section class="hero"><div><h1>தரம் 5 கணிதம்</h1><p>தமிழில் 20 இலவச வினாக்கள். சமர்ப்பித்த பின் ஒவ்வொரு விடைக்கும் விளக்கம்.</p><a href="/student">மாணவர் பகுதி</a></div><img src="/images/maths-desk.webp" alt="கணிதக் குறிப்பேடும் அளவுகோலும்"></section><section><h2>முன்மொழியப்பட்ட கட்டணங்கள்</h2><p>மாதம் Rs. 990 · ஆண்டு Rs. 7,990. உரிமையாளர் ஒப்புதல் நிலுவையில் உள்ளது.</p></section>';
