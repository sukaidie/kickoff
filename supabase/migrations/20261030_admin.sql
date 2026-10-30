-- Optional admin setup: run once in the Supabase SQL Editor. Safe to rerun.
-- Only a bcrypt hash is stored; existing passwords/sessions are preserved on rerun.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists kickoff_private;
revoke all on schema kickoff_private from public,anon,authenticated;
create table if not exists kickoff_private.admin_config (
 id boolean primary key default true check(id),password_hash text not null,
 window_started timestamptz not null default now(),attempts integer not null default 0
);
insert into kickoff_private.admin_config(id,password_hash)
values(true,'$2a$10$2oT00pms81k8NPT4DGiv9Oco0yj1unQIDyTCj.QQTsvZocQx2zb/6') on conflict(id) do nothing;
create table if not exists kickoff_private.admin_attempts (
 user_id uuid primary key references auth.users(id),window_started timestamptz not null default now(),attempts integer not null default 0
);
create table if not exists kickoff_private.admin_sessions (
 token_hash text primary key,user_id uuid not null references auth.users(id),expires_at timestamptz not null
);
create table if not exists kickoff_private.admin_audit (
 id bigint generated always as identity primary key,user_id uuid not null,action text not null,record_id uuid,created_at timestamptz not null default now()
);
revoke all on all tables in schema kickoff_private from public,anon,authenticated;
alter table kickoff_private.admin_config enable row level security;
alter table kickoff_private.admin_attempts enable row level security;
alter table kickoff_private.admin_sessions enable row level security;
alter table kickoff_private.admin_audit enable row level security;
create or replace function public.admin_login(p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg kickoff_private.admin_config; attempt kickoff_private.admin_attempts; token text; expiry timestamptz;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'message','Wait for sign-in, then try again'); end if;
 select * into cfg from kickoff_private.admin_config where id=true for update;
 if cfg.window_started<=now()-interval '15 minutes' then cfg.attempts:=0;cfg.window_started:=now();end if;
 insert into kickoff_private.admin_attempts(user_id) values(auth.uid()) on conflict do nothing;
 select * into attempt from kickoff_private.admin_attempts where user_id=auth.uid() for update;
 if attempt.window_started<=now()-interval '15 minutes' then attempt.attempts:=0;attempt.window_started:=now();end if;
 if cfg.attempts>=40 or attempt.attempts>=5 then return jsonb_build_object('ok',false,'message','Too many attempts. Try again in 15 minutes');end if;
 update kickoff_private.admin_config set attempts=cfg.attempts+1,window_started=cfg.window_started where id=true;
 update kickoff_private.admin_attempts set attempts=attempt.attempts+1,window_started=attempt.window_started where user_id=auth.uid();
 if p_password is null or octet_length(p_password)>72 or extensions.crypt(p_password,cfg.password_hash)<>cfg.password_hash then return jsonb_build_object('ok',false,'message','Incorrect password');end if;
 delete from kickoff_private.admin_sessions where expires_at<=now();
 token:=encode(extensions.gen_random_bytes(32),'hex');expiry:=now()+interval '1 hour';
 insert into kickoff_private.admin_sessions(token_hash,user_id,expires_at) values(encode(extensions.digest(token,'sha256'),'hex'),auth.uid(),expiry);
 update kickoff_private.admin_attempts set attempts=0,window_started=now() where user_id=auth.uid();
 return jsonb_build_object('ok',true,'token',token,'expires_at',expiry);
end $$;
create or replace function public.admin_valid(p_token text)
returns boolean language sql security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from kickoff_private.admin_sessions where user_id=auth.uid() and expires_at>now() and token_hash=encode(extensions.digest(p_token,'sha256'),'hex'));
$$;
create or replace function public.admin_logout(p_token text)
returns void language sql security definer set search_path = '' as $$
 delete from kickoff_private.admin_sessions where user_id=auth.uid() and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
$$;
create or replace function public.admin_mutate(p_token text,p_action text,p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid;pid uuid;rid uuid;
begin
 if not public.admin_valid(p_token) then raise exception 'Admin session expired. Sign in again';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid admin request';end if;
 mid:=(p_data->>'match')::uuid;pid:=(p_data->>'player')::uuid;
 if p_action='create_match' then
  insert into public.matches(owner_id,title,venue,match_date,match_time,cancelled) values(auth.uid(),trim(p_data->>'title'),p_data->>'venue',(p_data->>'date')::date,(p_data->>'time')::time,coalesce((p_data->>'cancelled')::boolean,false)) returning id into rid;
  insert into public.players(match_id,user_id,added_by,name) values(rid,auth.uid(),auth.uid(),trim(p_data->>'name'));
 elsif p_action in ('edit_match','cancel_match','delete_match','add_player','edit_player','remove_player','set_paid','set_confirmed') then
  perform 1 from public.matches where id=mid for update;if not found then raise exception 'Match not found';end if;
  rid:=mid;
  case p_action
   when 'edit_match' then update public.matches set title=trim(p_data->>'title'),venue=p_data->>'venue',match_date=(p_data->>'date')::date,match_time=(p_data->>'time')::time,cancelled=coalesce((p_data->>'cancelled')::boolean,cancelled) where id=mid;
   when 'cancel_match' then update public.matches set cancelled=true where id=mid;
   when 'delete_match' then delete from public.matches where id=mid;
   when 'add_player' then insert into public.players(match_id,user_id,added_by,name) values(mid,null,auth.uid(),trim(p_data->>'name')) returning id into rid;
   when 'edit_player' then update public.players set name=trim(p_data->>'name') where id=pid and match_id=mid;rid:=pid;
   when 'remove_player' then delete from public.players where id=pid and match_id=mid;rid:=pid;
   when 'set_paid' then update public.players set paid=(p_data->>'paid')::boolean,payment_updated_at=now(),payment_updated_by=auth.uid() where id=pid and match_id=mid;rid:=pid;
   when 'set_confirmed' then update public.players set confirmed=(p_data->>'confirmed')::boolean,confirmation_updated_at=now(),confirmation_updated_by=auth.uid() where id=pid and match_id=mid;rid:=pid;
  end case;
  if not found then raise exception 'Player not found in this match';end if;
 else raise exception 'Unsupported admin action';end if;
 insert into kickoff_private.admin_audit(user_id,action,record_id) values(auth.uid(),p_action,rid);
 return rid;
end $$;
revoke all on function public.admin_login(text),public.admin_valid(text),public.admin_logout(text),public.admin_mutate(text,text,jsonb) from public,anon;
grant execute on function public.admin_login(text),public.admin_valid(text),public.admin_logout(text),public.admin_mutate(text,text,jsonb) to authenticated;
commit;
