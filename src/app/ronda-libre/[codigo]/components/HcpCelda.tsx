// El HCP que se pinta de un jugador (`HcpMostrado`, de `crearHcpAMostrar`), con su
// texto accesible: la columna del leaderboard y la tarjeta de match play lo pintan
// desde acá para que "—" y "S/Ind" se lean igual en las dos.
import { SIN_INDICE, type HcpMostrado } from '@/lib/data/ronda-libre-live-api'

export function HcpCelda({ hcp }: { hcp: HcpMostrado }) {
  if (hcp == null) {
    return <span title="Índice no visible" style={{ color: 'var(--text-3)', fontWeight: 400 }}><span aria-hidden="true">—</span><span className="sr-only">Índice no visible</span></span>
  }
  if (hcp === SIN_INDICE) {
    return <span title="Sin índice" style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: '11px' }}><span aria-hidden="true">{SIN_INDICE}</span><span className="sr-only">Sin índice</span></span>
  }
  return <>{hcp}</>
}
