// Mapeo PURO del scoreboard de ESPN (PGA Tour) a nuestro DTO del widget.
//
// Extraído de `src/app/api/pga-live/route.ts` (regla "el que toca, ordena": el
// handler de la API queda delgado — solo fetch + corte proyectado async + responder
// — y TODA la lógica de negocio vive acá, pura y testeable sin red).

export interface PgaPlayer {
  position: string
  name: string
  nameFull: string
  score: string
  today: string
  thru: string
  flag: string
  country: string
  countryCode: string
  roundNum: number
  isTeam: boolean
}

export interface PgaNextEvent {
  name: string
  start: string
  end: string
  venue: string
}

export interface PgaLiveDTO {
  active: boolean
  live?: boolean
  complete?: boolean
  tournament?: string
  round?: string
  course?: string
  players?: PgaPlayer[]
  projectedCut?: string | null
  next_event?: PgaNextEvent
  isTeamEvent?: boolean
}

export interface ParsedScoreboard {
  dto: PgaLiveDTO
  /** ¿hay que pedir el corte proyectado? (solo cuando está en vivo). */
  needsCut: boolean
  /** Nombre del evento, para la llamada al corte proyectado. */
  eventName: string
}

const PGA_2026 = [
  { name: 'THE PLAYERS Championship',       start: '2026-03-12', end: '2026-03-15', venue: 'TPC Sawgrass' },
  { name: 'Valspar Championship',           start: '2026-03-20', end: '2026-03-23', venue: 'Innisbrook Resort (Copperhead)' },
  { name: "Texas Children's Houston Open",  start: '2026-03-27', end: '2026-03-30', venue: 'Memorial Park GC, TX' },
  { name: 'The Masters',                    start: '2026-04-09', end: '2026-04-12', venue: 'Augusta National, GA' },
  { name: 'RBC Heritage',                   start: '2026-04-16', end: '2026-04-19', venue: 'Harbour Town GL, SC' },
  { name: 'Zurich Classic of New Orleans',  start: '2026-04-23', end: '2026-04-26', venue: 'TPC Louisiana' },
  { name: 'Wells Fargo Championship',       start: '2026-05-07', end: '2026-05-10', venue: 'Quail Hollow Club, NC' },
  { name: 'PGA Championship',               start: '2026-05-14', end: '2026-05-17', venue: 'Aronimink GC, PA' },
  { name: 'the Memorial Tournament',        start: '2026-06-04', end: '2026-06-07', venue: 'Muirfield Village GC' },
  { name: 'U.S. Open',                      start: '2026-06-18', end: '2026-06-21', venue: 'Shinnecock Hills GC' },
]

/* ── Country → ISO 3166-1 alpha-2 (for flagcdn.com images) ── */
const COUNTRY_ISO: Record<string, string> = {
  'United States': 'us', 'USA': 'us', 'South Korea': 'kr', 'Canada': 'ca',
  'England': 'gb-eng', 'Australia': 'au', 'Spain': 'es',
  'Norway': 'no', 'Sweden': 'se', 'Japan': 'jp',
  'Ireland': 'ie', 'Scotland': 'gb-sct', 'Germany': 'de',
  'France': 'fr', 'Italy': 'it', 'Argentina': 'ar',
  'Chile': 'cl', 'Colombia': 'co', 'Mexico': 'mx',
  'South Africa': 'za', 'Denmark': 'dk', 'Belgium': 'be',
  'Netherlands': 'nl', 'New Zealand': 'nz', 'China': 'cn',
  'Thailand': 'th', 'Brazil': 'br', 'Northern Ireland': 'gb-nir',
  'Wales': 'gb-wls', 'Fiji': 'fj', 'Venezuela': 've',
  'Czech Republic': 'cz', 'Austria': 'at', 'Portugal': 'pt',
  'Philippines': 'ph', 'Singapore': 'sg', 'Taiwan': 'tw',
  'India': 'in', 'Poland': 'pl', 'Switzerland': 'ch',
  'Finland': 'fi', 'Zimbabwe': 'zw', 'Paraguay': 'py',
  'Puerto Rico': 'pr', 'Bermuda': 'bm',
}

