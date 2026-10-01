-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  SECURITY FIX: restringir columnas billing en profiles UPDATE      ║
-- ║                                                                    ║
-- ║  La policy "Usuario edita su propio perfil" (001_initial_schema)   ║
-- ║  permite UPDATE de TODAS las columnas, incluyendo:                 ║
-- ║    subscription_tier, subscription_status, is_founding_member,     ║
-- ║    trial_rounds_remaining, trial_ends_at, founding_member_at,      ║
-- ║    coach_access_enabled, role                                      ║
-- ║                                                                    ║
-- ║  Un usuario autenticado puede escalar privilegios con:             ║
-- ║    supabase.from('profiles').update({subscription_tier:'pro'})     ║
-- ║      .eq('id', userId)                                             ║
-- ║                                                                    ║
-- ║  FIX: revocar UPDATE a nivel tabla, re-otorgar solo en columnas    ║
-- ║  que el usuario legítimamente edita. Column-level REVOKE no        ║
-- ║  sobrescribe table-level GRANT en Postgres.                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 1. Revocar UPDATE a nivel tabla para authenticated y anon
REVOKE UPDATE ON profiles FROM authenticated;
REVOKE UPDATE ON profiles FROM anon;

-- 2. Re-otorgar UPDATE solo en columnas que el usuario puede editar
-- (perfil personal, preferencias de golf, metas)
GRANT UPDATE (
  name,
  avatar_url,
  genero,
  fecha_nacimiento,
  default_tee_color,
  golf_goals,
  target_handicap,
  target_deadline,
  target_set_at,
  analysis_level,
  updated_at,
  -- Estado final (ver 20261001d): columnas NO de billing que la app escribe con la
  -- sesión. Sin ellas se rompen editar perfil, onboarding, recálculo del índice y nivel.
  indice,
  indice_golfers,
  indice_golfers_updated_at,
  nivel,
  nivel_updated_at,
  nivel_expires_at,
  patterns_need_recalc
) ON profiles TO authenticated;

-- anon NO recibe UPDATE en ninguna columna de profiles.
-- Sólo service_role (API routes del backend) escribe billing y privilegios:
-- subscription_tier, subscription_status, is_founding_member, founding_member_at,
-- trial_rounds_remaining, trial_ends_at, coach_access_enabled, role, cpi_*.
-- indice, nivel*, patterns_need_recalc e indice_golfers* SÍ están en el GRANT de
-- arriba: la app los escribe con la sesión del usuario (ver 20261001d).
