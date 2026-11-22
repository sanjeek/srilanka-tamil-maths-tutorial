const test=require('node:test');
const assert=require('node:assert/strict');
const { randomUUID }=require('node:crypto');
const { PGlite }=require('@electric-sql/pglite');
const { migrate,seed }=require('../lib/preview-db');
const { normalizePhone }=require('../lib/preview-auth');
const { createHandler }=require('../lib/preview-handler');
const { mark }=require('../lib/marking');
const { createOrder,processEvent,sign }=require('../lib/preview-billing');

test('Sri Lankan phone normalization and exact marking',()=>{
  assert.equal(normalizePhone('077 123 4567'),normalizePhone('+94 77 123 4567'));
  assert.throws(()=>normalizePhone('011 234 5678'),{code:'invalid_mobile'});
  for(const [input,rule,result] of [
    [' 00 ',{type:'integer',answer:'0'},'correct'],
    ['௭,௬௦௦',{type:'integer',answer:'7600'},'correct'],
    ['6/8',{type:'fraction',answer:'3/4'},'correct'],
    ['2/3',{type:'fraction',answer:'3/4'},'incorrect'],
    ['2/0',{type:'fraction',answer:'3/4'},'incorrect'],
    [' 1.50 ',{type:'decimal',answer:'1.5',maxDecimalPlaces:2},'correct'],
    ['1e0',{type:'integer',answer:'1'},'incorrect'],
    ['  ',{type:'choice',answer:'0'},'skipped']
  ]) assert.equal(mark(input,rule),result);
});

