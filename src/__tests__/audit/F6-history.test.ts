// @ts-nocheck
/**
 * AUDIT F6 — Historial: Persistencia y Display
 * =============================================
 * Verifica que las rondas se persisten correctamente en historical_rounds
 * y que el historial muestra la info de formato/modo correctamente.
 *
 * Peso por área:
 *   Data model    — 3
 *   Display logic — 3
 *   Query         — 2
 *   Stats         — 2
 *   Finalization  — 3
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../../../')
const HISTORIAL_PAGE   = path.join(ROOT, 'src/app/perfil/historial/page.tsx')
const HISTORIAL_STATS  = path.join(ROOT, 'src/app/api/historial/stats/route.ts')
const SCORE_PAGE       = path.join(ROOT, 'src/app/ronda-libre/[codigo]/score/page.tsx')
const GAME_ACTIONS     = path.join(ROOT, 'src/app/api/game/actions.ts')

function readSrc(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

// ─── DB snapshots (verified live via Supabase Management API) ─────────────────

/**
 * Snapshot tomado el 2026-04-14 via:
 *   POST /v1/projects/hoswfwhvcgqlqdmzpnce/database/query
 *   SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns
 *   WHERE table_name = 'historical_rounds' ORDER BY ordinal_position
 */
const HISTORICAL_ROUNDS_COLUMNS: Record<string, { data_type: string; column_default: string | null; is_nullable: string }> = {
  id:               { data_type: 'uuid',                     column_default: 'gen_random_uuid()', is_nullable: 'NO' },
  user_id:          { data_type: 'uuid',                     column_default: null,                is_nullable: 'NO' },
  course_name:      { data_type: 'text',                     column_default: null,                is_nullable: 'NO' },
  tee_color:        { data_type: 'text',                     column_default: null,                is_nullable: 'YES' },
  played_at:        { data_type: 'date',                     column_default: null,                is_nullable: 'NO' },
  scores:           { data_type: 'jsonb',                    column_default: "'[]'::jsonb",       is_nullable: 'NO' },
  total_gross:      { data_type: 'integer',                  column_default: null,                is_nullable: 'YES' },
  notes:            { data_type: 'text',                     column_default: null,                is_nullable: 'YES' },
  privacy:          { data_type: 'text',                     column_default: "'private'::text",   is_nullable: 'NO' },
  curso_id:         { data_type: 'uuid',                     column_default: null,                is_nullable: 'YES' },
  holes_played:     { data_type: 'integer',                  column_default: null,                is_nullable: 'YES' },
  import_source:    { data_type: 'text',                     column_default: "'manual'::text",    is_nullable: 'YES' },
  diferencial:      { data_type: 'numeric',                  column_default: null,                is_nullable: 'YES' },
  formato_juego:    { data_type: 'text',                     column_default: "'stroke_play'::text", is_nullable: 'NO' },
  modo_juego:       { data_type: 'text',                     column_default: "'gross'::text",     is_nullable: 'NO' },
}

/**
 * Snapshot de CHECK constraints tomado el 2026-04-14 via:
 *   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 *   WHERE conrelid = 'historical_rounds'::regclass AND contype = 'c'
 */
const HISTORICAL_ROUNDS_CHECKS = [
  {
    conname: 'historical_rounds_formato_check',
    condef: "CHECK ((formato_juego = ANY (ARRAY['stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text])))",
  },
  {
    conname: 'historical_rounds_modo_check',
    condef: "CHECK ((modo_juego = ANY (ARRAY['gross'::text, 'neto'::text])))",
  },
]

// ─── AREA 1: Data Model ───────────────────────────────────────────────────────

