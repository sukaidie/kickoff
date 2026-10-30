import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Merkur confirmation defaults false; only host, participant or registrant can update it',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');await db.exec(schema.slice(0,schema.indexOf('-- Merkur confirmation'))+'commit;');
 const host='11111111-1111-4111-8111-111111111111',registrant='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';await db.query('insert into auth.users values($1),($2),($3)',[host,registrant,other]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await as(host);const mid=(await db.query("select public.create_match('Confirmation','Merkur Spiel-Arena','2099-01-09','09:00','Host') as id")).rows[0].id;
 await as(registrant);await db.query('select public.join_match($1,$2)',[mid,'Self']);await db.query('select public.add_player($1,$2)',[mid,'Friend']);
 await db.exec('reset role');const migration=await readFile(new URL('../supabase/migrations/20261030_merkur_confirmation.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 const team=(await db.query('select * from public.players where match_id=$1',[mid])).rows;assert.equal(team.length,3);assert.ok(team.every(p=>p.confirmed===false));
 const self=team.find(p=>p.name==='Self'),friend=team.find(p=>p.name==='Friend'),hostRow=team.find(p=>p.name==='Host');
 await as(registrant);for(const p of [self,friend])await db.query('select public.set_player_confirmed($1,$2,true)',[mid,p.id]);
 assert.equal((await db.query('select confirmed from public.players where id=$1',[friend.id])).rows[0].confirmed,true);
 await assert.rejects(db.query('select public.set_player_confirmed($1,$2,true)',[mid,hostRow.id]),/Only the host/);
 await assert.rejects(db.query('update public.players set confirmed=true where id=$1',[friend.id]),/permission denied/);
 await as(other);await assert.rejects(db.query('select public.set_player_confirmed($1,$2,false)',[mid,friend.id]),/Only the host/);
 await as(host);await db.query('select public.set_player_confirmed($1,$2,false)',[mid,friend.id]);const updated=(await db.query('select * from public.players where id=$1',[friend.id])).rows[0];assert.equal(updated.confirmed,false);assert.equal(updated.confirmation_updated_by,host);assert.ok(updated.confirmation_updated_at);
 await assert.rejects(db.query('select public.set_player_confirmed($1,$2,null)',[mid,friend.id]),/Choose confirmed/);
 const cosmo=(await db.query("select public.create_match('Paid venue','Cosmo','2099-01-09','18:00','Host') as id")).rows[0].id;await assert.rejects(db.query('select public.set_player_confirmed($1,$2,true)',[cosmo,friend.id]),/non-cancelled Merkur/);
 const second=(await db.query("select public.create_match('Other Merkur','Merkur Spiel-Arena','2099-01-10','09:00','Host') as id")).rows[0].id;await assert.rejects(db.query('select public.set_player_confirmed($1,$2,true)',[second,friend.id]),/Only the host/);
 await db.query('select public.cancel_match($1)',[mid]);await assert.rejects(db.query('select public.set_player_confirmed($1,$2,true)',[mid,friend.id]),/non-cancelled Merkur/);
 await db.exec('reset role;set role anon;');await assert.rejects(db.query('select public.set_player_confirmed($1,$2,true)',[mid,friend.id]),/permission denied/);
 }finally{await db.close();}
});
