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

 // Guests cannot invoke any host management function, including spoofed match IDs.
 await db.exec(`set request.jwt.claim.sub='${guest}';`);
 const hostPlayer=(await db.query('select id from public.players where match_id=$1',[id])).rows[0].id;
 for(const [sql,args] of [
  ['select public.host_add_player($1,$2)',[id,'Unauthorised']],
  ['select public.host_remove_player($1,$2)',[id,hostPlayer]],
  ['select public.host_edit_player($1,$2,$3)',[id,hostPlayer,'Changed']],
  ['select public.host_edit_match($1,$2,$3,$4,$5)',[id,'Changed','Cosmo','2099-01-09','17:00']]
 ])await assert.rejects(db.query(sql,args),/Only the organiser/);
 await db.exec(`set request.jwt.claim.sub='${host}';`);
 await db.query('select public.host_add_player($1,$2)',[id,'Guest one']);
 await db.query('select public.host_add_player($1,$2)',[id,'Guest two']);
 const guests=(await db.query('select * from public.players where match_id=$1 and user_id is null order by name',[id])).rows;
 assert.equal(guests.length,2);
 await assert.rejects(db.query('select public.host_add_player($1,$2)',[id,'   ']),/check constraint/);
 await db.query('select public.host_edit_player($1,$2,$3)',[id,guests[0].id,'Renamed guest']);
 assert.equal((await db.query('select name from public.players where id=$1',[guests[0].id])).rows[0].name,'Renamed guest');
 await db.query('select public.host_edit_match($1,$2,$3,$4,$5)',[id,'Rescheduled','Cosmo','2099-01-10','19:00']);
 const updated=(await db.query('select * from public.matches where id=$1',[id])).rows[0];
 assert.equal(updated.title,'Rescheduled');assert.equal(updated.owner_id,host);assert.equal(updated.starts_at.toISOString(),'2099-01-10T18:00:00.000Z');
 await assert.rejects(db.query('select public.host_edit_match($1,$2,$3,$4,$5)',[id,'Bad time','Cosmo','2099-01-10','21:00']),/check constraint/);
 await assert.rejects(db.query('select public.host_edit_match($1,$2,$3,$4,$5)',[id,'Past','Cosmo','2020-01-10','18:00']),/future/);
 await db.query('select public.host_edit_match($1,$2,$3,$4,$5)',[id,'Late Merkur','Merkur Spiel-Arena','2099-01-10','23:30']);
 assert.equal((await db.query('select match_time from public.matches where id=$1',[id])).rows[0].match_time,'23:30:00');
 const early=(await db.query("select public.create_match('Early Merkur','Merkur Spiel-Arena','2099-01-11','06:00','Host') as id")).rows[0].id;
 assert.equal((await db.query('select owner_id from public.matches where id=$1',[early])).rows[0].owner_id,host);
 assert.equal((await db.query('select user_id from public.players where match_id=$1',[early])).rows[0].user_id,host);
 await db.query('select public.leave_match($1)',[early]);
 assert.equal((await db.query('select owner_id from public.matches where id=$1',[early])).rows[0].owner_id,host);
 await db.query('select public.host_add_player($1,$2)',[early,'Host still manages Merkur']);
 await db.query('delete from public.matches where id=$1',[early]);
 const foreign=(await db.query("select public.create_match('Other match','Cosmo','2099-01-09','18:00','Host') as id")).rows[0].id;
 await assert.rejects(db.query('select public.host_remove_player($1,$2)',[foreign,guests[0].id]),/Player not found/);
 for(const p of guests)await db.query('select public.host_remove_player($1,$2)',[id,p.id]);
 await db.query('delete from public.matches where id=$1',[foreign]);
 await db.exec('reset role;');
 await db.exec('alter table public.players alter column user_id set not null;'); // Original deployed schema.
 await db.exec(await readFile(new URL('../supabase/migrations/20261030_host_management.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261030_host_management.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select count(*)::int as n from public.players where match_id=$1',[id])).rows[0].n,1);
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${host}';`);
 await db.query('select public.cancel_match($1)',[id]);
 await assert.rejects(db.query('select public.host_add_player($1,$2)',[id,'Closed guest']),/closed/);
 await assert.rejects(db.query('select public.host_edit_player($1,$2,$3)',[id,hostPlayer,'Closed name']),/closed/);
 await assert.rejects(db.query('select public.host_remove_player($1,$2)',[id,hostPlayer]),/closed/);
 await assert.rejects(db.query('select public.host_edit_match($1,$2,$3,$4,$5)',[id,'Closed','Cosmo','2099-01-09','18:00']),/closed/);
 await db.exec(`set request.jwt.claim.sub='${guest}';`);
 await assert.rejects(db.query('select public.join_match($1,$2)',[id,'Sam']),/closed/);
 await assert.rejects(db.query('delete from public.players'),/permission denied/);
 assert.equal((await db.query('delete from public.matches where id=$1 returning id',[id])).rows.length,0);
 await db.exec(`set request.jwt.claim.sub='${host}';`);
 assert.equal((await db.query('delete from public.matches where id=$1 returning id',[id])).rows.length,1);
 assert.equal((await db.query('select * from public.players')).rows.length,0);
 await db.exec('reset role;');
 await db.exec(await readFile(new URL('../supabase/migrations/20261030_owner_delete_matches.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261030_owner_delete_matches.sql',import.meta.url),'utf8'));
 await db.exec('set role anon;');
 await assert.rejects(db.query('select * from public.players'),/permission denied/);
 } finally {await db.close();}
});
