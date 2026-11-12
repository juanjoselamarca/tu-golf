'use client'

import { formatLabel, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import type { FormaDeLaRonda, MitadDeCancha } from '@/golf/ronda-libre/forma-de-la-ronda'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import type { JugadorDeLaRonda } from '../hooks/useCrearRonda'
import type { EquipoDeLaRonda } from '../hooks/useFormularioDeRonda'
import { nombreVisibleDeTee } from './SelectorTees'
import { colores, primario, secundario, tarjeta } from './estilos'
import { formatearHandicap, formatearIndice } from '@/golf/handicap-index-range'
import { nombreVisibleDeEquipo } from '@/golf/ronda-libre/nombre-de-equipo'

interface Props {
  cancha: string
  forma: FormaDeLaRonda
  mitad: MitadDeCancha
  recorridosElegidos: string[]
  formato: FormatoJuego
  modo: ModoJuego
  teeGlobal: string
  fecha: string
  jugadores: JugadorDeLaRonda[]
  /** Equipos de la ronda (vacío en formatos individuales). Referencian a `jugadores` por id. */
  equipos: EquipoDeLaRonda[]
  /** Quién anota: tú por todos (scorer de grupo) o cada uno en su celular. */
  llevaElScoreDelGrupo: boolean
  golpesDe: (indice: number | null | undefined, tee: string | null | undefined) => number | null
  /** Más de un tee disponible: recién ahí el tee por jugador aporta información. */
  hayVariosTees: boolean
  problema: ProblemaDeLaRonda | null
  creando: boolean
  onEditar: () => void
  onCrear: () => void
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: '12px', padding: '10px 0', borderBottom: `1px solid ${colores.borde}`,
    }}>
      <span style={{ fontSize: '13px', color: colores.texto2, flexShrink: 0 }}>{etiqueta}</span>
      <span style={{
        fontSize: '14px', fontWeight: 600, color: colores.texto, textAlign: 'right',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {children}
      </span>
    </div>
  )
}

/** Paso 4: el resumen que el usuario confirma antes de crear la ronda. */
export function PasoConfirmar(props: Props) {
  const { forma } = props

  // Los hoyos salen de `formaDeLaRonda`, la MISMA fuente que arma el payload.
  // Antes esta pantalla los re-derivaba del botón 18/9, así que en una cancha
  // de 27 mostraba "18" mientras el submit mandaba la suma de los recorridos.
  const detalleDeHoyos = forma.esMultiRecorrido
    ? props.recorridosElegidos.join(' + ')
    : forma.holes === 9
      ? `(${props.mitad === 'front' ? 'Front' : 'Back'})`
      : null

  // Los jugadores agrupados como van a competir. Un jugador que no esté en
  // ningún equipo igual se muestra: que falte de la lista sería peor que verlo
  // sin equipo (y la validación ya frena el botón en ese caso).
  const porId = new Map(props.jugadores.map(j => [j.id, j]))
  const enAlgunEquipo = new Set(props.equipos.flatMap(e => e.miembros))
  const grupos: Array<{ titulo: string | null; jugadores: JugadorDeLaRonda[] }> = props.equipos.length > 0
    ? [
        ...props.equipos.map((e, i) => ({
          titulo: nombreVisibleDeEquipo(e.nombre, i),
          jugadores: e.miembros.map(id => porId.get(id)).filter((j): j is JugadorDeLaRonda => j != null),
        })),
        { titulo: null, jugadores: props.jugadores.filter(j => !enAlgunEquipo.has(j.id)) },
      ].filter(g => g.jugadores.length > 0)
    : [{ titulo: null, jugadores: props.jugadores }]

  const filaDeJugador = (j: JugadorDeLaRonda) => {
    const golpes = props.golpesDe(j.indice, j.tees)
    return (
      <div key={j.id} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        padding: '8px 12px', borderRadius: '10px',
        background: j.esCreador ? 'rgba(196,153,42,0.12)' : 'rgba(196,153,42,0.05)',
        border: `1px solid ${j.esCreador ? colores.oroBorde : 'transparent'}`,
      }}>
        <span style={{
          fontSize: '13px', fontWeight: 500,
          color: j.esCreador ? colores.oroTexto : colores.texto,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {j.nombre}
          {j.indice != null ? ` · idx ${formatearIndice(j.indice)}` : ''}
          {/* Los golpes que va a repartir la ronda. En una vuelta de 9
              no son los mismos que el índice sugiere, y verlos acá
              evita la sorpresa en el hoyo 1. Mismo rótulo que la tarjeta del
              paso anterior ("HCP 12", "HCP +2"): "+2 golpes" se leía como recibir dos. */}
          {golpes != null ? ` · HCP ${formatearHandicap(golpes)}` : ''}
        </span>
        {props.hayVariosTees && j.tees && (
          <span style={{
            fontSize: '11px', color: colores.texto2, flexShrink: 0,
            padding: '2px 8px', borderRadius: '8px',
            background: colores.tarjeta, border: `1px solid ${colores.borde}`,
            fontFamily: '"DM Mono", monospace',
          }}>
            Tee {nombreVisibleDeTee(j.tees, props.recorridosElegidos.length === 2)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ ...tarjeta, padding: '20px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: colores.texto, marginBottom: '16px' }}>
          Confirmar ronda
        </div>

        <Fila etiqueta="Cancha">{props.cancha}</Fila>

        <Fila etiqueta="Hoyos">
          {forma.holes}
          {detalleDeHoyos ? ` ${detalleDeHoyos}` : ''}
        </Fila>

        {forma.hoyoInicio !== 1 && (
          <Fila etiqueta="Empieza en">Hoyo {forma.hoyoInicio}</Fila>
        )}

        <Fila etiqueta="Formato">{formatLabel(props.formato, props.modo)}</Fila>

        <Fila etiqueta="Tees">{nombreVisibleDeTee(props.teeGlobal, props.recorridosElegidos.length === 2)}</Fila>

        <Fila etiqueta="Fecha">
          {new Date(`${props.fecha}T12:00:00`).toLocaleDateString('es-CL', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
        </Fila>

        <Fila etiqueta="Anota">{props.llevaElScoreDelGrupo ? 'Tú, por todos' : 'Cada uno en su celular'}</Fila>

        <div style={{ padding: '10px 0' }}>
          <span style={{ fontSize: '13px', color: colores.texto2, display: 'block', marginBottom: '8px' }}>
            Jugadores ({props.jugadores.length})
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {grupos.map((grupo, i) => (
              <div key={grupo.titulo ?? `sin-equipo-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {grupo.titulo && (
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colores.texto, padding: '0 2px' }}>
                    {grupo.titulo}
                  </span>
                )}
                {grupo.jugadores.map(filaDeJugador)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        {/* Bloqueado mientras se crea: volver a editar con el POST en vuelo deja la pantalla de compartir
            mostrando datos que no son los de la ronda creada. */}
        <button
          type="button"
          disabled={props.creando}
          onClick={props.onEditar}
          style={{ ...secundario, ...(props.creando ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
        >
          ← Editar
        </button>
        <button
          type="button"
          disabled={props.creando || props.problema != null}
          onClick={props.onCrear}
          style={{ ...primario(props.creando || props.problema != null), flex: 2 }}
        >
          {props.creando ? 'Creando ronda...' : 'Crear ronda ✓'}
        </button>
      </div>

      {props.problema && (
        <div style={{ fontSize: '12px', color: colores.aviso, textAlign: 'center', marginTop: '8px', lineHeight: 1.4 }}>
          {props.problema.detalle}
        </div>
      )}
    </div>
  )
}
