const { createOrder,processEvent,sign } = require('./preview-billing');
const { share,teacherAction } = require('./preview-teacher');
const { randomUUID } = require('node:crypto');
const { sendCode,verifyCode,sessionFor,studentName } = require('./preview-auth');
const { openAttempt,readAttempt,changeAttempt,selected,uuid,PortalError,first } = require('./practice');

function createHandler(db,secret) {
  if (!secret || secret.length<32) throw new Error('CMC_SECRET must be at least 32 characters');
  return async function handle(action,body,context) {
    if (action==='send') return sendCode(db,secret,{...body,ip:context.ip,device:context.device});
    if (action==='verify') return verifyCode(db,secret,{...body,device:context.device});
    if (typeof action==='string' && action.startsWith('teacher-')) return teacherAction(db,secret,action,body,context);
    const session = await sessionFor(db,secret,context.token);
    switch(action) {
      case 'logout':
        await db.query('DELETE FROM guardian_session WHERE token_key=$1',[session.token_key]);
        return {};
      case 'students':
        return {selected:session.student_id,students:(await db.query('SELECT id,name,grade FROM student WHERE guardian_id=$1 ORDER BY created_at',[session.guardian_id])).rows};
      case 'add':
        if (body.grade!==5 || !uuid(body.id)) throw new PortalError(400,'invalid_student');
        await db.query('INSERT INTO student(id,guardian_id,name,grade) VALUES ($1,$2,$3,5) ON CONFLICT DO NOTHING',[body.id,session.guardian_id,studentName(body.name)]);
        return {};
      case 'select': {
        await selected(db,{...session,student_id:uuid(body.id)?body.id:null});
        await db.query('UPDATE guardian_session SET student_id=$2 WHERE token_key=$1',[session.token_key,body.id]);
        return {};
      }
      case 'share':
        return share(db,session,body.enabled);
      case 'recommendations': {
        const student = await selected(db,session);
        return (await db.query(`SELECT k.name_ta,r.state FROM recommendation r
          JOIN skill k ON k.id=r.skill_id JOIN cohort_membership c USING(staff_subject,student_id)
          WHERE r.student_id=$1 AND c.shared_at IS NOT NULL`,[student.id])).rows;
      }
      case 'history': {
        const student = await selected(db,session);
        return (await db.query('SELECT id,locale,started_at,submitted_at FROM attempt WHERE student_id=$1 ORDER BY started_at DESC LIMIT 50',[student.id])).rows;
      }
      case 'billing': {
        const student = await selected(db,session);
        const plans = (await db.query('SELECT id,amount_minor,currency,period_months FROM plan ORDER BY period_months')).rows;
        const entitlement = await first(db,'SELECT state,paid_through FROM entitlement WHERE student_id=$1',[student.id]);
        const order = await first(db,'SELECT id,plan_id,amount_minor,currency,status FROM payment_order WHERE student_id=$1 ORDER BY created_at DESC LIMIT 1',[student.id]);
        return {plans,entitlement,order};
      }
      case 'order': {
        if(Date.now()-new Date(session.verified_at).getTime()>5*60_000) throw new PortalError(403,'fresh_verification');
        const {id,status,amount_minor,currency} = await createOrder(db,session,body.plan);
        return {id,status,amount_minor,currency};
      }
      case 'simulate-payment': {
        const student=await selected(db,session);
        if(!uuid(body.id)) throw new PortalError(404,'order_not_found');
        const order=await first(db,'SELECT * FROM payment_order WHERE id=$1 AND student_id=$2',[body.id,student.id]);
        if(!order) throw new PortalError(404,'order_not_found');
        const kind=body.kind;
        if(!['paid','failed','refund','cancel'].includes(kind)) throw new PortalError(400,'invalid_event');
        const event={id:'simulation:'+order.id+':'+kind,orderId:order.id,kind,amount:order.amount_minor,currency:order.currency,transactionId:'simulation:'+order.id};
        return processEvent(db,secret,event,sign(secret,event));
      }
      case 'start':
        return readAttempt(db,session,await openAttempt(db,session,body.locale||'ta',body.setId||'sample'));
      case 'read':
        return readAttempt(db,session,body.id);
      case 'save':
      case 'submit':
        return changeAttempt(db,session,body.id,body.revision,body.responses,action==='submit');
      default:
        throw new PortalError(404,'not_found');
    }
  };
}
module.exports = { createHandler };
