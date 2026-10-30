import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('ordinary users register multiple players and manage only their own; host retains full control',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');
 // Start with the previously deployed schema, then migrate existing records.
 await db.exec(schema.slice(0,schema.indexOf('-- Multiple-player registration ownership'))+'commit;');
 const host='11111111-1111-4111-8111-111111111111',alice='22222222-2222-4222-8222-222222222222',bob='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1),($2),($3)',[host,alice,bob]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await as(host);const mid=(await db.query("select public.create_match('Group game','Cosmo','2099-01-09','18:00','Host') as id")).rows[0].id;
 await db.query('select public.host_add_player($1,$2)',[mid,'Old host entry']);await as(alice);await db.query('select public.join_match($1,$2)',[mid,'Alice']);
 await db.exec('reset role');const migration=await readFile(new URL('../supabase/migrations/20261030_multiple_players.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 const original=(await db.query('select * from public.players where match_id=$1',[mid])).rows;
 assert.equal(original.find(p=>p.name==='Alice').added_by,alice);assert.equal(original.find(p=>p.name==='Old host entry').added_by,host);
 const hostPlayer=original.find(p=>p.name==='Host').id,alicePlayer=original.find(p=>p.name==='Alice').id;
 await as(alice);for(const name of ['Friend one','Friend two'])await db.query('select public.add_player($1,$2)',[mid,name]);
 const friends=(await db.query('select * from public.players where match_id=$1 and user_id is null and added_by=$2',[mid,alice])).rows;assert.equal(friends.length,2);
 await db.query('select public.edit_player($1,$2,$3)',[mid,friends[0].id,'Renamed friend']);
 await assert.rejects(db.query('select public.edit_player($1,$2,$3)',[mid,hostPlayer,'Not allowed']),/only manage your own/);
 await assert.rejects(db.query('select public.remove_player($1,$2)',[mid,hostPlayer]),/only manage your own/);
 await assert.rejects(db.query('select public.add_player($1,$2)',[mid,'  ']),/check constraint/);
 await assert.rejects(db.query('select public.join_match($1,$2)',[mid,'Second self']),/unique constraint/);
 await db.query('select public.leave_match($1)',[mid]);assert.equal((await db.query('select * from public.players where id=$1',[alicePlayer])).rows.length,0);
 assert.equal((await db.query('select * from public.players where added_by=$1',[alice])).rows.length,2);
 await as(bob);await db.query('select public.add_player($1,$2)',[mid,'Bob friend']);
 await assert.rejects(db.query('select public.remove_player($1,$2)',[mid,friends[0].id]),/only manage your own/);
 await assert.rejects(db.query('select public.edit_player($1,$2,$3)',[mid,friends[0].id,'Spoof']),/only manage your own/);
 await assert.rejects(db.query('select public.host_edit_match($1,$2,$3,$4,$5)',[mid,'Spoof','Cosmo','2099-01-09','18:00']),/Only the organiser/);
 await assert.rejects(db.query("update public.players set added_by=$1",[bob]),/permission denied/);
 await as(alice);await db.query('select public.remove_player($1,$2)',[mid,friends[0].id]);
 const other=(await db.query("select public.create_match('Other','Cosmo','2099-01-09','18:00','Alice') as id")).rows[0].id;
 await assert.rejects(db.query('select public.remove_player($1,$2)',[other,friends[1].id]),/only manage your own/);
 await as(host);await db.query('select public.edit_player($1,$2,$3)',[mid,friends[1].id,'Host correction']);await db.query('select public.remove_player($1,$2)',[mid,friends[1].id]);
 await db.query('select public.cancel_match($1)',[mid]);await as(alice);
 await assert.rejects(db.query('select public.add_player($1,$2)',[mid,'Closed']),/closed/);
 await assert.rejects(db.query('select public.remove_player($1,$2)',[mid,hostPlayer]),/closed/);
 await assert.rejects(db.query('select public.edit_player($1,$2,$3)',[mid,hostPlayer,'Closed']),/closed/);
 await db.exec('reset role;set role anon;');await assert.rejects(db.query('select public.add_player($1,$2)',[mid,'Anon']),/permission denied/);
 }finally{await db.close();}
});
