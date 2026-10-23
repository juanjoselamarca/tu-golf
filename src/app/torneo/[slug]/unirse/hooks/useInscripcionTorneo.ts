'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type {
  JoinInfoTournament,
  JoinInfoProfile,
  InvitadosInfo,
} from '@/lib/data/tournaments/joinFlow'
import type { CapacityInfo } from '@/lib/data/tournaments/enrollPlayer'
import {
  getOrCreateGuestId,
  setGuestName as saveGuestName,
  setGuestHandicap as saveGuestHandicap,
  setGuestToken,
} from '@/lib/guest-session'
import { fetchJsonConPlazo } from '@/lib/red/fetch-json-con-plazo'
import { PLAZO_INSCRIPCION_MS } from '@/lib/red/plazos'

/**
 * `fetch` + cuerpo bajo un plazo duro (fuente única `fetchJsonConPlazo`, 12 s): una
 * conexión que abre pero nunca responde, o un 200 que estanca el cuerpo (señal móvil
 * pobre en cancha), no deja la UI atrapada en su estado de carga. Se leen también
 * los cuerpos de error (`already_registered`); 204/205 → `body: null`. Un cuerpo no
 * JSON (proxy de club que inyecta HTML) lanza, como antes.
 */
type RespuestaJson = { status: number; ok: boolean; body: unknown }
const aRespuestaJson = ({ res, json }: { res: Response; json: unknown }): RespuestaJson =>
  ({ status: res.status, ok: res.ok, body: json })

/**
 * Estado y acciones de la inscripción a un torneo por link: carga de join-info,
 * inscripción con cuenta e inscripción como invitado (redirige al scorer).
 */
