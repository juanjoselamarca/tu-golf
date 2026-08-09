'use client'

import type { FormatoJuego } from '@/golf/core/rules'
import { FORMAT_META } from '@/golf/core/rules'
import { maxRivales } from '@/golf/ronda-libre/plantilla-de-jugadores'
import type { CourseTee, RondaReciente } from '@/lib/data/ronda-libre-nueva'
import type { EquipoDeLaRonda, RivalDelCreador } from '../hooks/useFormularioDeRonda'
import type { JugadorDeLaRonda } from '../hooks/useCrearRonda'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import { AsignacionDeEquipos } from './AsignacionDeEquipos'
import { DiferenciaDeHandicap } from './DiferenciaDeHandicap'
import { SelectorDeTeeDelJugador } from './SelectorDeTeeDelJugador'
import { TarjetaDeRival } from './TarjetaDeRival'
import { colores, etiqueta, input, primario, secundario, tarjeta } from './estilos'

interface Props {
  creador: { nombre: string; indice: number | null }
  onIndiceCreador: (indice: number | null) => void
  teeGlobal: string
  onTeeGlobal: (tee: string) => void
  tees: CourseTee[]
  formato: FormatoJuego
  esFormatoDeEquipo: boolean
  llevaElScoreDelGrupo: boolean
  rivales: RivalDelCreador[]
  onCampoRival: <K extends keyof RivalDelCreador>(idx: number, campo: K, valor: RivalDelCreador[K]) => void
  onQuitarRival: (idx: number) => void
  onAgregarRival: (nombre?: string) => void
  equipos: EquipoDeLaRonda[]
  onEquipos: (equipos: EquipoDeLaRonda[]) => void
  jugadores: JugadorDeLaRonda[]
  golpesDe: (indice: number | null | undefined, tee: string | null | undefined) => number | null
  rondasRecientes: RondaReciente[]
  /** Problema que impide crear la ronda, si lo hay. */
  problema: ProblemaDeLaRonda | null
  onAtras: () => void
  onSiguiente: () => void
}

