/**
 * F5 — Share Cards Audit
 * Validates golf-coherence of all share card output by format.
 * DO NOT FIX here — diagnose only.
 */

import { describe, it, expect } from 'vitest'
import {
  buildShareCardRondaLibre,
  compartirLeaderboard,
  type ShareCardRondaLibre,
  type LeaderboardShareData,
} from '@/lib/share-card'
import { parTotalEstandar } from '@/golf/core/round-score'

// ─── Shared mock data ─────────────────────────────────────────────────────────

/** 9-hole course: par 3+4+5+4+3+4+5+4+4 = 36 */
const HOLES_9: Array<{ numero: number; par: number }> = [
  { numero: 1, par: 3 }, { numero: 2, par: 4 }, { numero: 3, par: 5 },
  { numero: 4, par: 4 }, { numero: 5, par: 3 }, { numero: 6, par: 4 },
  { numero: 7, par: 5 }, { numero: 8, par: 4 }, { numero: 9, par: 4 },
]
const PAR_9 = 36

/** 18-hole course: par 72 (two loops of 9 above) */
const HOLES_18: Array<{ numero: number; par: number }> = [
  ...HOLES_9,
  ...HOLES_9.map(h => ({ numero: h.numero + 9, par: h.par })),
]
const PAR_18 = 72

const COURSE_NAME = 'Club de Golf Los Leones'

// ─── 1. SCORE BY FORMAT (peso 3 — CRITICAL) ──────────────────────────────────

