// Board individual unificado — verificación contra la data REAL de prod.
//
// Las tres pantallas del board individual (`/torneo/[slug]`, `.../tv`,
// `.../en-vivo`) tenían su propia computación de neto, "a par", orden y nombre.
// Ahora las tres proyectan la salida de `buildLeaderboardFromLegacy`. Este test
// corre ese motor sobre los torneos del gate sembrados en prod y asegura las
// invariantes que la divergencia rompía.
//
// Read-only: no escribe ni borra nada. Skipea sin SUPABASE_SERVICE_ROLE_KEY,
// así que el `vitest run` de pre-push lo saltea limpio.
//
// Correr: npm run test:integration

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { buildLeaderboardFromLegacy } from '@/golf/leaderboard/build-from-legacy'
import { hasPlayData } from '@/golf/leaderboard/board-rules'
import type { TournamentLeaderboardContext, CourseHole } from '@/golf/leaderboard/types'
import type { DBPlayer } from '@/app/torneo/[slug]/types'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasCreds = Boolean(supabaseUrl && supabaseKey)

const GATE_SLUGS = ['gate-scorer-9h-individual', 'gate-scorer-18h-mixto']

const PLAYER_SELECT =
  'id, handicap_at_registration, player_name, category_id, ' +
  'profiles(name, indice), categories(name), ' +
  'rounds(id, status, total_gross, total_net, total_points, round_number, ' +
  'hole_scores(hole_number, gross_score))'

interface Loaded {
  slug: string
  ctx: TournamentLeaderboardContext
  dbPlayers: DBPlayer[]
  totalRounds: number
}

const loaded: Loaded[] = []

