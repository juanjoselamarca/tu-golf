// El HCP que se pinta de un jugador (`HcpMostrado`, de `crearHcpAMostrar`), con su
// texto accesible: la columna del leaderboard y la tarjeta de match play lo pintan
// desde acá para que "—" y "S/Ind" se lean igual en las dos.
import { SIN_INDICE, type HcpMostrado } from '@/lib/data/ronda-libre-live-api'
import { formatearHandicap } from '@/golf/handicap-index-range'

/**
 * `enLinea`: "—" y "S/Ind" heredan tamaño y color del texto que los rodea, en vez de su estilo de celda
 * (11px, --text-3). Para cuando el HCP va dentro de una línea con su propio estilo (el header del scorer).
 */
export function HcpCelda({ hcp, enLinea = false }: { hcp: HcpMostrado; enLinea?: boolean }) {
  if (hcp == null) {
    return <span title="Índice no visible" style={enLinea ? undefined : { color: 'var(--text-3)', fontWeight: 400 }}><span aria-hidden="true">—</span><span className="sr-only">Índice no visible</span></span>
  }
  if (hcp === SIN_INDICE) {
    return <span title="Sin índice" style={enLinea ? undefined : { color: 'var(--text-3)', fontWeight: 400, fontSize: '11px' }}><span aria-hidden="true">{SIN_INDICE}</span><span className="sr-only">Sin índice</span></span>
  }
  return <>{formatearHandicap(hcp)}</>
}
