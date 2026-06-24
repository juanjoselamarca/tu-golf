import type { ExamSeed } from './fixtures'

/**
 * executeTool EN MEMORIA para el examen mockeado (D3a, corre en cada PR sin tocar
 * Supabase). Dada la data sembrada del caso (`seed`), responde las tools del coach
 * con la MISMA forma `{ ok, data }` que `executeTool` real (ver tools.ts), para que
 * el coach LLM vea resultados realistas. Si una tool no tiene data sembrada, degrada
 * honesto (`ok:false`) — nunca inventa, igual que el coach real.
 *
 * El examen LIVE (D3b) usa el executeTool real contra Supabase; este mock es solo
 * para el path de CI por-PR.
 */

type ToolResult = { ok: boolean; data?: unknown; error?: string }

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function norm(s: string): string {
  return stripDiacritics(s).toLowerCase().trim()
}

function courseMatches(ref: string | undefined, courseName: string): boolean {
  if (!ref) return true
  const n = norm(ref)
  const c = norm(courseName)
  return c.includes(n) || n.includes(c)
}

export function buildMockExecuteTool(
  seed: ExamSeed,
): (name: string, input: Record<string, unknown>) => Promise<ToolResult> {
  return async (name, input) => {
    const courseRef = typeof input.course === 'string' ? input.course : undefined
    const holesFilter = typeof input.holes === 'number' ? input.holes : null

    switch (name) {
      case 'find_rounds': {
        let rounds = seed.rounds.filter((r) => courseMatches(courseRef, r.course))
        if (holesFilter) rounds = rounds.filter((r) => r.holes === holesFilter)
        const resolved =
          courseRef && rounds[0] ? { nombre: rounds[0].course, course_id: rounds[0].course_id } : null
        return {
          ok: true,
          data: {
            count: rounds.length,
            rounds: rounds.map((r) => ({
              id: `${r.course_id}-${r.played_at}`,
              course_id: r.course_id,
              course_name: r.course,
              played_at: r.played_at,
              total_gross: r.total,
              holes_played: r.holes,
              scores: r.scores ?? null,
            })),
            resolved_course: resolved,
          },
        }
      }

      case 'get_recent_rounds':
      case 'get_all_rounds_summary': {
        return {
          ok: true,
          data: {
            count: seed.rounds.length,
            rounds: seed.rounds.map((r) => ({
              course_name: r.course,
              course_id: r.course_id,
              played_at: r.played_at,
              total_gross: r.total,
              holes_played: r.holes,
            })),
          },
        }
      }

      case 'get_course_scorecard':
      case 'get_course_details': {
        const sc = seed.scorecard
        if (sc && courseMatches(courseRef, sc.course)) {
          return {
            ok: true,
            data: {
              course_name: sc.course,
              course_id: sc.course_id,
              par_total: sc.par_total,
              pares_por_hoyo: sc.pares,
              holes: sc.pares.map((par, i) => ({ numero: i + 1, par })),
            },
          }
        }
        return {
          ok: false,
          error: `No hay ninguna cancha que coincida con "${courseRef ?? ''}" en el catálogo. NO le pidas los pares al jugador: ofrece el mejor análisis con los scores que sí tengas.`,
        }
      }

      case 'get_playing_handicap': {
        const h = seed.handicap
        if (h && courseMatches(courseRef, h.cancha)) {
          return {
            ok: true,
            data: {
              cancha: h.cancha,
              course_id: h.course_id,
              tee: h.tee,
              indice: h.indice,
              holes: h.holes,
              handicap_de_juego: h.handicap_de_juego,
              course_rating: h.course_rating,
              slope: h.slope,
              nota: `El handicap de juego (${h.handicap_de_juego}) es DISTINTO del índice (${h.indice}): se calcula por cancha y tee con la fórmula WHS.`,
            },
          }
        }
        return { ok: false, error: 'No tengo el rating/slope confiable para calcular el handicap de juego acá.' }
      }

      default:
        // Tool sin data sembrada en el examen: honesto, no inventa.
        return { ok: false, error: `Tool "${name}" no disponible en el examen mockeado.` }
    }
  }
}
