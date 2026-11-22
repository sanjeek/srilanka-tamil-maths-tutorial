const { createHmac, randomUUID,timingSafeEqual } = require('node:crypto');
const { selected,first,PortalError,uuid } = require('./practice');
const sign = (secret,event) => createHmac('sha256',secret).update(JSON.stringify([
  event.id,event.orderId,event.kind,event.amount,event.currency,event.transactionId
])).digest('hex');

async function createOrder(db,session,planId) {
  const student=await selected(db,session);
  return db.transaction(async tx=>{
    await tx.query('SELECT id FROM student WHERE id=$1 FOR UPDATE',[student.id]);
    const plan=await first(tx,'SELECT * FROM plan WHERE id=$1',[planId]);
    if(!plan) throw new PortalError(404,'plan_unavailable');
    if(await first(tx,"SELECT 1 FROM entitlement WHERE student_id=$1 AND state IN ('active','cancelled') AND paid_through>now()",[student.id])) throw new PortalError(409,'already_entitled');
    const pending=await first(tx,"SELECT * FROM payment_order WHERE student_id=$1 AND status='pending'",[student.id]);
    if(pending) {
      if(pending.plan_id!==planId) throw new PortalError(409,'pending_order');
      return pending;
    }
    return first(tx,`INSERT INTO payment_order(id,student_id,plan_id,amount_minor,currency,period_months,status)
      VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,[randomUUID(),student.id,plan.id,plan.amount_minor,plan.currency,plan.period_months]);
  });
}

async function processEvent(db,secret,event,proof) {
  if(typeof proof!=='string'||!(/^[\da-f]{64}$/.test(proof))||
    !timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(sign(secret,event),'hex'))) throw new PortalError(403,'invalid_callback');
  if(!uuid(event.orderId)||typeof event.id!=='string'||typeof event.transactionId!=='string'||
    !['paid','failed','refund','cancel'].includes(event.kind)) throw new PortalError(400,'invalid_event');
  return db.transaction(async tx=>{
    const reference=await first(tx,'SELECT student_id FROM payment_order WHERE id=$1',[event.orderId]);
    if(!reference) throw new PortalError(404,'order_not_found');
    await tx.query('SELECT id FROM student WHERE id=$1 FOR UPDATE',[reference.student_id]);
    const order=await first(tx,'SELECT * FROM payment_order WHERE id=$1 FOR UPDATE',[event.orderId]);
    if(order.amount_minor!==event.amount||order.currency!==event.currency||
      (order.transaction_id&&order.transaction_id!==event.transactionId)) throw new PortalError(400,'payment_mismatch');
    const existing=await first(tx,'SELECT * FROM payment_event WHERE provider_id=$1',[event.id]);
    if(existing){
      if(existing.order_id!==event.orderId||existing.kind!==event.kind) throw new PortalError(409,'event_conflict');
      return {status:order.status};
    }
    const next={paid:'active',failed:'failed',refund:'refunded',cancel:'cancelled'}[event.kind];
    const transition=event.kind==='paid'?order.status==='pending':
      event.kind==='failed'?order.status==='pending':
      ['active','cancelled'].includes(order.status);
    if(!transition) throw new PortalError(409,'invalid_transition');
    await tx.query('INSERT INTO payment_event(provider_id,order_id,kind) VALUES ($1,$2,$3)',[event.id,order.id,event.kind]);
    await tx.query('UPDATE payment_order SET status=$2,transaction_id=$3 WHERE id=$1',[order.id,next,event.transactionId]);
    if(event.kind==='paid') {
      if(await first(tx,"SELECT 1 FROM entitlement WHERE student_id=$1 AND state IN ('active','cancelled') AND paid_through>now()",[order.student_id])) throw new PortalError(409,'already_entitled');
      await tx.query(`INSERT INTO entitlement(student_id,order_id,paid_through,state)
        VALUES ($1,$2,now()+make_interval(months=>$3),'active') ON CONFLICT(student_id) DO UPDATE
        SET order_id=excluded.order_id,paid_through=excluded.paid_through,state=excluded.state`,[order.student_id,order.id,order.period_months]);
    }
    if(event.kind==='refund'||event.kind==='cancel') await tx.query('UPDATE entitlement SET state=$2 WHERE order_id=$1',[order.id,next]);
    return {status:next};
  });
}
module.exports={createOrder,processEvent,sign};
