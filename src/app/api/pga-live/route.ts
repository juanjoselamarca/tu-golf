import { NextResponse } from 'next/server'

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

function traducirRonda(detail: string): string {
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

function getNextEvent(today: string) {
  const sorted = [...PGA_2026].sort((a, b) => a.start.localeCompare(b.start))
  return sorted.find(e => e.end >= today) ?? sorted[sorted.length - 1]
}

/**
 * Format a tee time from ISO string to local display (e.g. "7:30a")
 */
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

export async function GET() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { next: { revalidate: 30 } }
    )
    const data = await res.json()
    const event = data?.events?.[0]

    const today = new Date().toISOString().split('T')[0]
    const next_event = getNextEvent(today)

    if (!event) return NextResponse.json({ active: false, next_event })

    const competition = event.competitions?.[0]
    const competitors = competition?.competitors || []
    const status = competition?.status

    // Determine tournament's current round number from status detail
    // e.g. "Round 2 - In Progress" → 2
    const statusDetail = status?.type?.shortDetail || status?.type?.detail || ''
    const roundMatch = statusDetail.match(/Round\s*(\d+)/i)
    const tournamentRoundNum = roundMatch ? parseInt(roundMatch[1], 10) : 1

    // Sort by score
    interface EspnLineScore {
      displayValue?: string
      linescores?: Array<{ displayValue?: string }>
    }
    interface EspnCompetitor {
      score?: string
      athlete?: { displayName?: string; flag?: { alt?: string }; [k: string]: unknown }
      // Team events (e.g. Zurich Classic) return `team` instead of `athlete`.
      // displayName ya viene con formato "Apellido1/Apellido2".
      team?: { displayName?: string; shortDisplayName?: string; [k: string]: unknown }
      status?: { type?: { state?: string; completed?: boolean }; teeTime?: string; startDate?: string; [k: string]: unknown }
      linescores?: EspnLineScore[]
      [k: string]: unknown
    }
    const sorted = [...(competitors as EspnCompetitor[])].sort((a, b) => {
      const sa = parseFloat(a.score ?? '0') || 0
      const sb = parseFloat(b.score ?? '0') || 0
      return sa - sb
    })

    const top10 = sorted.slice(0, 10).map((c: EspnCompetitor, index: number) => {
      // Score total
      const rawScore = parseFloat(c.score ?? '0')
      let score = 'E'
      if (!isNaN(rawScore)) {
        score = rawScore < 0 ? String(rawScore) : rawScore > 0 ? `+${rawScore}` : 'E'
      }

      // All rounds data
      const rounds: EspnLineScore[] = c.linescores || []

      // Current round = the one matching tournamentRoundNum (0-indexed)
      // If tournament is in R2, we want rounds[1], not the last one with data
      const currentRoundIdx = tournamentRoundNum - 1
      const currentRound = rounds[currentRoundIdx]
      const holesInCurrentRound = (currentRound?.linescores || []).length

      // Determine player status for current round:
      // - Has holes in current round? → playing or finished today
      // - No holes in current round? → hasn't started yet
      const hasStartedCurrentRound = holesInCurrentRound > 0

      // Score de hoy (current round only)
      let todayScore = 'E'
      if (hasStartedCurrentRound && currentRound?.displayValue) {
        const raw = parseFloat(currentRound.displayValue)
        if (!isNaN(raw)) {
          todayScore = raw < 0 ? String(raw) : raw > 0 ? `+${raw}` : 'E'
        }
      }

      // Thru — the critical logic:
      // 1. Player finished current round (18 holes) → "F"
      // 2. Player is playing (1-17 holes) → show hole number
      // 3. Player hasn't started → show tee time or "—"
      let thru = '—'
      if (hasStartedCurrentRound) {
        thru = holesInCurrentRound >= 18 ? 'F' : String(holesInCurrentRound)
      } else {
        // Try to get tee time from ESPN's status or competitor data
        const teeTime = c.status?.teeTime || c.status?.startDate
        if (teeTime) {
          thru = formatTeeTime(teeTime)
        }
      }

      // Posición con ties reales: todos los empatados comparten el número más bajo
      const myScore = parseFloat(c.score ?? '0')
      const firstWithSameScore = sorted.findIndex(s => parseFloat(s.score ?? '0') === myScore)
      const hasTie = sorted.filter(s => parseFloat(s.score ?? '0') === myScore).length > 1
      const pos = hasTie ? `T${firstWithSameScore + 1}` : String(index + 1)

      // Team events (Zurich Classic) traen `team.displayName` en formato
      // "Apellido1/Apellido2" y no tienen un único country/flag. Individuales
      // traen `athlete.displayName` y `athlete.flag.alt`.
      const isTeam = !c.athlete && !!c.team
      const fullDisplay = c.athlete?.displayName || c.team?.displayName || ''
      const shortDisplay = isTeam
        ? (c.team?.shortDisplayName || c.team?.displayName || '')
        : nombreCorto(c.athlete?.displayName || '')

      // Country → flag image URL (flagcdn.com). Team events: sin bandera.
      const country = isTeam ? '' : (c.athlete?.flag?.alt ?? '')
      const countryCode = COUNTRY_ISO[country] || ''
      const flagUrl = countryCode
        ? `https://flagcdn.com/w40/${countryCode}.png`
        : ''

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

    // Bandera global del torneo — si todos los competidores son equipos,
    // es un team event (Zurich Classic, Hero World Challenge, etc.).
    const isTeamEvent = sorted.length > 0 && sorted.every(c => !c.athlete && !!c.team)

    const isLive = status?.type?.state === 'in'
    const isComplete = status?.type?.state === 'post'

    // Course — ESPN fallback to our schedule
    const course = competition?.venue?.fullName
      || PGA_2026.find(e => (event.name || '').toLowerCase().includes(e.name.toLowerCase().split(' ')[0]))?.venue
      || ''

    return NextResponse.json({
      active: true,
      live: isLive,
      complete: isComplete,
      tournament: event.name || event.shortName || '',
      round: traducirRonda(status?.type?.shortDetail || ''),
      course,
      players: top10,
      next_event,
      isTeamEvent,
    })
  } catch {
    return NextResponse.json({ active: false, players: [] })
  }
}
