const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const tamil = require('./questions');
const english = require('./questions-en');

const topics = [
  ['numbers','எண்களும் கணக்கீடும்','Numbers and Operations'],
  ['fractions','பின்னங்கள்','Fractions'],
  ['measurement','அளவீடு','Measurement'],
  ['everyday','வாழ்க்கைக் கணிதம்','Everyday Maths']
];

async function migrate(db) {
  await db.exec(readFileSync(join(__dirname, '..', 'migrations', '001_practice.sql'), 'utf8'));
}

async function seed(db) {
  await db.transaction(async tx => {
    for (const topic of topics) {
      await tx.query('INSERT INTO skill(id,grade,name_ta,name_en) VALUES ($1,5,$2,$3) ON CONFLICT DO NOTHING', topic);
    }
    await tx.query("INSERT INTO practice_set(id,grade,mode,enabled) VALUES ('sample',5,'sample',true) ON CONFLICT DO NOTHING");
    for (const [locale, questions] of [['ta',tamil],['en',english]]) {
      for (const [index, item] of questions.entries()) {
        const id = 'g5-sample-' + (index + 1);
        const skill = topics.find(topic => topic.includes(item.topic))[0];
        await tx.query('INSERT INTO question VALUES ($1,$2) ON CONFLICT DO NOTHING', [id,skill]);
        const content = {
          prompt: item.prompt, options: item.options, steps: item.steps, solution: item.solution,
          rule: { type: item.options ? 'choice' : 'integer', answer: item.answer },
          attribution: 'Original Chithambara Maths Challenge demo sample'
        };
        await tx.query("INSERT INTO question_version VALUES ($1,1,$2,'draft','standard',$3) ON CONFLICT DO NOTHING", [id,locale,JSON.stringify(content)]);
        await tx.query("INSERT INTO practice_set_item VALUES ('sample',$1,$2,1,$3) ON CONFLICT DO NOTHING", [index+1,id,locale]);
      }
    }
    await tx.query("INSERT INTO practice_set(id,grade,mode,paid,enabled) VALUES ('preview-mixed',5,'mixed',true,true) ON CONFLICT DO NOTHING");
    await tx.query(`INSERT INTO practice_set_item(set_id,position,question_id,version,locale)
      SELECT 'preview-mixed',position,question_id,version,locale FROM practice_set_item
      WHERE set_id='sample' AND position<=5 ON CONFLICT DO NOTHING`);
    await tx.query("INSERT INTO plan(id,amount_minor,period_months) VALUES ('monthly',99000,1),('annual',799000,12) ON CONFLICT DO NOTHING");
  });
}

async function openDatabase() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({connectionString:process.env.DATABASE_URL,max:3});
    return {
      query: pool.query.bind(pool),
      exec: sql => pool.query(sql),
      close: () => pool.end(),
      async transaction(work) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const value = await work(client);
          await client.query('COMMIT');
          return value;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    };
  }
  const { PGlite } = require('@electric-sql/pglite');
  return new PGlite(process.env.CMC_LOCAL_DATABASE || '.preview-db');
}
module.exports = { openDatabase,migrate,seed };
