import type { ReactNode } from 'react'
import { NOMBRE_FORMATO_PERSONALIZADO } from '@/golf/formats/personalizado'
import { unirNombres } from '@/golf/ronda-libre/juego-en-vivo'
import type { FilaRankingDelJuego, TablaDelJuego } from '@/golf/ronda-libre/tabla-del-juego'
import { DueloDelTramo, TramosDeLaTimba } from './ParejasDeLaTimba'
import { HoyoAHoyoDeLaTimba } from './HoyoAHoyoDeLaTimba'
import { HcpCelda } from '../HcpCelda'
import type { HcpAMostrar } from '@/lib/data/ronda-libre-live-api'

export { MARCA_GOLPE_RECIBIDO } from './HoyoAHoyoDeLaTimba'

/** Neto con jugadores sin hándicap usable (`resultado.sinHandicap`): el juego va como gross. */
export function avisoNetoComoGross(nombres: readonly string[]): string {
  return `Falta el hándicap de ${unirNombres(nombres)}: mientras tanto el juego va sin golpes recibidos, como gross.`
}

const titulo2 = { margin: '0 0 8px', fontSize: '18px', fontWeight: 600, color: 'var(--text)' } as const

/**
 * Antes de partir: en neto, el HCP de cada uno (el de 18 hoyos, regla de Juanjo del 12-nov: el mismo número del
 * marcador; nunca "recibe N golpes"); en gross, sus 0 puntos.
 */
function ValorAntesDePartir({ fila, tabla, hcpAMostrar }: { fila: FilaRankingDelJuego; tabla: TablaDelJuego; hcpAMostrar?: HcpAMostrar }) {
  if (!tabla.muestraGolpesRecibidos || !hcpAMostrar) return <>{fila.textoConUnidad}</>
  return <>HCP <HcpCelda hcp={hcpAMostrar(fila.jugadorId)} enLinea /></>
}

function Ranking({ tabla, hcpAMostrar }: { tabla: TablaDelJuego; hcpAMostrar?: HcpAMostrar }) {
  const empezo = tabla.frase.empezo
  return (
    <ol aria-label="Puntos de cada uno" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {tabla.ranking.map((r, i) => {
        const retirado = r.retiradoDesde != null
        return (
          <li
            key={r.jugadorId}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '52px', padding: '6px 0', borderBottom: i < tabla.ranking.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            {empezo && <span className="num" style={{ width: '18px', flex: '0 0 auto', fontSize: '14px', color: 'var(--text-2)' }}>{r.puesto}</span>}
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, overflowWrap: 'anywhere', color: retirado ? 'var(--text-2)' : 'var(--text)' }}>{r.nombre}</span>
              {retirado && <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>Se retiró en el hoyo {r.retiradoDesde}</span>}
            </span>
            {empezo ? (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: '0 0 auto' }}>
                <span className="num" style={{ fontSize: '18px', fontWeight: 600, color: retirado ? 'var(--text-2)' : 'var(--text)', whiteSpace: 'nowrap' }}>{r.textoConUnidad}</span>
                {r.diferencia && <span className="num" style={{ fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{r.diferencia}</span>}
              </span>
            ) : (
              <span className="num" style={{ flex: '0 0 auto', fontSize: '16px', color: 'var(--text)', whiteSpace: 'nowrap' }}><ValorAntesDePartir fila={r} tabla={tabla} hcpAMostrar={hcpAMostrar} /></span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Pestaña Juego de una Timba libre (rediseño C+, aprobado por Juanjo el 18-nov), de arriba hacia abajo: quién va
 * ganando, el duelo de parejas en juego, los puntos de cada uno, todos los tramos de parejas y el hoyo a hoyo
 * plegable. Los juegos sin parejas muestran solo frase, puntos y hoyo a hoyo. Todo viene armado de
 * `armarTablaDelJuego` (que lee solo `GET /juego`). Sin sesión se ve igual.
 */
export function JuegoDeLaTimba({ tabla, desactualizado, pie, encabezadoFijoEn, hoyoAHoyoAbierto, hcpAMostrar }: {
  tabla: TablaDelJuego
  desactualizado?: boolean
  pie?: ReactNode
  /** `HoyoAHoyoDeLaTimba.encabezadoFijoEn` (en el scorer, el panel con 16px de padding: '-16px'). */
  encabezadoFijoEn?: string
  /** El hoyo a hoyo parte abierto (se llegó desde "Hoyo a hoyo" del resultado final). */
  hoyoAHoyoAbierto?: boolean
  /** HCP a mostrar de cada jugador (`crearHcpAMostrar`, la fuente de la vista en vivo y el scorer). */
  hcpAMostrar?: HcpAMostrar
}) {
  const { frase } = tabla
  const destacado = tabla.tramoDestacado >= 0 ? tabla.tramos[tabla.tramoDestacado] : null
  // Con un solo tramo (parejas fijas) el duelo ya es todo: el bloque "Parejas" lo repetiría.
  const conBloqueDeParejas = tabla.tramos.length > 1
  const nombreDelJuego = tabla.titulo === NOMBRE_FORMATO_PERSONALIZADO ? null : tabla.titulo
  const aviso = tabla.sinHandicap.length > 0 ? avisoNetoComoGross(tabla.sinHandicap) : null
  return (
    <section aria-label={`Puntos de ${tabla.titulo}`} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, lineHeight: 1.15, textWrap: 'balance', color: frase.empezo ? 'var(--brand-on-bg)' : 'var(--text)' }}>
            {frase.texto}
          </h2>
          <p className="num" style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--text-2)' }}>
            {nombreDelJuego ? `${nombreDelJuego} · ` : ''}{frase.detalle}
          </p>
        </div>

        {desactualizado && (
          <p role="status" style={{ margin: 0, fontSize: '13px', color: 'var(--text-2)' }}>
            Sin señal: son los puntos de hace un momento.
          </p>
        )}

        {aviso && (
          <p role="note" style={{ margin: 0, padding: '12px', borderRadius: '12px', background: 'var(--status-open-bg)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.45 }}>
            {aviso}
          </p>
        )}

        {destacado && <DueloDelTramo tramo={destacado} primerDuelo={!frase.empezo && tabla.tramoDestacado === 0} />}
      </div>

      <section aria-label="Puntos de cada uno">
        <h3 style={titulo2}>Puntos de cada uno</h3>
        <Ranking tabla={tabla} hcpAMostrar={hcpAMostrar} />
      </section>

      {conBloqueDeParejas && (
        <section aria-label="Parejas">
          <h3 style={titulo2}>Parejas</h3>
          <TramosDeLaTimba tramos={tabla.tramos} />
        </section>
      )}

      {tabla.filas.length > 0 && (
        <HoyoAHoyoDeLaTimba tabla={tabla} abiertoAlInicio={hoyoAHoyoAbierto} encabezadoFijoEn={encabezadoFijoEn} />
      )}

      {pie}
    </section>
  )
}