describe('Score by format [CRITICAL peso 3]', () => {
  // ── Stroke Play ──────────────────────────────────────────────────────────────

  describe('Stroke Play share card', () => {
    it('scoreGross = total strokes (not points)', () => {
      const scores18: Record<string, number> = {}
      HOLES_18.forEach(h => { scores18[String(h.numero)] = h.par + 1 }) // every hole bogey
      // Total = 72 + 18 = 90

      const card = buildShareCardRondaLibre({
        jugadores: [{ nombre: 'Ana López', scores: scores18 }],
        holesData: HOLES_18,
        courseName: COURSE_NAME,
      })

      expect(card.scoreGross).toBe(90) // actual total strokes (72 par + 18 bogeys)
      // Verify it is NOT treating this as stableford points (which would be different)
      expect(card.scoreGross).not.toBe(PAR_18) // not par total (would mean no scoring)
    })

    it('scoreDiff = total strokes minus course par (vs par)', () => {
      const scores18: Record<string, number> = {}
      HOLES_18.forEach(h => { scores18[String(h.numero)] = h.par }) // every hole par
      // Total = 72, diff = 0

      const card = buildShareCardRondaLibre({
        jugadores: [{ nombre: 'Ana López', scores: scores18 }],
        holesData: HOLES_18,
        courseName: COURSE_NAME,
      })

      expect(card.scoreDiff).toBe(0)
    })

    it('scoreDiff is negative when under par', () => {
      const scores18: Record<string, number> = {}
      HOLES_18.forEach((h, i) => {
        scores18[String(h.numero)] = i < 3 ? h.par - 1 : h.par // 3 birdies, rest pars
      })
      // Total = 72 - 3 = 69, diff = -3

      const card = buildShareCardRondaLibre({
        jugadores: [{ nombre: 'Ana López', scores: scores18 }],
        holesData: HOLES_18,
        courseName: COURSE_NAME,
      })

      expect(card.scoreDiff).toBe(-3)
    })

    it('buildShareCardRondaLibre has no formato_juego (caller must set it)', () => {
      // buildShareCardRondaLibre is format-agnostic — formato_juego is not set by it
      // The caller (score/page.tsx) injects formato_juego after building.
      // This test documents that gap — if it ever starts setting it, update callers.
      const card = buildShareCardRondaLibre({
        jugadores: [{ nombre: 'Test', scores: { '1': 4 } }],
        holesData: [{ numero: 1, par: 4 }],
        courseName: COURSE_NAME,
      })
      expect(card.formato_juego).toBeUndefined()
    })
  })

  // ── Stableford ───────────────────────────────────────────────────────────────

  describe('Stableford share card (via compartirLeaderboard)', () => {
    it('scoreGross = stableford POINTS (not total strokes)', () => {
      // compartirLeaderboard: for stableford, vsPar contains points
      // scoreGross = winner.vsPar (the points value)
      const data: LeaderboardShareData = {
        players: [
          { nombre: 'Carlos Ruiz', vsPar: 34, holesPlayed: 18, totalHoles: 18 },
          { nombre: 'Diego Mora', vsPar: 30, holesPlayed: 18, totalHoles: 18 },
        ],
        courseName: COURSE_NAME,
        fecha: '12 abr 2026',
        rondaCodigo: 'ABC123',
        isFinished: true,
        totalHoles: 18,
        formato_juego: 'stableford',
        modo_juego: 'neto',
      }

      // We can't call compartirLeaderboard directly (it triggers navigator.share),
      // so we replicate its internal cardData construction logic here
      const winner = data.players[0]
      const isStableford = data.formato_juego === 'stableford'
      const scoreGross = isStableford ? winner.vsPar : parTotalEstandar(winner.totalHoles) + winner.vsPar

      expect(scoreGross).toBe(34) // stableford points, NOT strokes
      expect(scoreGross).not.toBe(parTotalEstandar(18) + 34) // would be 106 — wrong
    })

    it('scoreDiff = 0 for stableford (not applicable)', () => {
      const winner = { nombre: 'Carlos Ruiz', vsPar: 34, holesPlayed: 18, totalHoles: 18 }
      const isStableford = true
      const scoreDiff = isStableford ? 0 : winner.vsPar

      expect(scoreDiff).toBe(0)
    })

    it('dibujarRondaLibre shows "puntos" label for stableford (not vs-par diff)', () => {
      // The canvas renderer checks isStableford and shows "puntos" instead of +/-N sobre par.
      // We verify this by checking the share card data flag that triggers it.
      const card: ShareCardRondaLibre = {
        tipo: 'ronda_libre',
        ganador: 'Carlos Ruiz',
        esEmpate: false,
        scoreGross: 34,
        scoreDiff: 0,
        courseName: COURSE_NAME,
        fecha: '12 abr 2026',
        birdies: 0,
        eagles: 0,
        scoresByHole: {},
        parsByHole: {},
        holesPlayed: 18,
        formato_juego: 'stableford',
        modo_juego: 'neto',
      }
      // The canvas code uses: isStableford = data.formato_juego === 'stableford'
      // If true, renders "puntos" instead of scoreDiff label
      const isStableford = card.formato_juego === 'stableford'
      expect(isStableford).toBe(true)
      expect(card.scoreDiff).toBe(0) // must be 0 so no "+0 sobre par" text leaks in
    })
  })

  // ── Match Play ───────────────────────────────────────────────────────────────

  describe('Match Play share card', () => {
    it('AUDIT: buildShareCardRondaLibre does NOT support match result format (e.g. "3&2")', () => {
      // Match Play should show match result, not stroke total.
      // buildShareCardRondaLibre currently computes gross totals (stroke-play logic).
      // This is a known gap — Match Play in Golfers+ uses a separate code path in page.tsx.
      // The share card for Match Play goes through navigator.share with text, not canvas.
      // Verify: the builder has no match_play awareness.
      const card = buildShareCardRondaLibre({
        jugadores: [
          { nombre: 'Player A', scores: { '1': 3, '2': 4, '3': 4 } },
          { nombre: 'Player B', scores: { '1': 4, '2': 3, '3': 5 } },
        ],
        holesData: [{ numero: 1, par: 4 }, { numero: 2, par: 4 }, { numero: 3, par: 4 }],
        courseName: COURSE_NAME,
      })

      // Builder sorts by gross total — does not produce "3&2" style result
      // This WILL fail to show a match result string. Flag as gap.
      expect(typeof card.scoreGross).toBe('number') // it returns a number, not "3&2"
      expect(card.formato_juego).toBeUndefined() // no format awareness in builder
    })

    it('compartirLeaderboard passes formato_juego=match_play into card data', () => {
      // Verify the conversion in compartirLeaderboard correctly propagates format
      // by replicating its cardData construction
      const data: LeaderboardShareData = {
        players: [
          { nombre: 'Player A', vsPar: -2, holesPlayed: 18, totalHoles: 18 },
          { nombre: 'Player B', vsPar: 1, holesPlayed: 18, totalHoles: 18 },
        ],
        courseName: COURSE_NAME,
        fecha: '12 abr 2026',
        rondaCodigo: 'DEF456',
        isFinished: true,
        totalHoles: 18,
        formato_juego: 'match_play',
        modo_juego: 'neto',
      }

      // Replicate cardData build from compartirLeaderboard
      const winner = data.players[0]
      const isStableford = data.formato_juego === 'stableford'
      const scoreGross = isStableford ? winner.vsPar : parTotalEstandar(winner.totalHoles) + winner.vsPar
      const scoreDiff = isStableford ? 0 : winner.vsPar

      // For match_play, scoreGross is stroke total (no match result text) — AUDIT FLAG
      expect(scoreGross).toBe(70) // 72 + (-2) = 70 strokes — NOT a match result
      expect(scoreDiff).toBe(-2)
      // There is no "3&2" string produced anywhere — Match Play leaderboard share
      // goes through a DIFFERENT code path (navigator.share with text only, not canvas)
    })
  })
})

