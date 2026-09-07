# CEO Agent: Refactor + Security + Data — 2026-09-07

## Health Check
- HTTP endpoint requires admin session auth; could not run via CLI.
- No FAILs detected in direct DB queries.

## Data Quality Audit

### Findings

1. **9 active courses without course_holes data** (no par-per-hole):
   - C.G. Barquito Chanaral (DAMAS + VARONES)
   - C.G. Rio Blanco (DAMAS + VARONES)
   - Club de Golf Brisas de Santo Domingo
   - Club de Golf Marbella
   - Club de Golf Rocas de Santo Domingo
   - Iquique C.C. (DAMAS + VARONES)
   - **Impact**: Low. These courses exist but lack scorecard data. Users creating rounds on them won't get par-per-hole info. No action needed — they'll get data when someone plays or imports a scorecard.

2. **12 rondas_libres without course_id** (all finalized, oldest from March 2026):
   - All have `course_name` but no `course_id` FK.
   - Courses: Los Leones, Prince of Wales, El Polo, Marbella.
   - **Impact**: Low. These are early rounds before course matching was mandatory. Stats derivation works via course_name fallback.

3. **0 stale tournaments** — no tournaments stuck in open/active state past their end date.

4. **0 invalid par values** in course_holes — all pars are 3, 4, 5, or 6.

5. **0 duplicate stroke indices** — no SI permutation issues.

## Security Audit (Monday = Rate Limits)

### Critical Finding: 10% Rate Limit Coverage

Only 11 of 109 API routes had rate limiting. Full audit performed.

### Fixed (this session)

Added rate limiting to 6 critical unprotected endpoints:

| Route | Limit | Risk |
|-------|-------|------|
| `DELETE /api/profile/delete-account` | 3/hour | Irreversible account deletion |
| `POST /api/coach/post-round-trigger` | 10/min | Write (coach events) |
| `POST /api/coach/plan-outcome` | 10/min | Computation |
| `GET /api/coach/progress` | 30/min | Expensive dashboard load |
| `POST /api/torneos/create` | 5/min | Tournament creation |
| `POST /api/ronda-libre/create` | 10/min | Round creation |

**Commit**: 9cf4bb5c

### Remaining Gaps (priority order for future sessions)

**Tier 1 — Next session:**
- All `/api/admin/*` write endpoints (30+ routes, low user risk but compromised admin = disaster)
- `/api/push/send` — can spam push notifications
- `/api/import/csv`, `/api/import/confirm`, `/api/import/garmin-zip` — expensive processing

**Tier 2 — Within 2 weeks:**
- All `/api/torneos/[slug]/*` write endpoints (inscribirse, cupo, guest-join already done)
- `/api/fedegolf/*` sync endpoints
- `/api/cron/*` should validate CRON_SECRET header

**Tier 3 — Backlog:**
- Read endpoints (enumeration risk is low with <100 users)
- Demo endpoints

## Refactor
Not attempted this session — security fix took priority per triage order.

## What's Left
- Rate limiting coverage: ~15% after this fix (was 10%)
- 9 courses without scorecard data (low priority)
- 12 orphaned rondas_libres without course_id (cosmetic)
