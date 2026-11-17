'use client'

import type { ResultadoDeLaTimba } from '@/golf/ronda-libre/resultado-de-la-timba'

const MONO = 'var(--font-dm-mono), "DM Mono", monospace'
const ETIQUETA = { fontSize: '12px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-2)' } as const
const TARJETA = { background: 'var(--bg-surface)', border: '1px solid var(--border)' } as const

/**
 * Resultado final de una Timba libre (maqueta Final aprobada por Juanjo): ganador y por cuánto, ranking de puntos,
 * parejas por tramo y puntos especiales. Armado por `armarResultadoDeLaTimba` (lee solo `GET /juego`).
 */
export function ResultadoFinalDeLaTimba({ resultado, onHoyoAHoyo, onCompartir, compartiendo, compartirPrincipal = true, aviso }: {
  resultado: ResultadoDeLaTimba
  onHoyoAHoyo: () => void
  onCompartir: () => void
  compartiendo?: boolean
  /** `false`: el botón va con borde (otra acción de la vista es la dorada). */
  compartirPrincipal?: boolean
  /** "Resultado copiado": el compartir terminó en el portapapeles. */
  aviso?: string | null
}) {
  const { encabezado, titular, bajada, ranking, tramos, notaTramos, puntosEspeciales } = resultado
  return (
    <section aria-label="Resultado final" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={ETIQUETA}>{encabezado}</span>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-playfair), "Playfair Display", serif', fontSize: '30px', fontWeight: 700, lineHeight: 1.15, color: 'var(--text)' }}>
          {titular}
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-2)' }}>{bajada}</p>
      </header>

      <ol aria-label="Puntos" style={{ ...TARJETA, listStyle: 'none', margin: 0, display: 'flex', flexDirection: 'column', borderRadius: '14px', padding: '4px 14px' }}>
        {ranking.map((r, i) => (
          <li
            key={r.jugadorId}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', borderBottom: i < ranking.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <span
              aria-label={`Puesto ${r.puesto}`}
              style={{
                width: '32px', height: '32px', borderRadius: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: '14px',
                ...(r.puesto === 1
                  ? { background: 'var(--brand)', color: 'var(--brand-dark)', fontWeight: 600 }
                  : { background: 'var(--surface-soft)', color: 'var(--text)' }),
              }}
            >
              {r.puesto}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text)' }}>{r.nombre}</span>
              {r.retiradoDesde != null && (
                <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>Se retiró en el hoyo {r.retiradoDesde}</span>
              )}
            </span>
            <span style={{ fontFamily: MONO, fontSize: '22px', fontWeight: 500, color: 'var(--text)' }}>{r.texto}</span>
          </li>
        ))}
      </ol>

      {tramos && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ ...ETIQUETA, margin: 0 }}>Parejas</h3>
          {tramos.map((t, i) => (
            <div
              key={i}
              aria-label={`${t.parejas[0]} ${t.puntos[0]}, ${t.parejas[1]} ${t.puntos[1]}${t.ganadora == null ? ', empate' : `, ganó ${t.parejas[t.ganadora]}`}`}
              style={{ ...TARJETA, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: '8px', borderRadius: '12px', padding: '12px 14px' }}
            >
              <span aria-hidden style={estiloPareja(t.ganadora === 0)}>{t.parejas[0]}</span>
              <span aria-hidden style={{ fontFamily: MONO, fontSize: '16px', textAlign: 'center', color: 'var(--text)', whiteSpace: 'nowrap' }}>{t.marcador}</span>
              <span aria-hidden style={{ ...estiloPareja(t.ganadora === 1), textAlign: 'right' }}>{t.parejas[1]}</span>
            </div>
          ))}
          {notaTramos && <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-2)' }}>{notaTramos}</p>}
        </div>
      )}

      {puntosEspeciales && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ ...ETIQUETA, margin: 0 }}>Puntos especiales</h3>
          {puntosEspeciales.length === 0 ? (
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-2)' }}>Nadie hizo puntos especiales.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {puntosEspeciales.map(p => (
                <li key={`${p.puntitoId}-${p.jugadorId}`} style={{ fontSize: '13px', color: 'var(--text)', border: '1px solid var(--border-md)', borderRadius: '14px', padding: '5px 10px' }}>
                  {p.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={onHoyoAHoyo}
          style={{ minHeight: '52px', padding: '0 16px', borderRadius: '12px', border: '1px solid var(--border-md)', background: 'var(--bg-surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}
        >
          Hoyo a hoyo
        </button>
        <button
          type="button"
          onClick={onCompartir}
          disabled={compartiendo}
          style={{ flex: 1, minHeight: '52px', border: 0, borderRadius: '12px', fontFamily: 'inherit', fontSize: '16px', fontWeight: 700, cursor: 'pointer', opacity: compartiendo ? 0.7 : 1,
            ...(compartirPrincipal
              ? { background: 'var(--brand)', color: 'var(--brand-dark)' }
              : { background: 'var(--bg-surface)', color: 'var(--brand-on-bg)', border: '1px solid var(--brand-on-bg)' }) }}
        >
          Compartir al grupo
        </button>
      </div>
      {aviso && <p role="status" style={{ margin: '-8px 0 0', fontSize: '13px', color: 'var(--text-2)', textAlign: 'right' }}>{aviso}</p>}
    </section>
  )
}

function estiloPareja(gano: boolean) {
  return { fontSize: '14px', fontWeight: gano ? 700 : 400, color: gano ? 'var(--text)' : 'var(--text-2)' } as const
}
