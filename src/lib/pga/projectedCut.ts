/**
 * Corte proyectado OFICIAL del PGA Tour.
 *
 * ESPN (lo que usamos para el leaderboard) no expone el corte. El PGA Tour sí lo
 * calcula y lo publica en su GraphQL (`orchestrator.pgatour.com`), en
 * `leaderboardV3(id).cutLineProbabilities.projectedCutLine`. Esto trae todas las
 * normas resueltas por ellos (regla por evento, suspensiones, MDF, etc.).
 *
 * CERO FALLOS / dependencia frágil: es una API no documentada con key pública. Si
 * cae, cambia o nos bloquea, esta función devuelve `null` y el widget simplemente
 * NO muestra la línea de corte (nunca rompe, nunca inventa). Todo va envuelto en
 * try/catch y con cache de fetch para no martillar su API.
 *
 * La key es pública (la usa su propio sitio). Override por env `PGA_API_KEY`.
 */

const PGA_GQL = 'https://orchestrator.pgatour.com/graphql'
const PGA_KEY = process.env.PGA_API_KEY || 'da2-gsrx5bibzbb4njvhl7t37wqyl4'

async function pgaQuery<T>(query: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(PGA_GQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': PGA_KEY,
        Origin: 'https://www.pgatour.com',
      },
      body: JSON.stringify({ query }),
      // Cache a nivel fetch: el schedule cambia por semana, el corte cada pocos min.
      next: { revalidate },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: T; errors?: unknown }
    if (json.errors || !json.data) return null
    return json.data
  } catch {
    return null
  }
}

// Normaliza nombres para emparejar el evento de ESPN con el del PGA
// ("the Memorial Tournament pres. by Workday" ↔ "...presented by Workday").
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/presented by|pres\.?\s*by|championship|tournament|\bthe\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface SchedTournament { id: string; tournamentName: string; tournamentStatus: string }
interface SchedData { schedule?: { completed?: Array<{ tournaments?: SchedTournament[] }>; upcoming?: Array<{ tournaments?: SchedTournament[] }> } }
interface CutData { leaderboardV3?: { cutLineProbabilities?: { projectedCutLine?: string | null } | null } | null }

/**
 * Devuelve el corte proyectado oficial (ej. "+1", "E", "-2") del torneo PGA en
 * curso, o `null` si no hay torneo activo / no hay corte (eventos signature sin
 * corte → `cutLineProbabilities` viene null) / la API falla.
 *
 * @param eventName nombre del torneo según ESPN (para emparejar por nombre si hace falta)
 * @param year      año del torneo (YYYY)
 */
export async function getProjectedCut(eventName: string, year: string): Promise<string | null> {
  // 1. Resolver el id del torneo en curso (preferir IN_PROGRESS; fallback por nombre).
  const sched = await pgaQuery<SchedData>(
    `{schedule(tourCode:"R",year:"${year}"){completed{tournaments{id tournamentName tournamentStatus}} upcoming{tournaments{id tournamentName tournamentStatus}}}}`,
    3600,
  )
  const months = [...(sched?.schedule?.completed ?? []), ...(sched?.schedule?.upcoming ?? [])]
  const all = months.flatMap((m) => m.tournaments ?? [])
  if (all.length === 0) return null

  const target =
    all.find((t) => t.tournamentStatus === 'IN_PROGRESS') ||
    all.find((t) => normName(t.tournamentName) === normName(eventName))
  if (!target) return null

  // 2. Corte proyectado del torneo. Solo existe durante R1/R2 de eventos con corte.
  const lb = await pgaQuery<CutData>(
    `{leaderboardV3(id:"${target.id}"){cutLineProbabilities{projectedCutLine}}}`,
    60,
  )
  const cut = lb?.leaderboardV3?.cutLineProbabilities?.projectedCutLine
  return cut ? cut.trim() : null
}
