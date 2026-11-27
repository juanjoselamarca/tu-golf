'use client'

import { FORMAT_META, formatLabel, nombreDelModo, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import type { EquipoDeClubAValidar } from '@/golf/ronda-libre/validar-nueva-ronda'
import type { FormaDeLaRonda, MitadDeCancha } from '@/golf/ronda-libre/forma-de-la-ronda'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import type { JugadorDeLaRonda } from '../hooks/useCrearRonda'
import type { EquipoDeLaRonda } from '../hooks/useFormularioDeRonda'
import { nombreVisibleDeTee } from './SelectorTees'
import { estiloDeAviso, colores, primario, secundario, tarjeta } from './estilos'
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
  /** HCP que se muestra: siempre el de 18 hoyos. */
  hcpVisibleDe: (indice: number | null | undefined, tee: string | null | undefined) => number | null
  /** Más de un tee disponible: recién ahí el tee por jugador aporta información. */
  hayVariosTees: boolean
  problema: ProblemaDeLaRonda | null
  /** Scramble rápido: los equipos como viajan (`equiposDeClubParaEnviar`). Reemplazan a la lista de jugadores. */
  equiposDeClub?: EquipoDeClubAValidar[] | null
  /** Equipos de club con «Cada equipo en su celular» (`useEquiposDeClub.unCelularPorEquipo`). */
  unCelularPorEquipo?: boolean
  /**
   * Con drives: el mínimo por jugador que va a la ronda (0 = sin mínimo; `useEquiposDeClub.drivesMinimoParaEnviar`).
   * `undefined` = la ronda no anota drives.
   */
  drivesMinimo?: number
  /** Timba libre o Skins: su nombre reemplaza al del formato, y `detalle` (las parejas, las reglas) va antes de crear. */
  juego?: { nombre: string; detalle: React.ReactNode }
  creando: boolean
  onEditar: () => void
  onCrear: () => void
}

/** «Sábado 28 de noviembre»: el día de la semana ayuda a no equivocarse de fecha. El año solo si no es el actual. */
export function fechaDelResumen(fecha: string, hoy = new Date()): string {
  const d = new Date(`${fecha}T12:00:00`)
  if (Number.isNaN(d.getTime())) return fecha
  const texto = d.toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' as const } : {}),
  }).replace(',', '')
  return texto.charAt(0).toLocaleUpperCase('es-CL') + texto.slice(1)
}

/** Lo que dice la fila «Drives». */
export function textoDeDrives(minimo: number): string {
  if (minimo === 0) return 'Se anotan, sin mínimo'
  return `Mínimo ${minimo} por jugador`
}

/** Un dato del resumen: etiqueta arriba, valor abajo (se lee entero, sin puntos suspensivos). */
function Dato({ etiqueta, children, ancho = false }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div style={{ minWidth: 0, ...(ancho ? { gridColumn: '1 / -1' } : {}) }}>
      <div style={{ fontSize: '13px', fontWeight: 500, color: colores.texto2, marginBottom: '2px' }}>{etiqueta}</div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: colores.texto, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
        {children}
      </div>
    </div>
  )
}

/** Título de una sección del resumen: «Equipos (2)». */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ fontSize: '13px', fontWeight: 500, color: colores.texto2, marginBottom: '4px' }}>{titulo}</div>
      <div>{children}</div>
    </div>
  )
}

/** Fila con divisor (DESIGN §13: una tarjeta por dato sobra): principal a la izquierda, dato a la derecha. */
function Fila({ principal, detalle, derecha, primera }: {
  principal: React.ReactNode
  detalle?: React.ReactNode
  derecha?: React.ReactNode
  primera: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      padding: '12px 0', borderTop: primera ? 'none' : `1px solid ${colores.borde}`,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '16px', fontWeight: 600, color: colores.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {principal}
        </div>
        {detalle && (
          <div style={{ fontSize: '14px', color: colores.texto2, marginTop: '2px', lineHeight: 1.35 }}>{detalle}</div>
        )}
      </div>
      {derecha && <div style={{ flexShrink: 0, textAlign: 'right' }}>{derecha}</div>}
    </div>
  )
}

