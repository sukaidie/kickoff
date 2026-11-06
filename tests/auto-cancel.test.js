import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('kickoff worker cancels below ten once, covers both venues and preserves history, payments and bookings',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');await db.exec(schema.split('-- Automatic kickoff headcount check')[0]+'commit;');
 const host='11111111-1111-4111-8111-111111111111';await db.query('insert into auth.users values($1)',[host]);
 const create=async(venue,date,title='Fixture')=>(await db.query('insert into public.matches(owner_id,title,venue,match_date,match_time) values($1,$2,$3,$4,$5) returning id',[host,title,venue,date,'18:00'])).rows[0].id;
 const historical=await create('Cosmo','2020-01-09','Existing history'),upcoming=await create('Cosmo','2099-01-09','Existing upcoming');
 const migration=await readFile(new URL('../supabase/migrations/20261106_auto_cancel_underfilled.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 const get=async id=>(await db.query('select * from public.matches where id=$1',[id])).rows[0];
 assert.equal((await get(historical)).kickoff_check_pending,false);assert.equal((await get(upcoming)).kickoff_check_pending,true);
 const future=await create('Merkur Spiel-Arena','2099-02-09','New future');assert.equal((await get(future)).kickoff_check_pending,true);
 const fixtures=[];
 for(const venue of ['Cosmo','Merkur Spiel-Arena'])for(const count of [0,9,10,11]){
  const id=await create(venue,'2020-02-09',venue+' '+count);
  for(let i=0;i<count;i++)await db.query('insert into public.players(match_id,user_id,added_by,name,paid,confirmed) values($1,$2,$3,$4,$5,false)',[id,i===0?host:null,host,'Player '+i,i===0]);
  if(venue==='Cosmo'){await db.query('update public.matches set booked=true,pitch_number=2 where id=$1',[id]);}
  // Simulate a previously enrolled future fixture now being due at kick-off.
  await db.query('update public.matches set kickoff_check_pending=true where id=$1',[id]);fixtures.push({id,venue,count});
 }
 const run=async()=>(await db.query('select public.cancel_underfilled_matches() as n')).rows[0].n;
 assert.equal(await run(),4);
 for(const {id,venue,count} of fixtures){const m=await get(id);assert.equal(m.cancelled,count<10);assert.equal(m.auto_cancelled_for_players,count<10);assert.equal(m.kickoff_player_count,count);assert.ok(m.kickoff_checked_at);assert.equal(m.kickoff_check_pending,false);if(venue==='Cosmo'){assert.equal(m.booked,true);assert.equal(m.pitch_number,2);}assert.equal((await db.query('select count(*)::int as n from public.players where match_id=$1',[id])).rows[0].n,count);if(count)assert.equal((await db.query('select paid from public.players where match_id=$1 and user_id=$2',[id,host])).rows[0].paid,true);}
 assert.equal((await get(historical)).cancelled,false);assert.equal((await get(upcoming)).cancelled,false);assert.equal((await get(future)).kickoff_checked_at,null);assert.equal(await run(),0);
 const sufficient=fixtures.find(f=>f.count===10).id;await db.query('delete from public.players where match_id=$1',[sufficient]);assert.equal(await run(),0);assert.equal((await get(sufficient)).cancelled,false);
 const cancelled=fixtures.find(f=>f.count===9).id;
 await db.query('update public.matches set cancelled=false where id=$1',[cancelled]);assert.equal((await get(cancelled)).auto_cancelled_for_players,false);assert.equal(await run(),0);assert.equal((await get(cancelled)).cancelled,false);
 await db.query("update public.matches set match_date='2099-03-09' where id=$1",[cancelled]);assert.equal((await get(cancelled)).kickoff_check_pending,true);assert.equal((await get(cancelled)).kickoff_checked_at,null);assert.equal((await get(cancelled)).kickoff_player_count,null);
 await db.query('update public.matches set cancelled=true where id=$1',[cancelled]);assert.equal((await get(cancelled)).kickoff_check_pending,false);
 await db.exec(migration);assert.equal((await get(historical)).kickoff_check_pending,false);assert.equal((await get(sufficient)).kickoff_check_pending,false);assert.equal((await get(cancelled)).kickoff_check_pending,false);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[host]);await db.exec('set role authenticated');await assert.rejects(db.query('select public.cancel_underfilled_matches()'),/permission denied/);await assert.rejects(db.query('update public.matches set cancelled=true where id=$1',[future]),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.cancel_underfilled_matches()'),/permission denied/);
 }finally{await db.close();}
});
