-- Apply after 20261106_auto_cancel_underfilled.sql as the database owner.
-- Supabase Cron (pg_cron) must be available/enabled on this project.
begin;
create extension if not exists pg_cron with schema pg_catalog;
-- Reuse the named job on repeated installation; retain all unrelated jobs.
select cron.schedule('kickoff-cancel-underfilled','* * * * *','select public.cancel_underfilled_matches();');
commit;
-- Verify in SQL Editor:
-- select jobid,jobname,schedule,command,active from cron.job where jobname='kickoff-cancel-underfilled';
-- select status,return_message,start_time,end_time from cron.job_run_details
-- where jobid in (select jobid from cron.job where jobname='kickoff-cancel-underfilled') order by start_time desc limit 5;