test('synthetic family, draft, final marking, teacher access and billing ledger',async()=>{
  const db=new PGlite();
  const secret='synthetic-test-key-with-at-least-32-characters';
  process.env.CMC_PREVIEW_TEACHER_PASSWORD='synthetic-staff-password';
  try{
    await migrate(db);
    await seed(db);
    await seed(db);
    const handle=createHandler(db,secret);
    const device={ip:'127.0.0.1',device:'device-1'};
    const draft=await handle('send',{phone:'077 123 4567',name:'Test child A',grade:5,confirmed:true},device);
    await assert.rejects(handle('send',{phone:'+94 77 123 4567'},device),{code:'try_later'});
    const wrong=draft.simulationCode==='000000'?'000001':'000000';
    await assert.rejects(handle('verify',{id:draft.id,code:wrong},device),{code:'invalid_code'});
    const expired=await handle('send',{phone:'071 555 1234',name:'Expired example',grade:5,confirmed:true},{...device,device:'device-expired'});
    await db.query("UPDATE otp_challenge SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
    await assert.rejects(handle('verify',{id:expired.id,code:expired.simulationCode},{...device,device:'device-expired'}),{code:'invalid_code'});
    const login=await handle('verify',{id:draft.id,code:draft.simulationCode},device);
    await assert.rejects(handle('verify',{id:draft.id,code:draft.simulationCode},device),{code:'invalid_code'});
    const auth={...device,token:login.token};
    const family=await handle('students',{},auth);
    const child=family.selected;
    const sibling=randomUUID();
    const siblingData={id:sibling,name:'Test child B',grade:5};
    await handle('add',siblingData,auth);await handle('add',siblingData,auth);
    assert.equal((await handle('students',{},auth)).students.length,2);
    const attempt=await handle('start',{locale:'ta'},auth);
    assert.equal(attempt.items.length,20);
    assert.ok(attempt.items.every(item=>!item.solution&&!item.steps&&!item.rule));
    assert.equal((await db.query('SELECT count(*) AS n FROM payment_order')).rows[0].n,0);
    const saved=await handle('save',{id:attempt.id,revision:0,responses:{1:'0'}},auth);
    assert.equal((await handle('start',{locale:'ta'},auth)).items[0].response,'0');
    await assert.rejects(handle('save',{id:attempt.id,revision:0,responses:{}},auth),{code:'revision_conflict'});
    const final=await handle('submit',{id:attempt.id,revision:saved.revision,responses:{}},auth);
    assert.equal(final.items[0].status,'incorrect');
    assert.equal(final.items[1].status,'skipped');
    assert.equal(final.items.filter(i=>i.steps).length,20);
    assert.deepEqual(await handle('submit',{id:attempt.id,revision:saved.revision,responses:{}},auth),final);
    await db.query("INSERT INTO question_version SELECT question_id,2,locale,'draft',difficulty,jsonb_set(content,'{solution}','\"new\"') FROM question_version WHERE question_id='g5-sample-1'");
    assert.equal((await handle('read',{id:attempt.id},auth)).items[0].solution,final.items[0].solution);
    await handle('select',{id:sibling},auth);
    await assert.rejects(handle('read',{id:attempt.id},auth),{code:'attempt_not_found'});
    assert.equal((await handle('history',{},auth)).length,0);
    await handle('select',{id:child},auth);
    const staff=await handle('teacher-login',{password:process.env.CMC_PREVIEW_TEACHER_PASSWORD},device);
    assert.equal((await handle('teacher-review',{},staff)).length,0);
    await handle('share',{enabled:true},auth);
    const report=await handle('teacher-review',{},staff);
    assert.equal(report[0].response,'0');
    assert.equal(report[0].version,1);
    assert.equal((await handle('teacher-review',{status:'skipped'},staff)).length,19);
    await handle('teacher-note',{id:attempt.id,position:1,note:'Synthetic teaching note'},staff);
    assert.deepEqual((await handle('teacher-review',{},staff))[0].notes,['Synthetic teaching note']);
    assert.equal((await handle('read',{id:attempt.id},auth)).items[0].notes,undefined);
    await handle('teacher-recommend',{id:attempt.id,position:1},staff);
    assert.equal((await handle('recommendations',{},auth))[0].state,'recommended');
    await handle('share',{enabled:false},auth);
    assert.equal((await handle('teacher-review',{},staff)).length,0);
    await assert.rejects(handle('teacher-recommend',{id:attempt.id,position:1},staff),{code:'not_found'});
    const session={student_id:child,guardian_id:(await db.query('SELECT id FROM guardian')).rows[0].id};
    await assert.rejects(handle('start',{setId:'preview-mixed'},auth),{code:'paid_access_required'});
    const order=await createOrder(db,session,'monthly');
    assert.equal((await db.query('SELECT count(*) AS n FROM entitlement')).rows[0].n,0);
    const event={id:'p1',orderId:order.id,kind:'paid',amount:99000,currency:'LKR',transactionId:'t1'};
    const bad={...event,currency:'USD'};
    await assert.rejects(processEvent(db,secret,bad,sign(secret,bad)),{code:'payment_mismatch'});
    await processEvent(db,secret,event,sign(secret,event));
    await processEvent(db,secret,event,sign(secret,event));
    const grants=(await db.query('SELECT student_id,state FROM entitlement')).rows;
    assert.deepEqual(grants,[{student_id:child,state:'active'}]);
    const paid=await handle('start',{setId:'preview-mixed'},auth);
    assert.equal(paid.items.length,5);
    await handle('save',{id:paid.id,revision:0,responses:{1:'0'}},auth);
    assert.equal((await handle('start',{setId:'preview-mixed'},auth)).items[0].response,'0');
    await handle('select',{id:sibling},auth);
    await assert.rejects(handle('start',{setId:'preview-mixed'},auth),{code:'paid_access_required'});
    await handle('select',{id:child},auth);
    const cancel={...event,id:'c1',kind:'cancel'};
    await processEvent(db,secret,cancel,sign(secret,cancel));
    assert.equal((await db.query('SELECT state FROM entitlement')).rows[0].state,'cancelled');
    await handle('read',{id:paid.id},auth);
    const refund={...event,id:'r1',kind:'refund'};
    await processEvent(db,secret,refund,sign(secret,refund));
    assert.equal((await db.query('SELECT state FROM entitlement')).rows[0].state,'refunded');
    await assert.rejects(handle('read',{id:paid.id},auth),{code:'paid_access_required'});
    const failedOrder=await createOrder(db,session,'annual');
    const failed={id:'f1',orderId:failedOrder.id,kind:'failed',amount:799000,currency:'LKR',transactionId:'t2'};
    await processEvent(db,secret,failed,sign(secret,failed));
    assert.equal((await db.query('SELECT state FROM entitlement')).rows[0].state,'refunded');
    const nextOrder=await createOrder(db,session,'monthly');
    const nextPaid={...event,id:'p2',orderId:nextOrder.id,transactionId:'t3'};
    await processEvent(db,secret,nextPaid,sign(secret,nextPaid));
    await db.query("UPDATE entitlement SET paid_through=now()-interval '25 hours',state='expired' WHERE student_id=$1",[child]);
    await assert.rejects(handle('start',{setId:'preview-mixed'},auth),{code:'paid_access_required'});
  }finally{await db.close();}
});