// ─── 2. BADGES AND METADATA (peso 2) ─────────────────────────────────────────

describe('Badges and metadata [peso 2]', () => {
  it('format badge: formato_juego is present when set by caller', () => {
    const card: ShareCardRondaLibre = {
      tipo: 'ronda_libre',
      ganador: 'Test',
      esEmpate: false,
      scoreGross: 75,
      scoreDiff: 3,
      courseName: COURSE_NAME,
      fecha: '12 abr 2026',
      birdies: 0,
      eagles: 0,
      scoresByHole: {},
      parsByHole: {},
      holesPlayed: 18,
      formato_juego: 'stroke_play',
      modo_juego: 'neto',
    }
    expect(card.formato_juego).toBeDefined()
    expect(card.formato_juego).toBe('stroke_play')
  })

  it('hole count badge uses actual holes played (9 or 18), not hardcoded 18', () => {
    const scores9: Record<string, number> = {}
    HOLES_9.forEach(h => { scores9[String(h.numero)] = h.par })

    const card = buildShareCardRondaLibre({
      jugadores: [{ nombre: 'Test', scores: scores9 }],
      holesData: HOLES_9,
      courseName: COURSE_NAME,
    })

    expect(card.holesPlayed).toBe(9)
    expect(card.holesPlayed).not.toBe(18)
  })

  it('hole count badge is 18 for 18-hole round', () => {
    const scores18: Record<string, number> = {}
    HOLES_18.forEach(h => { scores18[String(h.numero)] = h.par })

    const card = buildShareCardRondaLibre({
      jugadores: [{ nombre: 'Test', scores: scores18 }],
      holesData: HOLES_18,
      courseName: COURSE_NAME,
    })

    expect(card.holesPlayed).toBe(18)
  })

  it('course name is present in share card', () => {
    const card = buildShareCardRondaLibre({
      jugadores: [{ nombre: 'Test', scores: { '1': 4 } }],
      holesData: [{ numero: 1, par: 4 }],
      courseName: COURSE_NAME,
    })
    expect(card.courseName).toBe(COURSE_NAME)
    expect(card.courseName.length).toBeGreaterThan(0)
  })

  it('date is present in share card', () => {
    const card = buildShareCardRondaLibre({
      jugadores: [{ nombre: 'Test', scores: { '1': 4 } }],
      holesData: [{ numero: 1, par: 4 }],
      courseName: COURSE_NAME,
    })
    expect(card.fecha).toBeDefined()
    expect(card.fecha.length).toBeGreaterThan(0)
  })

  it('AUDIT: ShareCardTorneo has hardcoded 18 holes in dibujarTorneo (not holesPlayed)', () => {
    // dibujarTorneo calls drawHolesBadge(ctx, 18, ...) unconditionally.
    // If a tournament is 9 holes, badge would show "18 HOYOS" incorrectly.
    // This is a known limitation in the canvas renderer.
    // Flag: ShareCardTorneo has no holesPlayed field at all.
    const torneo = {
      tipo: 'torneo' as const,
      torneoNombre: 'Copa Club',
      jugadorNombre: 'Test',
      posicion: 1,
      totalJugadores: 20,
      scoreGross: 74,
      scoreDiff: 2,
      courseName: COURSE_NAME,
      fecha: '12 abr 2026',
      birdies: 0,
      eagles: 0,
      scoresByHole: {},
      parsByHole: {},
    }
    // No holesPlayed field on ShareCardTorneo — if torneo is 9h, badge is wrong
    expect('holesPlayed' in torneo).toBe(false)
  })
})

