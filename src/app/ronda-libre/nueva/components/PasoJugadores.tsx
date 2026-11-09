'use client'

import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { FORMAT_META } from '@/golf/core/rules'
import { maxRivales, puedeSumarCompanero } from '@/golf/ronda-libre/plantilla-de-jugadores'
import type { CourseTee, JugadorReciente, RondaReciente } from '@/lib/data/ronda-libre-nueva'
import {
  esRivalEnBlanco,
  type DatosDeRival,
  type EquipoDeLaRonda,
  type RivalDelCreador,
} from '../hooks/useFormularioDeRonda'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import { DiferenciaDeHandicap } from './DiferenciaDeHandicap'
import { EquiposDeLaRonda } from './EquiposDeLaRonda'
import { SelectorQuienAnota } from './SelectorQuienAnota'
import { TarjetaDelCreador } from './TarjetaDelCreador'
import { TarjetaDeRival } from './TarjetaDeRival'
import { colores, etiqueta, primario, secundario, tarjeta } from './estilos'

interface Props {
  creador: { nombre: string; indice: number | null }
  onIndiceCreador: (indice: number | null) => void
  teeGlobal: string
  onTeeGlobal: (tee: string) => void
  tees: CourseTee[]
  formato: FormatoJuego
  /** Modo efectivo de la ronda: la diferencia de handicap sólo existe en neto. */
  modo: ModoJuego
  esFormatoDeEquipo: boolean
  /** El formato no decide solo quién anota: se le pregunta al usuario. */
  preguntaQuienAnota: boolean
  anotaPorTodos: boolean
  onQuienAnota: (porTodos: boolean) => void
  /** Modo de score efectivo (el que va a la ronda). */
  llevaElScoreDelGrupo: boolean
  rivales: RivalDelCreador[]
  onCampoRival: <K extends keyof RivalDelCreador>(idx: number, campo: K, valor: RivalDelCreador[K]) => void
  onQuitarRival: (idx: number) => void
  onAgregarRival: (base?: DatosDeRival, equipoIdx?: number) => void
  equipos: EquipoDeLaRonda[]
  onAgregarEquipo: () => void
  onQuitarEquipo: (equipoIdx: number) => void
  onRenombrarEquipo: (equipoIdx: number, nombre: string) => void
  onMoverAlEquipo: (id: string) => void
  golpesDe: (indice: number | null | undefined, tee: string | null | undefined) => number | null
  rondasRecientes: RondaReciente[]
  /** Problema que impide crear la ronda, si lo hay. */
  problema: ProblemaDeLaRonda | null
  onAtras: () => void
  onSiguiente: () => void
}

