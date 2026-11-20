-- Full payment-details setup/update including account holder. Safe to rerun.
begin;
create table if not exists public.match_payment_details (
 match_id uuid primary key references public.matches(id) on delete cascade,
 paypal text check(paypal is null or length(paypal)<=254),
 iban text check(iban is null or length(iban) between 15 and 34),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
alter table public.match_payment_details add column if not exists account_holder text check(account_holder is null or length(account_holder)<=200);
alter table public.match_payment_details enable row level security;
revoke all on public.match_payment_details from public,anon,authenticated;
drop function if exists public.get_match_payment_details(text);
create or replace function public.get_match_payment_details(p_token text default null)
returns table(match_id uuid,paypal text,iban text,account_holder text,updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare elevated boolean:=false;
begin
 if auth.uid() is null then raise exception 'Sign in to view payment details';end if;
 if p_token is not null then
  if not public.admin_valid(p_token) then raise exception 'Admin session expired. Sign in again';end if;
  elevated:=true;
 end if;
 return query select d.match_id,d.paypal,d.iban,d.account_holder,d.updated_at
 from public.match_payment_details d join public.matches m on m.id=d.match_id
 where m.venue='Cosmo' and (m.booked or m.owner_id=auth.uid() or elevated)
 order by d.match_id;
end $$;
create or replace function public.set_match_payment_details(p_match uuid,p_paypal text,p_iban text,p_token text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;elevated boolean:=false;paypal_value text;iban_value text;rotated text;remainder integer:=0;v integer;c text;i integer;
begin
 if auth.uid() is null then raise exception 'Sign in to edit payment details';end if;
 if p_token is not null then
  if not public.admin_valid(p_token) then raise exception 'Admin session expired. Sign in again';end if;
  elevated:=true;
 end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 if not elevated and m.owner_id<>auth.uid() then raise exception 'Only the host can edit payment details';end if;
 if m.venue<>'Cosmo' then raise exception 'Payment details are only available for Cosmo';end if;
 paypal_value:=nullif(btrim(p_paypal),'');
 iban_value:=nullif(upper(regexp_replace(coalesce(p_iban,''),'[[:space:]]','','g')),'');
 if length(paypal_value)>254 or paypal_value~'[[:cntrl:]]' then raise exception 'Enter a PayPal email or paypal.me address, up to 254 characters';end if;
 if iban_value is not null then
  if iban_value!~'^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then raise exception 'Enter a valid IBAN';end if;
  rotated:=substr(iban_value,5)||substr(iban_value,1,4);
  for i in 1..length(rotated) loop
   c:=substr(rotated,i,1);
   if c between '0' and '9' then remainder:=(remainder*10+ascii(c)-48)%97;
   else v:=ascii(c)-55;remainder:=(remainder*100+v)%97;end if;
  end loop;
  if remainder<>1 then raise exception 'IBAN checksum is invalid. Check the account number';end if;
 end if;
 insert into public.match_payment_details(match_id,paypal,iban,updated_by)
 values(p_match,paypal_value,iban_value,auth.uid())
 on conflict(match_id) do update set paypal=excluded.paypal,iban=excluded.iban,updated_at=now(),updated_by=excluded.updated_by;
 if elevated then insert into kickoff_private.admin_audit(user_id,action,record_id) values(auth.uid(),'set_payment_details',p_match);end if;
end $$;
revoke all on function public.get_match_payment_details(text),public.set_match_payment_details(uuid,text,text,text) from public,anon;
grant execute on function public.get_match_payment_details(text),public.set_match_payment_details(uuid,text,text,text) to authenticated;

-- Keep the original four-argument setter for older browser tabs. It preserves
-- the account holder; the five-argument version explicitly sets/clears it.
create or replace function public.set_match_payment_details(p_match uuid,p_paypal text,p_iban text,p_account_holder text,p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare holder text;
begin
 holder:=nullif(btrim(p_account_holder),'');
 if length(holder)>200 or holder~'[[:cntrl:]]' then raise exception 'Enter an account holder name up to 200 characters';end if;
 perform public.set_match_payment_details(p_match,p_paypal,p_iban,p_token);
 update public.match_payment_details set account_holder=holder where match_id=p_match;
end $$;
revoke all on function public.set_match_payment_details(uuid,text,text,text,text) from public,anon;
grant execute on function public.set_match_payment_details(uuid,text,text,text,text) to authenticated;
commit;
