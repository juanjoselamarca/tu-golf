import { NextResponse } from 'next/server'
import { getProjectedCut } from '@/lib/pga/projectedCut'
import { parseScoreboard } from '@/lib/pga/scoreboard'

/**
 * Handler delgado (regla "el que toca, ordena"): solo I/O. Trae el scoreboard de
 * ESPN, delega el mapeo a `parseScoreboard` (puro, testeado en scoreboard.test.ts)
 * y, solo si está en vivo, pide el corte proyectado oficial del PGA Tour.
 */
export async function GET() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { next: { revalidate: 30 } }
    )
    const data = await res.json()
    const today = new Date().toISOString().split('T')[0]

    const { dto, needsCut, eventName } = parseScoreboard(data, today)

    // Corte proyectado OFICIAL del PGA Tour (solo en vivo). Si la API del PGA falla
    // o el evento no tiene corte → null y el widget no muestra la línea.
    const projectedCut = needsCut
      ? await getProjectedCut(eventName, today.slice(0, 4))
      : null

    return NextResponse.json({ ...dto, projectedCut })
  } catch {
    return NextResponse.json({ active: false, players: [] })
  }
}
