'use client'

import { useRef, useState } from 'react'
import { FORMAT_META, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { isTeamFormat } from '@/golf/formats'
import {
  EQUIPOS_MINIMOS,
  exigeLlevarElScoreDelGrupo,
  maxRivales,
  rivalesIniciales,
} from '@/golf/ronda-libre/plantilla-de-jugadores'
import type { MitadDeCancha } from '@/golf/ronda-libre/forma-de-la-ronda'
import type { RondaReciente } from '@/lib/data/ronda-libre-nueva'

export type PasoDelAsistente = 1 | 2 | 3 | 4

/** Identidad del creador dentro de un equipo. Nunca cambia. */
export const ID_DEL_CREADOR = 'creador'

export interface RivalDelCreador {
  /**
   * Identidad estable del rival, viva sólo en el formulario.
   *
   * Los equipos referencian jugadores POR ID y no por posición. La lista de
   * jugadores de la ronda se arma filtrando a los rivales sin nombre, así que
   * su longitud cambia con cada tecla: con posiciones, borrar el nombre de un
   * rival del medio movía a todos los de atrás y los equipos quedaban
   * apuntando a otra persona sin que nada lo dijera. En cancha eso es un
   * jugador puntuando para el equipo equivocado.
   */
  id: string
  tipo: 'cuenta' | 'invitado'
  nombre: string
  telefono: string
  handicap: number | null
  /** Tee propio. `null` = hereda el tee global de la ronda. */
  tees: string | null
  /** UUID del perfil Golfers+ si se vinculó con búsqueda. `null` = jugador manual. */
  profileId: string | null
}

export interface EquipoDeLaRonda {
  nombre: string
  /** Ids de los integrantes (`ID_DEL_CREADOR` o el id de un rival). */
  miembros: string[]
}

function equiposVacios(cantidad = EQUIPOS_MINIMOS): EquipoDeLaRonda[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    nombre: `Equipo ${i + 1}`,
    miembros: [],
  }))
}

/**
 * Modo con el que se puede jugar este formato. FUENTE ÚNICA de la coerción.
 *
 * `FORMAT_META.modosPermitidos` es la autoridad: Match Play sólo admite neto.
 * Se aplica al elegir formato Y al repetir una ronda anterior — si sólo se
 * aplicara en uno, repetir un Match Play viejo guardado como gross volvería a
 * meter el modo prohibido.
 */
function modoQuePermiteElFormato(formato: FormatoJuego, deseado: ModoJuego): ModoJuego {
  const permitidos = FORMAT_META[formato]?.modosPermitidos ?? []
  if (permitidos.length === 0 || permitidos.includes(deseado)) return deseado
  return permitidos[0]
}

