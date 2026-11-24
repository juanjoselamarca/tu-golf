'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { esRondaCerrada } from '@/lib/data/ronda-libre-estado'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { isSharedBallFormat, isTeamFormat } from '@/golf/formats'
import { esFormatoPersonalizado } from '@/golf/formats/personalizado'
import { anotaLaRonda } from '@/golf/ronda-libre/permisos'
import { entradaAlScorerDeEquipos, equiposDeOtroCelular, equiposQueAnota, unCelularPorEquipo } from '@/golf/ronda-libre/anotador-de-equipo'
import { MENSAJE_YA_NO_ANOTAS } from '@/lib/data/ronda-libre-anotador'
import { addToast } from '@/hooks/useToast'
import { tarjetaAlDiaEnHoyo } from '@/golf/ronda-libre/hoyos-sin-rellenar'
import { hoyoParaRetomar, hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import {
  fetchRondaLibreParaScorer,
  cargarHoyosDelScorer,
  resolverHandicapsDelScorer,
  fetchEquiposDelScorer,
  tarjetasDesdeLaRonda,
  MENSAJE_SCORER_SIN_CONEXION,
  PLAZO_CARGA_SCORER_MS,
  REINTENTO_CARGA_MS,
  type EquipoDelScorer,
} from '@/lib/data/ronda-libre-scorer'
import { sesionDelScorer } from '@/lib/auth/sesion-del-scorer'
import {
  loadGroupScores,
  loadGroupTeamScores,
  leerPendientes,
  leerRechazados,
  ID_PENDIENTE_EQUIPO,
  saveScorerGrupoSnapshot,
  loadScorerGrupoSnapshot,
  clearScorerGrupoSnapshot,
  type ScorerGrupoSnapshot,
  limpiarCopiaLocalDeRonda,
} from '@/lib/ronda/score-storage'
import { useRefreshOnResume } from '@/hooks/ronda/useRefreshOnResume'
import type { HoleData, RondaLibre } from '@/types/ronda'
import { conOrdenEnPantalla } from '@/lib/ronda/orden-jugadores'
import { loginUrl } from '@/lib/auth/login-url'
import { leerIndicesDelCliente } from '@/lib/data/indices-de-perfil-lectura'
import { conPlazoCancelable, LecturaCanceladaError } from '@/lib/red/con-timeout'
import { clienteConSenal } from '@/lib/red/cliente-con-senal'

/**
 * Estado de la conexión del scorer con el servidor.
 * - `ok`           → datos frescos del servidor.
 * - `sin_conexion` → el servidor no responde: se anota desde la copia local y se reintenta solo.
 * - `sin_sesion`   → la sesión venció/no existe: se anota local; enviar requiere iniciar sesión.
 */
export type ConexionScorer = 'ok' | 'sin_conexion' | 'sin_sesion'


export interface RondaGrupoData {
  ronda: RondaLibre | null
  loading: boolean
  loadError: string | null
  currentHole: number
  setCurrentHole: React.Dispatch<React.SetStateAction<number>>
  scores: Record<string, Record<number, number>>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  /** Course handicap que PUNTÚA (en 9h, la mitad). */
  playerHcp: Record<string, number>
  /** El HCP que se MUESTRA: siempre en escala de 18 hoyos, aunque se jueguen 9. */
  playerDisplayHcp: Record<string, number>
  teamEquipos: EquipoDelScorer[]
  setTeamEquipos: React.Dispatch<React.SetStateAction<EquipoDelScorer[]>>
  /** Quién anota: su nombre en la ronda, o el prefijo del email. */
  anotadorNombre: string
  /** Usuario autenticado que abrió el scorer. */
  authUserId: string | null
  /** ¿El scorer está hablando con el servidor? (caída 04-oct-2026) */
  conexion: ConexionScorer
  /** Hay golpes PENDIENTES de confirmar en el teléfono (p.ej. se recargó en plena caída): enviarlos. */
  golpesSinSubir: boolean
  /** Un celular por equipo (`unCelularPorEquipo`): `teamEquipos` son solo los de este celular. */
  unCelularPorEquipo: boolean
  /** Un celular por equipo: los equipos que anota otro celular (la franja «lo anota Pedro»; nunca se tocan). */
  equiposDeOtroCelular: EquipoDelScorer[]
  /** Este celular todavía no anota ningún equipo: tiene que elegir uno (`ElegirEquipo`). */
  eleccion: { ronda: RondaLibre; equipos: EquipoDelScorer[] } | null
  /** Vuelve a leer la ronda y quién anota qué (tras reclamar o liberar un equipo, o si el servidor rechazó uno). */
  recargar: () => Promise<void>
  /** Igual que `recargar`, tras «Dejar este equipo»: vuelve a elegir equipo sin el aviso «Ya no anotas». */
  recargarTrasDejarEquipo: () => Promise<void>
}

type Carga =
  | { tipo: 'ok'; ronda: RondaLibre; userId: string; email: string | null; snap: Omit<ScorerGrupoSnapshot, 'v'> }
  | { tipo: 'redirigir'; a: string; reemplazar: boolean }
  | { tipo: 'elegir_equipo'; ronda: RondaLibre; equipos: EquipoDelScorer[] }
  | { tipo: 'sin_conexion'; userId: string | null }
  | { tipo: 'sin_sesion' }
  /** La vuelta se canceló (pantalla desmontada o `codigo` nuevo): lo leído no se aplica. */
  | { tipo: 'cancelada' }

/** Pendientes vienen con claves string (JSON): a hoyo numérico. */
function numerico(golpes: Record<string, number> | undefined): Record<number, number> {
  return Object.fromEntries(Object.entries(golpes ?? {}).map(([h, v]) => [Number(h), v]))
}

/**
 * Hoyo en que se abre el scorer (`hoyoParaRetomar`): el primero que le falte a alguna
 * tarjeta, las de los jugadores o, en bola compartida (scramble/foursome, sin golpes
 * propios), las de los equipos. Con todas llenas, el último, donde está Finalizar.
 * Timba libre: con `retiros`, los hoyos de un retirado no le faltan (`tarjetaAlDiaEnHoyo`).
 */
export function hoyoInicial(
  r: RondaLibre,
  scores: Record<string, Record<number, number>>,
  equipos: ReadonlyArray<{ scores: Record<string, number> }> = [],
  retiros?: Readonly<Record<string, number>>,
): number {
  const orden = hoyosDeLaRonda(r.hoyo_inicio ?? 1, r.holes)
  if (isSharedBallFormat(r.formato_juego)) {
    if (equipos.length === 0) return orden[0] ?? 1
    return hoyoParaRetomar(orden, h => equipos.every(e => e.scores[String(h)] != null))
  }
  const jugadores = r.ronda_libre_jugadores
  if (jugadores.length === 0) return orden[0] ?? 1
  return hoyoParaRetomar(orden, h => jugadores.every(j => tarjetaAlDiaEnHoyo(scores[j.id], j.id, h, retiros, orden)))
}

/**
 * Lee del servidor todo lo que el scorer necesita. Nunca lanza: una falla de red,
 * 5xx o timeout vuelve como `sin_conexion` (jamás como "la ronda no existe").
 * Cada lectura espera a lo más `PLAZO_CARGA_SCORER_MS` (la sesión y la ronda traen el suyo): una colgada dejaba el
 * scorer en "Cargando…" para siempre, sin copia local ni reintento (la carga en vuelo bloquea las siguientes).
 * Al vencer, la lectura se CANCELA (`conPlazoCancelable` + `clienteConSenal`: la señal llega al fetch), y `signal` (la
 * de la vuelta) corta todo lo que falte: con la vuelta cancelada devuelve `cancelada` y no toca nada (ni la copia
 * local de una ronda "borrada").
 */
async function cargarDelServidor(codigo: string, signal: AbortSignal): Promise<Carga> {
  const supabase = createClient()
  /** Un paso de la lectura: su plazo propio, cancelable, con el cliente que lleva la señal al fetch. */
  const paso = <T,>(leer: (cliente: typeof supabase) => PromiseLike<T>) =>
    conPlazoCancelable(s => leer(clienteConSenal(supabase, s)), PLAZO_CARGA_SCORER_MS, { signal })
  const sesion = await sesionDelScorer(supabase)
  if (signal.aborted) return { tipo: 'cancelada' }
  if (sesion.estado === 'sin_sesion') return { tipo: 'sin_sesion' }
  if (sesion.estado === 'sin_conexion') return { tipo: 'sin_conexion', userId: null }
  const userId = sesion.userId

  // Con sesión ya confirmada: puede pedir `reglas_juego` (el orden del juego de una Timba; anon no la lee).
  const carga = await fetchRondaLibreParaScorer(supabase, codigo, { conReglasDelJuego: true, signal })
  if (signal.aborted) return { tipo: 'cancelada' }
  // Ronda borrada (PGRST116, confirmado por el servidor): su copia local ya no tiene dónde subirse.
  if (carga.estado === 'no_existe') { limpiarCopiaLocalDeRonda(codigo); return { tipo: 'redirigir', a: '/dashboard', reemplazar: false } }
  if (carga.estado === 'sin_conexion') return { tipo: 'sin_conexion', userId }
  const r = carga.ronda

  // Team formats MUST use score-grupo (individual scoring doesn't support them).
  // Non-team rounds require admin_mode + matching admin user (`anotaLaRonda`, la misma regla que usa /score).
  // Timba libre: quien no anota va a la ronda en vivo (el individual nunca se usa en una Timba).
  if (!isTeamFormat(r.formato_juego) && !anotaLaRonda(r, userId)) {
    const a = esFormatoPersonalizado(r.formato_juego) ? `/ronda-libre/${codigo}` : `/ronda-libre/${codigo}/score`
    return { tipo: 'redirigir', a, reemplazar: true }
  }
  // Demo rondas son spectator-only (misma regla que /score); finalizada → vista de resultados.
  if (r.es_demo || esRondaCerrada(r.estado)) {
    return { tipo: 'redirigir', a: `/ronda-libre/${codigo}`, reemplazar: true }
  }

  try {
    // scramble/foursome usan equipo.scores (compartido); best_ball lee la
    // membresía (jugadorIds) y agrupa los scores INDIVIDUALES por equipo.
    const equipos = await paso(c => fetchEquiposDelScorer(c, r))
    // Formatos por equipo: quién entra lo decide `entradaAlScorerDeEquipos` (un celular por equipo: elegir equipo;
    // un celular: solo quien puede anotar la ronda; el resto, a la ronda en vivo).
    if (isTeamFormat(r.formato_juego)) {
      const entrada = entradaAlScorerDeEquipos(r, equipos, userId)
      if (entrada === 'en_vivo') return { tipo: 'redirigir', a: `/ronda-libre/${codigo}`, reemplazar: true }
      if (entrada === 'elegir_equipo') return { tipo: 'elegir_equipo', ronda: r, equipos }
    }
    const hoyos = await paso(c => cargarHoyosDelScorer(c, r))
    // El scorer de grupo exige sesión (arriba): `profiles` es legible.
    const { hcpMap, displayMap } = await paso(c => resolverHandicapsDelScorer(c, r, hoyos.finalParTotal, leerIndicesDelCliente(c)))
    if (signal.aborted) return { tipo: 'cancelada' }
    // UN solo filtro: este celular carga solo los equipos que anota. Todo lo que manda golpes (par al pasar de hoyo,
    // completar al finalizar, pendientes, hoyo inicial, copia local) parte de esta lista: nunca toca un equipo de
    // otro celular. En una ronda de un celular son todos.
    const teamEquipos = equiposQueAnota(r, equipos, userId)
    // Identidad del anotador: su nombre en la ronda; si no juega, el prefijo del email.
    const anotadorNombre = r.ronda_libre_jugadores.find(j => j.user_id === userId)?.nombre
      || (sesion.email ? sesion.email.split('@')[0] : '')
      || 'Anotador'
    return {
      tipo: 'ok', ronda: r, userId, email: sesion.email,
      snap: {
        at: Date.now(), authUserId: userId, anotadorNombre, ronda: r,
        parMap: hoyos.parMap, holeDataMap: hoyos.holeDataMap,
        playerHcp: hcpMap, playerDisplayHcp: displayMap, teamEquipos,
        equiposDeOtroCelular: equiposDeOtroCelular(r, equipos, userId),
        unCelularPorEquipo: unCelularPorEquipo(r, equipos),
      },
    }
  } catch (err) {
    // Cancelarla no es una falla: no se reporta ni se aplica.
    if (err instanceof LecturaCanceladaError || signal.aborted) return { tipo: 'cancelada' }
    captureError(err instanceof Error ? err : new Error(String(err)), { context: 'score_grupo_load', level: 'warning' })
    return { tipo: 'sin_conexion', userId }
  }
}

/**
 * Carga de la ronda para el scorer de GRUPO / admin: quién puede entrar
 * (formatos por equipo: cualquier jugador de la ronda; el resto: sólo el
 * admin), la ronda con tarjetas (BD + respaldo local del grupo), par/SI/
 * yardaje por hoyo, course handicaps y equipos — todo por la capa de datos
 * compartida con el scorer individual (`@/lib/data/ronda-libre-scorer`).
 *
 * Resiliencia (caída del 04-oct-2026, torneo Los Leones): una falla pasajera del
 * servidor NUNCA saca al marcador de su ronda. Si no responde, el scorer abre
 * desde la copia local (`saveScorerGrupoSnapshot`), anota en el teléfono y
 * reintenta solo cada 15 s y al volver a la app. Al reconectar se refrescan los
 * datos de la ronda SIN pisar los golpes locales (los envía useGrupoScoreSave).
 */
export function useRondaGrupoData(codigo: string): RondaGrupoData {
  const router = useRouter()

  const [ronda, setRonda] = useState<RondaLibre | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({})
  const [parMap, setParMap] = useState<Record<number, number>>({})
  const [holeDataMap, setHoleDataMap] = useState<Record<number, HoleData>>({})
  const [playerHcp, setPlayerHcp] = useState<Record<string, number>>({})
  const [playerDisplayHcp, setPlayerDisplayHcp] = useState<Record<string, number>>({})
  const [teamEquipos, setTeamEquipos] = useState<EquipoDelScorer[]>([])
  const [anotadorNombre, setAnotadorNombre] = useState<string>('')
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [conexion, setConexion] = useState<ConexionScorer>('ok')
  const [golpesSinSubir, setGolpesSinSubir] = useState(false)
  const [unCelular, setUnCelular] = useState(false)
  const [ajenos, setAjenos] = useState<EquipoDelScorer[]>([])
  const [eleccion, setEleccion] = useState<RondaGrupoData['eleccion']>(null)

  /** ¿Ya hay una ronda en pantalla? (la recarga de fondo no toca golpes ni hoyo) */
  const cargadaRef = useRef(false)
  /**
   * La corrida de lecturas en vuelo (una o más vueltas). Quien pide leer mientras hay una recibe ESTA promesa, que no
   * se resuelve hasta la vuelta que atiende su pedido: `useAnotadorDeEquipo` espera la lista de verdad nueva tras
   * reclamar o liberar, no una lectura que salió antes (revisión Fable).
   */
  const enVueloRef = useRef<Promise<void> | null>(null)
  /** La vuelta de lectura en curso: se aborta al desmontar o con un `codigo` nuevo. */
  const vueltaRef = useRef<AbortController | null>(null)
  /** Se pidió leer mientras otra lectura iba en vuelo (p. ej. justo después de reclamar o liberar): una vuelta más. */
  const otraVueltaRef = useRef(false)
  /** Un bug determinista se repetiría en cada reintento: solo el primero va como error, el resto como warning. */
  const errorDeLecturaReportadoRef = useRef(false)
  /** «Elige tu equipo» en pantalla: sin señal, la lista se queda (no la pantalla de sin conexión). */
  const eligiendoRef = useRef(false)
  /** Este celular soltó su equipo a propósito: la vuelta a «Elige tu equipo» no avisa «Ya no anotas». */
  const dejoElEquipoRef = useRef(false)
  /** Los equipos que este celular tiene en pantalla: al releer, uno que ya no es suyo se avisa. */
  const idsEnPantallaRef = useRef<string[]>([])
  useEffect(() => { idsEnPantallaRef.current = teamEquipos.map(e => e.id) }, [teamEquipos])

  const aplicarMetadatos = useCallback((s: Omit<ScorerGrupoSnapshot, 'v'>) => {
    const nueva = s.ronda as RondaLibre
    // Ya en pantalla: las filas no se mueven bajo el dedo (una copia local de antes del orden del juego abre en el
    // canónico y el servidor trae el del juego). Mismos jugadores → se conserva el orden en pantalla.
    setRonda(prev => cargadaRef.current && prev ? conOrdenEnPantalla(prev, nueva) : nueva)
    setParMap(s.parMap)
    setHoleDataMap(s.holeDataMap as Record<number, HoleData>)
    setPlayerHcp(s.playerHcp)
    setPlayerDisplayHcp(s.playerDisplayHcp)
    // Ya en pantalla (refresco de fondo): los golpes de equipo en pantalla NO se pisan.
    const equipos = s.teamEquipos as EquipoDelScorer[]
    if (cargadaRef.current) {
      setTeamEquipos(prev => {
        const enPantalla = new Map(prev.map(e => [e.id, e.scores]))
        return equipos.map(eq => ({ ...eq, scores: { ...eq.scores, ...(enPantalla.get(eq.id) ?? {}) } }))
      })
    } else {
      setTeamEquipos(equipos)
    }
    setAnotadorNombre(s.anotadorNombre)
    setAuthUserId(s.authUserId)
    setUnCelular(!!s.unCelularPorEquipo)
    setAjenos((s.equiposDeOtroCelular ?? []) as EquipoDelScorer[])
  }, [])

  /**
   * Primera pintura de los golpes: tarjetas de la ronda + respaldo local (`localGana`: abierto
   * sin servidor, lo local es lo más nuevo) y, SIEMPRE por encima, los golpes PENDIENTES de
   * confirmar — una corrección hecha sin señal nunca la pisa la BD (revisión Fable).
   */
  const pintarPrimeraVez = useCallback((r: RondaLibre, localGana: boolean, equipos: EquipoDelScorer[]) => {
    const cached = loadGroupScores(codigo)
    const pend = leerPendientes(codigo)
    // Tarjetas que el servidor rechazó en firme: sus golpes se muestran (para revisarlos) por encima de la BD.
    const rech = leerRechazados(codigo)
    const db = tarjetasDesdeLaRonda(r)
    const initialScores: Record<string, Record<number, number>> = {}
    for (const j of r.ronda_libre_jugadores) {
      const base = localGana
        ? { ...db[j.id], ...(cached[j.id] ?? {}) }
        : { ...(cached[j.id] ?? {}), ...db[j.id] } // online: BD manda; lo local aporta lo que falta
      initialScores[j.id] = { ...base, ...numerico(rech[j.id]), ...numerico(pend[j.id]) }
    }
    setScores(initialScores)
    // Equipos (scramble/foursome): respaldo local + pendientes por encima del servidor/copia.
    const cachedEq = loadGroupTeamScores(codigo)
    const equiposIniciales = equipos.map(eq => ({
      ...eq,
      scores: {
        ...eq.scores,
        ...(localGana ? cachedEq[eq.id] ?? {} : {}),
        ...(rech[ID_PENDIENTE_EQUIPO(eq.id)] ?? {}),
        ...(pend[ID_PENDIENTE_EQUIPO(eq.id)] ?? {}),
      },
    }))
    setTeamEquipos(equiposIniciales)
    setGolpesSinSubir(Object.keys(pend).length > 0)
    setCurrentHole(hoyoInicial(r, initialScores, equiposIniciales))
    cargadaRef.current = true
    setLoadError(null)
    setLoading(false)
  }, [codigo])

  /** Una vuelta de lectura. Nunca se llama directo: pasa por `cargar`, que no superpone vueltas. */
  const leerUnaVez = useCallback(async (signal: AbortSignal) => {
    {
      const c = await cargarDelServidor(codigo, signal)
      // Vuelta vencida (desmontada o `codigo` nuevo): nada de lo leído se aplica (ni navegación ni copia local).
      if (c.tipo === 'cancelada' || signal.aborted) return
      if (c.tipo === 'redirigir') {
        if (c.reemplazar) router.replace(c.a)
        else router.push(c.a)
        return
      }
      if (c.tipo === 'elegir_equipo') {
        // Lo liberaron mientras anotaba: al volver a elegir, el próximo equipo abre como recién cargado.
        if (cargadaRef.current && !dejoElEquipoRef.current) addToast({ type: 'info', title: MENSAJE_YA_NO_ANOTAS, duration: 6000 })
        dejoElEquipoRef.current = false
        cargadaRef.current = false
        // La copia local era de un equipo que ya no anota: sin señal, el scorer lo volvería a abrir con ella.
        clearScorerGrupoSnapshot(codigo)
        eligiendoRef.current = true
        setEleccion({ ronda: c.ronda, equipos: c.equipos })
        setConexion('ok')
        setLoadError(null)
        setLoading(false)
        return
      }
      if (c.tipo === 'ok') {
        // Un celular por equipo: otro celular tomó (o le liberaron) un equipo que este tenía en pantalla. Sus golpes
        // pendientes los descarta el envío (`useGrupoScoreSave`); acá solo se avisa.
        if (cargadaRef.current && c.snap.unCelularPorEquipo) {
          const ahora = new Set((c.snap.teamEquipos as EquipoDelScorer[]).map(e => e.id))
          if (idsEnPantallaRef.current.some(id => !ahora.has(id))) addToast({ type: 'info', title: MENSAJE_YA_NO_ANOTAS, duration: 6000 })
        }
        eligiendoRef.current = false
        setEleccion(null)
        saveScorerGrupoSnapshot(codigo, c.snap)
        aplicarMetadatos(c.snap)
        if (!cargadaRef.current) pintarPrimeraVez(c.ronda, false, c.snap.teamEquipos as EquipoDelScorer[])
        setConexion('ok')
        return
      }
      // Sin servidor o sin sesión: nunca se expulsa a alguien que ya está anotando.
      setConexion(c.tipo)
      if (cargadaRef.current) return
      // «Elige tu equipo» (sin copia local: se borró al entrar): la lista sigue en pantalla y se relee sola.
      if (c.tipo === 'sin_conexion' && eligiendoRef.current) return
      const snap = loadScorerGrupoSnapshot(codigo, c.tipo === 'sin_conexion' ? c.userId : null)
      if (snap) {
        aplicarMetadatos(snap)
        pintarPrimeraVez(snap.ronda as RondaLibre, true, snap.teamEquipos as EquipoDelScorer[])
        return
      }
      if (c.tipo === 'sin_sesion') {
        router.push(loginUrl(`/ronda-libre/${codigo}/score-grupo`))
        return
      }
      setLoadError(MENSAJE_SCORER_SIN_CONEXION)
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable (Next.js App Router)
  }, [codigo, aplicarMetadatos, pintarPrimeraVez])
  const leerRef = useRef(leerUnaVez)
  useEffect(() => { leerRef.current = leerUnaVez }, [leerUnaVez])

  /**
   * Lee la ronda sin superponer lecturas. La lectura en vuelo pudo salir ANTES del reclamo o la liberación: el pedido
   * nuevo deja una vuelta más y recibe la promesa de la corrida entera, que termina después de esa vuelta. Un bucle
   * (no recursión): cada vuelta atiende todos los pedidos llegados durante la anterior.
   * `deFondo` (refresco periódico, `online`, volver a la app) NO encola vuelta: con señal lenta una vuelta dura más que
   * el intervalo, siempre le caería un tic adentro y la corrida no terminaría nunca (Finalizar la espera). Solo
   * `recargar` y `recargarTrasDejarEquipo`, que necesitan una lectura posterior a su cambio, encolan.
   * La corrida nunca rechaza: una vuelta que lanza se registra y el bucle sigue (los `void cargar()` no dejan rechazos
   * sin manejar y un pedido encolado no se pierde).
   */
  const cargar = useCallback(({ deFondo = false }: { deFondo?: boolean } = {}): Promise<void> => {
    if (enVueloRef.current) {
      if (!deFondo) otraVueltaRef.current = true
      return enVueloRef.current
    }
    const corrida = (async () => {
      try {
        do {
          otraVueltaRef.current = false
          const vuelta = new AbortController()
          vueltaRef.current = vuelta
          try {
            await leerRef.current(vuelta.signal)
          } catch (err) {
            // No es la red (cargarDelServidor no lanza): es un bug. Se reporta como error y, si todavía no hay nada en
            // pantalla, se sale de «Preparando scorer» a la pantalla de espera, que reintenta sola. Solo el primero va
            // como error: si el bug se repite en cada reintento, no llena el tracking con el mismo evento en un torneo.
            captureError(err instanceof Error ? err : new Error(String(err)), {
              context: 'score_grupo_load', level: errorDeLecturaReportadoRef.current ? 'warning' : 'error',
            })
            errorDeLecturaReportadoRef.current = true
            if (!cargadaRef.current && !eligiendoRef.current) {
              setConexion('sin_conexion')
              setLoadError(MENSAJE_SCORER_SIN_CONEXION)
              setLoading(false)
            }
          }
        } while (otraVueltaRef.current)
      } finally {
        vueltaRef.current = null
        enVueloRef.current = null
        otraVueltaRef.current = false
      }
    })()
    enVueloRef.current = corrida
    return corrida
  // leerUnaVez en las deps: un `codigo` nuevo vuelve a disparar la carga inicial (el efecto de abajo).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leerUnaVez])
  const recargar = useCallback(() => cargar(), [cargar])
  const recargarTrasDejarEquipo = useCallback(() => { dejoElEquipoRef.current = true; return cargar() }, [cargar])

  // Al desmontar (o con un `codigo` nuevo) la vuelta en curso se cancela: su fetch se corta y lo que llegue tarde no
  // navega ni pinta. Va antes de la carga inicial: con un `codigo` nuevo, la cancelada deja lugar a la vuelta encolada.
  useEffect(() => () => { vueltaRef.current?.abort() }, [codigo])
  // Carga inicial (y con un `codigo` nuevo): no es un tic, sí encola si quedó otra lectura en vuelo.
  useEffect(() => { void cargar() }, [cargar])

  // Reintento solo mientras el servidor no responde (o la pantalla quedó en "sin conexión").
  const reintentando = conexion !== 'ok' || loadError === MENSAJE_SCORER_SIN_CONEXION
  // Un celular por equipo: también con conexión se relee quién anota qué. Un equipo que otro celular reclamó sale de
  // este (y sus pendientes no se envían: useGrupoScoreSave); uno liberado vuelve al creador. «Elige tu equipo» también
  // relee: un equipo que liberan o que otro toma aparece al día sin que nadie recargue la página.
  const releer = reintentando || unCelular || eleccion != null
  useEffect(() => {
    if (!releer) return
    const id = setInterval(() => { void cargar({ deFondo: true }) }, REINTENTO_CARGA_MS)
    const onOnline = () => { void cargar({ deFondo: true }) }
    window.addEventListener('online', onOnline)
    return () => { clearInterval(id); window.removeEventListener('online', onOnline) }
  }, [releer, cargar])
  useRefreshOnResume(useCallback(() => { void cargar({ deFondo: true }) }, [cargar]), releer)

  return {
    ronda, loading, loadError,
    currentHole, setCurrentHole,
    scores, setScores,
    parMap, holeDataMap, playerHcp, playerDisplayHcp,
    teamEquipos, setTeamEquipos,
    anotadorNombre, authUserId,
    conexion, golpesSinSubir,
    unCelularPorEquipo: unCelular, equiposDeOtroCelular: ajenos, eleccion, recargar, recargarTrasDejarEquipo,
  }
}
