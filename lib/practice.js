const { randomUUID } = require('node:crypto');
const { mark } = require('./marking');

class PortalError extends Error {
  constructor(status,code) { super(code);this.status=status;this.code=code; }
}
const first = async (db,sql,args=[]) => (await db.query(sql,args)).rows[0];
const uuid = value => typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);

async function selected(db, session) {
  if (!session.student_id) throw new PortalError(403,'select_student');
  const student = await first(db,'SELECT * FROM student WHERE id=$1 AND guardian_id=$2',[session.student_id,session.guardian_id]);
  if (!student) throw new PortalError(403,'select_student');
  return student;
}

async function openAttempt(db, session, locale, setId = 'sample') {
  if (!['ta','en'].includes(locale)) throw new PortalError(400,'invalid_locale');
  const student = await selected(db,session);
  return db.transaction(async tx => {
    await tx.query('SELECT id FROM student WHERE id=$1 FOR UPDATE',[student.id]);
    const set = await first(tx,'SELECT * FROM practice_set WHERE id=$1 AND grade=$2 AND enabled',[setId,student.grade]);
    if (!set) throw new PortalError(404,'set_unavailable');
    if (set.paid && !await first(tx,"SELECT 1 FROM entitlement WHERE student_id=$1 AND state IN ('active','cancelled') AND paid_through>now()",[student.id])) throw new PortalError(403,'paid_access_required');
    const existing = await first(tx,'SELECT id FROM attempt WHERE student_id=$1 AND set_id=$2 AND locale=$3 AND submitted_at IS NULL',[student.id,setId,locale]);
    if (existing) return existing.id;
    const id = randomUUID();
    await tx.query('INSERT INTO attempt(id,student_id,set_id,locale) VALUES ($1,$2,$3,$4)',[id,student.id,setId,locale]);
    const inserted = await tx.query(`INSERT INTO attempt_item(attempt_id,position,question_id,version,locale)
      SELECT $1,i.position,i.question_id,i.version,i.locale FROM practice_set_item i
      JOIN question_version v USING(question_id,version,locale)
      WHERE i.set_id=$2 AND i.locale=$3 AND (v.status='published' OR $4)`,[id,setId,locale,set.mode==='sample' || set.id==='preview-mixed']);
    if (!(inserted.rowCount ?? inserted.affectedRows)) throw new PortalError(404,'set_unavailable');
    return id;
  });
}

async function attemptFor(db, session, id, lock=false) {
  if (!uuid(id)) throw new PortalError(404,'attempt_not_found');
  const student = await selected(db,session);
  const attempt = await first(db,`SELECT a.*,s.paid FROM attempt a JOIN practice_set s ON s.id=a.set_id
    WHERE a.id=$1 AND a.student_id=$2${lock?' FOR UPDATE OF a':''}`,[id,student.id]);
  if (!attempt) throw new PortalError(404,'attempt_not_found');
  if (attempt.paid && !attempt.submitted_at && !await first(db,`SELECT 1 FROM entitlement WHERE student_id=$1
    AND (state IN ('active','cancelled') AND paid_through>now() OR state IN ('active','cancelled','expired')
    AND $2::timestamptz<paid_through AND now()<=paid_through+interval '24 hours')`,[student.id,attempt.started_at])) throw new PortalError(403,'paid_access_required');
  return attempt;
}

async function itemsFor(db,id) {
  return (await db.query(`SELECT i.*,v.content,q.skill_id FROM attempt_item i
    JOIN question_version v USING(question_id,version,locale)
    JOIN question q ON q.id=i.question_id WHERE i.attempt_id=$1 ORDER BY i.position`,[id])).rows;
}

async function readAttempt(db,session,id) {
  return db.transaction(async tx => {
    const attempt = await attemptFor(tx,session,id,true);
    const items = await itemsFor(tx,id);
    return {
      id, revision:attempt.revision, submittedAt:attempt.submitted_at,
      items:items.map(({position,question_id,version,skill_id,response,status,content}) => ({
        position,questionId:question_id,version,skill:skill_id,response,status,
        prompt:content.prompt,options:content.options,
        ...(attempt.submitted_at ? { solution:content.solution,steps:content.steps } : {})
      }))
    };
  });
}

async function changeAttempt(db,session,id,revision,responses,submit) {
  if (!Number.isInteger(revision) || !responses || typeof responses !== 'object' || Array.isArray(responses)) throw new PortalError(400,'invalid_responses');
  await db.transaction(async tx => {
    const attempt = await attemptFor(tx,session,id,true);
    if (attempt.submitted_at) {
      if (submit) return;
      throw new PortalError(409,'already_submitted');
    }
    if (revision !== attempt.revision) throw new PortalError(409,'revision_conflict');
    const items = await itemsFor(tx,id);
    if (Object.entries(responses).some(([key,value]) => !items.some(item=>String(item.position)===key) || typeof value!=='string' || value.length>128)) throw new PortalError(400,'invalid_responses');
    for (const item of items) {
      const response = responses[item.position] ?? item.response;
      const status = submit ? mark(response,item.content.rule) : 'unsubmitted';
      await tx.query('UPDATE attempt_item SET response=$3,status=$4 WHERE attempt_id=$1 AND position=$2',[id,item.position,response,status]);
      if (status === 'correct') await tx.query("UPDATE recommendation SET state='improved' WHERE student_id=$1 AND skill_id=$2 AND state='recommended'",[attempt.student_id,item.skill_id]);
    }
    await tx.query('UPDATE attempt SET revision=revision+1,submitted_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1',[id,submit]);
  });
  return readAttempt(db,session,id);
}
module.exports = { PortalError,first,uuid,selected,openAttempt,readAttempt,changeAttempt };