describe.skipIf(!hasCreds)('board individual unificado — data real de prod', () => {
  beforeAll(async () => {
    const sb = createClient(supabaseUrl as string, supabaseKey as string)

    for (const slug of GATE_SLUGS) {
      const { data: t } = await sb
        .from('tournaments')
        .select('id, hole_count, total_rounds, course_id, modo_juego, formato_juego, format, courses(par_total)')
        .eq('slug', slug)
        .single()
      if (!t) continue

      const row = t as unknown as {
        id: string
        hole_count: number | null
        total_rounds: number | null
        course_id: string | null
        modo_juego: string | null
        formato_juego: string | null
        format: string | null
      }

      const { data: holesRaw } = await sb
        .from('course_holes')
        .select('numero, par, stroke_index')
        .eq('course_id', row.course_id as string)
      const holes = ((holesRaw ?? []) as unknown) as CourseHole[]

      const { data: playersRaw } = await sb
        .from('players')
        .select(PLAYER_SELECT)
        .eq('tournament_id', row.id)
        .in('status', ['pending', 'approved', 'waitlist'])

      const parByHole = new Map<number, number>()
      for (const h of holes) parByHole.set(h.numero, h.par)

      loaded.push({
        slug,
        ctx: {
          parTotal: Array.from(parByHole.values()).reduce((s, p) => s + p, 0),
          totalHoyos: row.hole_count ?? 18,
          modoJuego: (row.modo_juego === 'neto' ? 'neto' : 'gross') as ModoJuego,
          formatoJuego: ((row.formato_juego ?? row.format ?? 'stroke_play') as FormatoJuego),
          courseHoles: holes,
        },
        dbPlayers: ((playersRaw ?? []) as unknown) as DBPlayer[],
        totalRounds: row.total_rounds ?? 1,
      })
    }
  })

  it('encuentra los torneos del gate en prod', () => {
    expect(loaded.length).toBeGreaterThan(0)
  })

  it('el "a par" es coherente con los hoyos jugados (el bug del −36/−72)', () => {
    // La firma del bug era medir contra la vuelta ENTERA llevando pocos hoyos:
    // el resultado no guardaba relación con lo jugado (−36 con 3 hoyos). La
    // invariante correcta ata el score a los hoyos que lleva: ni el mejor
    // jugador neto baja 3 golpes por hoyo, ni el peor sube 6.
    for (const { slug, ctx, dbPlayers, totalRounds } of loaded) {
      const board = buildLeaderboardFromLegacy(dbPlayers, ctx, totalRounds)
      for (const p of board.players) {
        if (!hasPlayData({ holesPlayed: p.holes })) continue
        const etiqueta = `${slug} · ${p.name}: ${p.total} en ${p.holes} hoyos`
        expect(p.total, etiqueta).toBeGreaterThan(-3 * p.holes)
        expect(p.total, etiqueta).toBeLessThan(6 * p.holes)
      }
    }
  })

  it('quien no scoreó queda en 0 hoyos y al final, nunca liderando', () => {
    for (const { slug, ctx, dbPlayers, totalRounds } of loaded) {
      const board = buildLeaderboardFromLegacy(dbPlayers, ctx, totalRounds)
      const conDatos = board.players.filter((p) => hasPlayData({ holesPlayed: p.holes }))
      const sinDatos = board.players.filter((p) => !hasPlayData({ holesPlayed: p.holes }))
      if (sinDatos.length === 0 || conDatos.length === 0) continue
      const peorIndiceConDatos = Math.max(...conDatos.map((p) => board.players.indexOf(p)))
      const mejorIndiceSinDatos = Math.min(...sinDatos.map((p) => board.players.indexOf(p)))
      expect(mejorIndiceSinDatos, `${slug}: un jugador sin scores quedó sobre uno que sí jugó`)
        .toBeGreaterThan(peorIndiceConDatos)
    }
  })

  it('ningún jugador queda sin nombre (los invitados traen player_name)', () => {
    for (const { slug, ctx, dbPlayers, totalRounds } of loaded) {
      const board = buildLeaderboardFromLegacy(dbPlayers, ctx, totalRounds)
      for (const p of board.players) {
        expect(p.name.trim().length, `${slug}: nombre vacío`).toBeGreaterThan(0)
        expect(p.name, `${slug}: nombre genérico — falta fallback de invitado`).not.toBe('Sin nombre')
      }
    }
  })

  it('el neto se deriva de los hoyos: nunca supera al bruto ni queda en 0 con scores cargados', () => {
    for (const { slug, ctx, dbPlayers, totalRounds } of loaded) {
      const board = buildLeaderboardFromLegacy(dbPlayers, ctx, totalRounds)
      for (const p of board.players) {
        if (!hasPlayData({ holesPlayed: p.holes })) continue
        expect(p.grossTotal, `${slug} · ${p.name}: bruto en 0 con hoyos jugados`).toBeGreaterThan(0)
        expect(p.netTotal, `${slug} · ${p.name}: neto en 0 con hoyos jugados`).toBeGreaterThan(0)
        // El handicap decide la dirección: un jugador PLUS (índice negativo)
        // DEVUELVE golpes, así que su neto es mayor que su bruto.
        const etiqueta = `${slug} · ${p.name} (hcp ${p.hcp}): bruto ${p.grossTotal} / neto ${p.netTotal}`
        if (p.hcp > 0) {
          expect(p.netTotal as number, etiqueta).toBeLessThan(p.grossTotal as number)
        } else if (p.hcp < 0) {
          expect(p.netTotal as number, etiqueta).toBeGreaterThan(p.grossTotal as number)
        } else {
          expect(p.netTotal as number, etiqueta).toBe(p.grossTotal as number)
        }
      }
    }
  })

  it('los tres rankings coinciden en quién tiene datos (una sola fuente)', () => {
    for (const { slug, ctx, dbPlayers, totalRounds } of loaded) {
      const board = buildLeaderboardFromLegacy(dbPlayers, ctx, totalRounds)
      const conDatosPrimary = board.players.filter((p) => hasPlayData({ holesPlayed: p.holes })).length
      expect(board.playersByGross.length, `${slug}`).toBe(conDatosPrimary)
      expect(board.playersByNeto.length, `${slug}`).toBe(conDatosPrimary)
    }
  })
})
