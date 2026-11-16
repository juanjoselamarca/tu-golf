/**
 * Lo que ve el grupo de una Timba libre (formato `personalizado`) donde una ronda normal muestra la tabla.
 *
 * Las vistas genéricas (tabla individual, de equipos, texto para compartir) ordenan por golpes o por neto con
 * el hándicap de cada uno; en una Timba ese ranking no existe (gana el que suma puntos) y, como `/live` ya no
 * entrega el hándicap de los otros, el neto caería a hándicap 0: un número falso. Por eso, en una Timba, en vez
 * de la tabla va este aviso. Los puntos se leen solo de `GET /api/ronda-libre/[codigo]/juego` (spec, "Para el
 * PR C").
 */
import { NOMBRE_FORMATO_PERSONALIZADO } from '@/golf/formats/personalizado'

export const TEXTO_PUNTOS_DE_LA_TIMBA = 'Los puntos de la Timba se ven en la pestaña Juego.'

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
