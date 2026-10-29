-- players.pending_user_id es la credencial del invitado de torneo: con ese uuid cualquiera reclama su tarjeta
-- (/torneo/[slug] -> GuestClaim). Hoy lo lee todo el mundo: anon por la lista de 20261027120000 y authenticated
-- por el SELECT de tabla del baseline. Esta migración lo deja privado para los dos roles del cliente.
--
-- Escrita el 16-oct-2026 y renumerada al 27-oct: el baseline del esquema es 20261019200001 y el canario
-- src/__tests__/canary-migration-names.test.ts prohíbe migraciones anteriores a él. Reescrita además con GRANT
-- estáticos (antes armaba la lista con format() desde information_schema, invisible para los canarios) y
-- reconciliada con 20261027120000, que ya había acotado anon a 12 columnas: si volviera a GRANTear "todas menos
-- pending_user_id" le devolvería a anon las 2 columnas que esa migración le quitó (flight_id, tees,
-- status_changed_at quedaron fuera a propósito).
--
-- Columnas de players (15, baseline:625-641): las 12 de anon menos pending_user_id = 11 para anon;
-- las 15 menos pending_user_id = 14 para authenticated.
--
-- ORDEN DE DEPLOY: aplicar SOLO con el PR de código (#565) ya en prod. Antes de eso el scorer de torneo
-- selecciona pending_user_id en su roster y recibiría 42501 para todos los jugadores.
--
-- La lista de anon vive también en ANON_COLUMNS (src/__tests__/helpers/migration-sql.ts), que la exige en prod.
-- REVOKE SELECT de tabla también quita los SELECT por columna, así que cada GRANT deja exactamente su lista.
-- Idempotente.
--
-- Rollback: supabase/migrations/rollback/20261027_players_ocultar_pending_user_id_rollback.sql

REVOKE SELECT ON public.players FROM anon;
GRANT SELECT (id, tournament_id, user_id, category_id, handicap_at_registration, status, created_at, status_reason,
              player_name, tee_id, genero)
  ON public.players TO anon;

REVOKE SELECT ON public.players FROM authenticated;
GRANT SELECT (id, tournament_id, user_id, category_id, flight_id, handicap_at_registration, status, created_at,
              tees, status_reason, status_changed_at, player_name, tee_id, genero)
  ON public.players TO authenticated;

-- Declaración explícita y revisable de que la columna que falta en los dos GRANT falta a propósito
-- (en Postgres es un no-op después de los REVOKE de tabla).
REVOKE SELECT (pending_user_id) ON public.players FROM anon, authenticated;

-- La columna queda invisible para los dos roles y ninguna de las otras 14 se perdió por el camino.
DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_column_privilege(col, 'public.players', 'pending_user_id', 'SELECT') THEN
      RAISE EXCEPTION '% todavía lee players.pending_user_id', col;
    END IF;
  END LOOP;
  FOR col IN SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'players' AND column_name <> 'pending_user_id' LOOP
    IF NOT has_column_privilege('authenticated', 'public.players', col, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated perdió players.%', col;
    END IF;
  END LOOP;
END $$;
