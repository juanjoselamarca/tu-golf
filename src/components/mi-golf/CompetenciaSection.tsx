// Sección server (async) del tab Competencia. Hace su propio fetch vía la capa
// de datos y arma los props de CompetenciaTab (client). Vive dentro de un
// <Suspense> en page.tsx, así que streamea independiente del tab Identidad.
import { createClient } from '@/utils/supabase/server'
import { CompetenciaTab } from './CompetenciaTab'
import { loadCompetenciaData, loadUltimaRondaDetalle } from '@/lib/data/dashboard'
import {
  buildFinishedRondas,
  injectUltimaRondaDetalle,
  enrichPlaying,
  findTorneoInminente,
  enrichOrganizing,
  buildFinalizados,
} from '@/lib/mi-golf/dashboard-derive'
import { getUltimaRondaReciente } from '@/lib/mi-golf/ultima-ronda'
import type { ComunidadMensaje } from '@/lib/mi-golf/types'

export async function CompetenciaSection({ userId, userName }: { userId: string; userName: string }) {
  const supabase = await createClient()
  const data = await loadCompetenciaData(supabase, userId)

  const fechaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const now = Date.now()

  const activeRonda = data.rondasLibres.find((r) => r.estado === 'en_curso') ?? null
  const finishedRondasRaw = data.rondasLibres.filter((r) => r.estado !== 'en_curso')
  let finishedRondas = buildFinishedRondas(finishedRondasRaw, data.historico)

  // Detalle hoyo-por-hoyo solo de la última ronda del día (UltimaRondaHero).
  // Se resuelve por el `id` de la fila histórica EXACTA que matcheó la lista
  // (mismo find que buildFinishedRondas), no por course+fecha — determinista
  // aunque existan rondas duplicadas mismo curso/día.
  const ultima = getUltimaRondaReciente(finishedRondas, fechaHoy)
  if (ultima && ultima.fecha) {
    const histMatch = data.historico.find(
      (h) => h.course_name === ultima.course_name && h.played_at === ultima.fecha,
    )
    if (histMatch) {
      const detalle = await loadUltimaRondaDetalle(supabase, histMatch.id)
      finishedRondas = injectUltimaRondaDetalle(finishedRondas, ultima.id, detalle)
    }
  }

  const enriquecidosPlaying = enrichPlaying(data.activeTournaments, now)
  const torneoInminente = findTorneoInminente(enriquecidosPlaying, now)
  const enriquecidosOrganizing = enrichOrganizing(data.organizedTournaments)
  const finalizadosRecientes = buildFinalizados(data.playedTournaments, data.organizedTournaments)

  const hcpDisplay = data.indiceGolfers != null ? data.indiceGolfers.toFixed(1) : null
  const comunidad: ComunidadMensaje = null
  const activeRondaSummary = activeRonda
    ? { hoyoActual: 1, totalHoyos: 18, scoreParcial: null as number | null }
    : null

  return (
    <CompetenciaTab
      userName={userName}
      hcpDisplay={hcpDisplay}
      activeRonda={activeRonda}
      activeRondaSummary={activeRondaSummary}
      torneoInminente={torneoInminente}
      playingInTournaments={enriquecidosPlaying}
      organizingTournaments={enriquecidosOrganizing}
      recentFinishedTournaments={finalizadosRecientes}
      finishedRondas={finishedRondas}
      historico={data.historico}
      comunidad={comunidad}
      fechaHoy={fechaHoy}
    />
  )
}