export function useInscripcionTorneo(slug: string) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [tournament, setTournament] = useState<JoinInfoTournament | null>(null)
  const [profile, setProfile] = useState<JoinInfoProfile | null>(null)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [capacity, setCapacity] = useState<CapacityInfo | null>(null)
  /** Gate de invitados adelantado por join-info (sin sesión). Si no viene, se asume permitido:
   *  el backend sigue siendo quien rechaza. */
  const [invitados, setInvitados] = useState<InvitadosInfo>({ permitido: true })
  const [authenticated, setAuthenticated] = useState(false)
  const [inscribing, setInscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  /** La carga falló y no hay torneo que mostrar → ofrecer reintento, no una
   *  pantalla en blanco con un banner rojo huérfano. */
  const [loadFailed, setLoadFailed] = useState(false)

  // Guest form state
  const [guestName, setGuestName] = useState('')
  const [guestHandicap, setGuestHandicap] = useState('')
  const [guestJoining, setGuestJoining] = useState(false)

  const loadData = useCallback(async () => {
    setError(null)
    let res: RespuestaJson
    try {
      res = aRespuestaJson(await fetchJsonConPlazo(`/api/torneos/${encodeURIComponent(slug)}/join-info`, {
        cache: 'no-store',
      }, PLAZO_INSCRIPCION_MS, { leerCuerpoSiNoOk: true }))
    } catch {
      // Sin red, timeout, o cuerpo ilegible (proxy de club que inyecta HTML).
      // El escenario real es el jugador en la cancha con señal mala: antes la
      // promesa quedaba sin capturar y la pantalla se congelaba en
      // "Cargando..." para siempre.
      setError('No pudimos cargar el torneo. Revisa tu señal y vuelve a intentarlo.')
      setLoadFailed(true)
      setLoading(false)
      return
    }

    if (res.status === 404) {
      setError('Este torneo no existe o el link es incorrecto.')
      setLoadFailed(true)
      setLoading(false)
      return
    }
    if (!res.ok) {
      setError('No se pudo cargar la información del torneo. Intenta nuevamente.')
      setLoadFailed(true)
      setLoading(false)
      return
    }

    const data = res.body as {
      tournament: JoinInfoTournament
      profile: JoinInfoProfile | null
      alreadyRegistered: boolean
      authenticated: boolean
      capacity?: CapacityInfo | null
      invitados?: InvitadosInfo
    }
    setTournament(data.tournament)
    setProfile(data.profile)
    setAlreadyRegistered(data.alreadyRegistered)
    setCapacity(data.capacity ?? null)
    setInvitados(data.invitados ?? { permitido: true })
    setAuthenticated(data.authenticated ?? false)
    setLoadFailed(false)
    setLoading(false)
  }, [slug])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reintentarCarga = () => {
    setLoading(true)
    setLoadFailed(false)
    loadData()
  }

  const handleInscribirse = async () => {
    if (!tournament || !profile || inscribing) return
    setInscribing(true)
    setError(null)

    let res: RespuestaJson
    try {
      res = aRespuestaJson(await fetchJsonConPlazo(`/api/torneos/${encodeURIComponent(slug)}/inscribirse`, {
        method: 'POST',
      }, PLAZO_INSCRIPCION_MS, { leerCuerpoSiNoOk: true }))
    } catch {
      // El botón quedaba en "Inscribiendo..." para siempre. Peor todavía: el
      // jugador no sabía si quedó inscrito o no. Lo dejamos reintentar — la
      // inscripción es idempotente: si el POST sí llegó, el backend responde
      // already_registered y la UI lo trata como éxito.
      setError('No pudimos confirmar tu inscripción. Revisa tu señal y vuelve a intentarlo.')
      setInscribing(false)
      return
    }

    if (res.ok) {
      setSuccess(true)
      setInscribing(false)
      return
    }

    const body = (res.body ?? {}) as { error?: string; message?: string }
    if (body.error === 'already_registered') {
      setAlreadyRegistered(true)
      setError(body.message ?? 'Ya estás inscrito en este torneo.')
    } else {
      setError(body.message ?? 'No se pudo completar la inscripción. Intenta nuevamente.')
    }
    setInscribing(false)
  }

  const handleGuestJoin = async () => {
    if (!tournament || guestJoining) return
    const trimmedName = guestName.trim()
    if (trimmedName.length < 2) {
      setError('Ingresa tu nombre (al menos 2 caracteres).')
      return
    }
    setGuestJoining(true)
    setError(null)

    const guestId = getOrCreateGuestId()
    const handicapNum = guestHandicap ? parseFloat(guestHandicap) : undefined

    let res: RespuestaJson
    try {
      res = aRespuestaJson(await fetchJsonConPlazo(`/api/torneos/${encodeURIComponent(slug)}/guest-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId,
          name: trimmedName,
          handicap: handicapNum != null && !isNaN(handicapNum) ? handicapNum : undefined,
        }),
      }, PLAZO_INSCRIPCION_MS, { leerCuerpoSiNoOk: true }))
    } catch {
      setError('No pudimos confirmar tu inscripción. Revisa tu señal y vuelve a intentarlo.')
      setGuestJoining(false)
      return
    }

    if (res.ok) {
      const body = res.body as { guestToken?: string }
      // Guardar datos de sesión de invitado
      saveGuestName(trimmedName)
      if (handicapNum != null && !isNaN(handicapNum)) {
        saveGuestHandicap(handicapNum)
      }
      if (body.guestToken) {
        setGuestToken(body.guestToken)
      }
      // Redirigir directo al scorer
      router.push(`/torneo/${slug}/score`)
      return
    }

    const body = (res.body ?? {}) as { message?: string }
    setError(body.message ?? 'No se pudo completar la inscripción. Intenta nuevamente.')
    setGuestJoining(false)
  }

  return {
    loading,
    tournament,
    profile,
    alreadyRegistered,
    capacity,
    invitados,
    authenticated,
    inscribing,
    error,
    success,
    loadFailed,
    guestName,
    setGuestName,
    guestHandicap,
    setGuestHandicap,
    guestJoining,
    reintentarCarga,
    handleInscribirse,
    handleGuestJoin,
  }
}