/** Paso 3: quiénes juegan, con qué índice y desde qué tee. */
export function PasoJugadores(props: Props) {
  const totalJugadores = 1 + props.rivales.length
  // Hay dónde poner a un jugador más: una tarjeta en blanco que ocupar, o cupo
  // en algún equipo (formatos por equipo) / bajo el tope de rivales (el resto).
  const hayCupo = props.llevaElScoreDelGrupo && (
    props.rivales.some(esRivalEnBlanco) ||
    (props.esFormatoDeEquipo
      ? props.equipos.some(e => puedeSumarCompanero(props.formato, e.miembros.length, totalJugadores))
      : props.rivales.length < maxRivales(props.formato))
  )
  const golpesCreador = props.golpesDe(props.creador.indice, props.teeGlobal)

  // Nombres ya usados, para no proponer a alguien que ya está en la ronda.
  const yaEnLaRonda = new Set(
    [props.creador.nombre, ...props.rivales.map(r => r.nombre)].map(n => n.toLowerCase().trim()),
  )
  // Un jugador por nombre, con los datos de la ronda MÁS reciente en que jugó
  // (las rondas llegan ordenadas de la más nueva a la más vieja).
  const porNombre = new Map<string, JugadorReciente>()
  for (const j of props.rondasRecientes.flatMap(r => r.jugadores)) {
    const clave = j.nombre.toLowerCase().trim()
    if (j.esCreador || !clave || yaEnLaRonda.has(clave) || porNombre.has(clave)) continue
    porNombre.set(clave, j)
  }
  const frecuentes = [...porNombre.values()].slice(0, 4)

  const esMatchPlay = FORMAT_META[props.formato]?.requiereParejas

  const tarjetaDelCreador = (
    <TarjetaDelCreador
      nombre={props.creador.nombre}
      indice={props.creador.indice}
      onIndice={props.onIndiceCreador}
      tees={props.tees}
      teeGlobal={props.teeGlobal}
      onTeeGlobal={props.onTeeGlobal}
      golpes={golpesCreador}
    />
  )

  return (
    <div>
      <div style={tarjeta}>
        {props.preguntaQuienAnota ? (
          <SelectorQuienAnota anotaPorTodos={props.anotaPorTodos} onElegir={props.onQuienAnota} />
        ) : (
          <div style={{ fontSize: '12px', color: colores.texto2, marginBottom: '12px', lineHeight: 1.4 }}>
            {/* El formato lo decide: con más de una persona por tarjeta, anota uno. */}
            {props.rivales.length > 0 ? 'Tú anotas por el grupo desde tu celular.' : 'Anotas desde tu celular.'}
          </div>
        )}

        <label style={{ ...etiqueta, marginBottom: '10px' }}>Jugadores</label>

        {props.esFormatoDeEquipo ? (
          <EquiposDeLaRonda
            formato={props.formato}
            equipos={props.equipos}
            rivales={props.rivales}
            creador={props.creador}
            onIndiceCreador={props.onIndiceCreador}
            teeGlobal={props.teeGlobal}
            onTeeGlobal={props.onTeeGlobal}
            tees={props.tees}
            golpesDe={props.golpesDe}
            onCampoRival={props.onCampoRival}
            onQuitarRival={props.onQuitarRival}
            onAgregarCompanero={equipoIdx => props.onAgregarRival(undefined, equipoIdx)}
            onAgregarEquipo={props.onAgregarEquipo}
            onQuitarEquipo={props.onQuitarEquipo}
            onRenombrarEquipo={props.onRenombrarEquipo}
            onMoverAlEquipo={props.onMoverAlEquipo}
          />
        ) : (
          <>
            {tarjetaDelCreador}

            {props.llevaElScoreDelGrupo && props.rivales.map((rival, idx) => (
              <TarjetaDeRival
                key={rival.id}
                rival={rival}
                indiceEnLista={idx}
                tees={props.tees}
                teeGlobal={props.teeGlobal}
                golpes={props.golpesDe(rival.handicap, rival.tees ?? props.teeGlobal)}
                onCampo={(campo, valor) => props.onCampoRival(idx, campo, valor)}
                onQuitar={() => props.onQuitarRival(idx)}
              />
            ))}

            {props.llevaElScoreDelGrupo && props.rivales.length < maxRivales(props.formato) && (
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
            )}
          </>
        )}

        {hayCupo && frecuentes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: colores.texto2, width: '100%' }}>
              Jugadores recientes:
            </span>
            {frecuentes.map(j => (
              <button
                key={j.nombre}
                type="button"
                onClick={() => props.onAgregarRival({
                  nombre: j.nombre,
                  handicap: j.handicap,
                  // Sólo si el tee existe en esta cancha: si no, hereda el de la ronda.
                  tees: j.tees && props.tees.some(t => t.nombre.toLowerCase() === j.tees?.toLowerCase()) ? j.tees : null,
                })}
                style={{
                  padding: '8px 14px', borderRadius: '22px', minHeight: '44px',
                  background: 'rgba(196,153,42,0.08)', border: `1px solid rgba(196,153,42,0.3)`,
                  color: colores.oroTexto, fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                }}
              >
                + {j.nombre}
              </button>
            ))}
          </div>
        )}

        {/* Sólo en neto: en Match Play Gross nadie recibe golpes, y anunciarlos
            prometía una ventaja que el marcador no da. */}
        {esMatchPlay && props.modo === 'neto' && props.rivales.length === 1 && (
          <DiferenciaDeHandicap
            jugadorA={{ nombre: props.creador.nombre, golpes: golpesCreador }}
            jugadorB={{
              nombre: props.rivales[0].nombre.trim() || 'Rival',
              golpes: props.golpesDe(props.rivales[0].handicap, props.rivales[0].tees ?? props.teeGlobal),
            }}
          />
        )}

        {!props.llevaElScoreDelGrupo && (
          <div style={{
            padding: '14px', background: 'rgba(196,153,42,0.04)', borderRadius: '10px',
            fontSize: '13px', color: colores.texto2, lineHeight: 1.5,
          }}>
            Otros jugadores pueden unirse compartiendo el enlace después de crear la ronda.
          </div>
        )}
      </div>

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
