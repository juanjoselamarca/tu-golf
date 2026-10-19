'use client'

import { FORMAT_META, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { KNOWN_FORMAT_KEYS } from '@/golf/formats'
import { LEYENDAS } from './leyendas-de-formato'
import { chip, colores, etiqueta, informativo, opcion, tarjeta } from './estilos'
import { ProBadge } from '@/components/billing/ProBadge'
import { planesUrl } from '@/lib/planes-url'

const FORMATOS = KNOWN_FORMAT_KEYS as ReadonlyArray<FormatoJuego>

/** PRO tag — prominente, visible bajo el sol con guante. */
function ProTag() {
  return <ProBadge tier="pro" variant="filled" />
}

/** Navega a /planes cuando se toca un feature bloqueado; su "Volver" trae de vuelta a armar la ronda. */
function navigateToPlanes() {
  window.location.href = planesUrl('/ronda-libre/nueva')
}

interface Props {
  formato: FormatoJuego
  onFormato: (f: FormatoJuego) => void
  /** Modo EFECTIVO (ya pasado por formato y plan): el que se muestra activo. */
  modo: ModoJuego
  onModo: (m: ModoJuego) => void
  /** El neto de este formato pide plan Pro (lo decide `modoPermitidoPorPlan`). */
  netoBloqueado: boolean
}

/**
 * Elige formato y modo de scoring.
 *
 * La lista sale de `KNOWN_FORMAT_KEYS` y los textos de `FORMAT_META`: antes eran
 * seis objetos escritos a mano, así que agregar un formato al motor no lo hacía
 * aparecer acá, y la descripción podía discrepar de la del resto de la app.
 *
 * Todos los formatos se juegan gross o neto. Gross es libre; el neto de Match
 * Play, Best Ball y Stableford es del plan Pro: sin plan, el botón Neto se ve
 * bloqueado y Gross queda activo (el hook nunca deja seleccionado un modo
 * bloqueado). El selector se ocultaría sólo si un formato admitiera un modo.
 */
export function SelectorFormato({ formato, onFormato, modo, onModo, netoBloqueado }: Props) {
  const meta = FORMAT_META[formato]
  const leyenda = LEYENDAS[formato]
  const modosPermitidos = meta?.modosPermitidos ?? ['gross', 'neto']

  return (
    <div style={tarjeta}>
      <label style={etiqueta}>Formato de juego</label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {FORMATOS.map(clave => {
          const info = FORMAT_META[clave]
          const activo = formato === clave
          return (
            <button
              key={clave}
              type="button"
              aria-pressed={activo}
              onClick={() => onFormato(clave)}
              style={{
                ...opcion(activo),
                cursor: 'pointer',
                position: 'relative' as const,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto }}>
                  {info.label}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: colores.texto2, marginTop: '2px' }}>
                {info.description}
              </div>
            </button>
          )
        })}
      </div>

      {modosPermitidos.length > 1 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ ...etiqueta, marginBottom: '10px' }}>Modo de scoring</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {([
              { valor: 'neto' as const, label: 'Neto', desc: 'Con handicap' },
              { valor: 'gross' as const, label: 'Gross', desc: 'Sin handicap' },
            ]).map(m => {
              const activo = modo === m.valor
              const netoLocked = m.valor === 'neto' && netoBloqueado
              return (
                <button
                  key={m.valor}
                  type="button"
                  aria-pressed={activo}
                  aria-disabled={netoLocked || undefined}
                  onClick={() => {
                    if (netoLocked) navigateToPlanes()
                    else onModo(m.valor)
                  }}
                  style={{
                    ...opcion(netoLocked ? false : activo),
                    flex: 1,
                    padding: '16px',
                    cursor: netoLocked ? 'not-allowed' : 'pointer',
                    borderStyle: netoLocked ? 'dashed' : undefined,
                    borderColor: netoLocked ? 'rgba(196,153,42,0.3)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: netoLocked ? colores.texto2 : (activo ? colores.oroTexto : colores.texto) }}>
                      {m.label}
                    </span>
                    {netoLocked && <ProTag />}
                  </div>
                  <div style={{ fontSize: '11px', color: colores.texto2 }}>
                    {netoLocked ? 'Requiere plan Pro' : m.desc}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {leyenda && (
        <div style={informativo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: colores.oroTexto, display: 'flex', flexShrink: 0 }} aria-hidden="true"><leyenda.icono size={18} strokeWidth={1.75} /></span>
            <span style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }}>
              {leyenda.explicacion(modo)}
            </span>
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px',
            paddingTop: '8px', borderTop: `1px solid rgba(196,153,42,0.15)`,
          }}>
            {leyenda.marcas.map(m => (
              <span key={m.label} style={chip}>
                <span style={{ color: colores.oroTexto, fontWeight: 700 }}>{m.sim}</span>{' '}{m.label}
              </span>
            ))}
          </div>
          <div style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }}>
            {leyenda.cierre(modo)}
          </div>
        </div>
      )}
    </div>
  )
}
