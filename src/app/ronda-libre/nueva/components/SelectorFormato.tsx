'use client'

import { FORMAT_META, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { KNOWN_FORMAT_KEYS } from '@/golf/formats'
import { useEntitlement } from '@/hooks/useEntitlement'
import { NETO_FEATURE_BY_FORMAT } from '@/golf/billing/plans'
import { LEYENDAS } from './leyendas-de-formato'
import { chip, colores, etiqueta, informativo, opcion, tarjeta } from './estilos'
import { ProBadge } from '@/components/billing/ProBadge'

const FORMATOS = KNOWN_FORMAT_KEYS as ReadonlyArray<FormatoJuego>

/** Formatos cuya seleccion requiere plan PRO (quality gate, no monetización). */
const GATED_FORMATS: Partial<Record<FormatoJuego, true>> = {
  // foursome bruto funciona bien → free.
  // Solo los modos neto de match_play y best_ball están gateados (isNetoGated).
}

/** Combos formato+modo que requieren plan PRO (quality gate: neto depende de stroke index). */
function isNetoGated(formato: FormatoJuego): boolean {
  return formato in NETO_FEATURE_BY_FORMAT
}

/** PRO tag — prominente, visible bajo el sol con guante. */
function ProTag() {
  return <ProBadge tier="pro" variant="filled" />
}

/** Navega a /planes cuando se toca un feature bloqueado. */
function navigateToPlanes() {
  window.location.href = '/planes'
}

interface Props {
  formato: FormatoJuego
  onFormato: (f: FormatoJuego) => void
  modo: ModoJuego
  onModo: (m: ModoJuego) => void
}

/**
 * Elige formato y modo de scoring.
 *
 * La lista sale de `KNOWN_FORMAT_KEYS` y los textos de `FORMAT_META`: antes eran
 * seis objetos escritos a mano, así que agregar un formato al motor no lo hacía
 * aparecer acá, y la descripción podía discrepar de la del resto de la app.
 *
 * El selector gross/neto se oculta cuando el formato admite un solo modo — hoy
 * Match Play, que en Chile se juega siempre neto.
 */
export function SelectorFormato({ formato, onFormato, modo, onModo }: Props) {
  const { allowed: netoMatchAllowed } = useEntitlement('match-play-neto')
  const { allowed: netoBestBallAllowed } = useEntitlement('best-ball-neto')
  const { allowed: netoStablefordAllowed } = useEntitlement('stableford-neto')

  const meta = FORMAT_META[formato]
  const leyenda = LEYENDAS[formato]
  const modosPermitidos = meta?.modosPermitidos ?? ['gross', 'neto']
  const modoEfectivo: ModoJuego = modosPermitidos.includes(modo) ? modo : modosPermitidos[0]

  return (
    <div style={tarjeta}>
      <label style={etiqueta}>Formato de juego</label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {FORMATOS.map(clave => {
          const info = FORMAT_META[clave]
          const activo = formato === clave
          const locked = !!GATED_FORMATS[clave]
          return (
            <button
              key={clave}
              type="button"
              aria-disabled={locked || undefined}
              onClick={() => {
                if (locked) navigateToPlanes()
                else onFormato(clave)
              }}
              style={{
                ...opcion(locked ? false : activo),
                cursor: locked ? 'not-allowed' : 'pointer',
                position: 'relative' as const,
                borderStyle: locked ? 'dashed' : undefined,
                borderColor: locked ? 'rgba(196,153,42,0.3)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: locked ? colores.texto2 : (activo ? colores.oroTexto : colores.texto) }}>
                  {info.label}
                </span>
                {locked && <ProTag />}
              </div>
              <div style={{ fontSize: '12px', color: colores.texto2, marginTop: '2px' }}>
                {locked ? 'Requiere plan Pro' : info.description}
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
              const netoLocked = m.valor === 'neto' && isNetoGated(formato) && (
                (formato === 'match_play' && !netoMatchAllowed) ||
                (formato === 'best_ball' && !netoBestBallAllowed) ||
                (formato === 'stableford' && !netoStablefordAllowed)
              )
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
            <span style={{ fontSize: '16px' }} aria-hidden="true">{leyenda.icono}</span>
            <span style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }}>
              {leyenda.explicacion(modoEfectivo)}
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
          <div style={{ fontSize: '10px', color: colores.texto2, opacity: 0.75, lineHeight: 1.3 }}>
            {leyenda.cierre(modoEfectivo)}
          </div>
        </div>
      )}
    </div>
  )
}
