import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('weekday hours migration permits Saturday 09:00 venue changes and preserves host permissions',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const host='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users values($1),($2)',[host,other]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await db.exec('reset role');
 await db.exec("alter table public.matches drop constraint matches_check;alter table public.matches add constraint matches_check check(venue <> 'Cosmo' or (match_time >= '10:00' and match_time <= '20:00'));");
 await as(host);const mid=(await db.query("select public.create_match('Saturday morning','Merkur Spiel-Arena','2099-01-10','09:00','Host') as id")).rows[0].id;
 const change=()=>db.query('select public.host_edit_match($1,$2,$3,$4,$5)',[mid,'Saturday morning','Cosmo','2099-01-10','09:00']);
 await assert.rejects(change(),/check constraint/);
 await db.exec('reset role');const migration=await readFile(new URL('../supabase/migrations/20261113_cosmo_opening_hours.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 await as(other);await assert.rejects(change(),/Only the organiser/);await as(host);await change();
 const game=(await db.query('select * from public.matches where id=$1',[mid])).rows[0];assert.equal(game.venue,'Cosmo');assert.equal(game.match_time,'09:00:00');assert.equal(game.owner_id,host);
 for(const [date,time] of [['2099-01-12','09:00'],['2099-01-10','08:59'],['2099-01-10','23:01']])await assert.rejects(db.query('select public.host_edit_match($1,$2,$3,$4,$5)',[mid,'Invalid','Cosmo',date,time]),/check constraint/);
 }finally{await db.close();}
});
