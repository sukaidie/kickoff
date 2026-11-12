import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('only host may add to past games; migration preserves validation and cancelled restrictions',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const host='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users values($1),($2)',[host,other]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await as(host);const mid=(await db.query("select public.create_match('Past game','Cosmo','2099-01-09','18:00','Host') as id")).rows[0].id;
 await db.exec('reset role');await db.query("update public.matches set match_date='2020-01-09' where id=$1",[mid]);
 const migration=await readFile(new URL('../supabase/migrations/20261112_past_host_add_players.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 await as(other);await assert.rejects(db.query('select public.add_player($1,$2)',[mid,'Visitor guest']),/closed/);await assert.rejects(db.query('select public.host_add_player($1,$2)',[mid,'Legacy guest']),/Only the organiser/);
 await as(host);await db.query('select public.add_player($1,$2)',[mid,'Late guest']);await db.query('select public.host_add_player($1,$2)',[mid,'Legacy guest']);
 const guest=(await db.query("select * from public.players where match_id=$1 and name='Late guest'",[mid])).rows[0];assert.equal(guest.added_by,host);assert.equal(guest.user_id,null);assert.equal(guest.paid,false);
 await assert.rejects(db.query('select public.add_player($1,$2)',[mid,'late guest']),/already registered/);await assert.rejects(db.query('select public.add_player($1,$2)',[mid,' ']),/check constraint/);
 await assert.rejects(db.query('select public.join_match($1,$2)',[mid,'Self']),/closed/);
 await db.exec('reset role');await db.query('update public.matches set cancelled=true where id=$1',[mid]);await as(host);
 for(const fn of ['add_player','host_add_player'])await assert.rejects(db.query(`select public.${fn}($1,$2)`,[mid,'Cancelled guest']),/closed/);
 }finally{await db.close();}
});
