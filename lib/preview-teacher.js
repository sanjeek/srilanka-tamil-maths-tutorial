const { createHmac,randomBytes,randomUUID,timingSafeEqual } = require('node:crypto');
const { PortalError,first,selected,uuid } = require('./practice');
const subject = 'preview-kavithan';
const digest = (secret,value) => createHmac('sha256',secret).update(value).digest('hex');
async function audit(db,actor,action,target) {
  await db.query('INSERT INTO audit_event(id,actor,action,subject) VALUES ($1,$2,$3,$4)',[randomUUID(),actor,action,target]);
}
async function share(db,session,enabled) {
  if (typeof enabled!=='boolean') throw new PortalError(400,'invalid_sharing');
  if (Date.now()-new Date(session.verified_at).getTime()>5*60_000) throw new PortalError(403,'fresh_verification');
  const student=await selected(db,session);
  const staff=await first(db,'SELECT subject FROM staff_identity WHERE subject=$1 AND active',[subject]);
  if(!staff) throw new PortalError(503,'teacher_unavailable');
  await db.transaction(async tx=>{
    if(enabled) await tx.query(`INSERT INTO cohort_membership(staff_subject,student_id,shared_at) VALUES ($1,$2,now())
      ON CONFLICT(staff_subject,student_id) DO UPDATE SET shared_at=now()`,[subject,student.id]);
    else await tx.query('UPDATE cohort_membership SET shared_at=NULL WHERE staff_subject=$1 AND student_id=$2',[subject,student.id]);
    await audit(tx,session.guardian_id,enabled?'share_enabled':'share_withdrawn',student.id);
  });
  return {};
}
async function teacherAction(db,secret,action,body,context) {
  if(action==='teacher-login'){
    const password=process.env.CMC_PREVIEW_TEACHER_PASSWORD;
    if(!password||typeof body.password!=='string'||body.password.length>128||
      !timingSafeEqual(Buffer.from(digest(secret,body.password)),Buffer.from(digest(secret,password)))) throw new PortalError(401,'login_required');
    const token=randomBytes(32).toString('hex');
    await db.transaction(async tx=>{
      await tx.query("INSERT INTO staff_identity(subject,name,active) VALUES ($1,'K. Kavithan',true) ON CONFLICT DO NOTHING",[subject]);
      await tx.query("INSERT INTO staff_session VALUES ($1,$2,now()+interval '1 hour')",[digest(secret,token),subject]);
      await audit(tx,subject,'preview_staff_login',subject);
    });
    return {staffToken:token};
  }
  if(!/^[\da-f]{64}$/.test(context.staffToken||'')) throw new PortalError(401,'login_required');
  const tokenKey=digest(secret,context.staffToken);
  const staff=await first(db,`SELECT i.subject FROM staff_session s JOIN staff_identity i ON i.subject=s.staff_subject
    WHERE s.token_key=$1 AND s.expires_at>now() AND i.active`,[tokenKey]);
  if(!staff) throw new PortalError(401,'login_required');
  if(action==='teacher-logout'){
    await db.query('DELETE FROM staff_session WHERE token_key=$1',[tokenKey]);
    return {};
  }
  if(action==='teacher-review'){
    const status=body.status==='skipped'?'skipped':'incorrect';
    return db.transaction(async tx=>{
      const {rows}=await tx.query(`SELECT s.id AS student_id,s.name,i.attempt_id,i.position,i.question_id,i.version,i.response,i.status,
        a.submitted_at,q.skill_id,v.content->>'prompt' AS prompt,v.content->>'solution' AS solution,
        v.content->'steps' AS steps,v.content->'options' AS options,
        (SELECT coalesce(jsonb_agg(n.body ORDER BY n.created_at),'[]'::jsonb) FROM teacher_note n
         WHERE n.staff_subject=c.staff_subject AND n.attempt_id=i.attempt_id AND n.position=i.position) AS notes
        FROM cohort_membership c JOIN student s ON s.id=c.student_id JOIN attempt a ON a.student_id=s.id
        JOIN attempt_item i ON i.attempt_id=a.id JOIN question q ON q.id=i.question_id
        JOIN question_version v ON v.question_id=i.question_id AND v.version=i.version AND v.locale=i.locale
        WHERE c.staff_subject=$1 AND c.shared_at IS NOT NULL AND a.submitted_at IS NOT NULL
        AND i.status=$2 ORDER BY a.submitted_at DESC,i.position LIMIT 100`,[staff.subject,status]);
      await audit(tx,staff.subject,'review_queue',status);
      return rows;
    });
  }
  if(['teacher-recommend','teacher-note'].includes(action)){
    if(!uuid(body.id)||!Number.isInteger(body.position)) throw new PortalError(404,'not_found');
    return db.transaction(async tx=>{
      const item=await first(tx,`SELECT a.student_id,q.skill_id FROM cohort_membership c
        JOIN attempt a ON a.student_id=c.student_id JOIN attempt_item i ON i.attempt_id=a.id
        JOIN question q ON q.id=i.question_id
        WHERE c.staff_subject=$1 AND c.shared_at IS NOT NULL AND a.id=$2 AND i.position=$3
        AND a.submitted_at IS NOT NULL AND i.status IN ('incorrect','skipped') FOR UPDATE OF c`,[staff.subject,body.id,body.position]);
      if(!item) throw new PortalError(404,'not_found');
      if(action==='teacher-note'){
        const note=typeof body.note==='string'?body.note.trim():'';
        if(!note||note.length>800) throw new PortalError(400,'invalid_note');
        await tx.query('INSERT INTO teacher_note(id,staff_subject,attempt_id,position,body) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),staff.subject,body.id,body.position,note]);
        await audit(tx,staff.subject,'add_private_note',body.id);
        return {};
      }
      await tx.query(`INSERT INTO recommendation(staff_subject,student_id,skill_id,state) VALUES ($1,$2,$3,'recommended')
        ON CONFLICT(staff_subject,student_id,skill_id) DO UPDATE SET state='recommended',created_at=now()`,[staff.subject,item.student_id,item.skill_id]);
      await audit(tx,staff.subject,'recommend_skill',body.id);
      return {};
    });
  }
  throw new PortalError(404,'not_found');
}
module.exports = { share,teacherAction };
