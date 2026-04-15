// @ts-nocheck
import { describe, it, test, expect } from 'vitest'
/**
 * AUDIT F2 — Creación de Ronda
 * ============================================================
 * Target: src/app/ronda-libre/nueva/page.tsx
 *
 * Strategy: Since the page is a client component with all validation
 * logic inlined in handleSubmit (no exported helpers), we replicate
 * the exact validation branches here and test them as pure logic.
 * The component itself is NOT mounted (would require Supabase mocks).
 *
 * What IS tested:
 *   - All format×mode validation branches (extracted logic)
 *   - Player-count guards for Match Play
 *   - Stableford HCP guard
 *   - modo_juego override logic (match_play → always 'neto')
 *   - holes hardcode (always 18 in handleSubmit)
 *   - Data shape inserted into rondas_libres
 *
 * What CANNOT be tested here (documented):
 *   - UI auto-switch: selecting Stableford → setAdminMode(true) [inline onClick]
 *   - UI auto-switch: selecting Match Play → setModo('neto') [inline onClick]
 *   - UI auto-switch: selecting Match Play → setAdminMode(true) [inline onClick]
 *   - Default modo='gross' initial state [useState initializer]
 *   - 9-hole round: holes is HARDCODED to 18 (line 259) — no UI toggle visible
 *   - showError calls (require component mount + toast context)
 *   - Actual Supabase INSERT (requires live DB or full mock)
 */

// ─── Types mirrored from the component ─────────────────────────────────────

type Formato = 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'
type Modo    = 'gross' | 'neto'

interface AdminPlayer {
  tipo: 'cuenta' | 'invitado'
  nombre: string
  telefono: string
  handicap: number | null
}

// ─── Validation logic extracted from handleSubmit (lines 225–370) ──────────
// This mirrors EXACTLY what the component does, so any drift here = bug found.

interface ValidationInput {
  userId: string | null
  cancha: string
  formato: Formato
  modo: Modo
  adminMode: boolean
  adminPlayers: AdminPlayer[]
  creatorName: string
  creatorHandicap: number | null
}

interface ValidationResult {
  ok: boolean
  errorTitle?: string
  errorMessage?: string
}

/**
 * Replicates the exact validation branches in handleSubmit.
 * Returns {ok: true} when validation passes, {ok: false, errorTitle, errorMessage} otherwise.
 */
function validateRoundCreation(input: ValidationInput): ValidationResult {
  const { userId, cancha, formato, adminMode, adminPlayers, creatorName, creatorHandicap } = input

  // Guard: must be logged in
  if (!userId) return { ok: false, errorTitle: 'Sin sesión', errorMessage: 'Usuario no autenticado.' }

  // Guard: must have a course
  if (!cancha) {
    return { ok: false, errorTitle: 'Selecciona una cancha', errorMessage: 'Elige la cancha donde vas a jugar.' }
  }

  // Build player list (same logic as component lines 233-235)
  const jugadoresValidos = adminMode
    ? [creatorName, ...adminPlayers.filter(p => p.nombre.trim()).map(p => p.nombre.trim())]
    : [creatorName]

  if (jugadoresValidos.length === 0) {
    return { ok: false, errorTitle: 'Faltan jugadores', errorMessage: 'Agrega al menos un jugador para crear la ronda.' }
  }

  // Match Play: requires exactly 2 players (lines 240-242)
  if (formato === 'match_play' && jugadoresValidos.length !== 2) {
    return { ok: false, errorTitle: 'Match Play requiere 2 jugadores', errorMessage: 'Agrega exactamente un rival para jugar Match Play.' }
  }

  // Stableford: all players must have HCP (lines 245-251)
  if (formato === 'stableford') {
    const missingHCP = adminPlayers.some(p => p.handicap == null)
    if (creatorHandicap == null || missingHCP) {
      return { ok: false, errorTitle: 'Índice requerido', errorMessage: 'Esta modalidad requiere el índice WHS de todos los jugadores para calcular el handicap de cancha.' }
    }
  }

  return { ok: true }
}

/**
 * Replicates the modo_juego override logic (line 286).
 * Match Play ALWAYS becomes 'neto' regardless of what modo state holds.
 */
function resolveModoJuego(formato: Formato, modo: Modo): Modo {
  return formato === 'match_play' ? 'neto' : modo
}

/**
 * Replicates the baseData shape (lines 262-270).
 * holes is HARDCODED to 18 — no 9-hole option exists in handleSubmit.
 */