export function traducirRonda(detail: string): string {
  return detail
    .replace(/Round (\d+)/g, 'Ronda $1')
    .replace('In Progress', 'En curso')
    .replace('Complete', 'Finalizada')
    .replace('Suspended', 'Suspendida')
    .replace(' - ', ' · ')
}

function nombreCorto(fullName: string): string {
  const parts = fullName.trim().split(' ')
  if (parts.length < 2) return fullName
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

export function getNextEvent(today: string): PgaNextEvent {
  const sorted = [...PGA_2026].sort((a, b) => a.start.localeCompare(b.start))
  return sorted.find(e => e.end >= today) ?? sorted[sorted.length - 1]
}

/** Format a tee time from ISO string to local display (e.g. "7:30a"). */
function formatTeeTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    const h = d.getHours()
    const m = d.getMinutes()
    const ampm = h >= 12 ? 'p' : 'a'
    const h12 = h % 12 || 12
    return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`
  } catch {
    return '—'
  }
}

interface EspnLineScore {
  displayValue?: string
  linescores?: Array<{ displayValue?: string }>
}
interface EspnCompetitor {
  score?: string
  athlete?: { displayName?: string; flag?: { alt?: string };[k: string]: unknown }
  team?: { displayName?: string; shortDisplayName?: string;[k: string]: unknown }
  status?: { type?: { state?: string; completed?: boolean }; teeTime?: string; startDate?: string;[k: string]: unknown }
  linescores?: EspnLineScore[]
  [k: string]: unknown
}

/**
 * Convierte el JSON del scoreboard de ESPN en nuestro DTO. Función PURA: no hace
 * red ni lee el reloj (recibe `today`). Devuelve también `needsCut`/`eventName`
 * para que el route decida si pide el corte proyectado.
 */
export function parseScoreboard(data: unknown, today: string): ParsedScoreboard {
  const d = data as { events?: Array<Record<string, unknown>> } | null
  const event = d?.events?.[0] as Record<string, unknown> | undefined
  const next_event = getNextEvent(today)

  if (!event) {
    return { dto: { active: false, next_event }, needsCut: false, eventName: '' }
  }

  const competition = (event.competitions as Array<Record<string, unknown>> | undefined)?.[0]
  const competitors = (competition?.competitors as EspnCompetitor[] | undefined) || []
  const status = competition?.status as { type?: { state?: string; shortDetail?: string; detail?: string } } | undefined

  // Ronda actual del torneo desde el status detail. Ej: "Round 2 - In Progress" → 2
  const statusDetail = status?.type?.shortDetail || status?.type?.detail || ''
  const roundMatch = statusDetail.match(/Round\s*(\d+)/i)
  let tournamentRoundNum = roundMatch ? parseInt(roundMatch[1], 10) : 1
  // Torneo finalizado: el status no trae "Round N", así que tomamos la última ronda
  // con datos (la final) en vez de caer a 1 (mostraría la R1 de un torneo terminado).
  if (!roundMatch && status?.type?.state === 'post') {
    for (const c of competitors) {
      const n = Array.isArray(c?.linescores) ? c.linescores.length : 0
      if (n > tournamentRoundNum) tournamentRoundNum = n
    }
  }

  const sorted = [...competitors].sort((a, b) => {
    const sa = parseFloat(a.score ?? '0') || 0
    const sb = parseFloat(b.score ?? '0') || 0
    return sa - sb
  })

  // Posiciones con empates en O(n): el array ya viene ordenado por score, así que
  // agrupamos scores consecutivos iguales.
  const posByIndex: string[] = new Array(sorted.length)
  {
    let i = 0
    while (i < sorted.length) {
      const sc = parseFloat(sorted[i].score ?? '0')
      let j = i
      while (j + 1 < sorted.length && parseFloat(sorted[j + 1].score ?? '0') === sc) j++
      const tied = j > i
      for (let k = i; k <= j; k++) posByIndex[k] = tied ? `T${i + 1}` : String(i + 1)
      i = j + 1
    }
  }

  // Leaderboard COMPLETO (todo el campo, no solo top-10).
  const players: PgaPlayer[] = sorted.map((c: EspnCompetitor, index: number) => {
    const rawScore = parseFloat(c.score ?? '0')
    let score = 'E'
    if (!isNaN(rawScore)) {
      score = rawScore < 0 ? String(rawScore) : rawScore > 0 ? `+${rawScore}` : 'E'
    }

    const rounds: EspnLineScore[] = c.linescores || []
    const currentRoundIdx = tournamentRoundNum - 1
    const currentRound = rounds[currentRoundIdx]
    const holesInCurrentRound = (currentRound?.linescores || []).length
    const hasStartedCurrentRound = holesInCurrentRound > 0

    let todayScore = 'E'
    if (hasStartedCurrentRound && currentRound?.displayValue) {
      const raw = parseFloat(currentRound.displayValue)
      if (!isNaN(raw)) {
        todayScore = raw < 0 ? String(raw) : raw > 0 ? `+${raw}` : 'E'
      }
    }

    // Thru: 18 hoyos → "F"; 1-17 → número; sin empezar → tee time o "—".
    let thru = '—'
    if (hasStartedCurrentRound) {
      thru = holesInCurrentRound >= 18 ? 'F' : String(holesInCurrentRound)
    } else {
      const teeTime = c.status?.teeTime || c.status?.startDate
      if (teeTime) thru = formatTeeTime(teeTime)
    }

    const pos = posByIndex[index]
    const isTeam = !c.athlete && !!c.team
    const fullDisplay = c.athlete?.displayName || c.team?.displayName || ''
    const shortDisplay = isTeam
      ? (c.team?.shortDisplayName || c.team?.displayName || '')
      : nombreCorto(c.athlete?.displayName || '')
    const country = isTeam ? '' : (c.athlete?.flag?.alt ?? '')
    const countryCode = COUNTRY_ISO[country] || ''
    const flagUrl = countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : ''

    return {
      position: pos,
      name: shortDisplay,
      nameFull: fullDisplay,
      score,
      today: todayScore,
      thru,
      flag: flagUrl,
      country,
      countryCode,
      roundNum: tournamentRoundNum,
      isTeam,
    }
  })

  const isTeamEvent = sorted.length > 0 && sorted.every(c => !c.athlete && !!c.team)

  const isPre = status?.type?.state === 'pre'
  const isLive = status?.type?.state === 'in'
  const isComplete = status?.type?.state === 'post'

  const course = (competition?.venue as { fullName?: string } | undefined)?.fullName
    || PGA_2026.find(e => String(event.name || '').toLowerCase().includes(e.name.toLowerCase().split(' ')[0]))?.venue
    || ''

  const eventName = String(event.name || event.shortName || '')

  // Un evento 'pre' (aún no arranca) NO es un board en vivo: se muestra como "Próximo
  // evento". active = se está jugando o ya terminó. Sin esto, un torneo por empezar
  // salía como "En vivo" con tee-times en vez de scores (bug inbox 22-jun).
  const active = isLive || isComplete

  // La ronda solo tiene sentido en vivo. Al finalizar, el label ya dice "Final" y el
  // shortDetail de ESPN puede quedar stale ("Round 1 - Suspended") → no se muestra.
  const round = isLive ? traducirRonda(status?.type?.shortDetail || '') : ''

  // Próximo evento: si ESPN ya apunta al torneo que viene ('pre'), ESE es el real y
  // actual (el calendario hardcodeado se queda corto al cerrar la temporada).
  const nextEventOut: PgaNextEvent = isPre
    ? {
        name: eventName,
        start: String(event.date || '').slice(0, 10),
        end: String(event.endDate || event.date || '').slice(0, 10),
        venue: course,
      }
    : next_event

  return {
    dto: {
      active,
      live: isLive,
      complete: isComplete,
      tournament: eventName,
      round,
      course,
      players,
      projectedCut: null,
      next_event: nextEventOut,
      isTeamEvent,
    },
    needsCut: isLive,
    eventName,
  }
}
