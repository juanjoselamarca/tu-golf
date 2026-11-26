'use client'

import { useEffect, useRef } from 'react'
import type { ModoJuego } from '@/golf/core/rules'
import { esHandicapDeClubValido, handicapDeClubMaximo, type QuienAnota } from '@/golf/ronda-libre/equipos-de-club'
import { NOMBRE_EQUIPO_MAX, nombreDeEquipo, nombreVisibleDeEquipo } from '@/golf/ronda-libre/nombre-de-equipo'
import { DETALLE_DEMASIADOS_EQUIPOS_DE_CLUB } from '@/golf/ronda-libre/validar-nueva-ronda'
import { NOMBRE_JUGADOR_DE_DRIVE_MAX, drivesMinimoPorJugador } from '@/golf/formats/drives-scramble'
import { handicapDeClubDesdeTexto, type EquipoDeClubDelFormulario } from '../hooks/useEquiposDeClub'
import { colores, etiqueta, input, inputQueBloquea, opcion } from './estilos'

const OPCIONES = [
  { solo: false, titulo: 'Con jugadores' },
  { solo: true, titulo: 'Solo equipos' },
] as const

/** Scramble: «Con jugadores» (el flujo de siempre) o «Solo equipos» (nombre y hándicap del club). */
export function SelectorSoloEquipos({ soloEquipos, onElegir }: { soloEquipos: boolean; onElegir: (solo: boolean) => void }) {
  return (
    <div role="group" aria-label="Cómo se arman los equipos" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
      {OPCIONES.map(op => {
        const activo = soloEquipos === op.solo
        return (
          <button
            key={op.titulo}
            type="button"
            aria-pressed={activo}
            onClick={() => onElegir(op.solo)}
            style={{
              ...opcion(activo), flex: 1, minHeight: '48px', padding: '12px', textAlign: 'center',
              fontSize: '14px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto,
            }}
          >
            {op.titulo}
          </button>
        )
      })}
    </div>
  )
}

const OPCIONES_QUIEN_ANOTA: ReadonlyArray<{ valor: QuienAnota; titulo: string }> = [
  { valor: 'uno', titulo: 'Yo anoto todos' },
  { valor: 'cada_equipo', titulo: 'Cada equipo en su celular' },
]

/**
 * Con 2 o más equipos: quién anota, obligatorio y sin nada elegido de antemano (`useEquiposDeClub.quienAnota`).
 * «Cada equipo en su celular»: al crear la ronda se comparte un link y cada equipo elige el suyo.
 */
export function SelectorQuienAnotaEquipos({ quienAnota, onElegir }: { quienAnota: QuienAnota | null; onElegir: (q: QuienAnota) => void }) {
  return (
    <div style={{ marginTop: '16px' }}>
      <div id="equipos-club-quien-anota" style={{ ...etiqueta, fontSize: '14px', color: colores.texto }}>¿Quién anota?</div>
      <div role="group" aria-labelledby="equipos-club-quien-anota" style={{ display: 'flex', gap: '8px' }}>
        {OPCIONES_QUIEN_ANOTA.map(op => {
          const activo = quienAnota === op.valor
          return (
            <button
              key={op.valor}
              type="button"
              aria-pressed={activo}
              onClick={() => onElegir(op.valor)}
              style={{
                ...opcion(activo), flex: 1, minHeight: '56px', padding: '10px 12px', textAlign: 'center',
                fontSize: '14px', fontWeight: 600, lineHeight: 1.3, color: activo ? colores.oroTexto : colores.texto,
              }}
            >
              {op.titulo}
            </button>
          )
        })}
      </div>
      {quienAnota === 'cada_equipo' && (
        <div style={{ fontSize: '13px', color: colores.texto2, marginTop: '8px', lineHeight: 1.4 }}>
          Al crear la ronda envías un link y cada equipo elige el suyo. Tú anotas el primero y cierras la ronda.
        </div>
      )}
    </div>
  )
}

const OPCIONES_DRIVES = [
  { valor: false, titulo: 'No' },
  { valor: true, titulo: 'Sí' },
] as const

