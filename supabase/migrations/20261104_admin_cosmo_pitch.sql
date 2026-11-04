-- Apply after Admin setup and 20261104_cosmo_pitch.sql. Safe to rerun.
begin;
create or replace function public.admin_set_match_pitch(p_token text,p_match uuid,p_pitch integer)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if not public.admin_valid(p_token) then raise exception 'Admin session expired. Sign in again';end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 if m.venue<>'Cosmo' or not m.booked then raise exception 'Book a Cosmo match before selecting a pitch';end if;
 if p_pitch is not null and (p_pitch<1 or p_pitch>6) then raise exception 'Choose Soccer 1 to Soccer 6';end if;
 update public.matches set pitch_number=p_pitch where id=p_match;
 insert into kickoff_private.admin_audit(user_id,action,record_id) values(auth.uid(),'set_pitch',p_match);
end $$;
revoke all on function public.admin_set_match_pitch(text,uuid,integer) from public,anon;
grant execute on function public.admin_set_match_pitch(text,uuid,integer) to authenticated;
commit;