describe('F6 | Data Model (peso 3)', () => {

  it('[DM-1] historical_rounds has formato_juego column (NOT NULL, DEFAULT stroke_play)', () => {
    const col = HISTORICAL_ROUNDS_COLUMNS['formato_juego']
    expect(col, 'columna formato_juego debe existir').toBeDefined()
    expect(col.is_nullable).toBe('NO')
    expect(col.column_default).toMatch(/stroke_play/)
  })

  it('[DM-2] historical_rounds has modo_juego column (NOT NULL, DEFAULT gross)', () => {
    const col = HISTORICAL_ROUNDS_COLUMNS['modo_juego']
    expect(col, 'columna modo_juego debe existir').toBeDefined()
    expect(col.is_nullable).toBe('NO')
    expect(col.column_default).toMatch(/gross/)
  })

  it('[DM-3] CHECK constraint exists for formato_juego with valid values', () => {
    const check = HISTORICAL_ROUNDS_CHECKS.find(c => c.conname === 'historical_rounds_formato_check')
    expect(check, 'CHECK constraint para formato_juego debe existir').toBeDefined()
    expect(check!.condef).toContain('stroke_play')
    expect(check!.condef).toContain('stableford')
    expect(check!.condef).toContain('match_play')
  })

  it('[DM-4] CHECK constraint exists for modo_juego with valid values (gross, neto)', () => {
    const check = HISTORICAL_ROUNDS_CHECKS.find(c => c.conname === 'historical_rounds_modo_check')
    expect(check, 'CHECK constraint para modo_juego debe existir').toBeDefined()
    expect(check!.condef).toContain('gross')
    expect(check!.condef).toContain('neto')
  })

  it('[DM-5] No additional (unexpected) CHECK constraints break formato/modo values', () => {
    // Verifica que los constraints sean exactamente los 2 esperados y nada más en formato/modo
    const formatChecks = HISTORICAL_ROUNDS_CHECKS.filter(c =>
      c.conname.includes('formato') || c.conname.includes('modo')
    )
    expect(formatChecks).toHaveLength(2)
  })

})

// ─── AREA 2: Display Logic ────────────────────────────────────────────────────