function hoyDeChile(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Todo lo que el usuario elige en el asistente de nueva ronda, y las reglas que
 * acoplan una elección con otra.
 *
 * Las reglas viven acá y no repartidas por los `onClick` de la vista: elegir
 * Match Play tiene que crear el rival, y elegir 9 hoyos tiene que apagar el
 * shotgun, sin importar desde qué botón se llegó.
 */
export function useFormularioDeRonda() {
  const [paso, setPaso] = useState<PasoDelAsistente>(1)

  // Contador y no `crypto.randomUUID()`: el id sólo tiene que ser único dentro
  // de este formulario, y un contador da el mismo valor en el render del
  // servidor y en la hidratación.
  const ultimoId = useRef(0)
  const rivalVacio = (nombre = ''): RivalDelCreador => {
    ultimoId.current += 1
    return { id: `rival-${ultimoId.current}`, tipo: 'invitado', nombre, telefono: '', handicap: null, tees: null, profileId: null }
  }

  const [cancha, setCancha] = useState('')
  const [courseId, setCourseId] = useState<string | null>(null)
  const [tees, setTees] = useState('blanco')
  const [fecha, setFecha] = useState(hoyDeChile)

  const [formato, setFormatoState] = useState<FormatoJuego>('stroke_play')
  const [modo, setModo] = useState<ModoJuego>('gross')

  const [llevaElScoreDelGrupo, setLlevaElScoreDelGrupo] = useState(false)
  const [rivales, setRivales] = useState<RivalDelCreador[]>([])
  const [equipos, setEquipos] = useState<EquipoDeLaRonda[]>(equiposVacios)

  const [hoyosElegidos, setHoyosElegidos] = useState<9 | 18>(18)
  const [mitad, setMitad] = useState<MitadDeCancha>('front')
  const [shotgun, setShotgun] = useState(false)
  const [hoyoShotgun, setHoyoShotgun] = useState(1)

  const esFormatoDeEquipo = isTeamFormat(formato)

  /**
   * Cambiar de formato arrastra a los jugadores: Match Play necesita un rival,
   * los formatos por equipo necesitan tres, y Stableford necesita los índices,
   * que sólo se piden en el modo "yo llevo el score".
   */
  const elegirFormato = (nuevo: FormatoJuego) => {
    setFormatoState(nuevo)

    // El modo se ajusta a lo que el formato permite. Match Play sólo admite neto
    // (cultura de golf en Chile, alineado con R&A 32.1b para Stableford) y por
    // eso la pantalla le esconde el selector — pero esconderlo no cambiaba el
    // valor guardado: quien venía de una ronda en Gross creaba un Match Play
    // "gross", y el marcador no repartía la diferencia de handicap que la misma
    // pantalla le había anunciado.
    setModo(prev => modoQuePermiteElFormato(nuevo, prev))

    if (!exigeLlevarElScoreDelGrupo(nuevo)) return

    const necesarios = rivalesIniciales(nuevo)
    setLlevaElScoreDelGrupo(true)
    setRivales(prev => {
      // Los rivales que ya cargó el usuario NO se pisan: sólo se recortan si el
      // formato nuevo admite menos (pasar a Match Play desde una ronda de 4) y
      // se completan si admite más.
      const recortados = prev.slice(0, maxRivales(nuevo))
      const faltantes = Math.max(0, necesarios - recortados.length)
      return [...recortados, ...Array.from({ length: faltantes }, () => rivalVacio())]
    })
    if (isTeamFormat(nuevo)) setEquipos(equiposVacios())
  }

  const agregarRival = (nombre = '') => {
    setRivales(prev => (prev.length < maxRivales(formato) ? [...prev, rivalVacio(nombre)] : prev))
  }

  const actualizarRival = <K extends keyof RivalDelCreador>(
    idx: number,
    campo: K,
    valor: RivalDelCreador[K],
  ) => {
    setRivales(prev => prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)))
  }

  const quitarRival = (idx: number) => {
    const quitado = rivales[idx]
    setRivales(prev => prev.filter((_, i) => i !== idx))
    // Sacarlo de su equipo es una baja por ID: no hay posiciones que recalcular.
    if (!quitado) return
    setEquipos(prev =>
      prev.map(e => ({ ...e, miembros: e.miembros.filter(id => id !== quitado.id) })),
    )
  }

  const elegirModoDeScore = (grupo: boolean) => {
    setLlevaElScoreDelGrupo(grupo)
    setRivales(grupo ? [rivalVacio()] : [])
  }

  const elegirCancha = (nueva: { id: string | null; nombre: string }) => {
    setCancha(nueva.nombre)
    setCourseId(nueva.id)
  }

  const limpiarCancha = () => {
    setCancha('')
    setCourseId(null)
  }

  /**
   * Elegir 9 hoyos apaga el shotgun: el front/back ya define dónde se arranca, y
   * dejar los dos activos daba una ronda que empezaba en un hoyo fuera de la
   * mitad elegida.
   */
  const elegirHoyos = (n: 9 | 18) => {
    setHoyosElegidos(n)
    if (n === 9) {
      setMitad('front')
      setShotgun(false)
      setHoyoShotgun(1)
    } else if (!shotgun) {
      setHoyoShotgun(1)
    }
  }

  const elegirMitad = (nueva: MitadDeCancha) => setMitad(nueva)

  const alternarShotgun = () => {
    setShotgun(prev => {
      if (prev) setHoyoShotgun(1)
      return !prev
    })
  }

  /** Repite la configuración de una ronda anterior y salta a elegir la cancha. */
  const repetirRonda = (r: RondaReciente) => {
    setCancha(r.course_name)
    setCourseId(r.course_id)
    setTees(r.tees)
    elegirHoyos(r.holes === 9 ? 9 : 18)
    const formatoRepetido = (r.formato_juego as FormatoJuego) ?? 'stroke_play'
    if (r.formato_juego) elegirFormato(formatoRepetido)
    if (r.modo_juego) setModo(modoQuePermiteElFormato(formatoRepetido, r.modo_juego as ModoJuego))
    if (r.jugadores.length > 1) {
      setLlevaElScoreDelGrupo(true)
      setRivales(r.jugadores.slice(1, 1 + maxRivales(formatoRepetido)).map(n => rivalVacio(n)))
    }
    setPaso(2)
  }

  /** Rivales con nombre cargado — los únicos que llegan a la ronda. */
  const rivalesConNombre = rivales.filter(r => r.nombre.trim())

  return {
    paso, setPaso,
    cancha, courseId, elegirCancha, limpiarCancha,
    tees, setTees,
    fecha, setFecha,
    formato, elegirFormato, esFormatoDeEquipo,
    modo, setModo,
    llevaElScoreDelGrupo, elegirModoDeScore,
    rivales, rivalesConNombre, agregarRival, actualizarRival, quitarRival,
    repetirRonda,
    equipos, setEquipos,
    hoyosElegidos, elegirHoyos,
    mitad, elegirMitad,
    shotgun, alternarShotgun, hoyoShotgun, setHoyoShotgun,
  }
}

export type FormularioDeRonda = ReturnType<typeof useFormularioDeRonda>
