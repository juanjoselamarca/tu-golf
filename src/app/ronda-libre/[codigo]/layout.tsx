import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'

interface JugadorRow {
  nombre: string
  scores: Record<string, number> | null
}

interface RondaRow {
  course_name: string
  estado: string
  holes: number
  ronda_libre_jugadores: JugadorRow[]
}

function calcVsPar(scores: Record<string, number> | null, holes: number): number {
  if (!scores) return 0
  let total = 0
  for (let h = 1; h <= holes; h++) {
    if (scores[String(h)] != null) total += scores[String(h)]
  }
  return total
}

function countHolesPlayed(scores: Record<string, number> | null, holes: number): number {
  if (!scores) return 0
  let count = 0
  for (let h = 1; h <= holes; h++) {
    if (scores[String(h)] != null) count++
  }
  return count
}

export async function generateMetadata({ params }: { params: { codigo: string } }): Promise<Metadata> {
  const supabase = await createClient()
  const { data: ronda } = await supabase
    .from('rondas_libres')
    .select('course_name, estado, holes, ronda_libre_jugadores(nombre, scores)')
    .eq('codigo', params.codigo)
    .single<RondaRow>()

  if (!ronda) {
    return {
      title: 'Ronda en vivo — Golfers+',
      description: 'Sigue una ronda de golf en tiempo real en Golfers+.',
    }
  }

  const jugadores = ronda.ronda_libre_jugadores || []
  const nJugadores = jugadores.length

  // Find leader by most strokes with most holes played
  let leaderName = ''
  let leaderScore = ''

  if (nJugadores > 0) {
    const sorted = [...jugadores]
      .map(j => ({
        nombre: j.nombre,
        hp: countHolesPlayed(j.scores, ronda.holes),
        total: calcVsPar(j.scores, ronda.holes),
      }))
      .filter(j => j.hp > 0)
      .sort((a, b) => a.total - b.total || b.hp - a.hp)

    if (sorted.length > 0) {
      leaderName = sorted[0].nombre
      const vs = sorted[0].total
      leaderScore = vs === 0 ? 'E' : vs > 0 ? `+${vs}` : `${vs}`
    }
  }

  const estadoLabel = ronda.estado === 'finalizada' ? 'Finalizada' : 'En vivo'

  const title = leaderName
    ? `${leaderName} va ${leaderScore} en ${ronda.course_name} — Golfers+`
    : `${estadoLabel} — ${ronda.course_name} — Golfers+`

  const description = nJugadores > 0
    ? `Sigue la ronda en vivo. ${nJugadores} jugador${nJugadores !== 1 ? 'es' : ''} en ${ronda.course_name}.`
    : `Ronda en ${ronda.course_name} — Golfers+`

  return {
    title,
    description,
    openGraph: {
      title: `Ronda en vivo — ${ronda.course_name}`,
      description: `${nJugadores} jugador${nJugadores !== 1 ? 'es' : ''} compitiendo en tiempo real`,
      siteName: 'Golfers+',
      locale: 'es_CL',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `Ronda en vivo — ${ronda.course_name}`,
      description,
    },
  }
}

export default function RondaLibreCodigoLayout({ children }: { children: React.ReactNode }) {
  return children
}
