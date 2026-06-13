import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'

interface JugadorRow {
  nombre: string
  scores: Record<string, number> | null
  handicap: number | null
}

interface EquipoRow {
  id: string
  nombre: string
  jugador_ids: string[]
}

interface RondaRow {
  course_name: string
  course_id: string | null
  estado: string
  holes: number
  formato_juego: string
  modo_juego: string
  recorridos: string[] | null
  ronda_libre_jugadores: JugadorRow[]
}

function calcGross(scores: Record<string, number> | null, holes: number): number {
  if (!scores) return 0
  let total = 0
  for (let h = 1; h <= holes; h++) {
    if (scores[String(h)] != null) total += scores[String(h)]
  }
  return total
}

function calcVsPar(
  scores: Record<string, number> | null,
  holes: number,
  parMap: Record<number, number>,
): number {
  if (!scores) return 0
  let diff = 0
  for (let h = 1; h <= holes; h++) {
    if (scores[String(h)] != null) {
      diff += scores[String(h)] - (parMap[h] ?? 4)
    }
  }
  return diff
}

function countHolesPlayed(scores: Record<string, number> | null, holes: number): number {
  if (!scores) return 0
  let count = 0
  for (let h = 1; h <= holes; h++) {
    if (scores[String(h)] != null) count++
  }
  return count
}

function formatVsPar(vs: number): string {
  if (vs === 0) return 'E'
  return vs > 0 ? `+${vs}` : `${vs}`
}

export async function generateMetadata({ params }: { params: { codigo: string } }): Promise<Metadata> {
  const supabase = await createClient()
  const { data: ronda } = await supabase
    .from('rondas_libres')
    .select('course_name, course_id, estado, holes, formato_juego, modo_juego, recorridos, ronda_libre_jugadores(nombre, scores, handicap)')
    .eq('codigo', params.codigo)
    .single<RondaRow>()

  if (!ronda) {
    return {
      title: 'Ronda en vivo — Golfers+',
      description: 'Sigue una ronda de golf en tiempo real en Golfers+.',
    }
  }

  // Fetch par map from course_holes
  const parMap: Record<number, number> = {}
  if (ronda.course_id) {
    let holeQuery = supabase
      .from('course_holes')
      .select('numero, par, recorrido')
      .eq('course_id', ronda.course_id)
    const recorridos = ronda.recorridos
    if (recorridos && recorridos.length > 0) {
      holeQuery = holeQuery.in('recorrido', recorridos)
    }
    const { data: holes } = await holeQuery.order('recorrido').order('numero')
    if (holes) {
      const isMultiLoop = recorridos && recorridos.length > 1
      let holeNum = 1
      holes.forEach((h: { numero: number; par: number }) => {
        const num = isMultiLoop ? holeNum : h.numero
        parMap[num] = h.par
        holeNum++
      })
    }
  }

  const jugadores = ronda.ronda_libre_jugadores || []
  const nJugadores = jugadores.length
  const isTeamFormat = ['best_ball', 'scramble', 'foursome'].includes(ronda.formato_juego)

  let leaderName = ''
  let leaderScore = ''
  let teamContext = ''

  if (isTeamFormat) {
    // For team formats, fetch team names and show format-aware description
    const { data: equipos } = await supabase
      .from('ronda_equipos')
      .select('id, nombre, jugador_ids')
      .eq('ronda_id', params.codigo)

    const formatLabel = ronda.formato_juego === 'best_ball' ? 'Best Ball'
      : ronda.formato_juego === 'scramble' ? 'Scramble' : 'Foursome'

    if (equipos && equipos.length > 0) {
      teamContext = `${equipos.length} equipos en ${formatLabel}`
      // For best ball, find team with best aggregate score
      // Simple approach: sum best score per hole across team members
      const teamScores = (equipos as EquipoRow[]).map(eq => {
        const members = jugadores.filter((_, idx) => {
          // jugador_ids references ronda_libre_jugadores ids, but we don't have ids here
          // Fall back to showing team names without score leader
          return false
        })
        return { nombre: eq.nombre, vsPar: 0, hp: 0 }
      })
      // Show first team name as context (we can't reliably compute best ball here without full data)
      leaderName = ''
      leaderScore = ''
    } else {
      teamContext = formatLabel
    }
  } else if (nJugadores > 0) {
    // Individual format: find leader by vs-par
    const sorted = [...jugadores]
      .map(j => ({
        nombre: j.nombre,
        hp: countHolesPlayed(j.scores, ronda.holes),
        vsPar: Object.keys(parMap).length > 0
          ? calcVsPar(j.scores, ronda.holes, parMap)
          : calcGross(j.scores, ronda.holes),
      }))
      .filter(j => j.hp > 0)
      .sort((a, b) => a.vsPar - b.vsPar || b.hp - a.hp)

    if (sorted.length > 0) {
      leaderName = sorted[0].nombre
      if (Object.keys(parMap).length > 0) {
        leaderScore = formatVsPar(sorted[0].vsPar)
      } else {
        // No course linked, show gross score
        leaderScore = String(sorted[0].vsPar)
      }
    }
  }

  const estadoLabel = ronda.estado === 'finalizada' ? 'Finalizada' : 'En vivo'
  const modoLabel = ronda.modo_juego === 'neto' ? 'Neto' : 'Gross'

  let title: string
  let ogTitle: string
  let description: string

  if (isTeamFormat) {
    const formatLabel = ronda.formato_juego === 'best_ball' ? 'Best Ball'
      : ronda.formato_juego === 'scramble' ? 'Scramble' : 'Foursome'
    title = `${formatLabel} ${modoLabel} — ${ronda.course_name} — Golfers+`
    ogTitle = `${estadoLabel} · ${formatLabel} ${modoLabel} — ${ronda.course_name}`
    description = teamContext
      ? `${teamContext} en ${ronda.course_name}. Sigue la ronda en vivo.`
      : `${formatLabel} en ${ronda.course_name} — Golfers+`
  } else if (leaderName) {
    title = `${leaderName} va ${leaderScore} en ${ronda.course_name} — Golfers+`
    ogTitle = `${estadoLabel} — ${ronda.course_name}`
    description = `${leaderName} lidera con ${leaderScore}. ${nJugadores} jugador${nJugadores !== 1 ? 'es' : ''} en ${ronda.course_name}.`
  } else {
    title = `${estadoLabel} — ${ronda.course_name} — Golfers+`
    ogTitle = `${estadoLabel} — ${ronda.course_name}`
    description = nJugadores > 0
      ? `${nJugadores} jugador${nJugadores !== 1 ? 'es' : ''} en ${ronda.course_name}. Sigue la ronda en vivo.`
      : `Ronda en ${ronda.course_name} — Golfers+`
  }

  return {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      siteName: 'Golfers+',
      locale: 'es_CL',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: ogTitle,
      description,
    },
  }
}

export default function RondaLibreCodigoLayout({ children }: { children: React.ReactNode }) {
  return children
}