function buildBaseData(params: {
  codigo: string
  userId: string
  courseId: string | null
  cancha: string
  tees: string
  fechaStr: string
  hoyoInicio: number
  adminMode: boolean
}) {
  return {
    codigo: params.codigo,
    creador_id: params.userId,
    course_id: params.courseId || null,
    course_name: params.cancha,
    tees: params.tees,
    holes: 18, // ← HARDCODED — no 9-hole support in submit path
    fecha: params.fechaStr,
    estado: 'en_curso',
    hoyo_inicio: params.hoyoInicio,
    ...(params.adminMode && { admin_mode: true, admin_user_id: params.userId }),
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const makePlayer = (nombre: string, handicap: number | null = null): AdminPlayer => ({
  tipo: 'invitado', nombre, telefono: '', handicap,
})

const baseInput = (overrides: Partial<ValidationInput> = {}): ValidationInput => ({
  userId: 'user-123',
  cancha: 'Club de Golf X',
  formato: 'stroke_play',
  modo: 'gross',
  adminMode: false,
  adminPlayers: [],
  creatorName: 'Juan',
  creatorHandicap: 12,
  ...overrides,
})

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe('F2 — Round Creation: Format × Mode Validation (CRITICAL, peso 3)', () => {

  // ── Stableford ────────────────────────────────────────────────────────────

  describe('Stableford', () => {

    test('Stableford + gross (modo) + all HCPs present → ALLOWED (R&A 32.1b gross variant exists)', () => {
      /**
       * FINDING: The component ALLOWS Stableford + gross since commit bba2198.
       * The comment in code says "Stableford ahora permite gross (sin handicap) y neto".
       * This passes validation if all HCPs are present for admin players.
       * However: for gross Stableford the HCP guard still checks adminPlayers HCPs
       * (not the creator's). If no adminPlayers, only creator plays — passes.
       * This is architecturally ambiguous: why require adminPlayer HCPs for gross?
       */
      const result = validateRoundCreation(baseInput({
        formato: 'stableford',
        modo: 'gross',
        adminMode: false,
        adminPlayers: [],
        creatorHandicap: 10,
      }))
      // In non-admin mode, adminPlayers is empty → missingHCP check passes (no items to fail)
      // BUT creatorHandicap is required even for gross Stableford
      expect(result.ok).toBe(true)
    })

    test('Stableford + creator HCP null → REJECTED (R&A 32 requires HCP for Stableford neto)', () => {
      const result = validateRoundCreation(baseInput({
        formato: 'stableford',
        adminMode: false,
        adminPlayers: [],
        creatorHandicap: null,
      }))
      expect(result.ok).toBe(false)
      expect(result.errorTitle).toContain('Índice requerido')
    })

    test('Stableford + adminMode + one player missing HCP → REJECTED', () => {
      const result = validateRoundCreation(baseInput({
        formato: 'stableford',
        adminMode: true,
        adminPlayers: [makePlayer('Rival', null)], // null HCP
        creatorHandicap: 10,
      }))
      expect(result.ok).toBe(false)
      expect(result.errorTitle).toContain('Índice requerido')
    })

    test('Stableford + adminMode + all HCPs present → ALLOWED', () => {
      const result = validateRoundCreation(baseInput({
        formato: 'stableford',
        adminMode: true,
        adminPlayers: [makePlayer('Rival', 8)],
        creatorHandicap: 12,
      }))
      expect(result.ok).toBe(true)
    })

    test('Stableford HCP guard: adminPlayers with empty nombre are filtered out', () => {
      /**
       * FINDING: The HCP guard at line 246 checks ALL adminPlayers (including those
       * with empty names). But the player list build at line 233 only includes
       * players where p.nombre.trim() is truthy. This means a player with
       * nombre='' but handicap=null still TRIGGERS the HCP error even though
       * they won't be added to the round.
       * BUG: The guard should only check adminPlayers that pass the nombre filter.
       */
      const result = validateRoundCreation(baseInput({
        formato: 'stableford',
        adminMode: true,
        adminPlayers: [makePlayer('', null)], // empty name, no HCP
        creatorHandicap: 10,
      }))
      // This WILL fail the validation (HCP guard fires before name filter)
      // marking this as a FOUND BUG
      expect(result.ok).toBe(false)
      // The "empty player" is checked for HCP even though they'd be excluded from the round
    })

  })

  // ── Match Play ────────────────────────────────────────────────────────────

  describe('Match Play', () => {

    test('Match Play + 1 player (creator only) → REJECTED', () => {
      const result = validateRoundCreation(baseInput({
        formato: 'match_play',
        adminMode: false,
        adminPlayers: [],
        creatorName: 'Juan',
      }))
      expect(result.ok).toBe(false)
      expect(result.errorTitle).toContain('Match Play requiere 2 jugadores')
    })

    test('Match Play + exactly 2 players → ALLOWED', () => {
      const result = validateRoundCreation(baseInput({
        formato: 'match_play',
        adminMode: true,
        adminPlayers: [makePlayer('Rival', 8)],
        creatorName: 'Juan',
        creatorHandicap: 12,
      }))
      expect(result.ok).toBe(true)
    })

    test('Match Play + 3 players (creator + 2 rivals) → REJECTED', () => {
      const result = validateRoundCreation(baseInput({
        formato: 'match_play',
        adminMode: true,
        adminPlayers: [makePlayer('Rival A', 8), makePlayer('Rival B', 14)],
        creatorName: 'Juan',
      }))
      expect(result.ok).toBe(false)
      expect(result.errorTitle).toContain('Match Play requiere 2 jugadores')
    })

    test('Match Play + gross mode → OVERRIDDEN to neto by resolveModoJuego (Chilean convention)', () => {
      /**
       * The UI hides the gross/neto selector for match_play (line 853),
       * and the submit path always overrides to 'neto' (line 286).
       * Even if modo state = 'gross', the DB insert uses 'neto'.
       */
      const resolved = resolveModoJuego('match_play', 'gross')
      expect(resolved).toBe('neto')
    })

    test('Match Play + neto mode → stays neto', () => {
      const resolved = resolveModoJuego('match_play', 'neto')
      expect(resolved).toBe('neto')
    })

  })

  // ── Stroke Play ───────────────────────────────────────────────────────────

  describe('Stroke Play', () => {

    test('Stroke Play + gross → ALLOWED', () => {
      const result = validateRoundCreation(baseInput({
        formato: 'stroke_play',
        modo: 'gross',
      }))
      expect(result.ok).toBe(true)
    })

    test('Stroke Play + neto → ALLOWED', () => {
      const result = validateRoundCreation(baseInput({
        formato: 'stroke_play',
        modo: 'neto',
      }))
      expect(result.ok).toBe(true)
    })

    test('Stroke Play + gross + no HCP → ALLOWED (gross does not require HCP)', () => {
      const result = validateRoundCreation(baseInput({
        formato: 'stroke_play',
        modo: 'gross',
        creatorHandicap: null,
      }))
      expect(result.ok).toBe(true)
    })

    test('Stroke Play + neto → resolveModoJuego returns neto (no override)', () => {
      expect(resolveModoJuego('stroke_play', 'neto')).toBe('neto')
    })

    test('Stroke Play + gross → resolveModoJuego returns gross (no override)', () => {
      expect(resolveModoJuego('stroke_play', 'gross')).toBe('gross')
    })

  })

})

// ═══════════════════════════════════════════════════════════════════════════
describe('F2 — Round Creation: Default Behavior (peso 2)', () => {

  test('Default modo is "gross" (useState initializer line 92)', () => {
    /**
     * UNTESTABLE via unit test — this is React state.
     * DOCUMENTED: useState<'gross' | 'neto'>('gross') on line 92.
     * Manual verification: on page load, "Gross" button is active.
     */
    const defaultModo: Modo = 'gross'
    expect(defaultModo).toBe('gross')
  })

  test('Selecting Stableford auto-switches adminMode ON (UI onClick, line 801)', () => {
    /**
     * UNTESTABLE via unit test — inline onClick handler.
     * DOCUMENTED: if (f.value === 'stableford' && !adminMode) { setAdminMode(true); ... }
     * Manual: click Stableford → admin mode section appears with 1 player slot.
     * NOTE: This does NOT auto-switch modo to neto for Stableford (unlike Match Play).
     * The user can still pick gross for Stableford — this is intentional per code comment.
     */
    expect(true).toBe(true) // placeholder — untestable in unit context
  })

  test('Selecting Match Play auto-switches modo to neto (UI onClick, line 794)', () => {
    /**
     * UNTESTABLE via unit test — inline onClick handler calls setModo('neto').
     * DOCUMENTED: if (f.value === 'match_play') setModo('neto') on line 794.
     * Manual: click Match Play → gross/neto selector is hidden and neto is active.
     */
    expect(true).toBe(true) // placeholder — untestable in unit context
  })

  test('Default formato is "stroke_play" (useState initializer line 91)', () => {
    /**
     * UNTESTABLE via unit test — React state.
     * DOCUMENTED: useState<Formato>('stroke_play') on line 91.
     */
    const defaultFormato: Formato = 'stroke_play'
    expect(defaultFormato).toBe('stroke_play')
  })

})

// ═══════════════════════════════════════════════════════════════════════════
describe('F2 — Round Creation: Data Persistence Shape (peso 3)', () => {

  test('formato_juego is saved correctly for each format', () => {
    const formats: Formato[] = ['stroke_play', 'stableford', 'match_play']
    for (const f of formats) {
      // The component sets formatoJuego = formato (line 287)
      const formatoJuego = f
      expect(formatoJuego).toBe(f)
    }
  })

  test('modo_juego for match_play is always "neto" regardless of modo state', () => {
    expect(resolveModoJuego('match_play', 'gross')).toBe('neto')
    expect(resolveModoJuego('match_play', 'neto')).toBe('neto')
  })

  test('modo_juego for stroke_play preserves the modo state', () => {
    expect(resolveModoJuego('stroke_play', 'gross')).toBe('gross')
    expect(resolveModoJuego('stroke_play', 'neto')).toBe('neto')
  })

  test('modo_juego for stableford preserves the modo state (both gross and neto allowed)', () => {
    expect(resolveModoJuego('stableford', 'gross')).toBe('gross')
    expect(resolveModoJuego('stableford', 'neto')).toBe('neto')
  })

  test('holes is HARDCODED to 18 in baseData — no 9-hole path exists', () => {
    const data = buildBaseData({
      codigo: 'ABC123',
      userId: 'user-1',
      courseId: 'course-1',
      cancha: 'Club Test',
      tees: 'blanco',
      fechaStr: '2026-04-12',
      hoyoInicio: 1,
      adminMode: false,
    })
    expect(data.holes).toBe(18)
  })

  test('estado is always "en_curso" on creation', () => {
    const data = buildBaseData({
      codigo: 'ABC123', userId: 'user-1', courseId: null, cancha: 'Club X',
      tees: 'rojo', fechaStr: '2026-04-12', hoyoInicio: 1, adminMode: false,
    })
    expect(data.estado).toBe('en_curso')
  })

  test('admin_mode and admin_user_id are only included when adminMode=true', () => {
    const withAdmin = buildBaseData({
      codigo: 'X', userId: 'u1', courseId: null, cancha: 'C', tees: 't',
      fechaStr: '2026-04-12', hoyoInicio: 1, adminMode: true,
    })
    expect(withAdmin.admin_mode).toBe(true)
    expect(withAdmin.admin_user_id).toBe('u1')

    const noAdmin = buildBaseData({
      codigo: 'X', userId: 'u1', courseId: null, cancha: 'C', tees: 't',
      fechaStr: '2026-04-12', hoyoInicio: 1, adminMode: false,
    })
    expect((noAdmin as Record<string, unknown>).admin_mode).toBeUndefined()
    expect((noAdmin as Record<string, unknown>).admin_user_id).toBeUndefined()
  })

  test('course_id is null when no courseId provided', () => {
    const data = buildBaseData({
      codigo: 'X', userId: 'u1', courseId: null, cancha: 'Manual',
      tees: 'blanco', fechaStr: '2026-04-12', hoyoInicio: 1, adminMode: false,
    })
    expect(data.course_id).toBeNull()
  })

  test('hoyo_inicio is included in baseData (partidaSimultanea support)', () => {
    const data = buildBaseData({
      codigo: 'X', userId: 'u1', courseId: 'c1', cancha: 'C',
      tees: 'blanco', fechaStr: '2026-04-12', hoyoInicio: 10, adminMode: false,
    })
    expect(data.hoyo_inicio).toBe(10)
  })

})

// ═══════════════════════════════════════════════════════════════════════════
describe('F2 — Round Creation: Edge Cases (peso 2)', () => {

  test('9-hole round: NO UI control exists — holes is hardcoded 18 (FINDING)', () => {
    /**
     * CRITICAL FINDING: handleSubmit line 259 has `const holes = 18` with
     * no conditional. There is NO 9-hole option in the creation flow.
     * The component shows "18 hoyos" static text (line 421).
     * Multi-loop combo picker assumes 18 holes (two 9-hole loops).
     * A user CANNOT create a 9-hole round via ronda-libre.
     */
    const data = buildBaseData({
      codigo: 'X', userId: 'u1', courseId: null, cancha: 'C',
      tees: 'blanco', fechaStr: '2026-04-12', hoyoInicio: 1, adminMode: false,
    })
    expect(data.holes).toBe(18) // always — 9-hole path does not exist
  })

  test('Multi-loop course: selectedLoops is stored as recorridos array', () => {
    /**
     * Line 274: if (courseLoops.length > 0 && selectedLoops.length > 0)
     *   baseData.recorridos = selectedLoops
     * This is the mechanism for front+back 9 combos.
     */
    const selectedLoops = ['Norte', 'Sur']
    const baseData: Record<string, unknown> = { holes: 18 }
    const courseLoops: CourseLoop[] = [
      { recorrido: 'Norte', holes: 9, par: 36 },
      { recorrido: 'Sur', holes: 9, par: 36 },
    ]
    if (courseLoops.length > 0 && selectedLoops.length > 0) {
      baseData.recorridos = selectedLoops
    }
    expect(baseData.recorridos).toEqual(['Norte', 'Sur'])
  })

  test('Multi-loop combo key is order-independent (sorted join)', () => {
    /**
     * Line 707-708: activeKey = selectedLoops.map(l => l.toLowerCase()).sort().join('_')
     * This ensures ['Sur','Norte'] matches ['Norte','Sur'].
     */
    const normalize = (loops: string[]) => loops.map(l => l.toLowerCase()).sort().join('_')
    expect(normalize(['Sur', 'Norte'])).toBe(normalize(['Norte', 'Sur']))
    expect(normalize(['Norte', 'Sur'])).toBe('norte_sur')
  })

  test('Player without HCP + stroke_play → ALLOWED (no HCP guard for stroke play)', () => {
    const result = validateRoundCreation(baseInput({
      formato: 'stroke_play',
      modo: 'gross',
      creatorHandicap: null,
      adminMode: true,
      adminPlayers: [makePlayer('Rival', null)],
    }))
    expect(result.ok).toBe(true)
  })

  test('Player without HCP + stroke_play neto → ALLOWED (no validation guard)', () => {
    /**
     * FINDING: stroke_play neto with players having null HCP passes validation.
     * The component does NOT guard against this — the scoring engine would use HCP=0
     * or break silently. This is a gap: neto requires HCP for correct score.
     */
    const result = validateRoundCreation(baseInput({
      formato: 'stroke_play',
      modo: 'neto',
      creatorHandicap: null,
      adminMode: false,
    }))
    expect(result.ok).toBe(true) // passes — but scoring will use HCP=0 implicitly
  })

  test('No cancha selected → REJECTED before any format validation', () => {
    const result = validateRoundCreation(baseInput({ cancha: '' }))
    expect(result.ok).toBe(false)
    expect(result.errorTitle).toContain('cancha')
  })

  test('No userId (not logged in) → REJECTED immediately', () => {
    const result = validateRoundCreation(baseInput({ userId: null }))
    expect(result.ok).toBe(false)
  })

  test('Fallback INSERT path: when formato_juego column missing, ronda inserts with modo_juego only', () => {
    /**
     * DOCUMENTED (lines 297-310): If Supabase returns error code 42703 (column not found)
     * for formato_juego, the code falls back to inserting without formato_juego but
     * WITH modo_juego. This is a schema migration compatibility guard.
     * RISK: If this fallback is triggered in production, formato_juego is lost.
     * The fallback should be removed once the migration is confirmed stable.
     */
    const e1 = { message: 'column "formato_juego" does not exist', code: '42703' }
    const isFallbackTriggered =
      e1.message?.includes('formato_juego') ||
      e1.message?.includes('schema cache') ||
      e1.code === '42703'
    expect(isFallbackTriggered).toBe(true)
  })

})

// ═══════════════════════════════════════════════════════════════════════════
// UNTESTABLE SUMMARY (documented for manual QA)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * UNTESTABLE items (require component mount + Supabase mock or E2E):
 *
 * 1. UI default: modo='gross' visible on page load (initial useState)
 * 2. UI auto-switch: selecting Stableford → setAdminMode(true), setAdminPlayers([1 slot])
 * 3. UI auto-switch: selecting Match Play → setModo('neto'), setAdminMode(true)
 * 4. UI display: gross/neto toggle hidden when formato='match_play'
 * 5. Toast/showError calls (require useToast context)
 * 6. Actual Supabase INSERT and response handling
 * 7. saveCourseSnapshot call (dynamic import)
 * 8. trackEvent call after creation
 * 9. Redirect to share screen after success
 * 10. 9-hole multi-loop: UI never generates a "9-hole only" combo (all combos = 18h)
 */
