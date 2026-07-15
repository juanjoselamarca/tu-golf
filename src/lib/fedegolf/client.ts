/**
 * Cliente HTTP para la API de fedegolf.cl
 *
 * Usa fetch nativo de Node 18+ (Next.js 14).
 * Todos los endpoints verificados contra el servidor real.
 */

import {
  FEDEGOLF_CLUBES,
  FEDEGOLF_TEE_LABELS,
  type FedegolfCancha,
  type FedegolfCourseData,
  type FedegolfDownloadProgress,
  type FedegolfIndice,
  type FedegolfInfoCancha,
  type FedegolfMiembro,
  type FedegolfPerfil,
  type FedegolfSession,
  type FedegolfTeeColor,
  type FedegolfTeeInfo,
} from './types'

const BASE_URL = 'https://www.fedegolf.cl'
const TEE_COLORS: FedegolfTeeColor[] = ['azul', 'blanco', 'rojo', 'negro', 'rojov']

// ─── Helpers ─────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Extrae PHPSESSID de un header Set-Cookie.
 * Soporta tanto string como string[] (múltiples Set-Cookie).
 */
function extractPhpSessionId(headers: Headers): string | null {
  // getSetCookie() disponible en Node 18.14+
  const cookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie')?.split(', ') ?? [])

  for (const cookie of cookies) {
    const match = cookie.match(/PHPSESSID=([^;]+)/)
    if (match) return match[1]
  }
  return null
}

// ─── Perfil del socio ────────────────────────────────────────────────

/**
 * Normaliza el `sexo` de FedeGolf ("Varon"/"Dama"/…) a la convención de la app
 * (`profiles.genero` = 'M' | 'F'). Robusto a variantes; null si no reconoce.
 * Fuente única del mapeo sexo→genero para el flujo de vinculación.
 */
export function fedegolfSexoToGenero(sexo: unknown): 'M' | 'F' | null {
  if (typeof sexo !== 'string') return null
  const s = sexo.trim().toLowerCase()
  if (!s) return null
  if (/^(var|masc|hom|m$)/.test(s)) return 'M'
  if (/^(dam|muj|fem|f$)/.test(s)) return 'F'
  return null
}

/**
 * Extrae el subconjunto útil del `data` del login (nombre completo + género).
 * No asume que todos los campos vengan — todo es best-effort y null-safe.
 */
export function parseFedegolfPerfil(data: Record<string, unknown> | null | undefined): FedegolfPerfil {
  const d = data ?? {}
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const nombreCompleto =
    [str(d.Nombres), str(d.Apellido_Paterno), str(d.Apellido_Materno)].filter(Boolean).join(' ') || null
  const usuarioRaw = d.Usuario
  const usuarioId =
    typeof usuarioRaw === 'number'
      ? usuarioRaw
      : typeof usuarioRaw === 'string' && usuarioRaw.trim() !== '' && Number.isFinite(Number(usuarioRaw))
        ? Number(usuarioRaw)
        : null
  return {
    usuarioId,
    nombreCompleto,
    genero: fedegolfSexoToGenero(d.sexo),
    sexoRaw: str(d.sexo) || null,
  }
}

// ─── Login ───────────────────────────────────────────────────────────

/**
 * Autentica contra fedegolf.cl en dos pasos:
 * 1. GET / para obtener PHPSESSID
 * 2. POST services.php con credenciales (responde 302 en éxito)
 *
 * En éxito devuelve la cookie de sesión + el perfil del socio (nombre, género)
 * parseado del body del login, que la ruta de vinculación usa para
 * autocompletar el perfil del usuario.
 */