/**
 * «¿Anotar drives?» (registro opcional, src/golf/formats/drives-scramble.ts). No viene elegido: sin tocarlo la
 * ronda es la de siempre. Con Sí, cada tarjeta pide los jugadores del equipo.
 */
function SelectorAnotarDrives({ anotarDrives, holes, onElegir }: { anotarDrives: boolean; holes: number; onElegir: (si: boolean) => void }) {
  const minimo = drivesMinimoPorJugador(holes)
  return (
    <div style={{ marginBottom: '16px' }}>
      <div id="equipos-club-drives" style={{ ...etiqueta, fontSize: '14px', color: colores.texto }}>¿Anotar drives?</div>
      <div role="group" aria-labelledby="equipos-club-drives" style={{ display: 'flex', gap: '8px' }}>
        {OPCIONES_DRIVES.map(op => {
          const activo = anotarDrives === op.valor
          return (
            <button
              key={op.titulo}
              type="button"
              aria-pressed={activo}
              onClick={() => onElegir(op.valor)}
              style={{
                ...opcion(activo), flex: 1, minHeight: '48px', padding: '12px', textAlign: 'center',
                fontSize: '14px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto,
              }}
            >
              {op.titulo}
            </button>
          )
        })}
      </div>
      {anotarDrives && (
        <div style={{ fontSize: '13px', color: colores.texto2, marginTop: '8px', lineHeight: 1.4 }}>
          En cada hoyo se anota de quién fue el drive.
          {minimo != null && <> Cada jugador necesita al menos {minimo}.</>}
        </div>
      )}
    </div>
  )
}

interface Props {
  equipos: EquipoDeClubDelFormulario[]
  /** Modo efectivo de la ronda: el hándicap del club solo se pide en neto. */
  modo: ModoJuego
  /** Hoyos de la ronda: deciden el máximo del hándicap. */
  holes: number
  puedeAgregar: boolean
  onAgregar: () => void
  onQuitar: (idx: number) => void
  onRenombrar: (idx: number, nombre: string) => void
  onHandicap: (idx: number, texto: string) => void
  anotarDrives: boolean
  onAnotarDrives: (si: boolean) => void
  onJugador: (idx: number, jugador: number, nombre: string) => void
}

