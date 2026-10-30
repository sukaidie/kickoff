import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('schema: anonymous participants can join, but cannot modify others or cancel their matches',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; create publication supabase_realtime;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const host='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users values ($1),($2)',[host,guest]);
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${host}';`);
 const {rows:[{id}]}=await db.query("select public.create_match('Friday football','Cosmo','2099-01-09','18:00','Alex') as id");
 assert.equal((await db.query('select * from public.players')).rows.length,1);
 await assert.rejects(db.query("insert into public.matches(title,venue,match_date,match_time) values('Bad','Cosmo','2099-01-01','18:00')"),/permission denied/);
 await db.exec(`set request.jwt.claim.sub='${guest}';`);
 await db.query('select public.join_match($1,$2)',[id,'Sam']);
 assert.equal((await db.query('select * from public.players')).rows.length,2);
 await assert.rejects(db.query('select public.cancel_match($1)',[id]),/Only the organiser/);
 await assert.rejects(db.query("update public.players set name='Imposter'"),/permission denied/);
 await assert.rejects(db.query('select public.join_match($1,$2)',[id,'Duplicate']),/unique constraint/);
 await db.query('select public.leave_match($1)',[id]);
 assert.equal((await db.query('select name from public.players')).rows[0].name,'Alex');
 await db.exec(`set request.jwt.claim.sub='${host}';`);
 await assert.rejects(db.query("select public.create_match('Too late','Cosmo','2099-01-09','20:30','Alex')"),/check constraint/);
 await assert.rejects(db.query("select public.create_match('Past','Cosmo','2020-01-09','18:00','Alex')"),/future/);
 await db.query('select public.cancel_match($1)',[id]);
 await db.exec(`set request.jwt.claim.sub='${guest}';`);
 await assert.rejects(db.query('select public.join_match($1,$2)',[id,'Sam']),/closed/);
 await db.exec('set role anon;');
 await assert.rejects(db.query('select * from public.players'),/permission denied/);
 } finally {await db.close();}
});