export async function fedegolfLogin(
  rut: string,
  password: string
): Promise<FedegolfSession> {
  // Paso 1: obtener cookie de sesión
  const initRes = await fetch(BASE_URL, {
    redirect: 'manual',
  })
  const sessionId = extractPhpSessionId(initRes.headers)
  if (!sessionId) {
    throw new Error('fedegolf: no se pudo obtener PHPSESSID inicial')
  }

  // Paso 2: login con JSON body
  const loginRes = await fetch(`${BASE_URL}/code/ajax/services.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `PHPSESSID=${sessionId}`,
    },
    body: JSON.stringify({
      service: 'login',
      action: 'login',
      rut,
      pass: password,
    }),
    redirect: 'manual', // 302 = éxito, no seguir redirect
  })

  // El servidor responde 302 en login exitoso
  if (loginRes.status !== 302) {
    throw new Error(
      `fedegolf: login fallido (status ${loginRes.status}). Verificar RUT y password.`
    )
  }

  // Puede venir un nuevo PHPSESSID en la respuesta del login
  const newSessionId = extractPhpSessionId(loginRes.headers)
  const cookie = `PHPSESSID=${newSessionId ?? sessionId}`

  // El body del 302 trae { data: { Nombres, sexo, ... } }. Best-effort: si no
  // parsea, la vinculación igual funciona (solo no autocompleta el perfil).
  let perfil: FedegolfPerfil | undefined
  try {
    const body = (await loginRes.json()) as { data?: Record<string, unknown> } | null
    if (body?.data) perfil = parseFedegolfPerfil(body.data)
  } catch {
    // body no-JSON o vacío — perfil queda undefined
  }

  return { cookie, perfil }
}

// ─── Canchas de un club ──────────────────────────────────────────────

/**
 * Obtiene las canchas (recorridos) de un club.
 * Endpoint: modMantenedorCanchas/ajax.php con accion=ObtenerCanchas
 */
export async function fedegolfGetCanchas(
  session: FedegolfSession,
  clubId: number
): Promise<FedegolfCancha[]> {
  const body = new URLSearchParams({
    accion: 'ObtenerCanchas',
    club: String(clubId),
  })

  const res = await fetch(
    `${BASE_URL}/sistema/admin/modMantenedorCanchas/ajax.php`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: session.cookie,
      },
      body: body.toString(),
      redirect: 'manual', // PHP endpoints return 302 with JSON body
    }
  )

  // PHP endpoints may return 302 with valid JSON body
  if (!res.ok && res.status !== 302) {
    throw new Error(`fedegolf: error obteniendo canchas del club ${clubId} (${res.status})`)
  }

  const data: FedegolfCancha[] = await res.json()
  return data
}

// ─── Info de cancha (slope/rating) ───────────────────────────────────

/**
 * Obtiene slope, rating y par de una cancha específica.
 * Endpoint: modMantenedorCanchas/json.php con action=get_info_cancha
 * NOTA: este endpoint usa "action" (no "accion")
 */
export async function fedegolfGetInfoCancha(
  session: FedegolfSession,
  clubId: number,
  canchaId: string
): Promise<FedegolfInfoCancha> {
  const body = new URLSearchParams({
    action: 'get_info_cancha',
    club: String(clubId),
    cancha: canchaId,
  })

  const res = await fetch(
    `${BASE_URL}/sistema/admin/modMantenedorCanchas/json.php`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: session.cookie,
      },
      body: body.toString(),
      redirect: 'manual',
    }
  )

  if (!res.ok && res.status !== 302) {
    throw new Error(
      `fedegolf: error obteniendo info cancha ${canchaId} del club ${clubId} (${res.status})`
    )
  }

  const raw: Record<string, string> = await res.json()

  // Parsear tees
  const tees: FedegolfTeeInfo[] = TEE_COLORS.map((color) => {
    const rtKey = `rt-${color}`
    const slKey = `sl-${color}`
    const rating = parseFloat(raw[rtKey] || '0')
    const slope = parseFloat(raw[slKey] || '0')

    // El servidor marca los tees activos con checked="checked"
    // La key varía: puede ser "azul", "blanco", etc.
    const checkedKey = color
    const active = raw[checkedKey] === 'checked'

    return {
      color,
      label: FEDEGOLF_TEE_LABELS[color],
      rating: isNaN(rating) ? 0 : rating,
      slope: isNaN(slope) ? 0 : slope,
      active,
    }
  }).filter((tee) => tee.rating > 0 || tee.slope > 0) // Solo tees con datos

  // Determinar género
  let genero: 'masculino' | 'femenino' | null = null
  if (raw.seleccionMasculino === 'selected') genero = 'masculino'
  else if (raw.seleccionFemenino === 'selected') genero = 'femenino'

  return {
    nombre: raw.nombre || '',
    par: parseInt(raw.par || '72', 10),
    genero,
    tees,
    raw,
  }
}

// ─── Índice de jugador ───────────────────────────────────────────────

/**
 * Consulta el índice de handicap de un jugador por RUT.
 * Endpoint público: modVeinteMejoresPalos/json.php
 */
export async function fedegolfGetIndice(
  session: FedegolfSession,
  rut: string
): Promise<FedegolfIndice> {
  const body = new URLSearchParams({
    action: 'get_indice_rut',
    rut,
  })

  const res = await fetch(
    `${BASE_URL}/sistema/publico/modVeinteMejoresPalos/json.php`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: session.cookie,
      },
      body: body.toString(),
      redirect: 'manual',
    }
  )

  if (!res.ok && res.status !== 302) {
    throw new Error(`fedegolf: error consultando indice para RUT ${rut} (${res.status})`)
  }

  const data: { indice: string } = await res.json()
  const indice = parseFloat(data.indice)

  return {
    rut,
    indice: isNaN(indice) ? null : indice,
  }
}

// ─── Miembros de un club ─────────────────────────────────────────────

/**
 * Obtiene la lista de miembros de un club.
 * Endpoint: modMantenedorUsuarios/accionesAJAX.php con accion=CargaUsuariosClub
 */
export async function fedegolfGetMiembrosClub(
  session: FedegolfSession,
  clubId: number
): Promise<FedegolfMiembro[]> {
  const body = new URLSearchParams({
    accion: 'CargaUsuariosClub',
    id_club: String(clubId),
  })

  const res = await fetch(
    `${BASE_URL}/sistema/admin/modMantenedorUsuarios/accionesAJAX.php`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: session.cookie,
      },
      body: body.toString(),
      redirect: 'manual',
    }
  )

  if (!res.ok && res.status !== 302) {
    throw new Error(`fedegolf: error obteniendo miembros del club ${clubId} (${res.status})`)
  }

  const data: FedegolfMiembro[] = await res.json()
  return data
}

// ─── Descarga masiva ─────────────────────────────────────────────────

/**
 * Descarga canchas + info de todos los clubes federados.
 * Incluye delay de 500ms entre requests para no saturar el servidor.
 */
export async function fedegolfDownloadAll(
  session: FedegolfSession,
  onProgress?: (progress: FedegolfDownloadProgress) => void
): Promise<FedegolfCourseData[]> {
  const results: FedegolfCourseData[] = []

  for (let i = 0; i < FEDEGOLF_CLUBES.length; i++) {
    const club = FEDEGOLF_CLUBES[i]

    onProgress?.({
      phase: 'canchas',
      clubIndex: i,
      totalClubs: FEDEGOLF_CLUBES.length,
      clubName: club.nombre,
    })

    // Obtener canchas del club
    let canchasRaw: FedegolfCancha[]
    try {
      canchasRaw = await fedegolfGetCanchas(session, club.id)
    } catch {
      // Si falla un club, continuar con el siguiente
      results.push({ club, canchas: [] })
      await delay(500)
      continue
    }

    await delay(500)

    // Obtener info de cada cancha
    const canchasConInfo: FedegolfCourseData['canchas'] = []
    for (let j = 0; j < canchasRaw.length; j++) {
      const cancha = canchasRaw[j]

      onProgress?.({
        phase: 'info',
        clubIndex: i,
        totalClubs: FEDEGOLF_CLUBES.length,
        clubName: club.nombre,
        canchaIndex: j,
        totalCanchas: canchasRaw.length,
      })

      let info: FedegolfInfoCancha | null = null
      try {
        info = await fedegolfGetInfoCancha(session, club.id, cancha.cancha)
      } catch {
        // Info no disponible, continuar
      }

      canchasConInfo.push({ ...cancha, info })
      await delay(500)
    }

    results.push({ club, canchas: canchasConInfo })
  }

  return results
}
