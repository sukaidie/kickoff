import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {registrationNameKey} from '../src/rules.js';
test('registration name keys ignore case, whitespace and Unicode width',()=>{
 assert.equal(registrationNameKey('  Alex\t Lee  '),'alex lee');assert.equal(registrationNameKey('ＡＬＥＸ　ＬＥＥ'),'alex lee');assert.equal(registrationNameKey('ÉRIC'),'éric');assert.notEqual(registrationNameKey('Alex Lee'),registrationNameKey('Alex Li'));
});
test('same-match names are checked across join, guest, rename and Admin paths without rewriting old duplicates',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');await db.exec(schema.split('-- Prevent new duplicate registration names')[0]+'commit;');
 const host='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';await db.query('insert into auth.users values($1),($2)',[host,other]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await as(host);const mid=(await db.query("select public.create_match('Duplicate test','Cosmo','2099-01-09','18:00','Host') as id")).rows[0].id;
 await db.query('select public.add_player($1,$2)',[mid,'Alex  Lee']);await db.query('select public.add_player($1,$2)',[mid,'alex lee']);
 const roster=async()=>(await db.query('select * from public.players where match_id=$1 order by id',[mid])).rows;const old=await roster();await db.exec('reset role');
 const migration=await readFile(new URL('../supabase/migrations/20261110_duplicate_registration_names.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);assert.deepEqual(await roster(),old);
 await as(other);for(const name of ['Alex Lee','  alex   LEE  ','ＡＬＥＸ　ＬＥＥ'])await assert.rejects(db.query('select public.join_match($1,$2)',[mid,name]),/This name is already registered/);
 await assert.rejects(db.query('select public.add_player($1,$2)',[mid,'Alex Lee']),/This name is already registered/);
 await assert.rejects(db.query('insert into public.players(match_id,name) values($1,$2)',[mid,'Alex Lee']),/permission denied/);
 const another=(await db.query("select public.create_match('Other match','Merkur Spiel-Arena','2099-01-09','18:00','Alex Lee') as id")).rows[0].id;assert.ok(another);
 await db.query('select public.add_player($1,$2)',[mid,'Éric']);await assert.rejects(db.query('select public.add_player($1,$2)',[mid,'éric']),/already registered/);
 await as(host);const legacy=old.find(p=>p.name==='Alex  Lee');await db.query('select public.edit_player($1,$2,$3)',[mid,legacy.id,'Alex  Lee']);await assert.rejects(db.query('select public.edit_player($1,$2,$3)',[mid,legacy.id,'Host']),/already registered/);await db.query('select public.set_player_paid($1,$2,true)',[mid,legacy.id]);
 await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/20261030_admin.sql',import.meta.url),'utf8'));await db.query("update kickoff_private.admin_config set password_hash=extensions.crypt($1,extensions.gen_salt('bf',4))",['test-password']);await as(other);const session=(await db.query("select public.admin_login('test-password') as r")).rows[0].r;
 await assert.rejects(db.query('select public.admin_mutate($1,$2,$3)',[session.token,'add_player',{match:mid,name:'ALEX LEE'}]),/already registered/);
 await assert.rejects(db.query('select public.admin_mutate($1,$2,$3)',[session.token,'edit_player',{match:mid,player:legacy.id,name:'Host'}]),/already registered/);
 await as(host);for(const p of old.filter(p=>p.name.toLowerCase().startsWith('alex')))await db.query('select public.remove_player($1,$2)',[mid,p.id]);await as(other);await db.query('select public.join_match($1,$2)',[mid,'Alex Lee']);assert.equal((await roster()).filter(p=>registrationNameKey(p.name)==='alex lee').length,1);
 }finally{await db.close();}
});