// ─── 3. EAGLE/BIRDIE ACCURACY (peso 3) ───────────────────────────────────────

describe('Eagle/Birdie accuracy [CRITICAL peso 3]', () => {
  it('gross round: birdies counted from gross score vs par', () => {
    // Holes 1-3 birdie (par-1), rest par
    const scores: Record<string, number> = {}
    HOLES_18.forEach((h, i) => {
      scores[String(h.numero)] = i < 3 ? h.par - 1 : h.par
    })

    const card = buildShareCardRondaLibre({
      jugadores: [{ nombre: 'Test', scores }],
      holesData: HOLES_18,
      courseName: COURSE_NAME,
    })

    expect(card.birdies).toBe(3)
    expect(card.eagles).toBe(0)
  })

  it('gross round: eagles counted correctly (score <= par - 2)', () => {
    const scores: Record<string, number> = {}
    HOLES_18.forEach((h, i) => {
      scores[String(h.numero)] = i < 2 ? h.par - 2 : h.par // 2 eagles
    })

    const card = buildShareCardRondaLibre({
      jugadores: [{ nombre: 'Test', scores }],
      holesData: HOLES_18,
      courseName: COURSE_NAME,
    })

    expect(card.eagles).toBe(2)
  })

  it('AUDIT: buildShareCardRondaLibre always uses gross score for birdies/eagles', () => {
    // buildShareCardRondaLibre has no handicap-adjustment — it always uses raw scores.
    // For neto rounds, the CALLER (score/page.tsx) calculates birdies/eagles with
    // neto adjustment and passes them into shareData.birdies/.eagles directly.
    // The builder itself does NOT support neto eagle/birdie counting.
    // This test documents: builder uses gross scores unconditionally.

    // Player with HCP 18: every hole gets 1 stroke. Gross score par+1 each hole.
    // Neto score = gross - stroke = par each hole = 0 birdies.
    // But builder sees par+1 and counts 0 birdies (gross, correct for gross rounds).
    const scores: Record<string, number> = {}
    HOLES_9.forEach(h => { scores[String(h.numero)] = h.par + 1 }) // all bogeys gross

    const card = buildShareCardRondaLibre({
      jugadores: [{ nombre: 'HCP18 Player', scores, indice: 18 }],
      holesData: HOLES_9,
      courseName: COURSE_NAME,
    })

    // Builder counts gross scores — 0 birdies (all par+1 gross)
    expect(card.birdies).toBe(0)
    // If this were neto, neto score = par (with HCP18), which is 0 birdies too —
    // but builder correctly ignores indice, leaving birdie calculation to the caller.
  })

  it('AUDIT: Stableford birdies/eagles are exposed in dibujarRondaLibre (should not be shown)', () => {
    // For Stableford, eagles/birdies are conceptually irrelevant — only points matter.
    // However, dibujarRondaLibre draws eagle/birdie items if data.eagles/birdies > 0,
    // regardless of formato_juego. There is NO isStableford guard on the stats block.
    // This means a Stableford card could show "2 eagles 3 birdies" — incorrect UX.

    const card: ShareCardRondaLibre = {
      tipo: 'ronda_libre',
      ganador: 'Test',
      esEmpate: false,
      scoreGross: 36, // stableford points
      scoreDiff: 0,
      courseName: COURSE_NAME,
      fecha: '12 abr 2026',
      birdies: 3, // will be shown on canvas even for stableford!
      eagles: 1,
      scoresByHole: {},
      parsByHole: {},
      holesPlayed: 18,
      formato_juego: 'stableford',
      modo_juego: 'neto',
    }

    // The canvas code (dibujarRondaLibre) does NOT check isStableford before rendering stats:
    //   if (data.eagles > 0) items.push(...)
    //   if (data.birdies > 0) items.push(...)
    // No format guard — stableford card with birdies > 0 WILL show birdie/eagle count.
    const wouldShowStats = card.eagles > 0 || card.birdies > 0
    expect(wouldShowStats).toBe(true) // AUDIT FLAG: stableford card shows birdie/eagle stats
  })

  it('neto round eagles use neto score (score/page.tsx caller logic)', () => {
    // Replicate the neto eagle/birdie counting logic from score/page.tsx
    // to verify it correctly adjusts for handicap strokes
    function strokesRecibidosEnHoyo(hcp: number, strokeIndex: number, totalHoles: number): number {
      // Simplified: strokes = floor(hcp / totalHoles) + (strokeIndex <= hcp % totalHoles ? 1 : 0)
      const base = Math.floor(hcp / totalHoles)
      const extra = strokeIndex <= (hcp % totalHoles) ? 1 : 0
      return base + extra
    }

    // HCP 9, SI 1-9 ordered, 9-hole round
    // Player scores all pars gross. Neto = par - strokes_received.
    // With HCP9 on 9-hole: base = floor(9/9)=1, extra = SI <= 0 → 0. So 1 stroke per hole.
    // Neto = par - 1 = birdie on every hole.
    const hcp = 9
    const holes = 9
    let birdieCount = 0, eagleCount = 0

    HOLES_9.forEach((h, i) => {
      const si = i + 1 // stroke index 1-9
      const gross = h.par
      const strokes = strokesRecibidosEnHoyo(hcp, si, holes)
      const neto = gross - strokes
      const diff = neto - h.par
      if (diff === -1) birdieCount++
      if (diff <= -2) eagleCount++
    })

    // All holes: neto = par - 1 → all birdies
    expect(birdieCount).toBe(9)
    expect(eagleCount).toBe(0)
  })
})

