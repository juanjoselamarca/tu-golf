'use client'

import { FORMAT_META, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { KNOWN_FORMAT_KEYS } from '@/golf/formats'
import { LEYENDAS } from './leyendas-de-formato'
import { chip, colores, etiqueta, informativo, opcion, tarjeta } from './estilos'

const FORMATOS = KNOWN_FORMAT_KEYS as ReadonlyArray<FormatoJuego>

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
  const meta = FORMAT_META[formato]
  const leyenda = LEYENDAS[formato]
  const modosPermitidos = meta?.modosPermitidos ?? ['gross', 'neto']
  // El modo que se explica es el que realmente se va a jugar: si el formato
  // sólo admite uno, el estado `modo` puede decir otra cosa y la explicación
  // mentiría.
  const modoEfectivo: ModoJuego = modosPermitidos.includes(modo) ? modo : modosPermitidos[0]

  return (
    <div style={tarjeta}>
      <label style={etiqueta}>Formato de juego</label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {FORMATOS.map(clave => {
          const info = FORMAT_META[clave]
          const activo = formato === clave
          return (
            <button key={clave} type="button" onClick={() => onFormato(clave)} style={opcion(activo)}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto }}>
                {info.label}
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
              return (
                <button
                  key={m.valor}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onModo(m.valor)}
                  style={{ ...opcion(activo), flex: 1, padding: '16px' }}
                >
                  <div style={{ fontSize: '15px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto, marginBottom: '2px' }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: '11px', color: colores.texto2 }}>{m.desc}</div>
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
