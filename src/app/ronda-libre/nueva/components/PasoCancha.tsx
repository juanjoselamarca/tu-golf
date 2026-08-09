'use client'

import CourseSelector from '@/components/CourseSelector'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import type { MitadDeCancha } from '@/golf/ronda-libre/forma-de-la-ronda'
import type { EstadoDeCancha } from '../hooks/useSetupDeCancha'
import { colores, etiqueta, input, primario, secundario, tarjeta } from './estilos'
import { PartidaShotgun } from './PartidaShotgun'
import { SelectorFormato } from './SelectorFormato'
import { SelectorHoyos } from './SelectorHoyos'
import { SelectorRecorridos } from './SelectorRecorridos'
import { SelectorTees } from './SelectorTees'

interface Props {
  cancha: string
  onElegirCancha: (c: { id: string | null; nombre: string }) => void
  onLimpiarCancha: () => void
  setup: EstadoDeCancha
  esMultiRecorrido: boolean
  hoyos: 9 | 18
  onHoyos: (n: 9 | 18) => void
  mitad: MitadDeCancha
  onMitad: (m: MitadDeCancha) => void
  formato: FormatoJuego
  onFormato: (f: FormatoJuego) => void
  modo: ModoJuego
  onModo: (m: ModoJuego) => void
  tees: string
  onTees: (t: string) => void
  fecha: string
  onFecha: (f: string) => void
  shotgun: boolean
  onAlternarShotgun: () => void
  hoyoShotgun: number
  onHoyoShotgun: (h: number) => void
  onAtras: () => void
  onSiguiente: () => void
}

/** Ventana de fechas: una ronda se carga hasta una semana después de jugada. */
function rangoDeFechas(): { min: string; max: string } {
  const desde = new Date()
  desde.setDate(desde.getDate() - 7)
  const hasta = new Date()
  hasta.setDate(hasta.getDate() + 1)
  return { min: desde.toISOString().split('T')[0], max: hasta.toISOString().split('T')[0] }
}

/** Paso 2: dónde, cuántos hoyos, con qué formato y desde qué tee. */
export function PasoCancha(props: Props) {
  const { setup, esMultiRecorrido } = props
  const { min, max } = rangoDeFechas()

  return (
    <div>
      <div style={tarjeta}>
        <label style={etiqueta}>Cancha *</label>

        {!props.cancha ? (
          <CourseSelector onSelect={course => props.onElegirCancha({ id: course.id, nombre: course.nombre })} />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 14px', background: colores.inputFondo,
            border: `1px solid ${colores.inputBorde}`, borderRadius: '10px', minHeight: '48px',
          }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background: setup.details ? colores.ok : colores.aviso,
            }} />
            <span style={{ color: colores.texto, fontSize: '14px', flex: 1 }}>{props.cancha}</span>
            <button
              type="button"
              onClick={props.onLimpiarCancha}
              style={{
                background: 'none', border: 'none', color: colores.texto3,
                fontSize: '13px', cursor: 'pointer', padding: '4px 8px',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Cambiar
            </button>
          </div>
        )}

        {setup.details && (
          <div style={{
            marginTop: '12px', padding: '10px 14px', borderRadius: '10px',
            background: setup.details.has_holes ? 'rgba(196,153,42,0.08)' : 'rgba(217,119,6,0.08)',
            fontSize: '13px', color: colores.texto,
            display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
          }}>
            {setup.details.has_holes ? (
              <>
                <span style={{ color: colores.ok, fontWeight: 700 }} aria-hidden="true">✓</span>
                {setup.details.par_total && (
                  <span>
                    Par {setup.details.par_total}
                    {!esMultiRecorrido && props.hoyos === 9 && (
                      <span style={{ color: colores.texto2 }}>
                        {' '}&middot; {props.mitad === 'back' ? 'Back 9 (10-18)' : 'Front 9 (1-9)'}
                      </span>
                    )}
                  </span>
                )}
              </>
            ) : (
              <>
                <span style={{ color: colores.aviso, fontWeight: 700 }} aria-hidden="true">!</span>
                <span>Datos parciales — el scoring puede no ser exacto</span>
              </>
            )}
          </div>
        )}

        {esMultiRecorrido && (
          <SelectorRecorridos
            loops={setup.loops}
            tees={setup.tees}
            elegidos={setup.recorridosElegidos}
            onElegir={setup.setRecorridosElegidos}
          />
        )}
      </div>

      {props.cancha && !esMultiRecorrido && (
        <SelectorHoyos hoyos={props.hoyos} onHoyos={props.onHoyos} mitad={props.mitad} onMitad={props.onMitad} />
      )}

      <SelectorFormato formato={props.formato} onFormato={props.onFormato} modo={props.modo} onModo={props.onModo} />

      <div style={tarjeta}>
        <div style={{ marginBottom: '20px' }}>
          <SelectorTees
            tees={setup.tees}
            recorridosElegidos={setup.recorridosElegidos}
            valor={props.tees}
            onElegir={props.onTees}
          />
        </div>

        <div>
          <label htmlFor="fecha-ronda" style={etiqueta}>Fecha</label>
          <input
            id="fecha-ronda"
            type="date"
            value={props.fecha}
            min={min}
            max={max}
            onChange={e => props.onFecha(e.target.value)}
            style={{
              ...input, width: '100%', minHeight: '48px', padding: '12px 14px',
              fontSize: '16px', cursor: 'pointer',
              WebkitAppearance: 'none' as const, appearance: 'none' as const,
            }}
          />
        </div>
      </div>

      {/* En media ronda el front/back ya define el arranque: el shotgun no aplica. */}
      {!(!esMultiRecorrido && props.hoyos === 9) && (
        <PartidaShotgun
          activa={props.shotgun}
          onAlternar={props.onAlternarShotgun}
          hoyo={props.hoyoShotgun}
          onHoyo={props.onHoyoShotgun}
        />
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={props.onAtras} style={secundario}>
          ← Atrás
        </button>
        <button
          type="button"
          disabled={!props.cancha}
          onClick={props.onSiguiente}
          style={{ ...primario(!props.cancha), flex: 2 }}
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}