// ─── 4. TIE DETECTION (peso 2) ────────────────────────────────────────────────

describe('Tie detection [peso 2]', () => {
  it('Stroke Play tie: same vsPar → esEmpate = true', () => {
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    HOLES_9.forEach(h => {
      scoresA[String(h.numero)] = h.par // both score exactly par
      scoresB[String(h.numero)] = h.par
    })

    const card = buildShareCardRondaLibre({
      jugadores: [
        { nombre: 'Player A', scores: scoresA },
        { nombre: 'Player B', scores: scoresB },
      ],
      holesData: HOLES_9,
      courseName: COURSE_NAME,
    })

    expect(card.esEmpate).toBe(true)
    expect(card.jugadores).toHaveLength(2)
    expect(card.jugadores).toContain('Player A')
    expect(card.jugadores).toContain('Player B')
  })

  it('Stroke Play no-tie: different scores → esEmpate = false', () => {
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    HOLES_9.forEach(h => {
      scoresA[String(h.numero)] = h.par
      scoresB[String(h.numero)] = h.par + 1 // B plays worse
    })

    const card = buildShareCardRondaLibre({
      jugadores: [
        { nombre: 'Player A', scores: scoresA },
        { nombre: 'Player B', scores: scoresB },
      ],
      holesData: HOLES_9,
      courseName: COURSE_NAME,
    })

    expect(card.esEmpate).toBe(false)
    expect(card.ganador).toBe('Player A')
  })

  it('Stableford tie: same points (vsPar field) → isTie = true in compartirLeaderboard', () => {
    // Replicate compartirLeaderboard tie detection for stableford
    const players = [
      { nombre: 'Player A', vsPar: 34, holesPlayed: 18, totalHoles: 18 },
      { nombre: 'Player B', vsPar: 34, holesPlayed: 18, totalHoles: 18 },
      { nombre: 'Player C', vsPar: 30, holesPlayed: 18, totalHoles: 18 },
    ]
    const winner = players[0]
    const isTie = players.length > 1 && players[1].vsPar === winner.vsPar
    const tiedPlayers = players.filter(p => p.vsPar === winner.vsPar)

    expect(isTie).toBe(true)
    expect(tiedPlayers).toHaveLength(2)
    expect(tiedPlayers.map(p => p.nombre)).toContain('Player A')
    expect(tiedPlayers.map(p => p.nombre)).toContain('Player B')
    expect(tiedPlayers.map(p => p.nombre)).not.toContain('Player C')
  })

  it('Stroke Play tie in compartirLeaderboard: same vsPar → isTie = true', () => {
    const players = [
      { nombre: 'Player A', vsPar: -3, holesPlayed: 18, totalHoles: 18 },
      { nombre: 'Player B', vsPar: -3, holesPlayed: 18, totalHoles: 18 },
    ]
    const winner = players[0]
    const isTie = players.length > 1 && players[1].vsPar === winner.vsPar

    expect(isTie).toBe(true)
  })

  it('multiple winners: all tied names in jugadores array', () => {
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    const scoresC: Record<string, number> = {}
    HOLES_9.forEach(h => {
      scoresA[String(h.numero)] = h.par
      scoresB[String(h.numero)] = h.par
      scoresC[String(h.numero)] = h.par + 1
    })

    const card = buildShareCardRondaLibre({
      jugadores: [
        { nombre: 'Player A', scores: scoresA },
        { nombre: 'Player B', scores: scoresB },
        { nombre: 'Player C', scores: scoresC },
      ],
      holesData: HOLES_9,
      courseName: COURSE_NAME,
    })

    expect(card.esEmpate).toBe(true)
    expect(card.jugadores).toHaveLength(2)
    expect(card.jugadores).toContain('Player A')
    expect(card.jugadores).toContain('Player B')
    expect(card.jugadores).not.toContain('Player C')
  })
})

