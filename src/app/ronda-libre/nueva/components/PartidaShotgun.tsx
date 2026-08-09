'use client'

import { colores, tarjeta } from './estilos'

interface Props {
  activa: boolean
  onAlternar: () => void
  hoyo: number
  onHoyo: (h: number) => void
}

/** Hoyos elegibles para arrancar un shotgun: del 2 al 18 (el 1 es el default). */
const HOYOS = Array.from({ length: 17 }, (_, i) => i + 2)

/**
 * Partida shotgun: cada grupo arranca en un hoyo distinto.
 *
 * No se muestra en media ronda — el front/back ya define el arranque, y tener
 * los dos activos daba una ronda que empezaba fuera de la mitad elegida.
 */
export function PartidaShotgun({ activa, onAlternar, hoyo, onHoyo }: Props) {
  return (
    <div style={{ ...tarjeta, padding: '16px 20px', marginBottom: '24px' }}>
      <button
        type="button"
        role="switch"
        aria-checked={activa}
        onClick={onAlternar}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
          background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{
          width: '40px', height: '24px', borderRadius: '12px', flexShrink: 0,
          background: activa ? colores.oro : 'var(--border)',
          position: 'relative', transition: 'background 0.2s',
        }}>
          <span style={{
            width: '18px', height: '18px', borderRadius: '50%', background: colores.tarjeta,
            position: 'absolute', top: '3px', left: activa ? '19px' : '3px',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </span>
        <span>
          <span style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: colores.texto }}>
            Partida shotgun
          </span>
          <span style={{ display: 'block', fontSize: '11px', color: colores.texto2, lineHeight: 1.4 }}>
            Cada grupo empieza en un hoyo distinto. Útil cuando son muchos jugadores o tienes tiempo limitado.
          </span>
        </span>
      </button>

      {activa && (
        <div style={{ marginTop: '12px', padding: '0 4px' }}>
          <div style={{ fontSize: '12px', color: colores.texto2, marginBottom: '8px' }}>Hoyo de inicio:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {HOYOS.map(h => {
              const activo = hoyo === h
              return (
                <button
                  key={h}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onHoyo(h)}
                  style={{
                    width: '38px', height: '38px', borderRadius: '10px',
                    fontSize: '14px', fontWeight: activo ? 700 : 400,
                    background: activo ? colores.oro : colores.fondo,
                    color: activo ? colores.oroSobreTexto : colores.texto2,
                    border: `1px solid ${activo ? colores.oro : colores.borde}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {h}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
