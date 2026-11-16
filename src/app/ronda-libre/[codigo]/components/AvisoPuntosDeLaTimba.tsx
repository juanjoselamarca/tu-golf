/**
 * Lo que ve el grupo de una Timba libre (formato `personalizado`) donde una ronda normal muestra la tabla.
 *
 * Las vistas genéricas (tabla individual, de equipos, texto para compartir) ordenan por golpes o por neto con
 * el hándicap de cada uno; en una Timba ese ranking no existe (gana el que suma puntos) y, como `/live` ya no
 * entrega el hándicap de los otros, el neto caería a hándicap 0: un número falso. Por eso, en una Timba, en vez
 * de la tabla va este aviso. Los puntos se leen solo de `GET /api/ronda-libre/[codigo]/juego` (spec, "Para el
 * PR C").
 *
 * El texto tiene que ser cierto: mientras la pestaña Juego no exista (`TIMBA_LIBRE_ABIERTA = false`; una Timba
 * solo la puede haber creado un admin por la API), no la nombra. El PR C2 da vuelta el interruptor y el texto.
 */
import { NOMBRE_FORMATO_PERSONALIZADO } from '@/golf/formats/personalizado'
import { TIMBA_LIBRE_ABIERTA } from '@/lib/auth/timba-libre-abierta'

export const TEXTO_PUNTOS_DE_LA_TIMBA_CON_PESTANA = 'Los puntos de la Timba se ven en la pestaña Juego.'
export const TEXTO_PUNTOS_DE_LA_TIMBA_SIN_PESTANA =
  'La Timba no tiene tabla por golpes: gana quien suma puntos. La app todavía no muestra esos puntos; los golpes de cada uno quedan guardados.'

/** Lo que dice el aviso hoy, según el interruptor de la Timba libre. */
export const TEXTO_PUNTOS_DE_LA_TIMBA = TIMBA_LIBRE_ABIERTA
  ? TEXTO_PUNTOS_DE_LA_TIMBA_CON_PESTANA
  : TEXTO_PUNTOS_DE_LA_TIMBA_SIN_PESTANA

export function AvisoPuntosDeLaTimba() {
  return (
    <section
      aria-label={NOMBRE_FORMATO_PERSONALIZADO}
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px',
        padding: '16px', marginBottom: '16px',
      }}
    >
      <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
        {NOMBRE_FORMATO_PERSONALIZADO}
      </div>
      <p style={{ margin: '4px 0 0', fontSize: '14px', lineHeight: 1.45, color: 'var(--text-2)' }}>
        {TEXTO_PUNTOS_DE_LA_TIMBA}
      </p>
    </section>
  )
}
