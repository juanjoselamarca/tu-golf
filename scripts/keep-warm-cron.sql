-- keep-warm-cron.sql — mantiene caliente la función serverless de Golfers+.
--
-- POR QUÉ: en Vercel Hobby con tráfico bajo la función escala a cero y la
-- primera visita paga un cold start (~1s de pantalla blanca), justo cuando se
-- demuestra la app. El endpoint /api/keep-warm es lo más liviano posible (NO
-- toca la base de datos) y solo tiene que arrancar el runtime de Node.
--
-- POR QUÉ pg_cron y no GitHub Actions: GitHub estrangula los cron de repos de
-- bajo tráfico (corría cada 1-3h en vez de cada 5 min → no mantenía nada
-- caliente). Supabase SÍ respeta el schedule, así que es confiable.
--
-- Idempotente: se puede re-correr sin duplicar el job. Ejecutar con:
--   node --env-file=.env.local scripts/run-sql.mjs scripts/keep-warm-cron.sql

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'keep-warm-golfers') then
    perform cron.unschedule('keep-warm-golfers');
  end if;
end $$;

select cron.schedule(
  'keep-warm-golfers',
  '*/2 * * * *',
  $job$ select net.http_get(url := 'https://golfersplus.vercel.app/api/keep-warm') $job$
);

-- Verificación:
--   select jobid, jobname, schedule, active from cron.job where jobname='keep-warm-golfers';
--   select status, return_message, start_time from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname='keep-warm-golfers')
--     order by start_time desc limit 5;
--   select status_code, error_msg, created from net._http_response order by created desc limit 5;
