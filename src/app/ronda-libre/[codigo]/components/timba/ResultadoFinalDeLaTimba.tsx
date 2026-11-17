'use client'

import type { ResultadoDeLaTimba } from '@/golf/ronda-libre/resultado-de-la-timba'

// DESIGN.md §4/§13 (16-nov): una familia (DM Sans), números con `.num`, escala 28/24/18/16/14/13, etiquetas en
// oración, números en `--text`, oro solo para la acción principal.
const SECCION = { margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text)' } as const
const GRUPO = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '0 16px' } as const
/** Nombres de jugadores y parejas: un nombre largo parte la línea, nunca empuja el marcador fuera de la pantalla. */
const NOMBRE = { overflowWrap: 'anywhere', minWidth: 0 } as const

/**
 * Resultado final de una Timba libre (maqueta Final aprobada por Juanjo, llevada a DESIGN.md §4/§13): ganador y por
 * cuánto, ranking de puntos, parejas por tramo y puntos especiales. Armado por `armarResultadoDeLaTimba` (lee solo
 * `GET /juego`).
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
    <section aria-label="Resultado final" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-2)' }}>{encabezado}</span>
        <h2 style={{ ...NOMBRE, margin: 0, fontSize: '28px', fontWeight: 600, lineHeight: 1.2, color: 'var(--text)' }}>{titular}</h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-2)' }}>{bajada}</p>
      </header>

      <ol aria-label="Puntos" style={{ ...GRUPO, listStyle: 'none', margin: 0, display: 'flex', flexDirection: 'column' }}>
        {ranking.map((r, i) => (
          <li
            key={r.jugadorId}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '8px 0', borderBottom: i < ranking.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <span
              aria-label={`Puesto ${r.puesto}`}
              className="num"
              style={{
                width: '32px', height: '32px', borderRadius: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: r.puesto === 1 ? 600 : 400, background: 'var(--surface-soft)', color: 'var(--text)',
              }}
            >
              {r.puesto}
            </span>
            <span style={{ ...NOMBRE, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '16px', fontWeight: r.puesto === 1 ? 600 : 400, color: 'var(--text)' }}>{r.nombre}</span>
              {r.retiradoDesde != null && (
                <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>Se retiró en el hoyo {r.retiradoDesde}</span>
              )}
            </span>
            <span className="num" style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text)' }}>{r.texto}</span>
          </li>
        ))}
      </ol>

      {tramos && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={SECCION}>Parejas</h3>
          <div style={{ ...GRUPO, display: 'flex', flexDirection: 'column' }}>
            {tramos.map((t, i) => (
              <div
                key={i}
                aria-label={`${t.parejas[0]} ${t.puntos[0]}, ${t.parejas[1]} ${t.puntos[1]}${t.ganadora == null ? ', empate' : `, ganó ${t.parejas[t.ganadora]}`}`}
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: '12px',
                  minHeight: '56px', padding: '8px 0', borderBottom: i < tramos.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span aria-hidden style={estiloPareja(t.ganadora === 0)}>{t.parejas[0]}</span>
                <span aria-hidden className="num" style={{ fontSize: '16px', fontWeight: 600, textAlign: 'center', color: 'var(--text)', whiteSpace: 'nowrap' }}>{t.marcador}</span>
                <span aria-hidden style={{ ...estiloPareja(t.ganadora === 1), textAlign: 'right' }}>{t.parejas[1]}</span>
              </div>
            ))}
          </div>
          {notaTramos && <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-2)' }}>{notaTramos}</p>}
        </div>
      )}

      {puntosEspeciales && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={SECCION}>Puntos especiales</h3>
          {puntosEspeciales.length === 0 ? (
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-2)' }}>Nadie hizo puntos especiales.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {puntosEspeciales.map(p => (
                <li
                  key={`${p.puntitoId}-${p.jugadorId}`}
                  className="num"
                  style={{ ...NOMBRE, fontSize: '14px', color: 'var(--text)', border: '1px solid var(--border-md)', borderRadius: '8px', padding: '4px 12px' }}
                >
                  {p.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={onHoyoAHoyo}
          style={{ minHeight: '52px', padding: '0 16px', borderRadius: '12px', border: '1px solid var(--border-md)', background: 'var(--bg-surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '16px', fontWeight: 600, cursor: 'pointer' }}
        >
          Hoyo a hoyo
        </button>
        <button
          type="button"
          onClick={onCompartir}
          disabled={compartiendo}
          style={{ flex: 1, minHeight: '52px', border: 0, borderRadius: '12px', fontFamily: 'inherit', fontSize: '16px', fontWeight: 600, cursor: 'pointer', opacity: compartiendo ? 0.7 : 1,
            ...(compartirPrincipal
              ? { background: 'var(--brand)', color: 'var(--brand-dark)' }
              : { background: 'var(--bg-surface)', color: 'var(--brand-on-bg)', border: '1px solid var(--brand-on-bg)' }) }}
        >
          Compartir al grupo
        </button>
      </div>
      {aviso && <p role="status" style={{ margin: '-16px 0 0', fontSize: '13px', color: 'var(--text-2)', textAlign: 'right' }}>{aviso}</p>}
    </section>
  )
}

/** Nombres de pareja a 16 px (dato de cancha); la ganadora del tramo en negrita, la otra en `--text` igual (legible al sol). */
function estiloPareja(gano: boolean) {
  return { ...NOMBRE, fontSize: '16px', fontWeight: gano ? 700 : 400, color: 'var(--text)' } as const
}