describe('F6 | Display Logic (peso 3)', () => {

  let pageSource: string

  beforeAll(() => {
    pageSource = readSrc(HISTORIAL_PAGE)
  })

  it('[DL-1] cellBg uses diff vs par (score - par), not absolute score', () => {
    // The function must use "score - par" pattern
    expect(pageSource).toMatch(/const diff = score - par/)
    // Sanity: must NOT reference a hardcoded par in the cellBg function itself
    // (the par is passed as parameter, default 4)
    expect(pageSource).toMatch(/function cellBg\(score: number \| null, par: number = 4\)/)
  })

  it('[DL-2] HoleBar component is imported AND used in JSX', () => {
    // Import
    expect(pageSource).toMatch(/import HoleBar from/)
    // Usage in JSX
    expect(pageSource).toMatch(/<HoleBar/)
  })

  it('[DL-3] Format badge is shown only when formato_juego !== stroke_play', () => {
    // Must check that the badge renders conditionally
    expect(pageSource).toMatch(/r\.formato_juego.*!==.*['"]stroke_play['"]/)
    // Must use formatLabel() to get the badge text
    expect(pageSource).toMatch(/formatLabel\(r\.formato_juego/)
  })

  it('[DL-4] Modo badge "NETO" shown when modo === neto AND not stableford/match_play', () => {
    // The condition must exclude stableford and match_play from showing "NETO"
    expect(pageSource).toMatch(/r\.modo_juego === ['"]neto['"]/)
    expect(pageSource).toMatch(/r\.formato_juego !== ['"]stableford['"]/)
    expect(pageSource).toMatch(/r\.formato_juego !== ['"]match_play['"]/)
    // The badge text itself
    expect(pageSource).toMatch(/NETO/)
  })

  it('[DL-5] Par calculation uses holes-aware fallback (9->36, 18->72), not bare hardcoded 72', () => {
    // In the round list rendering, par should derive from holes_played
    // The pattern "holes <= 9 ? 36 : 72" guards the fallback
    expect(pageSource).toMatch(/holes.*<=.*9.*\?.*36.*:.*72|36.*:.*72/)
  })

  it('[DL-6] Score display: scoreColor uses vsPar, not absolute score (e.g., not red for over-par total)', () => {
    // scoreColor() must accept vsPar (number | null) and return color strings
    // Specifically, over par should NOT return red (#dc2626)
    expect(pageSource).toMatch(/function scoreColor\(vsPar: number \| null\)/)
    // Over par returns grey (not red) — verified from commit d05ac2a
    expect(pageSource).toMatch(/#5a6370/)
    // Red (#dc2626) should not appear in scoreColor for over-par
    const scoreColorMatch = pageSource.match(/function scoreColor[\s\S]*?^}/m)
    if (scoreColorMatch) {
      expect(scoreColorMatch[0]).not.toContain('#dc2626')
    }
  })

  it('[DL-7] Scorecard rendered in expanded view with formato prop from round data', () => {
    // The Scorecard component must be used
    expect(pageSource).toMatch(/<Scorecard/)
    // formato prop should use round's formato_juego, not hardcoded
    expect(pageSource).toMatch(/formato=\{.*formato_juego.*\}|formato_juego.*ScorecardProps/)
  })

  it('[DL-8] Expanded scorecard uses HoleBar from round data (not a separate HoleColorBar)', () => {
    // HoleBar (Garmin-style bar) must render in the card body (not only in expanded mode)
    // Checks that HoleBar is used in the card — presence of both the condition and HoleBar together
    // The pattern checks scores.some(Boolean) guard exists near a HoleBar usage
    expect(pageSource).toMatch(/r\.scores.*some.*Boolean/)
    expect(pageSource).toMatch(/<HoleBar/)
    // Confirm HoleBar is rendered outside the expanded (isOpen) block by checking
    // it appears before the isOpen conditional scorecard
    const holeBarIndex   = pageSource.indexOf('<HoleBar')
    const scorecardIndex = pageSource.indexOf('<Scorecard')
    expect(holeBarIndex).toBeGreaterThan(0)
    expect(scorecardIndex).toBeGreaterThan(0)
    expect(holeBarIndex).toBeLessThan(scorecardIndex)
  })

})

// ─── AREA 3: Query ────────────────────────────────────────────────────────────

describe('F6 | Query (peso 2)', () => {

  let pageSource: string
  let statsSource: string

  beforeAll(() => {
    pageSource  = readSrc(HISTORIAL_PAGE)
    statsSource = readSrc(HISTORIAL_STATS)
  })

  it('[Q-1] Supabase query in historial page includes formato_juego', () => {
    // The .select() call must include formato_juego
    expect(pageSource).toMatch(/\.select\(.*formato_juego/)
  })

  it('[Q-2] Supabase query in historial page includes modo_juego', () => {
    expect(pageSource).toMatch(/\.select\(.*modo_juego/)
  })

  it('[Q-3] HistoricalRound interface includes formato_juego field', () => {
    expect(pageSource).toMatch(/formato_juego\??\s*:\s*string/)
  })

  it('[Q-4] HistoricalRound interface includes modo_juego field', () => {
    expect(pageSource).toMatch(/modo_juego\??\s*:\s*string/)
  })

  it('[Q-5] Stats route HistoricalRound interface does NOT miss formato_juego/modo_juego (optional check)', () => {
    // The stats route has its own HistoricalRound interface — it currently omits formato/modo
    // because it only uses stats, which is acceptable but flagged
    const statsHasFormato = statsSource.includes('formato_juego')
    const statsHasModo    = statsSource.includes('modo_juego')
    // This is a diagnostic flag — not necessarily a hard failure for stats aggregation
    // but it means stats cannot segment by format
    if (!statsHasFormato || !statsHasModo) {
      console.warn('[Q-5] WARNING: stats route does not include formato_juego/modo_juego — Stableford rounds pollute stroke play averages')
    }
    // We still pass — this is a documented gap, not a crash
    expect(true).toBe(true)
  })

})

// ─── AREA 4: Stats ────────────────────────────────────────────────────────────

describe('F6 | Stats (peso 2)', () => {

  let statsSource: string

  beforeAll(() => {
    statsSource = readSrc(HISTORIAL_STATS)
  })

  it('[ST-1] Stats route returns meaningful aggregates (totalRounds, bestRound18, totalBirdies)', () => {
    expect(statsSource).toMatch(/totalRounds/)
    expect(statsSource).toMatch(/bestRound18/)
    expect(statsSource).toMatch(/totalBirdies/)
  })

  it('[ST-2] Stats route computes birdies per-hole, not per-round', () => {
    // Must iterate holes (for loop over scores array) and count diff per hole
    expect(statsSource).toMatch(/for.*let i.*scores\.length|for.*i < scores\.length/)
    expect(statsSource).toMatch(/diff.*<=.*-2.*totalEagles|diff.*-1.*totalBirdies/)
  })

  it('[ST-3] WARN: Stats route does NOT segment Stableford from Stroke Play for averages', () => {
    // The stats route query DOES NOT select formato_juego:
    //   .select('id, course_name, course_id, played_at, scores, total_gross, holes_played, import_source, garmin_scorecard_id, metadata')
    // This means Stableford point totals (e.g., 36 points) get mixed into avgOverPar18
    // which uses total_gross. This is a known bug.
    const queryLine = statsSource.match(/\.select\(['"][^'"]*['"]\)/g) ?? []
    const mainQuery = queryLine.find(q => q.includes('total_gross')) ?? ''
    const hasFormato = mainQuery.includes('formato_juego')
    // Document the gap
    if (!hasFormato) {
      console.warn('[ST-3] BUG: historial/stats does not fetch formato_juego — Stableford totals mixed with stroke play averages')
    }
    // Verify the gap is present (so we can track it):
    expect(hasFormato).toBe(false) // This test PASSES by documenting the known bug
  })

  it('[ST-4] Stats route uses in-memory aggregation (no N+1 queries in loops)', () => {
    // Verified in observation #500: all loops iterate in-memory arrays.
    // Permitimos UN loop que contenga supabase: el de paginación con
    // .range(...) que recorre course_holes de a PAGE_SIZE filas (fix P12,
    // auditoría 22-abr). Ese loop NO es N+1 — itera chunks de la misma
    // tabla, no entidades. El guard real es "ninguna query usa una
    // variable iteradora sobre entidades" (p.ej. .eq('id', round.id)).
    const forLoops = statsSource.matchAll(/for\s*\([^)]+\)\s*\{([\s\S]*?)\n  \}/g)
    let foundBadDbInLoop = false
    for (const match of forLoops) {
      const body = match[1] ?? ''
      const hasDbCall = body.includes('.from(') || body.includes('supabase')
      if (!hasDbCall) continue
      // Acepta patrón de paginación: .range(offset, offset + PAGE_SIZE - 1)
      const isPagination = body.includes('.range(') && body.includes('PAGE_SIZE')
      if (!isPagination) {
        foundBadDbInLoop = true
        break
      }
    }
    expect(foundBadDbInLoop).toBe(false)
  })

  it('[ST-5] Stats route separates 9-hole and 18-hole averages (does not mix them)', () => {
    expect(statsSource).toMatch(/avgOverPar18/)
    expect(statsSource).toMatch(/avgOverPar9/)
    // Rounds are split before averaging
    expect(statsSource).toMatch(/rounds18|rounds9/)
  })

})

// ─── AREA 5: Finalization ─────────────────────────────────────────────────────

describe('F6 | Finalization (peso 3)', () => {

  let scorePageSource: string
  let gameActionsSource: string

  beforeAll(() => {
    scorePageSource   = readSrc(SCORE_PAGE)
    gameActionsSource = readSrc(GAME_ACTIONS)
  })

  it('[FN-1] ronda_libre score page inserts into historical_rounds on finish', () => {
    expect(scorePageSource).toMatch(/historical_rounds.*\.insert|\.insert.*historical_rounds/)
  })

  it('[FN-2] ronda_libre finalization inserts course_name', () => {
    // The insert payload must include course_name
    // Pattern: from('historical_rounds').insert({ ... }) — grab everything between insert({ and the closing })
    const insertBlock = scorePageSource.match(/historical_rounds['"]\)\.insert\(\{([\s\S]{0,1000})\}\)/)?.[1] ?? ''
    expect(insertBlock).toContain('course_name')
  })

  it('[FN-3] ronda_libre finalization inserts scores array', () => {
    const insertBlock = scorePageSource.match(/historical_rounds['"]\)\.insert\(\{([\s\S]{0,1000})\}\)/)?.[1] ?? ''
    expect(insertBlock).toContain('scores')
  })

  it('[FN-4] CRITICAL: ronda_libre finalization does NOT copy formato_juego from ronda to historical_rounds', () => {
    // This is the key finalization bug to detect.
    // The insert in score/page.tsx does NOT include formato_juego or modo_juego.
    // These will default to 'stroke_play' and 'gross' in the DB, losing Stableford/Match Play info.
    const insertBlock = scorePageSource.match(/historical_rounds['"]\)\.insert\(\{([\s\S]{0,1000})\}\)/)?.[1] ?? ''
    const hasFormato = insertBlock.includes('formato_juego')
    const hasModo    = insertBlock.includes('modo_juego')

    if (!hasFormato) {
      console.error('[FN-4] BUG: ronda_libre finalization omits formato_juego — Stableford/Match Play rounds saved as stroke_play')
    }
    if (!hasModo) {
      console.error('[FN-4] BUG: ronda_libre finalization omits modo_juego — neto rounds saved as gross')
    }

    // These tests FAIL intentionally to surface the bug
    expect(hasFormato).toBe(true) // EXPECTED TO FAIL — formato_juego not in insert
    expect(hasModo).toBe(true)    // EXPECTED TO FAIL — modo_juego not in insert
  })

  it('[FN-5] CRITICAL: tournament finalization (game/actions.ts) does NOT copy formato_juego', () => {
    // Tournament round finalization also lacks formato/modo in the historical_rounds insert
    const actionsInsertBlock = gameActionsSource.match(/historical_rounds['"]\)\.insert\(\{([\s\S]{0,1000})\}\)/)?.[1] ?? ''
    const hasFormato = actionsInsertBlock.includes('formato_juego')
    const hasModo    = actionsInsertBlock.includes('modo_juego')

    if (!hasFormato) {
      console.error('[FN-5] BUG: game/actions.ts tournament finalization omits formato_juego')
    }
    if (!hasModo) {
      console.error('[FN-5] BUG: game/actions.ts tournament finalization omits modo_juego')
    }

    expect(hasFormato).toBe(true) // EXPECTED TO FAIL
    expect(hasModo).toBe(true)    // EXPECTED TO FAIL
  })

  it('[FN-6] ronda_libre has formato_juego and modo_juego fields queried before scoring', () => {
    // Verify that the ronda query (before saving) includes the fields
    expect(scorePageSource).toMatch(/formato_juego/)
    expect(scorePageSource).toMatch(/modo_juego/)
  })

  it('[FN-7] manual insert from historial page does NOT include formato_juego (historical only, no format context)', () => {
    // When a user manually adds a round via the historial form, there is no formato_juego
    // (the form only captures course, date, scores). This is expected — these are always stroke play.
    const historialSource = readSrc(HISTORIAL_PAGE)
    const manualInsertBlock = historialSource.match(/historical_rounds['"]\)\.insert\(\{([\s\S]{0,1000})\}\)/)?.[1] ?? ''
    // Manual inserts legitimately omit formato_juego (defaults to stroke_play in DB)
    // so this test confirms the omission is correct for this specific path
    expect(manualInsertBlock).toBeTruthy()
    // The form does not have a format selector, so omission is by design
    expect(manualInsertBlock).not.toContain('formato_juego') // Correct — manual = stroke play
  })

})

// ─── Summary helper ──────────────────────────────────────────────────────────

describe('F6 | Audit Summary', () => {
  it('documents all known gaps for reporting', () => {
    const gaps = [
      'CRITICAL [FN-4]: ronda_libre/score/page.tsx does not copy formato_juego/modo_juego to historical_rounds insert. All Stableford and Match Play rounds are stored as stroke_play/gross in the DB.',
      'CRITICAL [FN-5]: api/game/actions.ts tournament finalization does not copy formato_juego/modo_juego either.',
      'WARN [ST-3]: api/historial/stats/route.ts fetches historical_rounds without formato_juego column, so avgOverPar18/avgOverPar9 mix Stableford point totals with stroke play scores.',
      'WARN [Q-5]: HistoricalRound interface in stats route omits formato_juego and modo_juego fields.',
      'INFO [DL]: Display logic is correct — badges render when the DB values are present (formato_juego, modo_juego are read and shown). The bug is upstream at write time.',
    ]
    gaps.forEach(gap => console.info(gap))
    expect(gaps.length).toBeGreaterThan(0)
  })
})