/** Paso 3: quiénes juegan, con qué índice y desde qué tee. */
export function PasoJugadores(props: Props) {
  const tope = maxRivales(props.formato)
  const puedeAgregar = props.llevaElScoreDelGrupo && props.rivales.length < tope
  const golpesCreador = props.golpesDe(props.creador.indice, props.teeGlobal)

  // Nombres ya usados, para no proponer a alguien que ya está en la ronda.
  const yaEnLaRonda = new Set(
    [props.creador.nombre, ...props.rivales.map(r => r.nombre)].map(n => n.toLowerCase().trim()),
  )
  const frecuentes = Array.from(new Set(props.rondasRecientes.flatMap(r => r.jugadores)))
    .filter(nombre => !yaEnLaRonda.has(nombre.toLowerCase().trim()))
    .slice(0, 4)

  const esMatchPlay = FORMAT_META[props.formato]?.requiereParejas

  return (
    <div>
      <div style={tarjeta}>
        <label style={{ ...etiqueta, marginBottom: '10px' }}>Jugadores</label>

        {/* Creador */}
        <div style={{
          padding: '12px 14px', borderRadius: '12px',
          background: colores.oroTenue, border: `1px solid ${colores.oroBorde}`,
          marginBottom: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: colores.texto }}>{props.creador.nombre}</div>
            <span style={{
              fontSize: '11px', color: colores.oroTexto, fontWeight: 600,
              background: 'rgba(196,153,42,0.1)', padding: '3px 10px', borderRadius: '10px',
            }}>
              Tú
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor="indice-creador" style={{ ...etiqueta, marginBottom: 0, fontSize: '12px', color: colores.texto3, flexShrink: 0 }}>
              Índice
            </label>
            <input
              id="indice-creador"
              type="number"
              step="0.1"
              placeholder="Ej: 10.5"
              value={props.creador.indice ?? ''}
              onChange={e => props.onIndiceCreador(e.target.value ? Number(e.target.value) : null)}
              style={{ ...input, width: '90px', minHeight: '38px', padding: '8px 12px', fontSize: '14px' }}
            />
            <SelectorDeTeeDelJugador
              tees={props.tees}
              valor={props.teeGlobal}
              onElegir={props.onTeeGlobal}
              etiquetaAccesible="Tu tee de salida"
            />
            {golpesCreador != null && (
              <span style={{ fontSize: '12px', color: colores.oroTexto, fontWeight: 600 }}>
                HCP {golpesCreador}
              </span>
            )}
          </div>
        </div>

        {/* Rivales */}
        {props.llevaElScoreDelGrupo && (
          <>
            {props.rivales.map((rival, idx) => (
              <TarjetaDeRival
                key={idx}
                rival={rival}
                indiceEnLista={idx}
                tees={props.tees}
                teeGlobal={props.teeGlobal}
                golpes={props.golpesDe(rival.handicap, rival.tees ?? props.teeGlobal)}
                onCampo={(campo, valor) => props.onCampoRival(idx, campo, valor)}
                onQuitar={() => props.onQuitarRival(idx)}
              />
            ))}

            {puedeAgregar && (
              <>
                {frecuentes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', color: colores.texto2, width: '100%' }}>
                      Jugadores recientes:
                    </span>
                    {frecuentes.map(nombre => (
                      <button
                        key={nombre}
                        type="button"
                        onClick={() => props.onAgregarRival(nombre)}
                        style={{
                          padding: '8px 14px', borderRadius: '20px', minHeight: '36px',
                          background: 'rgba(196,153,42,0.08)', border: `1px solid rgba(196,153,42,0.3)`,
                          color: colores.oroTexto, fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                        }}
                      >
                        + {nombre}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => props.onAgregarRival()}
                  style={{
                    width: '100%', background: 'transparent',
                    border: `1px dashed ${colores.oro}`, color: colores.oroTexto,
                    borderRadius: '10px', padding: '12px', cursor: 'pointer',
                    fontSize: '14px', fontWeight: 500, textAlign: 'center', minHeight: '44px',
                  }}
                >
                  + Agregar jugador
                </button>
              </>
            )}
          </>
        )}

        {esMatchPlay && props.rivales.length === 1 && (
          <DiferenciaDeHandicap
            jugadorA={{ nombre: props.creador.nombre, golpes: golpesCreador }}
            jugadorB={{
              nombre: props.rivales[0].nombre.trim() || 'Rival',
              golpes: props.golpesDe(props.rivales[0].handicap, props.rivales[0].tees ?? props.teeGlobal),
            }}
          />
        )}

        {!props.llevaElScoreDelGrupo && !esMatchPlay && (
          <div style={{
            padding: '14px', background: 'rgba(196,153,42,0.04)', borderRadius: '10px',
            fontSize: '13px', color: colores.texto2, lineHeight: 1.5,
          }}>
            Otros jugadores pueden unirse compartiendo el enlace después de crear la ronda.
          </div>
        )}
      </div>

      {props.esFormatoDeEquipo && props.llevaElScoreDelGrupo && props.jugadores.length >= 3 && (
        <AsignacionDeEquipos
          formato={props.formato}
          nombres={props.jugadores.map(j => j.nombre)}
          equipos={props.equipos}
          onEquipos={props.onEquipos}
        />
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={props.onAtras} style={secundario}>
          ← Atrás
        </button>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            type="button"
            disabled={props.problema != null}
            onClick={props.onSiguiente}
            style={{ ...primario(props.problema != null), width: '100%' }}
          >
            Revisar →
          </button>
          {props.problema && (
            <div style={{ fontSize: '11px', color: colores.aviso, textAlign: 'center', lineHeight: 1.3 }}>
              {props.problema.detalle}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
