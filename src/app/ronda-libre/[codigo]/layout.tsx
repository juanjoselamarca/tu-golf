import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { loadRondaMetadata } from '@/lib/data/ronda-metadata'
import { getVsPar, getHolesPlayed } from '@/lib/ronda/helpers'
import { TEAM_FORMAT_KEYS } from '@/golf/formats'

function calcGross(scores: Record<string, number> | null, holes: number): number {
  if (!scores) return 0
  let total = 0
  for (let h = 1; h <= holes; h++) {
    if (scores[String(h)] != null) total += scores[String(h)]
  }
  return total
}

function formatVsPar(vs: number): string {
  if (vs === 0) return 'E'
  return vs > 0 ? `+${vs}` : `${vs}`
}

export async function generateMetadata({ params }: { params: { codigo: string } }): Promise<Metadata> {
  const supabase = await createClient()
  const bundle = await loadRondaMetadata(params.codigo, supabase)

  if (!bundle) {
    return {
      title: 'Ronda en vivo — Golfers+',
      description: 'Sigue una ronda de golf en tiempo real en Golfers+.',
    }
  }

  const { ronda, parMap, teamCount } = bundle
  const jugadores = ronda.ronda_libre_jugadores
  const nJugadores = jugadores.length
  const isTeamFormat = TEAM_FORMAT_KEYS.includes(ronda.formato_juego)
  const hasCourse = Object.keys(parMap).length > 0

  let leaderName = ''
  let leaderScore = ''
  let teamContext = ''

  if (isTeamFormat) {
    const formatLabel = ronda.formato_juego === 'best_ball' ? 'Best Ball'
      : ronda.formato_juego === 'scramble' ? 'Scramble' : 'Foursome'
    teamContext = teamCount > 0 ? `${teamCount} equipos en ${formatLabel}` : formatLabel
  } else if (nJugadores > 0) {
    // Individual: líder por vs-par (gross si no hay cancha linkeada).
    const sorted = [...jugadores]
      .map(j => ({
        nombre: j.nombre,
        hp: getHolesPlayed(j.scores ?? {}, ronda.holes),
        vsPar: hasCourse
          ? getVsPar(j.scores ?? {}, ronda.holes, parMap)
          : calcGross(j.scores, ronda.holes),
      }))
      .filter(j => j.hp > 0)
      .sort((a, b) => a.vsPar - b.vsPar || b.hp - a.hp)

    if (sorted.length > 0) {
      leaderName = sorted[0].nombre
      leaderScore = hasCourse ? formatVsPar(sorted[0].vsPar) : String(sorted[0].vsPar)
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
