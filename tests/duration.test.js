import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('host duration overrides persist across player counts, validate closing times, and require owner/admin access',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const host='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222';await db.query('insert into auth.users values($1),($2)',[host,guest]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await as(host);const mid=(await db.query("select public.create_match('Duration','Cosmo','2099-01-09','18:00','Host') as id")).rows[0].id;
 const value=async()=>(await db.query('select duration_override_minutes from public.matches where id=$1',[mid])).rows[0].duration_override_minutes;
 assert.equal(await value(),null);for(let i=1;i<15;i++)await db.query('select public.add_player($1,$2)',[mid,'Player '+i]);
 await as(guest);await assert.rejects(db.query('select public.set_match_duration($1,90)',[mid]),/Only the host/);await assert.rejects(db.query('update public.matches set duration_override_minutes=90 where id=$1',[mid]),/permission denied/);
 await as(host);await db.query('select public.set_match_duration($1,90)',[mid]);assert.equal(await value(),90);await db.query('select public.add_player($1,$2)',[mid,'Player sixteen']);assert.equal(await value(),90);
 await assert.rejects(db.query('select public.set_match_duration($1,0)',[mid]),/check constraint/);await assert.rejects(db.query('select public.set_match_duration($1,1441)',[mid]),/check constraint|opening hours/);await assert.rejects(db.query('select public.set_match_duration($1,421)',[mid]),/opening hours/);assert.equal(await value(),90);
 await db.query('select public.set_match_duration($1,420)',[mid]);await assert.rejects(db.query('select public.host_edit_match($1,$2,$3,$4,$5)',[mid,'Too late','Cosmo','2099-01-09','19:00']),/opening hours/);
 await db.query('select public.set_match_duration($1,null)',[mid]);assert.equal(await value(),null);
 const free=(await db.query("select public.create_match('Overnight','Merkur Spiel-Arena','2099-01-09','23:00','Host') as id")).rows[0].id;await db.query('select public.set_match_duration($1,120)',[free]);
 await db.exec('reset role');const migration=await readFile(new URL('../supabase/migrations/20261117_match_duration.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);assert.equal((await db.query('select duration_override_minutes from public.matches where id=$1',[free])).rows[0].duration_override_minutes,120);
 await as(host);await db.query('select public.cancel_match($1)',[mid]);await assert.rejects(db.query('select public.set_match_duration($1,90)',[mid]),/cancelled/);
 await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/20261030_admin.sql',import.meta.url),'utf8'));await db.query("update kickoff_private.admin_config set password_hash=extensions.crypt($1,extensions.gen_salt('bf',4))",['duration-test']);await as(guest);const session=(await db.query('select public.admin_login($1) as r',['duration-test'])).rows[0].r;
 await assert.rejects(db.query('select public.admin_set_match_duration($1,$2,90)',['forged',mid]),/expired/);await db.query('select public.admin_set_match_duration($1,$2,90)',[session.token,mid]);assert.equal(await value(),90);
 await db.exec('reset role;set role anon;');await assert.rejects(db.query('select public.set_match_duration($1,90)',[mid]),/permission denied/);
 }finally{await db.close();}
});
