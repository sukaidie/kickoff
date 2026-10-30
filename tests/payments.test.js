import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('only the host records payments before and after Cosmo games; demo is owned and idempotent',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');await db.exec(schema.slice(0,schema.indexOf('-- Completed Cosmo payment tracking'))+'commit;');
 const host='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222';await db.query('insert into auth.users values($1),($2)',[host,guest]);
 const games=(await db.query(`insert into public.matches(owner_id,title,venue,match_date,match_time,cancelled) values
 ($1,'Completed','Cosmo',(now() at time zone 'Europe/Berlin')::date-1,'18:00',false),
 ($1,'Free','Merkur Spiel-Arena',(now() at time zone 'Europe/Berlin')::date-1,'18:00',false),
 ($1,'Cancelled','Cosmo',(now() at time zone 'Europe/Berlin')::date-1,'18:00',true),
 ($1,'Future','Cosmo',(now() at time zone 'Europe/Berlin')::date+1,'18:00',false) returning *`,[host])).rows;
 for(const m of games)await db.query('insert into public.players(match_id,user_id,added_by,name) values($1,$2,$2,$3)',[m.id,guest,m.title+' player']);
 const migration=await readFile(new URL('../supabase/migrations/20261030_player_payments.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);const preMatchMigration=await readFile(new URL('../supabase/migrations/20261030_pre_match_payments.sql',import.meta.url),'utf8');await db.exec(preMatchMigration);await db.exec(preMatchMigration);
 const team=(await db.query('select * from public.players')).rows;assert.ok(team.every(p=>p.paid===false));
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const complete=games.find(m=>m.title==='Completed'),player=team.find(p=>p.match_id===complete.id);
 await as(guest);await assert.rejects(db.query('select public.set_player_paid($1,$2,true)',[complete.id,player.id]),/Only the organiser/);
 await assert.rejects(db.query('update public.players set paid=true where id=$1',[player.id]),/permission denied/);
 await as(host);await db.query('select public.set_player_paid($1,$2,true)',[complete.id,player.id]);
 let updated=(await db.query('select * from public.players where id=$1',[player.id])).rows[0];assert.equal(updated.paid,true);assert.equal(updated.payment_updated_by,host);assert.ok(updated.payment_updated_at);
 await db.query('select public.set_player_paid($1,$2,false)',[complete.id,player.id]);assert.equal((await db.query('select paid from public.players where id=$1',[player.id])).rows[0].paid,false);
 await assert.rejects(db.query('select public.set_player_paid($1,$2,null)',[complete.id,player.id]),/Choose paid or unpaid/);
 for(const title of ['Free','Cancelled']){const m=games.find(m=>m.title===title),p=team.find(p=>p.match_id===m.id);await assert.rejects(db.query('select public.set_player_paid($1,$2,true)',[m.id,p.id]),/non-cancelled Cosmo/);}
 const future=games.find(m=>m.title==='Future'),futurePlayer=team.find(p=>p.match_id===future.id);await db.query('select public.set_player_paid($1,$2,true)',[future.id,futurePlayer.id]);assert.equal((await db.query('select paid from public.players where id=$1',[futurePlayer.id])).rows[0].paid,true);
 await assert.rejects(db.query('select public.set_player_paid($1,$2,true)',[complete.id,team.find(p=>p.match_id!==complete.id).id]),/Player not found/);
 const demo=(await db.query('select public.create_payment_demo() as id')).rows[0].id;assert.equal((await db.query('select owner_id from public.matches where id=$1',[demo])).rows[0].owner_id,host);
 const samples=(await db.query('select * from public.players where match_id=$1',[demo])).rows;assert.equal(samples.length,3);assert.equal(samples.filter(p=>p.paid).length,1);
 await db.query('select public.set_player_paid($1,$2,true)',[demo,samples.find(p=>!p.paid).id]);assert.equal((await db.query('select public.create_payment_demo() as id')).rows[0].id,demo);assert.equal((await db.query('select * from public.players where match_id=$1 and paid',[demo])).rows.length,2);
 await as(guest);const otherDemo=(await db.query('select public.create_payment_demo() as id')).rows[0].id;assert.notEqual(otherDemo,demo);
 await db.exec("reset role;set role anon;");await assert.rejects(db.query('select public.set_player_paid($1,$2,true)',[complete.id,player.id]),/permission denied/);await assert.rejects(db.query('select public.create_payment_demo()'),/permission denied/);
 }finally{await db.close();}
});