/** «HCP 8» y abajo de dónde sale («del club»: no lo calculó Golfers+). */
function HcpDeEquipo({ handicap }: { handicap: number }) {
  return (
    <>
      <div className="num" style={{ fontSize: '16px', fontWeight: 600, color: colores.texto }}>HCP {formatearHandicap(handicap)}</div>
      <div style={{ fontSize: '13px', color: colores.texto2 }}>del club</div>
    </>
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
      ? (props.mitad === 'front' ? 'Front' : 'Back')
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

  const club = props.equiposDeClub ?? null
  const dosRecorridos = props.recorridosElegidos.length === 2

  const formato = props.juego
    ? `${props.juego.nombre} · ${nombreDelModo(props.modo)}`
    : club
      ? `${FORMAT_META[props.formato].label} · ${nombreDelModo(props.modo)}`
      : formatLabel(props.formato, props.modo)

  const anota = club
    ? (props.unCelularPorEquipo ? 'Cada equipo en su celular' : 'Tú, todos los equipos')
    : props.llevaElScoreDelGrupo ? 'Tú, por todos' : 'Cada uno en su celular'

  const filaDeJugador = (j: JugadorDeLaRonda, i: number) => {
    const hcp = props.hcpVisibleDe(j.indice, j.tees)
    const detalle = [
      j.indice != null ? `Índice ${formatearIndice(j.indice)}` : 'Sin índice',
      props.hayVariosTees && j.tees ? `Tee ${nombreVisibleDeTee(j.tees, dosRecorridos)}` : null,
    ].filter(Boolean).join(' · ')
    return (
      <Fila
        key={j.id}
        primera={i === 0}
        principal={<>{j.nombre}{j.esCreador && <span style={{ fontWeight: 500, color: colores.texto2 }}> (tú)</span>}</>}
        detalle={detalle}
        // El HCP de 18 hoyos aunque la ronda sea de 9 (regla de Juanjo, 12-nov-2026): el mismo número que verá en
        // el marcador. "HCP +2", no "+2 golpes" (se leía como recibir dos).
        derecha={hcp != null
          ? <span className="num" style={{ fontSize: '16px', fontWeight: 600, color: colores.texto }}>HCP {formatearHandicap(hcp)}</span>
          : undefined}
      />
    )
  }

  return (
    <div>
      <div style={{ ...tarjeta, padding: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, color: colores.texto, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
          {props.cancha}
        </div>
        <div style={{ fontSize: '14px', color: colores.texto2, marginTop: '2px' }}>{fechaDelResumen(props.fecha)}</div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px 12px',
          marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${colores.borde}`,
        }}>
          <Dato etiqueta="Formato" ancho={formato.length > 22}>{formato}</Dato>
          <Dato etiqueta="Hoyos">
            {forma.holes}
            {detalleDeHoyos && <span style={{ fontWeight: 500, color: colores.texto2 }}> · {detalleDeHoyos}</span>}
          </Dato>
          {forma.hoyoInicio !== 1 && <Dato etiqueta="Empieza en">Hoyo {forma.hoyoInicio}</Dato>}
          {/* Equipos de club: nadie juega con su índice, el tee no cambia ningún número. */}
          {!club && <Dato etiqueta="Tees">{nombreVisibleDeTee(props.teeGlobal, dosRecorridos)}</Dato>}
          <Dato etiqueta="Anota" ancho>{anota}</Dato>
          {/* La fila sale si la ronda anota drives; a 27 hoyos no hay mínimo (revisión Fable #901). */}
          {club?.some(e => e.driveJugadores) && (
            <Dato etiqueta="Drives" ancho>{props.drivesMinimo !== undefined ? textoDeDrives(props.drivesMinimo) : 'Se anotan'}</Dato>
          )}
        </div>

        {club ? (
          <Seccion titulo={`Equipos (${club.length})`}>
            {club.map((e, i) => (
              <Fila
                key={`${i}-${e.nombre}`}
                primera={i === 0}
                principal={e.nombre}
                detalle={e.driveJugadores ? e.driveJugadores.join(' · ') : undefined}
                // Solo en neto: en gross el hándicap no juega.
                derecha={props.modo === 'neto' && e.handicap != null ? <HcpDeEquipo handicap={e.handicap} /> : undefined}
              />
            ))}
          </Seccion>
        ) : (
          <Seccion titulo={`Jugadores (${props.jugadores.length})`}>
            {grupos.map((grupo, g) => (
              <div key={grupo.titulo ?? `sin-equipo-${g}`} style={{ marginTop: g === 0 ? 0 : '12px' }}>
                {grupo.titulo && (
                  <div style={{ fontSize: '14px', fontWeight: 600, color: colores.oroTexto, paddingTop: '4px' }}>{grupo.titulo}</div>
                )}
                {grupo.jugadores.map(filaDeJugador)}
              </div>
            ))}
          </Seccion>
        )}
      </div>

      {props.juego?.detalle}

      <div style={{ display: 'flex', gap: '8px' }}>
        {/* Bloqueado mientras se crea: volver a editar con el POST en vuelo deja la pantalla de compartir
            mostrando datos que no son los de la ronda creada. */}
        <button
          type="button"
          disabled={props.creando}
          onClick={props.onEditar}
          style={{ ...secundario, minHeight: '52px', ...(props.creando ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
        >
          ← Editar
        </button>
        <button
          type="button"
          disabled={props.creando || props.problema != null}
          onClick={props.onCrear}
          style={{ ...primario(props.creando || props.problema != null), flex: 2, minHeight: '52px' }}
        >
          {props.creando ? 'Creando ronda...' : 'Crear ronda'}
        </button>
      </div>

      {props.problema && (
        <div style={{ ...estiloDeAviso(props.problema), marginTop: '8px' }}>
          {props.problema.detalle}
        </div>
      )}
    </div>
  )
}