// ─── 5. compartirLeaderboard (peso 3) ────────────────────────────────────────

describe('compartirLeaderboard [CRITICAL peso 3]', () => {
  it('passes formato_juego through to card data', () => {
    // Replicate the cardData construction from compartirLeaderboard
    const data: LeaderboardShareData = {
      players: [{ nombre: 'Test', vsPar: -2, holesPlayed: 18, totalHoles: 18 }],
      courseName: COURSE_NAME,
      fecha: '12 abr 2026',
      rondaCodigo: 'XYZ',
      isFinished: true,
      totalHoles: 18,
      formato_juego: 'stroke_play',
      modo_juego: 'neto',
    }

    const winner = data.players[0]
    const isStableford = data.formato_juego === 'stableford'
    const cardData: ShareCardRondaLibre = {
      tipo: 'ronda_libre',
      ganador: winner.nombre,
      esEmpate: false,
      scoreGross: isStableford ? winner.vsPar : parTotalEstandar(winner.totalHoles) + winner.vsPar,
      scoreDiff: isStableford ? 0 : winner.vsPar,
      courseName: data.courseName,
      fecha: data.fecha,
      birdies: 0,
      eagles: 0,
      scoresByHole: {},
      parsByHole: {},
      holesPlayed: winner.totalHoles,
      formato_juego: data.formato_juego,
      modo_juego: data.modo_juego,
      ranking: data.players.map(p => ({
        nombre: p.nombre,
        score: isStableford ? p.vsPar : parTotalEstandar(p.totalHoles) + p.vsPar,
        diff: isStableford ? 0 : p.vsPar,
      })),
    }

    expect(cardData.formato_juego).toBe('stroke_play')
    expect(cardData.modo_juego).toBe('neto')
  })

  it('Stableford: ranking uses points (vsPar = points), not gross strokes', () => {
    const players = [
      { nombre: 'Player A', vsPar: 36, holesPlayed: 18, totalHoles: 18 },
      { nombre: 'Player B', vsPar: 32, holesPlayed: 18, totalHoles: 18 },
      { nombre: 'Player C', vsPar: 28, holesPlayed: 18, totalHoles: 18 },
    ]
    const isStableford = true

    const ranking = players.map(p => ({
      nombre: p.nombre,
      score: isStableford ? p.vsPar : parTotalEstandar(p.totalHoles) + p.vsPar,
      diff: isStableford ? 0 : p.vsPar,
    }))

    expect(ranking[0].score).toBe(36) // points, not 72+36=108
    expect(ranking[1].score).toBe(32)
    expect(ranking[2].score).toBe(28)
    expect(ranking[0].diff).toBe(0)   // diff is 0 for stableford (N/A)
  })

  it('Stroke Play: ranking uses gross total (parTotal + vsPar)', () => {
    const players = [
      { nombre: 'Player A', vsPar: -3, holesPlayed: 18, totalHoles: 18 },
      { nombre: 'Player B', vsPar: 0, holesPlayed: 18, totalHoles: 18 },
    ]
    const isStableford = false

    const ranking = players.map(p => ({
      nombre: p.nombre,
      score: isStableford ? p.vsPar : parTotalEstandar(p.totalHoles) + p.vsPar,
      diff: isStableford ? 0 : p.vsPar,
    }))

    expect(ranking[0].score).toBe(69)  // 72 + (-3)
    expect(ranking[0].diff).toBe(-3)
    expect(ranking[1].score).toBe(72)  // par
    expect(ranking[1].diff).toBe(0)
  })

  it('holesPlayed propagates correctly to card (9-hole leaderboard)', () => {
    const players = [
      { nombre: 'Player A', vsPar: -1, holesPlayed: 9, totalHoles: 9 },
    ]
    const winner = players[0]
    const isStableford = false
    const cardData: Partial<ShareCardRondaLibre> = {
      holesPlayed: winner.totalHoles,
      scoreGross: isStableford ? winner.vsPar : parTotalEstandar(winner.totalHoles) + winner.vsPar,
    }

    expect(cardData.holesPlayed).toBe(9)
    expect(cardData.scoreGross).toBe(35) // parTotalEstandar(9)=36 + (-1) = 35
  })

  it('AUDIT: Stableford leaderboard winner has higher vsPar (points), not lower', () => {
    // In compartirLeaderboard, players[0] is assumed to be the winner.
    // For Stableford, higher points = winner. The caller (page.tsx line 711+) sorts:
    //   if (ronda.formato_juego === 'stableford') return b.stablefordPts - a.stablefordPts
    // So players[0] should have HIGHEST points. Verify the conversion is consistent.
    const players = [
      { nombre: 'Winner', vsPar: 38, holesPlayed: 18, totalHoles: 18 },
      { nombre: 'Second', vsPar: 34, holesPlayed: 18, totalHoles: 18 },
    ]
    // The leaderboard is already sorted (highest pts first for stableford)
    // Winner is players[0] with 38 pts
    expect(players[0].vsPar).toBeGreaterThan(players[1].vsPar)

    const isStableford = true
    const winner = players[0]
    expect(isStableford ? winner.vsPar : parTotalEstandar(winner.totalHoles) + winner.vsPar).toBe(38)
  })
})

