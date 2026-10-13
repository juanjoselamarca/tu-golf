-- Fix: profiles table was missing SELECT grant for authenticated and anon roles.
-- The RLS policy "Profiles publicos" (using: true) was already in place but
-- table-level GRANT SELECT was never issued, causing all authenticated/anon
-- SELECT queries on profiles to fail with "permission denied".
-- This broke hasCoachAccess() and silently returned null in 20+ call sites.
--
-- Already applied to production on 2026-09-10.
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
