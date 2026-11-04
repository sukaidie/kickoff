import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('Cosmo booking defaults, host permissions, migration repeatability and admin sessions',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const host='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users values($1),($2)',[host,other]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await as(host);
 const create=async venue=>(await db.query("select public.create_match('Booking', $1,'2099-01-09','18:00','Host') as id",[venue])).rows[0].id;
 const mid=await create('Cosmo'),free=await create('Merkur Spiel-Arena');
 const state=async()=>(await db.query('select booked from public.matches where id=$1',[mid])).rows[0].booked;
 assert.equal(await state(),false);
 await assert.rejects(db.query('select public.set_match_pitch($1,1)',[mid]),/Book a Cosmo/);
 await db.query('select public.set_match_booked($1,true)',[mid]);assert.equal(await state(),true);
 for(const n of [1,2,3,4,5,6]){await db.query('select public.set_match_pitch($1,$2)',[mid,n]);assert.equal((await db.query('select pitch_number from public.matches where id=$1',[mid])).rows[0].pitch_number,n);}
 await assert.rejects(db.query('select public.set_match_pitch($1,7)',[mid]),/Soccer 1 to Soccer 6/);
 await assert.rejects(db.query('select public.set_match_pitch($1,0)',[mid]),/Soccer 1 to Soccer 6/);
 await assert.rejects(db.query('select public.set_match_pitch($1,1)',[free]),/Book a Cosmo/);
 await db.query('select public.set_match_pitch($1,null)',[mid]);assert.equal((await db.query('select pitch_number from public.matches where id=$1',[mid])).rows[0].pitch_number,null);
 await db.query('select public.set_match_pitch($1,3)',[mid]);
 await db.exec('reset role');
 const pitchMigration=await readFile(new URL('../supabase/migrations/20261104_cosmo_pitch.sql',import.meta.url),'utf8');await db.exec(pitchMigration);await db.exec(pitchMigration);
 assert.equal((await db.query('select pitch_number from public.matches where id=$1',[mid])).rows[0].pitch_number,3);

 const migration=await readFile(new URL('../supabase/migrations/20261102_cosmo_booking.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 assert.equal(await state(),true);
 await as(other);await assert.rejects(db.query('select public.set_match_pitch($1,2)',[mid]),/Only the organiser/);await assert.rejects(db.query('select public.set_match_booked($1,false)',[mid]),/Only the organiser/);
 await assert.rejects(db.query('update public.matches set booked=false where id=$1',[mid]),/permission denied/);
 await as(host);await assert.rejects(db.query('select public.set_match_booked($1,true)',[free]),/only available for Cosmo/);
 await assert.rejects(db.query('select public.set_match_booked($1,null)',[mid]),/Choose a booking status/);
 await assert.rejects(db.query('select public.set_match_booked($1,true)',['33333333-3333-4333-8333-333333333333']),/Match not found/);
 await db.query('select public.cancel_match($1)',[mid]);await db.query('select public.set_match_booked($1,false)',[mid]);assert.equal(await state(),false);assert.equal((await db.query('select pitch_number from public.matches where id=$1',[mid])).rows[0].pitch_number,null);
 await db.exec('reset role');
 await db.exec(await readFile(new URL('../supabase/migrations/20261030_admin.sql',import.meta.url),'utf8'));
 const adminPitch=await readFile(new URL('../supabase/migrations/20261104_admin_cosmo_pitch.sql',import.meta.url),'utf8');await db.exec(adminPitch);await db.exec(adminPitch);
 const adminMigration=await readFile(new URL('../supabase/migrations/20261102_admin_cosmo_booking.sql',import.meta.url),'utf8');await db.exec(adminMigration);await db.exec(adminMigration);
 await db.query("update kickoff_private.admin_config set password_hash=extensions.crypt($1,extensions.gen_salt('bf',4))",['test-only-password']);
 await as(other);const session=(await db.query("select public.admin_login('test-only-password') as r")).rows[0].r;
 await assert.rejects(db.query('select public.admin_set_match_booked($1,$2,true)',['forged',mid]),/session expired/);
 await db.query('select public.admin_set_match_booked($1,$2,true)',[session.token,mid]);assert.equal(await state(),true);
 await assert.rejects(db.query('select public.admin_set_match_booked($1,$2,true)',[session.token,free]),/only available for Cosmo/);
 await db.query('select public.admin_set_match_pitch($1,$2,6)',[session.token,mid]);assert.equal((await db.query('select pitch_number from public.matches where id=$1',[mid])).rows[0].pitch_number,6);await assert.rejects(db.query('select public.admin_set_match_pitch($1,$2,2)',['forged',mid]),/session expired/);
 await as(host);await assert.rejects(db.query('select public.admin_set_match_booked($1,$2,false)',[session.token,mid]),/session expired/);
 await db.exec('reset role');assert.equal((await db.query("select count(*)::int as n from kickoff_private.admin_audit where action='set_booked'")).rows[0].n,1);
 await as(other);await db.query('select public.admin_logout($1)',[session.token]);await assert.rejects(db.query('select public.admin_set_match_booked($1,$2,false)',[session.token,mid]),/session expired/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.set_match_booked($1,true)',[mid]),/permission denied/);
 }finally{await db.close();}
});
