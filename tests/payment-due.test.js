import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {paymentDue,paymentStatus} from '../src/rules.js';
test('payment display preserves Paid and distinguishes Not due yet from Unpaid',()=>{
 const m={booked:false,starts_at:'2099-01-09T17:00:00Z'};
 assert.equal(paymentStatus(m,{paid:false}),'Not due yet');
 assert.equal(paymentStatus(m,{paid:true,payment_due:false}),'Paid');
 assert.equal(paymentStatus({...m,booked:true},{paid:false,payment_due:false}),'Unpaid');
 assert.equal(paymentStatus({...m,starts_at:'2020-01-09T17:00:00Z'},{paid:false}),'Unpaid');
 assert.equal(paymentStatus({...m,starts_at:'2020-01-09T17:00:00Z'},{paid:false,payment_due:false}),'Not due yet');
 assert.equal(paymentDue(m,{paid:false,payment_due:true}),true);
});
test('booking transitions synchronize registrations and preserve paid and historical records across host and Admin paths',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
 const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');await db.exec(schema.split('-- Booking-aware payment readiness')[0]+'commit;');
 const host='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users values($1),($2)',[host,guest]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await as(host);const mid=(await db.query("select public.create_match('Future','Cosmo','2099-01-09','18:00','Host') as id")).rows[0].id;
 await db.query('select public.add_player($1,$2)',[mid,'Paid guest']);const paid=(await db.query('select id from public.players where name=$1',['Paid guest'])).rows[0].id;await db.query('select public.set_player_paid($1,$2,true)',[mid,paid]);
 await db.exec('reset role');const historical=(await db.query("insert into public.matches(owner_id,title,venue,match_date,match_time) values($1,'History','Cosmo','2020-01-09','18:00') returning id",[host])).rows[0].id;
 await db.query("insert into public.players(match_id,user_id,added_by,name) values($1,$2,$2,'Historical')",[historical,host]);
 const migration=await readFile(new URL('../supabase/migrations/20261102_payment_due.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 const roster=async()=>(await db.query('select name,paid,payment_due,payment_updated_at,payment_updated_by from public.players where match_id=$1 order by name',[mid])).rows;
 assert.equal((await db.query('select payment_due from public.players where match_id=$1',[historical])).rows[0].payment_due,true);
 let rows=await roster();assert.equal(rows.find(p=>p.name==='Host').payment_due,false);const originalPaid=rows.find(p=>p.name==='Paid guest');assert.equal(originalPaid.paid,true);assert.equal(originalPaid.payment_due,true);
 await as(guest);await db.query('select public.join_match($1,$2)',[mid,'Joined']);await db.query('select public.add_player($1,$2)',[mid,'Extra']);assert.ok((await roster()).filter(p=>!p.paid).every(p=>!p.payment_due));
 await assert.rejects(db.query('select public.set_match_booked($1,true)',[mid]),/Only the organiser/);
 await assert.rejects(db.query('update public.players set payment_due=true where match_id=$1',[mid]),/permission denied/);
 await as(host);await db.query('select public.set_match_booked($1,true)',[mid]);assert.ok((await roster()).every(p=>p.payment_due));
 await db.query('select public.add_player($1,$2)',[mid,'After booking']);assert.equal((await roster()).find(p=>p.name==='After booking').payment_due,true);
 await db.query('select public.set_match_booked($1,false)',[mid]);rows=await roster();assert.ok(rows.filter(p=>!p.paid).every(p=>!p.payment_due));assert.deepEqual(rows.find(p=>p.name==='Paid guest'),originalPaid);
 const joined=(await db.query("select id from public.players where match_id=$1 and name='Joined'",[mid])).rows[0].id;
 await db.query('select public.set_player_paid($1,$2,true)',[mid,joined]);assert.equal((await roster()).find(p=>p.name==='Joined').paid,true);await db.query('select public.set_player_paid($1,$2,false)',[mid,joined]);assert.equal((await roster()).find(p=>p.name==='Joined').payment_due,false);
 await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/20261030_admin.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/20261102_admin_cosmo_booking.sql',import.meta.url),'utf8'));
 await db.query("update kickoff_private.admin_config set password_hash=extensions.crypt($1,extensions.gen_salt('bf',4))",['test-only-password']);await as(guest);const session=(await db.query("select public.admin_login('test-only-password') as r")).rows[0].r;
 await db.query('select public.admin_set_match_booked($1,$2,true)',[session.token,mid]);assert.ok((await roster()).every(p=>p.payment_due));
 await db.query('select public.admin_mutate($1,$2,$3)',[session.token,'set_paid',{match:mid,player:joined,paid:true}]);assert.equal((await roster()).find(p=>p.name==='Joined').paid,true);
 await db.exec('reset role');await db.exec(migration);assert.equal((await roster()).find(p=>p.name==='Joined').paid,true);assert.ok((await roster()).every(p=>p.payment_due));
 }finally{await db.close();}
});
