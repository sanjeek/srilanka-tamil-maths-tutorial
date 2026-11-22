const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const { openDatabase,migrate,seed } = require('../lib/preview-db');
const publicPaths = ['/', '/student','/teacher','/how-it-works','/topics','/free-sample','/pricing','/faq','/contact','/privacy','/terms','/refunds'];
const { createHandler } = require('../lib/preview-handler');

async function main() {
  if (process.env.CMC_TEST_ADAPTERS!=='true') throw new Error('Preview requires CMC_TEST_ADAPTERS=true');
  const origin = new URL(process.env.CMC_ORIGIN || 'http://localhost:3000');
  if (origin.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(origin.hostname)) throw new Error('Synthetic preview must run on loopback');
  const db = await openDatabase();
  await migrate(db);
  await seed(db);
  const handle = createHandler(db,process.env.CMC_SECRET);
  const root = join(__dirname,'..');
  const server = createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const url = new URL(req.url,origin);
    if (req.method==='GET' && [...publicPaths,'/preview.js','/images/maths-desk.webp'].includes(url.pathname)) {
      const filename = {'/':'preview.html','/student':'preview.html','/teacher':'preview.html','/preview.js':'preview/client.js','/images/maths-desk.webp':'images/maths-desk.webp'}[url.pathname] || 'preview.html';
      res.setHeader('Content-Type',filename.endsWith('.js')?'application/javascript':filename.endsWith('.webp')?'image/webp':'text/html; charset=utf-8');
      return res.end(readFileSync(join(root,filename)));
    }
    res.setHeader('Content-Type','application/json');
    try {
      if (req.method!=='POST' || url.pathname!=='/api/preview') {
        res.statusCode=404;
        return res.end(JSON.stringify({error:'not_found'}));
      }
      if (req.headers.origin!==origin.origin || req.headers.host!==origin.host || !req.headers['content-type']?.startsWith('application/json')) {
        res.statusCode=403;
        return res.end(JSON.stringify({error:'forbidden'}));
      }
      const cookies = Object.fromEntries((req.headers.cookie||'').split('; ').map(item=>item.split('=')));
      const device = cookies.cmc_device || randomUUID();
      const parts = [];
      let length=0;
      for await (const chunk of req) {
        length+=chunk.length;
        if (length>16384) { res.statusCode=413;return res.end(JSON.stringify({error:'request_too_large'})); }
        parts.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(parts).toString('utf8'));
      const headers = ['cmc_device='+device+'; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict'];
      res.setHeader('Set-Cookie',headers);
      const result = await handle(data.action,data,{token:cookies.cmc_session,staffToken:cookies.cmc_staff,ip:req.socket.remoteAddress,device});
      if (data.action==='verify') {
        headers.push('cmc_session='+result.token+'; Path=/; Max-Age=28800; HttpOnly; SameSite=Strict');
        delete result.token;
      }
      if (data.action==='teacher-login') {
        headers.push('cmc_staff='+result.staffToken+'; Path=/; Max-Age=3600; HttpOnly; SameSite=Strict');
        delete result.staffToken;
      }
      if (data.action==='teacher-logout') headers.push('cmc_staff=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
      if (data.action==='logout') headers.push('cmc_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
      res.setHeader('Set-Cookie',headers);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode=error.status || (error instanceof SyntaxError?400:500);
      res.end(JSON.stringify({error:error.status?error.code:'request_failed'}));
    }
  });
  server.listen(Number(origin.port||80), '127.0.0.1',()=>console.log('Synthetic preview: '+origin.origin));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
