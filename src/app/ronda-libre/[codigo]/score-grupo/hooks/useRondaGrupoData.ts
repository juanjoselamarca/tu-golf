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
import {
  entradaAlScorerDeEquipos, equiposDeOtroCelular, equiposQueAnota, unCelularPorEquipo, nombreDelAnotadorDelCelular, NOMBRE_ANOTADOR_GENERICO,
} from '@/golf/ronda-libre/anotador-de-equipo'
import { MENSAJE_YA_NO_ANOTAS } from '@/lib/data/ronda-libre-anotador'
import { addToast } from '@/hooks/useToast'
import { tarjetaAlDiaEnHoyo } from '@/golf/ronda-libre/hoyos-sin-rellenar'
import { hoyoParaRetomar, hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { capaDeTarjeta, combinarCapasDeTarjeta, soloGolpes, type FueraPorJugador } from '@/golf/formats/skins/fuera-del-hoyo'
import {
  fetchRondaLibreParaScorer,
  cargarHoyosDelScorer,
  resolverHandicapsDelScorer,
  fetchEquiposDelScorer,
  tarjetasDesdeLaRonda,
  fueraDesdeLaRonda,
  MENSAJE_SCORER_SIN_CONEXION,
  PLAZO_CARGA_SCORER_MS,
  REINTENTO_CARGA_MS,
  type EquipoDelScorer,
} from '@/lib/data/ronda-libre-scorer'
import { sesionDelScorer } from '@/lib/auth/sesion-del-scorer'
import {
  loadGroupScores,
  loadGroupFuera,
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
import { leerNombresDePerfilCon } from '@/lib/data/nombres-de-perfil-lectura'
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
  /** Skins: hoyos con X de cada tarjeta, aparte de los golpes (`fuera_del_hoyo` + respaldo + pendientes). Vacío fuera del skins. */
  fuera: FueraPorJugador
  setFuera: React.Dispatch<React.SetStateAction<Record<string, Record<number, true>>>>
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  /** Course handicap que PUNTÚA (en 9h, la mitad). */
  playerHcp: Record<string, number>
  /** El HCP que se MUESTRA: siempre en escala de 18 hoyos, aunque se jueguen 9. */
  playerDisplayHcp: Record<string, number>
  teamEquipos: EquipoDelScorer[]
  setTeamEquipos: React.Dispatch<React.SetStateAction<EquipoDelScorer[]>>
  /** Quién anota (`nombreDelAnotadorDelCelular`): su nombre en la ronda o de perfil; nunca el correo. */
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

/**
 * Hoyo en que se abre el scorer (`hoyoParaRetomar`): el primero que le falte a alguna
 * tarjeta, las de los jugadores o, en bola compartida (scramble/foursome, sin golpes
 * propios), las de los equipos. Con todas llenas, el último, donde está Finalizar.
 * Timba libre: con `retiros`, los hoyos de un retirado no le faltan (`tarjetaAlDiaEnHoyo`). Skins: tampoco los con X.
 */
export function hoyoInicial(
  r: RondaLibre,
  scores: Record<string, Record<number, number>>,
  equipos: ReadonlyArray<{ scores: Record<string, number> }> = [],
  retiros?: Readonly<Record<string, number>>,
  fuera?: FueraPorJugador,
): number {
  const orden = hoyosDeLaRonda(r.hoyo_inicio ?? 1, r.holes)
  if (isSharedBallFormat(r.formato_juego)) {
    if (equipos.length === 0) return orden[0] ?? 1
    return hoyoParaRetomar(orden, h => equipos.every(e => e.scores[String(h)] != null))
  }
  const jugadores = r.ronda_libre_jugadores
  if (jugadores.length === 0) return orden[0] ?? 1
  return hoyoParaRetomar(orden, h => jugadores.every(j => tarjetaAlDiaEnHoyo(scores[j.id], j.id, h, retiros, orden, fuera?.[j.id])))
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
  // Nacida cancelada: ni siquiera se espera la sesión (hasta 8 s).
  if (signal.aborted) return { tipo: 'cancelada' }
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
    // Identidad del anotador (`nombreDelAnotadorDelCelular`): nunca el correo. Su perfil se lee solo si la ronda no
    // trae su nombre, EN PARALELO con hoyos y hándicaps (no suma un plazo más con señal lenta); una falla de esa
    // lectura no frena el scorer (queda el genérico) y su cancelación la recoge el `signal.aborted` de abajo.
    const delCelular = { jugadores: r.ronda_libre_jugadores, equipos, userId, email: sesion.email }
    const nombreSinPerfil = nombreDelAnotadorDelCelular(delCelular)
    const nombreDePerfilP: Promise<string | null> = nombreSinPerfil === NOMBRE_ANOTADOR_GENERICO
      ? paso(c => leerNombresDePerfilCon(c, [userId])).then(m => m.get(userId) ?? null, () => null)
      : Promise.resolve(null)
    const hoyos = await paso(c => cargarHoyosDelScorer(c, r))
    // El scorer de grupo exige sesión (arriba): `profiles` es legible.
    const { hcpMap, displayMap } = await paso(c => resolverHandicapsDelScorer(c, r, hoyos.finalParTotal, leerIndicesDelCliente(c)))
    if (signal.aborted) return { tipo: 'cancelada' }
    // UN solo filtro: este celular carga solo los equipos que anota. Todo lo que manda golpes (par al pasar de hoyo,
    // completar al finalizar, pendientes, hoyo inicial, copia local) parte de esta lista: nunca toca un equipo de
    // otro celular. En una ronda de un celular son todos.
    const teamEquipos = equiposQueAnota(r, equipos, userId)
    const nombreDePerfil = await nombreDePerfilP
    if (signal.aborted) return { tipo: 'cancelada' }
    const anotadorNombre = nombreSinPerfil === NOMBRE_ANOTADOR_GENERICO
      ? nombreDelAnotadorDelCelular({ ...delCelular, nombreDePerfil })
      : nombreSinPerfil
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
  const [fuera, setFuera] = useState<Record<string, Record<number, true>>>({})
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
  /**
   * Vida de la pantalla para este `codigo`: abortada (desmontada o `codigo` nuevo), la corrida no arranca más vueltas.
   * Sin ella, una vuelta ENCOLADA (`recargar` con otra en vuelo) corría y aplicaba todo desde una pantalla cerrada.
   */
  const vidaRef = useRef<AbortController | null>(null)
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
    // Skins: la X va aparte de los golpes en la base y en el respaldo; se combina con ellos por capas (un hoyo con X
    // en una capa más nueva le gana a golpes de una más vieja, y al revés). Fuera del skins las dos están vacías.
    const dbFuera = fueraDesdeLaRonda(r)
    const cachedFuera = loadGroupFuera(codigo)
    const initialScores: Record<string, Record<number, number>> = {}
    const initialFuera: Record<string, Record<number, true>> = {}
    for (const j of r.ronda_libre_jugadores) {
      const capaDb = capaDeTarjeta(db[j.id], dbFuera[j.id])
      const capaLocal = capaDeTarjeta(cached[j.id], cachedFuera[j.id])
      // Online: BD manda y lo local aporta lo que falta. Sin servidor: lo local es lo más nuevo. Siempre encima, los
      // rechazados (para revisarlos) y lo pendiente de confirmar.
      const { golpes, fuera: x } = combinarCapasDeTarjeta(localGana
        ? [capaDb, capaLocal, rech[j.id], pend[j.id]]
        : [capaLocal, capaDb, rech[j.id], pend[j.id]])
      initialScores[j.id] = golpes
      if (Object.keys(x).length > 0) initialFuera[j.id] = x
    }
    setScores(initialScores)
    setFuera(initialFuera)
    // Equipos (scramble/foursome): respaldo local + pendientes por encima del servidor/copia.
    const cachedEq = loadGroupTeamScores(codigo)
    const equiposIniciales = equipos.map(eq => ({
      ...eq,
      scores: {
        ...eq.scores,
        ...(localGana ? cachedEq[eq.id] ?? {} : {}),
        ...soloGolpes(rech[ID_PENDIENTE_EQUIPO(eq.id)]),
        ...soloGolpes(pend[ID_PENDIENTE_EQUIPO(eq.id)]),
      },
    }))
    setTeamEquipos(equiposIniciales)
    setGolpesSinSubir(Object.keys(pend).length > 0)
    setCurrentHole(hoyoInicial(r, initialScores, equiposIniciales, undefined, initialFuera))
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
          // Pantalla cerrada (o el `codigo` cambió y su efecto todavía no repone la vida): no se lee nada más.
          if (!vidaRef.current || vidaRef.current.signal.aborted) break
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

  // Vida por `codigo`. Al desmontar (o con un `codigo` nuevo) muere la vida y se cancela la vuelta en curso: su fetch se
  // corta, lo que llegue tarde no navega ni pinta, y ninguna vuelta encolada arranca. Va ANTES de la carga inicial: con
  // un `codigo` nuevo la vida nueva ya está puesta cuando la corrida (que terminó la vuelta cancelada) retoma.
  useEffect(() => {
    const vida = new AbortController()
    vidaRef.current = vida
    return () => { vida.abort(); vueltaRef.current?.abort() }
  }, [codigo])
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
    scores, setScores, fuera, setFuera,
    parMap, holeDataMap, playerHcp, playerDisplayHcp,
    teamEquipos, setTeamEquipos,
    anotadorNombre, authUserId,
    conexion, golpesSinSubir,
    unCelularPorEquipo: unCelular, equiposDeOtroCelular: ajenos, eleccion, recargar, recargarTrasDejarEquipo,
  }
}