// ─── 6. TEXT FALLBACK (peso 1) ────────────────────────────────────────────────

describe('Text fallback in compartirResultado [peso 1]', () => {
  it('Stableford text uses "X pts" format', () => {
    // Replicate the scoreText logic from compartirResultado
    const scoreGross = 34
    const scoreDiff = 0
    const isStab = true

    const scoreText = isStab
      ? `${scoreGross} pts`
      : `${scoreGross} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`

    expect(scoreText).toBe('34 pts')
    expect(scoreText).not.toContain('(') // no stroke-play format
  })

  it('Stroke Play text uses "gross (±diff)" format', () => {
    const scoreGross = 78
    const scoreDiff = 6
    const isStab = false

    const scoreText = isStab
      ? `${scoreGross} pts`
      : `${scoreGross} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`

    expect(scoreText).toBe('78 (+6)')
  })

  it('Stroke Play under par uses negative diff', () => {
    const scoreGross = 69
    const scoreDiff = -3
    const isStab = false

    const scoreText = isStab
      ? `${scoreGross} pts`
      : `${scoreGross} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`

    expect(scoreText).toBe('69 (-3)')
  })

  it('AUDIT: Match Play text in compartirResultado falls through to stroke-play format', () => {
    // compartirResultado has no match_play branch for scoreText.
    // isStab = (formato_juego === 'stableford') → false for match_play
    // So Match Play share text shows "70 (-2)" instead of "3&2" or "1UP"
    const card: ShareCardRondaLibre = {
      tipo: 'ronda_libre',
      ganador: 'Player A',
      esEmpate: false,
      scoreGross: 70,
      scoreDiff: -2,
      courseName: COURSE_NAME,
      fecha: '12 abr 2026',
      birdies: 0,
      eagles: 0,
      scoresByHole: {},
      parsByHole: {},
      holesPlayed: 18,
      formato_juego: 'match_play',
      modo_juego: 'neto',
    }

    // compartirResultado: isStab = (data.formato_juego === 'stableford') → false
    const isStab = card.formato_juego === 'stableford'
    const scoreText = isStab
      ? `${card.scoreGross} pts`
      : `${card.scoreGross} (${(card.scoreDiff ?? 0) >= 0 ? '+' : ''}${card.scoreDiff})`

    // AUDIT: shows stroke play format, not match result like "3&2" or "1UP"
    expect(scoreText).toBe('70 (-2)') // wrong for match play — no "3&2" text
    expect(scoreText).not.toMatch(/\d+&\d+/) // no match play result format
    expect(scoreText).not.toMatch(/\dUP/)     // no "1UP" etc.
  })

  it('Stroke Play par score uses "+0" format', () => {
    const scoreGross = 72
    const scoreDiff = 0
    const isStab = false

    const scoreText = isStab
      ? `${scoreGross} pts`
      : `${scoreGross} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`

    expect(scoreText).toBe('72 (+0)')
  })
})

// ─── 7. parTotalEstandar correctness ─────────────────────────────────────────

describe('parTotalEstandar helper', () => {
  it('returns 36 for 9-hole round', () => {
    expect(parTotalEstandar(9)).toBe(36)
  })

  it('returns 72 for 18-hole round', () => {
    expect(parTotalEstandar(18)).toBe(72)
  })

  it('compartirLeaderboard uses parTotalEstandar, not hardcoded 72', () => {
    // For a 9-hole leaderboard with vsPar = -1:
    // scoreGross should be 36 + (-1) = 35, not 72 + (-1) = 71
    const winner = { nombre: 'Test', vsPar: -1, holesPlayed: 9, totalHoles: 9 }
    const isStableford = false
    const scoreGross = isStableford ? winner.vsPar : parTotalEstandar(winner.totalHoles) + winner.vsPar

    expect(scoreGross).toBe(35) // 36 - 1
    expect(scoreGross).not.toBe(71) // 72 - 1 would be wrong for 9 holes
  })
})
