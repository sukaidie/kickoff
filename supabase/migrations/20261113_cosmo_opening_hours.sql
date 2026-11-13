begin;
alter table public.matches drop constraint if exists matches_check;
alter table public.matches add constraint matches_check check(venue <> 'Cosmo' or (match_time >= case when extract(dow from match_date) in (0,6) then time '09:00' else time '10:00' end and match_time <= case when extract(dow from match_date) in (5,6) then time '23:00' when extract(dow from match_date)=0 then time '20:00' else time '21:00' end));
commit;
