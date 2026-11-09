'use client'

import { useRef, useState } from 'react'
import { FORMAT_META, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { isTeamFormat } from '@/golf/formats'
import {
  exigeLlevarElScoreDelGrupo,
  jugadoresPorEquipo,
  maxRivales,
  puedeSumarCompanero,
  puedeSumarEquipo,
  rivalesIniciales,
} from '@/golf/ronda-libre/plantilla-de-jugadores'
import type { MitadDeCancha } from '@/golf/ronda-libre/forma-de-la-ronda'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import type { RondaReciente } from '@/lib/data/ronda-libre-nueva'
import { modoPermitidoPorPlan, netoBloqueadoPorPlan } from '@/golf/billing/modo-por-plan'
import type { NetoFeature } from '@/golf/billing/plans'
import { useAccesoNeto } from '@/hooks/useAccesoNeto'
import {
  equiposSirvenPara,
  nombreDeEquipo,
  repartirEnEquipos,
  type EquipoDeLaRonda,
} from './equipos-del-formulario'

export type { EquipoDeLaRonda } from './equipos-del-formulario'

/** 1 Cancha · 2 Formato · 3 Jugadores · 4 Confirmar. */
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

/**
 * Modo que admite el formato según las reglas de golf
 * (`FORMAT_META.modosPermitidos`). Hoy todos admiten gross y neto; el gate de
 * PLAN (neto Pro) es otra regla y vive en `modoPermitidoPorPlan`.
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

/** Lo que se puede precargar de un rival (un jugador reciente, una ronda repetida). */
export type DatosDeRival = Partial<Pick<RivalDelCreador, 'nombre' | 'handicap' | 'tees'>>

/** Tarjeta de rival sin nada cargado. */
export function esRivalEnBlanco(r: RivalDelCreador): boolean {
  return !r.nombre.trim() && r.handicap == null && !r.telefono.trim() && !r.profileId
}

/**
 * Todo lo que el usuario elige en el asistente de nueva ronda, y las reglas que
 * acoplan una elección con otra.
 *
 * Las reglas viven acá y no repartidas por los `onClick` de la vista: elegir
 * Match Play tiene que crear el rival, elegir Scramble tiene que armar el
 * equipo, volver a Stroke Play tiene que deshacerlo, y elegir 9 hoyos tiene que
 * apagar el shotgun, sin importar desde qué botón se llegó.
 *
 * Quién anota NO se pregunta al entrar: se deriva. Un formato que necesita a
 * más de una persona (equipos, Match Play, Stableford) se anota desde un solo
 * celular; en Stroke Play el usuario elige entre "cada uno en su celular" y
 * "yo anoto por todos" recién cuando suma gente. Antes la pregunta era el paso
 * 1 y elegir Scramble después la respondía por el usuario sin avisar; al volver
 * a Stroke Play la respuesta forzada quedaba pegada y la ronda nacía en el
 * scorer de grupo con una sola persona (R4794T, 07-nov-2026).
 */
export function useFormularioDeRonda() {
  const [paso, setPaso] = useState<PasoDelAsistente>(1)

  // Contador y no `crypto.randomUUID()`: el id sólo tiene que ser único dentro
  // de este formulario, y un contador da el mismo valor en el render del
  // servidor y en la hidratación.
  const ultimoId = useRef(0)
  const rivalVacio = (base: DatosDeRival = {}): RivalDelCreador => {
    ultimoId.current += 1
    return {
      id: `rival-${ultimoId.current}`, tipo: 'invitado',
      nombre: base.nombre ?? '', telefono: '',
      handicap: base.handicap ?? null, tees: base.tees ?? null, profileId: null,
    }
  }
  const rivalesEnBlanco = (cantidad: number) => Array.from({ length: cantidad }, () => rivalVacio())

  const [cancha, setCancha] = useState('')
  const [courseId, setCourseId] = useState<string | null>(null)
  const [tees, setTees] = useState('blanco')
  const [fecha, setFecha] = useState(hoyDeChile)

  const [formato, setFormatoState] = useState<FormatoJuego>('stroke_play')
  // Lo que el usuario PIDIÓ (botón o ronda repetida). El modo que se muestra y
  // se manda al servidor es `modo`, derivado abajo: nunca queda seleccionado
  // un valor que el formato o el plan no permiten.
  const [modoElegido, setModo] = useState<ModoJuego>('gross')
  const accesoNeto = useAccesoNeto()

  // La respuesta del usuario a "¿quién anota?", que sólo existe en los formatos
  // que no la deciden solos. Se conserva al pasar por Scramble y volver.
  const [anotaPorTodos, setAnotaPorTodos] = useState(false)
  const [rivales, setRivales] = useState<RivalDelCreador[]>([])
  const [equipos, setEquipos] = useState<EquipoDeLaRonda[]>([])

  const [hoyosElegidos, setHoyosElegidos] = useState<9 | 18>(18)
  const [mitad, setMitad] = useState<MitadDeCancha>('front')
  const [shotgun, setShotgun] = useState(false)
  const [hoyoShotgun, setHoyoShotgun] = useState(1)

  const esFormatoDeEquipo = isTeamFormat(formato)
  /** El formato decide solo que se anota desde un celular; no hay nada que preguntar. */
  const preguntaQuienAnota = !exigeLlevarElScoreDelGrupo(formato)
  /** Modo de score EFECTIVO: el que va a la API (`admin_mode`) y elige el scorer. */
  const llevaElScoreDelGrupo = !preguntaQuienAnota || anotaPorTodos
  /** Los rivales que van a la ronda. En "cada uno en su celular" no va ninguno: se unen por el link. */
  const rivalesEnJuego = llevaElScoreDelGrupo ? rivales : []
  const totalJugadores = 1 + rivales.length

  // Mientras el plan carga (o no se puede leer, sin señal) no se bloquea nada:
  // el servidor es la autoridad y responde 403 si no corresponde. Bloquear a
  // ciegas le cambiaría a gross el match de un Pro parado en el tee 1.
  const planPermite = (feature: NetoFeature) => accesoNeto.loading || accesoNeto.puedeUsar(feature)
  const modo: ModoJuego = modoPermitidoPorPlan(formato, modoQuePermiteElFormato(formato, modoElegido), planPermite)
  /** El botón Neto del formato actual pide plan Pro. */
  const netoBloqueado = netoBloqueadoPorPlan(formato, planPermite)

  /**
   * Deja a los rivales y a los equipos como los pide `nuevo`, partiendo de
   * `base` (los rivales que ya había). Es la única función que arma equipos.
   *
   * - Formato por equipos: completa al compañero que falte y reparte a todos
   *   en equipos; si los equipos que había siguen sirviendo, los conserva.
   * - Formato individual: deshace los equipos y descarta las tarjetas en
   *   blanco que un formato de equipo haya abierto. Si quedan rivales con
   *   nombre al salir de un formato de equipo, el usuario los escribió:
   *   siguen a la vista en "yo anoto por todos" en vez de desaparecer.
   */
  const acomodarAlFormato = (nuevo: FormatoJuego, base: RivalDelCreador[], anterior: FormatoJuego) => {
    let siguientes = base.slice(0, maxRivales(nuevo))

    if (isTeamFormat(nuevo)) {
      const porEquipo = jugadoresPorEquipo(nuevo)!
      siguientes = [...siguientes, ...rivalesEnBlanco(Math.max(0, porEquipo.min - 1 - siguientes.length))]
      const ids = [ID_DEL_CREADOR, ...siguientes.map(r => r.id)]
      setEquipos(prev => (equiposSirvenPara(nuevo, prev, ids) ? prev : repartirEnEquipos(nuevo, ids, prev)))
    } else {
      if (isTeamFormat(anterior)) {
        siguientes = siguientes.filter(r => !esRivalEnBlanco(r))
        if (siguientes.length > 0) setAnotaPorTodos(true)
      }
      siguientes = [...siguientes, ...rivalesEnBlanco(Math.max(0, rivalesIniciales(nuevo) - siguientes.length))]
      setEquipos([])
    }

    setFormatoState(nuevo)
    setRivales(siguientes)
  }

  const elegirFormato = (nuevo: FormatoJuego) => {
    // El modo NO se toca acá: `modo` se deriva del formato y del plan en cada
    // render. Antes se conservaba el modo previo y un free que venía de Stroke
    // Play Neto quedaba con un Match Play Neto bloqueado y sin botón activo.
    acomodarAlFormato(nuevo, rivales, formato)
  }

  /**
   * Suma un jugador. Si ya hay una tarjeta en blanco (la que se abre sola al
   * elegir un formato que necesita gente), un jugador reciente la ocupa en vez
   * de dejarla vacía arriba y agregar otra abajo. En un formato por equipos el
   * nuevo entra al equipo pedido o, si no se pide ninguno, al primero con cupo.
   */
  const agregarRival = (base: DatosDeRival = {}, equipoIdx?: number) => {
    const enBlanco = base.nombre ? rivales.findIndex(esRivalEnBlanco) : -1
    if (enBlanco >= 0) {
      const nuevo = rivalVacio(base)
      setRivales(prev => prev.map((r, i) => (i === enBlanco ? { ...nuevo, id: r.id } : r)))
      return
    }
    if (rivales.length >= maxRivales(formato)) return

    let destino = -1
    if (esFormatoDeEquipo) {
      destino = equipoIdx ?? equipos.findIndex(e => puedeSumarCompanero(formato, e.miembros.length, totalJugadores))
      if (destino < 0 || !puedeSumarCompanero(formato, equipos[destino]?.miembros.length ?? 0, totalJugadores)) return
    }

    const nuevo = rivalVacio(base)
    setRivales(prev => [...prev, nuevo])
    if (destino >= 0) {
      setEquipos(prev => prev.map((e, i) => (i === destino ? { ...e, miembros: [...e.miembros, nuevo.id] } : e)))
    }
  }

  const actualizarRival = <K extends keyof RivalDelCreador>(
    idx: number,
    campo: K,
    valor: RivalDelCreador[K],
  ) => {
    setRivales(prev => prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)))
  }

  /**
   * Quita a un rival. Sacarlo de su equipo es una baja por ID: no hay
   * posiciones que recalcular. Un equipo rival que queda vacío desaparece; el
   * primero (el del creador) queda y la validación pide el compañero.
   */
  const quitarRival = (idx: number) => {
    const quitado = rivales[idx]
    setRivales(prev => prev.filter((_, i) => i !== idx))
    if (!quitado) return
    setEquipos(prev =>
      prev
        .map(e => ({ ...e, miembros: e.miembros.filter(id => id !== quitado.id) }))
        .filter((e, i) => i === 0 || e.miembros.length > 0),
    )
  }

  /** Abre un equipo rival con sus tarjetas en blanco. */
  const agregarEquipoRival = () => {
    const porEquipo = jugadoresPorEquipo(formato)
    if (!porEquipo || !puedeSumarEquipo(formato, equipos.length, totalJugadores)) return
    const nuevos = rivalesEnBlanco(porEquipo.min)
    setRivales(prev => [...prev, ...nuevos])
    setEquipos(prev => [...prev, { nombre: nombreDeEquipo(prev.length), miembros: nuevos.map(r => r.id) }])
  }

  /**
   * Quita un equipo rival con toda su gente. El primer equipo no se quita, y el
   * creador nunca sale de la ronda: si se había movido al equipo que se quita,
   * vuelve al primero.
   */
  const quitarEquipo = (equipoIdx: number) => {
    const equipo = equipos[equipoIdx]
    if (equipoIdx === 0 || !equipo) return
    const ids = new Set(equipo.miembros.filter(id => id !== ID_DEL_CREADOR))
    const traeAlCreador = equipo.miembros.includes(ID_DEL_CREADOR)
    setRivales(prev => prev.filter(r => !ids.has(r.id)))
    setEquipos(prev =>
      prev
        .filter((_, i) => i !== equipoIdx)
        .map((e, i) => (i === 0 && traeAlCreador ? { ...e, miembros: [ID_DEL_CREADOR, ...e.miembros] } : e)),
    )
  }

  const renombrarEquipo = (equipoIdx: number, nombre: string) => {
    setEquipos(prev => prev.map((e, i) => (i === equipoIdx ? { ...e, nombre } : e)))
  }

  /**
   * Cambia a un jugador de equipo (corregir el reparto automático). El creador
   * también se puede mover: la identidad del equipo no depende de quién esté.
   * No entra a un equipo que ya está en su tope, y un equipo rival que queda
   * vacío desaparece (igual que al quitar a su último integrante).
   */
  const moverAlEquipo = (id: string, equipoIdx: number) => {
    const destino = equipos[equipoIdx]
    const porEquipo = jugadoresPorEquipo(formato)
    if (!destino || !porEquipo || destino.miembros.includes(id) || destino.miembros.length >= porEquipo.max) return
    setEquipos(prev =>
      prev
        .map((e, i) => ({
          ...e,
          miembros: i === equipoIdx ? [...e.miembros, id] : e.miembros.filter(m => m !== id),
        }))
        .filter((e, i) => i === 0 || e.miembros.length > 0),
    )
  }

  /**
   * "¿Quién anota?" en los formatos que lo preguntan. "Yo anoto por todos"
   * abre la primera tarjeta de rival; "cada uno en su celular" cierra las que
   * siguen en blanco y guarda las escritas por si vuelve a cambiar de idea.
   */
  const elegirQuienAnota = (porTodos: boolean) => {
    setAnotaPorTodos(porTodos)
    if (porTodos) {
      if (rivales.length === 0) setRivales([rivalVacio()])
    } else {
      setRivales(prev => prev.filter(r => !esRivalEnBlanco(r)))
    }
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

  /**
   * Repite la configuración de una ronda anterior (cancha, tees, hoyos, formato,
   * modo y gente) y salta a los jugadores: ahí se revisan índices y tees.
   */
  const repetirRonda = (r: RondaReciente) => {
    setCancha(r.course_name)
    setCourseId(r.course_id)
    setTees(r.tees)
    elegirHoyos(r.holes === 9 ? 9 : 18)
    const formatoRepetido = (r.formato_juego as FormatoJuego) ?? 'stroke_play'
    // Se guarda lo pedido; `modo` le aplica formato y plan (un Match Play
    // Neto viejo, repetido por alguien sin Pro, queda en Gross a la vista).
    if (r.modo_juego === 'gross' || r.modo_juego === 'neto') setModo(r.modo_juego)
    // Se excluye al creador por identidad, no por posición: el orden de los
    // jugadores que devuelve la base no está garantizado.
    const traidos = r.jugadores
      .filter(j => !j.esCreador)
      .map(j => rivalVacio({ nombre: j.nombre, handicap: j.handicap, tees: j.tees }))
    setAnotaPorTodos(traidos.length > 0)
    acomodarAlFormato(formatoRepetido, traidos, formato)
    setPaso(3)
  }

  /** Rivales con nombre cargado — los únicos que llegan a la ronda. */
  const rivalesConNombre = rivalesEnJuego.filter(r => r.nombre.trim())

  // Una tarjeta sin nombre dentro de un equipo: a la ronda viaja sólo la gente con
  // nombre, así que el validador vería un equipo incompleto y diría "asigna a un
  // equipo" cuando el usuario no asigna nada; lo que falta es escribir el nombre.
  const sinNombreEnEquipos = esFormatoDeEquipo
    ? rivalesEnJuego.filter(r => !r.nombre.trim() && equipos.some(e => e.miembros.includes(r.id))).length
    : 0
  const problemaDelFormulario: ProblemaDeLaRonda | null = sinNombreEnEquipos > 0
    ? {
        titulo: 'Falta un nombre',
        detalle: sinNombreEnEquipos === 1
          ? 'Escribe el nombre del jugador que falta.'
          : `Escribe el nombre de los ${sinNombreEnEquipos} jugadores que faltan.`,
      }
    : null

  return {
    paso, setPaso,
    cancha, courseId, elegirCancha, limpiarCancha,
    tees, setTees,
    fecha, setFecha,
    formato, elegirFormato, esFormatoDeEquipo,
    modo, setModo, netoBloqueado,
    llevaElScoreDelGrupo, preguntaQuienAnota, anotaPorTodos, elegirQuienAnota,
    rivales, rivalesEnJuego, rivalesConNombre, agregarRival, actualizarRival, quitarRival,
    problemaDelFormulario,
    repetirRonda,
    equipos, agregarEquipoRival, quitarEquipo, renombrarEquipo, moverAlEquipo,
    hoyosElegidos, elegirHoyos,
    mitad, elegirMitad,
    shotgun, alternarShotgun, hoyoShotgun, setHoyoShotgun,
  }
}

export type FormularioDeRonda = ReturnType<typeof useFormularioDeRonda>
