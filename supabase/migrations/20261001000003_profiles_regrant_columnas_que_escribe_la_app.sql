-- HOTFIX P0 (01-oct-2026). `profiles_restrict_billing_columns` (20261001, aplicada a
-- prod a las 05:26 desde la rama sin mergear del PR #468) dejó UPDATE sólo en 11
-- columnas de perfil. La app escribe desde el cliente otras columnas que NO son de
-- billing y quedaron rotas:
--   indice                      → OnboardingWizard, useProfileEdit (editar perfil)
--   indice_golfers(_updated_at) → calcular_indice_golfers (SECURITY INVOKER) tras cada ronda
--   nivel, nivel_updated_at, nivel_expires_at → finalizar ronda / agregar ronda
--   patterns_need_recalc        → import-round, detect-and-save-patterns
-- Se re-otorgan SÓLO esas. Billing/suscripción/role/coach_access siguen bloqueadas.
-- RLS de profiles sigue limitando a la fila propia.
GRANT UPDATE (
  indice,
  indice_golfers,
  indice_golfers_updated_at,
  nivel,
  nivel_updated_at,
  nivel_expires_at,
  patterns_need_recalc
) ON public.profiles TO authenticated;
