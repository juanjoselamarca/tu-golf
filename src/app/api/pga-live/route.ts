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

const COUNTRY_FLAG: Record<string, string> = {
  'United States': '🇺🇸', 'South Korea': '🇰🇷', 'Canada': '🇨🇦',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Australia': '🇦🇺', 'Spain': '🇪🇸',
  'Norway': '🇳🇴', 'Sweden': '🇸🇪', 'Japan': '🇯🇵',
  'Ireland': '🇮🇪', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Germany': '🇩🇪',
  'France': '🇫🇷', 'Italy': '🇮🇹', 'Argentina': '🇦🇷',
  'Chile': '🇨🇱', 'Colombia': '🇨🇴', 'Mexico': '🇲🇽',
  'South Africa': '🇿🇦', 'Denmark': '🇩🇰', 'Belgium': '🇧🇪',
  'Netherlands': '🇳🇱', 'New Zealand': '🇳🇿', 'China': '🇨🇳',
  'Thailand': '🇹🇭', 'Brazil': '🇧🇷', 'Northern Ireland': '🇬🇧',
  'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Fiji': '🇫🇯', 'Venezuela': '🇻🇪',
  'Czech Republic': '🇨🇿', 'Austria': '🇦🇹', 'Portugal': '🇵🇹',
  'Philippines': '🇵🇭', 'Singapore': '🇸🇬', 'Taiwan': '🇹🇼',
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

    // Sort by score
    const sorted = [...(competitors as any[])].sort((a, b) => {
      const sa = parseFloat(a.score) || 0
      const sb = parseFloat(b.score) || 0
      return sa - sb
    })

    const top10 = sorted.slice(0, 10).map((c: any, index: number) => {
      // Score total
      const rawScore = parseFloat(c.score)
      let score = 'E'
      if (!isNaN(rawScore)) {
        score = rawScore < 0 ? String(rawScore) : rawScore > 0 ? `+${rawScore}` : 'E'
      }

      // Ronda actual — hoyos jugados desde linescores
      const rounds: any[] = c.linescores || []
      const currentRound = rounds.find((r: any) => r.linescores?.length > 0) || rounds[0]
      const holesPlayed = (currentRound?.linescores || []).length

      // Score de hoy
      let todayScore = 'E'
      if (currentRound?.displayValue) {
        const raw = parseFloat(currentRound.displayValue)
        if (!isNaN(raw)) {
          todayScore = raw < 0 ? String(raw) : raw > 0 ? `+${raw}` : 'E'
        }
      }

      // Thru
      const thru = holesPlayed >= 18 ? 'F' : holesPlayed > 0 ? String(holesPlayed) : '—'

      // Posición con ties
      const prevScore = index > 0 ? parseFloat(sorted[index - 1]?.score) : null
      const myScore = parseFloat(c.score)
      const pos = prevScore !== null && !isNaN(prevScore) && !isNaN(myScore) && prevScore === myScore
        ? `T${index + 1}` : String(index + 1)

      // País y bandera
      const country = c.athlete?.flag?.alt ?? ''
      const flag = COUNTRY_FLAG[country] || '🏳️'

      // Round number
      const roundNum = rounds.filter((r: any) => r.linescores?.length > 0).length || 1

      return {
        position: pos,
        name: nombreCorto(c.athlete?.displayName || ''),
        nameFull: c.athlete?.displayName || '',
        score,
        today: todayScore,
        thru,
        flag,
        country,
        roundNum,
      }
    })

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
    })
  } catch {
    return NextResponse.json({ active: false, players: [] })
  }
}
