'use client'

import { useState } from 'react'
import { ChevronDown } from '@/components/icons'
import { Toggle } from '@/components/ui/Toggle'
import type { ModoJuego } from '@/golf/core/rules'
import {
  NOMBRE_PLANTILLA, PUNTITOS_DEL_CATALOGO, alternarPuntito, cambiarDestinoPuntitos, cambiarPerdedorResta,
  cambiarRepartoPareja, type ConfigJuego, type PlantillaJuego,
} from '@/golf/formats/personalizado'
import { conConfig, timbaDePlantilla, type TimbaDelFormulario } from '../../hooks/timba-del-formulario'
import { colores, tarjeta } from '../estilos'
import { Fila, Opciones, SegmentoModo, SelectorPuntosEspeciales, caption } from '../juego/controles'
import { NOMBRE_PUNTITO, PLANTILLAS_DEL_CATALOGO, bajadaDePlantilla, jugadoresDePlantilla } from './catalogo'
import { ejemploDelHoyo } from './ejemplo-del-hoyo'
import { FraseDelJuego } from './FraseDelJuego'

interface Props {
  timba: TimbaDelFormulario
  onTimba: (t: TimbaDelFormulario) => void
  modo: ModoJuego
  onModo: (m: ModoJuego) => void
  holes: number
}

/** "Elegir el juego" (maqueta Main): catálogo, frase tocable, ejemplo con el motor, puntos especiales y reglas. */
export function ElegirJuegoTimba({ timba, onTimba, modo, onModo, holes }: Props) {
  const [masReglas, setMasReglas] = useState(false)
  const { config } = timba
  const cambiar = (c: ConfigJuego) => onTimba(conConfig(timba, c))
  const elegir = (p: PlantillaJuego) => { if (p !== config.plantilla) onTimba(timbaDePlantilla(p)) }
  const ejemplo = ejemploDelHoyo(config)
  const esParejas = config.unidad !== 'individual'

  return (
    <div style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div role="radiogroup" aria-label="Juego" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[...PLANTILLAS_DEL_CATALOGO, 'personalizado_total' as const].map(p => {
          const activa = p === config.plantilla
          const total = p === 'personalizado_total'
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => elegir(p)}
              style={{
                width: '100%', minHeight: '64px', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 14px', borderRadius: '12px', color: colores.texto, cursor: 'pointer', textAlign: 'left',
                background: total && !activa ? 'transparent' : colores.tarjeta,
                border: activa ? `2px solid ${colores.texto}` : (total ? `1.5px dashed ${colores.texto3}` : `1px solid ${colores.borde}`),
              }}
            >
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '16px', fontWeight: 600 }}>{NOMBRE_PLANTILLA[p]}</span>
                <span style={{ fontSize: '13px', color: colores.texto2 }}>{bajadaDePlantilla(p, holes)}</span>
              </span>
              <span
                aria-label={`${jugadoresDePlantilla(p).replace('–', ' a ')} jugadores`}
                style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '12px', color: colores.texto2, whiteSpace: 'nowrap' }}
              >
                {jugadoresDePlantilla(p)}
              </span>
            </button>
          )
        })}
      </div>

      <section aria-label="Así se juega" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={caption}>Así se juega · toca lo subrayado para cambiarlo</span>
        <FraseDelJuego config={config} holes={holes} onConfig={cambiar} />
        <div style={{ background: colores.fondo, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: colores.texto2 }}>
            Ejemplo{modo === 'neto' ? ' (sin contar hándicap)' : ''}
          </span>
          <span style={{ fontSize: '14px', lineHeight: 1.5, color: colores.texto }}>{ejemplo.golpes}</span>
          {ejemplo.duelos.map(d => (
            <span key={d} style={{ fontSize: '13px', lineHeight: 1.5, color: colores.texto2 }}>{d}</span>
          ))}
          <span style={{ fontSize: '14px', lineHeight: 1.5, fontWeight: 600, color: colores.texto }}>
            Puntos: {ejemplo.puntos}
          </span>
        </div>
      </section>

      <section aria-label="Puntos especiales" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={caption}>Puntos especiales</span>
        <SelectorPuntosEspeciales
          tipos={PUNTITOS_DEL_CATALOGO}
          nombre={t => NOMBRE_PUNTITO[t]}
          activo={t => config.puntitos.some(p => p.tipo === t)}
          onAlternar={t => cambiar(alternarPuntito(config, t))}
        />
      </section>

      {/* Sin candado Pro: Timba neto no es una feature Pro (`NETO_FEATURE_BY_FORMAT` no la incluye). */}
      <SegmentoModo modo={modo} onModo={onModo} />

      <div>
        <button
          type="button"
          aria-expanded={masReglas}
          onClick={() => setMasReglas(v => !v)}
          style={{
            width: '100%', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: 0, background: 'transparent', padding: '0 4px', color: colores.texto, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Más reglas</span>
            <span style={{ fontSize: '13px', color: colores.texto2 }}>
              {esParejas ? 'hándicap, puntos de la pareja, quién resta' : 'hándicap'}
            </span>
          </span>
          <ChevronDown size={20} aria-hidden="true" style={{ transform: masReglas ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
        </button>
        {masReglas && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 4px 0' }}>
            <Opciones
              titulo="Hándicap en neto"
              nota={modo === 'gross' ? 'Aplica solo si juegan neto.' : undefined}
              valor={config.handicap}
              opciones={[
                { valor: 'diferencia_mas_bajo', etiqueta: 'Diferencia del más bajo' },
                { valor: 'completo', etiqueta: 'Completo' },
              ]}
              onCambiar={h => cambiar({ ...config, handicap: h })}
            />
            {esParejas && (
              <Opciones
                titulo="Puntos de la pareja"
                valor={config.repartoPareja}
                opciones={[
                  { valor: 'total_a_cada_uno', etiqueta: 'Cada uno suma el total' },
                  { valor: 'dividir', etiqueta: 'Se dividen entre los dos' },
                ]}
                onCambiar={r => cambiar(cambiarRepartoPareja(config, r))}
              />
            )}
            {esParejas && (
              <Fila etiqueta="La pareja que pierde un duelo resta lo mismo">
                <Toggle
                  checked={config.duelos.some(d => d.tipo !== 'por_puesto' && d.perdedorResta)}
                  onChange={v => cambiar(cambiarPerdedorResta(config, v))}
                  ariaLabel="La pareja que pierde un duelo resta lo mismo"
                />
              </Fila>
            )}
            {esParejas && config.puntitos.length > 0 && (
              <Opciones
                titulo="Los puntos especiales suman"
                valor={config.puntitos[0].destino}
                opciones={[
                  { valor: 'individual', etiqueta: 'Al jugador' },
                  { valor: 'pareja', etiqueta: 'A la pareja' },
                ]}
                onCambiar={d => cambiar(cambiarDestinoPuntitos(config, d))}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