/** «Solo equipos»: de 1 a 4 equipos, cada uno con su nombre y, en neto, el hándicap que le dio el club. */
export function EquiposDeClub(props: Props) {
  const esNeto = props.modo === 'neto'
  const maximo = handicapDeClubMaximo(props.holes)

  // Al agregar un equipo, el foco va a su nombre: con una mano, el teclado queda abierto donde se escribe.
  const nombres = useRef<Array<HTMLInputElement | null>>([])
  const cuantosAntes = useRef(props.equipos.length)
  useEffect(() => {
    if (props.equipos.length > cuantosAntes.current) nombres.current[props.equipos.length - 1]?.focus()
    cuantosAntes.current = props.equipos.length
  }, [props.equipos.length])

  return (
    <div>
      <div style={{ fontSize: '13px', color: colores.texto2, marginBottom: '12px', lineHeight: 1.4 }}>
        {/* Con 2 o más equipos lo dice la elección de quién anota (abajo). */}
        {props.equipos.length < 2 && <>Anotas el equipo desde tu celular.{' '}</>}
        {esNeto ? `El hándicap es el que les dio el club, de 0 a ${maximo}.` : 'Juegan gross, sin hándicap.'}
      </div>

      <SelectorAnotarDrives anotarDrives={props.anotarDrives} holes={props.holes} onElegir={props.onAnotarDrives} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {props.equipos.map((equipo, i) => {
          const visible = nombreVisibleDeEquipo(equipo.nombre, i)
          const idNombre = `equipo-club-nombre-${equipo.id}`
          const idHandicap = `equipo-club-hcp-${equipo.id}`
          // Escrito y fuera de rango (o con decimales): el borde lo marca; la frase la da el aviso bajo el botón.
          const invalido = esNeto && equipo.handicap.trim() !== ''
            && !esHandicapDeClubValido(handicapDeClubDesdeTexto(equipo.handicap), props.holes)
          return (
            <div
              key={equipo.id}
              style={{ border: `1px solid ${colores.borde}`, borderRadius: '12px', padding: '12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                <label htmlFor={idNombre} style={{ ...etiqueta, marginBottom: 0 }}>
                  Equipo {i + 1}
                </label>
                {props.equipos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => props.onQuitar(i)}
                    aria-label={`Quitar ${visible}`}
                    style={{
                      minHeight: '44px', minWidth: '44px', padding: '0 8px', margin: '-8px -4px -8px 0',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 500, color: colores.texto2,
                    }}
                  >
                    Quitar
                  </button>
                )}
              </div>

              <input
                id={idNombre}
                ref={el => { nombres.current[i] = el }}
                type="text"
                value={equipo.nombre}
                placeholder={nombreDeEquipo(i)}
                maxLength={NOMBRE_EQUIPO_MAX}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint={esNeto ? 'next' : 'done'}
                onChange={e => props.onRenombrar(i, e.target.value)}
                style={{ ...input, width: '100%', minHeight: '48px', fontSize: '16px' }}
              />

              {esNeto && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '12px' }}>
                  <label htmlFor={idHandicap} style={{ ...etiqueta, marginBottom: 0, fontSize: '14px', color: colores.texto }}>
                    Hándicap del equipo
                  </label>
                  <input
                    id={idHandicap}
                    // Con el nombre del equipo: con 3 o 4 tarjetas, el lector de pantalla dice de cuál es el campo.
                    aria-label={`Hándicap del equipo ${visible}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    enterKeyHint="done"
                    value={equipo.handicap}
                    placeholder={`0–${maximo}`}
                    aria-invalid={invalido || undefined}
                    aria-describedby={invalido ? 'paso-jugadores-aviso' : undefined}
                    onChange={e => props.onHandicap(i, e.target.value)}
                    className="num"
                    style={{
                      ...input, width: '96px', height: '56px', minHeight: '56px', padding: '0 12px',
                      fontSize: '18px', fontWeight: 600, textAlign: 'center',
                      ...(invalido ? inputQueBloquea : {}),
                    }}
                  />
                </div>
              )}

              {props.anotarDrives && (
                <fieldset style={{ border: 'none', padding: 0, margin: '12px 0 0' }}>
                  <legend style={{ ...etiqueta, padding: 0, fontSize: '14px', color: colores.texto }}>Jugadores</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {equipo.jugadores.map((nombre, j) => (
                      <input
                        key={j}
                        type="text"
                        value={nombre}
                        placeholder={`Jugador ${j + 1}`}
                        aria-label={`Jugador ${j + 1} de ${visible}`}
                        maxLength={NOMBRE_JUGADOR_DE_DRIVE_MAX}
                        autoComplete="off"
                        autoCapitalize="words"
                        enterKeyHint={j < equipo.jugadores.length - 1 ? 'next' : 'done'}
                        onChange={e => props.onJugador(i, j, e.target.value)}
                        style={{ ...input, width: '100%', minWidth: 0, minHeight: '48px', fontSize: '16px' }}
                      />
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          )
        })}
      </div>

      {props.puedeAgregar ? (
        <button
          type="button"
          onClick={props.onAgregar}
          style={{
            width: '100%', marginTop: '12px', minHeight: '56px', background: 'transparent',
            border: `1px dashed ${colores.oro}`, color: colores.oroTexto, borderRadius: '12px',
            cursor: 'pointer', fontSize: '16px', fontWeight: 600, textAlign: 'center',
          }}
        >
          + Agregar equipo
        </button>
      ) : (
        <div style={{ marginTop: '12px', fontSize: '13px', color: colores.texto2, textAlign: 'center' }}>
          {DETALLE_DEMASIADOS_EQUIPOS_DE_CLUB}
        </div>
      )}
    </div>
  )
}
