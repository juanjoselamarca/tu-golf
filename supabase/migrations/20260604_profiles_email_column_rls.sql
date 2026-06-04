-- ============================================================================
-- Cierra fuga de PII: profiles.email legible por cualquiera con la anon key
-- ============================================================================
-- La policy SELECT de `profiles` es USING(true), pensada para que leaderboards,
-- tarjeta pública e índices de rivales puedan leer name/indice de otros jugadores.
-- Efecto colateral: tambien expone `email` de TODA la base al rol publico (anon).
--
-- RLS opera por FILA, no por columna. Para mantener name/indice publicos pero
-- ocultar email, usamos COLUMN-LEVEL privileges: revocamos el SELECT a nivel
-- tabla para anon/authenticated y lo re-otorgamos en todas las columnas EXCEPTO
-- email. Generamos la lista dinamicamente para no omitir ninguna columna nueva.
--
-- Quien sigue leyendo email:
--   - service_role (API admin + /api/profiles/search autenticada + draft/[id])
--   - el propio usuario ve su email via auth.getUser() (JWT), no via profiles
--
-- IMPORTANTE: aplicar SOLO despues de deployar el codigo que dejo de leer
-- profiles.email via cliente publico (PR de este mismo cambio). Si se aplica
-- antes, esas lecturas devuelven 42501 (permission denied for column email).
-- ============================================================================

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name <> 'email';

  -- Quitar SELECT a nivel tabla (cubre todas las columnas, incl. email)
  EXECUTE 'REVOKE SELECT ON public.profiles FROM anon, authenticated';

  -- Re-otorgar SELECT solo en las columnas no sensibles (todas menos email)
  EXECUTE format(
    'GRANT SELECT (%s) ON public.profiles TO anon, authenticated',
    cols
  );

  RAISE NOTICE 'profiles: SELECT re-otorgado en columnas [%], email excluido', cols;
END $$;

-- Verificacion: anon NO debe tener privilegio sobre email
DO $$
DECLARE
  has_email_priv boolean;
BEGIN
  SELECT bool_or(true) INTO has_email_priv
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'email'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type = 'SELECT';

  IF COALESCE(has_email_priv, false) THEN
    RAISE EXCEPTION 'FALLO: anon/authenticated todavia tienen SELECT sobre profiles.email';
  END IF;
  RAISE NOTICE 'OK: email ya no es legible por anon/authenticated';
END $$;
