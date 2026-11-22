const { createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual } = require('node:crypto');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');
const { first,PortalError,uuid } = require('./practice');

const notice = 'guardian-notice-v1';
const lock = (db,key) => db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
const digest = (secret,value) => createHmac('sha256',secret).update(value).digest('hex');

function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 40) throw new PortalError(400,'invalid_mobile');
  const phone = parsePhoneNumberFromString(value,{defaultCountry:'LK',extract:false});
  if (phone?.country !== 'LK' || !phone.isValid() || phone.getType() !== 'MOBILE') throw new PortalError(400,'invalid_mobile');
  return phone.number;
}
function studentName(value) {
  const name = typeof value==='string' ? value.trim() : '';
  if (!name || name.length>80) throw new PortalError(400,'invalid_student_name');
  return name;
}

async function sendCode(db,secret,{phone,name,grade,confirmed,ip,device}) {
  const phoneKey = digest(secret,'phone:'+normalizePhone(phone));
  if (name != null && (grade!==5 || confirmed!==true)) throw new PortalError(400,'confirmation_required');
  const signupName = name==null ? null : studentName(name);
  const ipKey = digest(secret,'ip:'+ip);
  const deviceKey = digest(secret,'device:'+device);
  const id = randomUUID();
  const code = String(randomInt(0,1_000_000)).padStart(6,'0');
  await db.transaction(async tx => {
    for (const key of [phoneKey,ipKey,deviceKey].sort()) await lock(tx,key);
    const limits = await first(tx,`SELECT
      count(*) FILTER(WHERE phone_key=$1) AS phone,
      count(*) FILTER(WHERE ip_key=$2) AS ip,
      count(*) FILTER(WHERE device_key=$3) AS device,
      count(*) FILTER(WHERE phone_key=$1 AND created_at>now()-interval '60 seconds') AS cooldown
      FROM otp_challenge WHERE created_at>now()-interval '1 hour'`,[phoneKey,ipKey,deviceKey]);
    if ([limits.phone,limits.device].some(n=>Number(n)>=5) || Number(limits.ip)>=15 || Number(limits.cooldown)) throw new PortalError(429,'try_later');
    await tx.query('UPDATE otp_challenge SET consumed_at=now() WHERE phone_key=$1 AND consumed_at IS NULL',[phoneKey]);
    await tx.query("INSERT INTO otp_challenge(id,phone_key,ip_key,device_key,proof,expires_at,signup_name) VALUES ($1,$2,$3,$4,$5,now()+interval '5 minutes',$6)",[id,phoneKey,ipKey,deviceKey,digest(secret,id+':'+code),signupName]);
  });
  return { id, simulationCode:code };
}

async function verifyCode(db,secret,{id,code,device}) {
  if (!uuid(id) || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new PortalError(400,'invalid_code');
  const session = await db.transaction(async tx => {
    const phone = await first(tx,'SELECT phone_key FROM otp_challenge WHERE id=$1',[id]);
    if (!phone) return null;
    await lock(tx,phone.phone_key);
    const otp = await first(tx,`SELECT * FROM otp_challenge WHERE id=$1 AND expires_at>now()
      AND consumed_at IS NULL AND attempts<5 AND device_key=$2 FOR UPDATE`,[id,digest(secret,'device:'+device)]);
    if (!otp) return null;
    const expected = digest(secret,id+':'+code);
    if (!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(otp.proof,'hex'))) {
      await tx.query('UPDATE otp_challenge SET attempts=attempts+1 WHERE id=$1',[id]);
      return null;
    }
    await tx.query('UPDATE otp_challenge SET consumed_at=now(),signup_name=NULL WHERE id=$1',[id]);
    const token = randomBytes(32).toString('hex');
    let guardian = await first(tx,'SELECT id FROM guardian WHERE phone_key=$1',[otp.phone_key]);
    if (!guardian && !otp.signup_name) return null;
    let studentId = null;
    if (!guardian) {
      guardian = {id:randomUUID()};
      studentId = randomUUID();
      await tx.query('INSERT INTO guardian(id,phone_key) VALUES ($1,$2)',[guardian.id,otp.phone_key]);
      await tx.query('INSERT INTO consent(guardian_id,version) VALUES ($1,$2)',[guardian.id,notice]);
      await tx.query('INSERT INTO student(id,guardian_id,name,grade) VALUES ($1,$2,$3,5)',[studentId,guardian.id,otp.signup_name]);
    } else {
      await tx.query('UPDATE guardian SET verified_at=now() WHERE id=$1',[guardian.id]);
    }
    await tx.query("INSERT INTO guardian_session(token_key,guardian_id,student_id,expires_at) VALUES ($1,$2,$3,now()+interval '8 hours')",[digest(secret,token),guardian.id,studentId]);
    return { token };
  });
  if (!session) throw new PortalError(400,'invalid_code');
  return session;
}

async function sessionFor(db,secret,token) {
  if (!/^[\da-f]{64}$/.test(token||'')) throw new PortalError(401,'login_required');
  const session = await first(db,'SELECT * FROM guardian_session WHERE token_key=$1 AND expires_at>now()',[digest(secret,token)]);
  if (!session) throw new PortalError(401,'login_required');
  return session;
}
module.exports = { normalizePhone,studentName,sendCode,verifyCode,sessionFor };
