import { NextResponse } from 'next/server'

const PGA_2026 = [
  { name: 'THE PLAYERS Championship',       start: '2026-03-12', end: '2026-03-15', venue: 'TPC Sawgrass' },
  { name: 'Valspar Championship',           start: '2026-03-20', end: '2026-03-23', venue: 'Innisbrook Resort, FL' },
  { name: "Texas Children's Houston Open",  start: '2026-03-27', end: '2026-03-30', venue: 'Memorial Park GC, TX' },
  { name: 'The Masters',                    start: '2026-04-09', end: '2026-04-12', venue: 'Augusta National, GA' },
  { name: 'RBC Heritage',                   start: '2026-04-16', end: '2026-04-19', venue: 'Harbour Town GL, SC' },
  { name: 'Zurich Classic of New Orleans',  start: '2026-04-23', end: '2026-04-26', venue: 'TPC Louisiana' },
  { name: 'Wells Fargo Championship',       start: '2026-05-07', end: '2026-05-10', venue: 'Quail Hollow Club, NC' },
  { name: 'PGA Championship',               start: '2026-05-14', end: '2026-05-17', venue: 'Aronimink GC, PA' },
  { name: 'the Memorial Tournament',        start: '2026-06-04', end: '2026-06-07', venue: 'Muirfield Village GC' },
  { name: 'U.S. Open',                      start: '2026-06-18', end: '2026-06-21', venue: 'Shinnecock Hills GC' },
]

function getNextEvent(today: string) {
  const sorted = [...PGA_2026].sort((a, b) => a.start.localeCompare(b.start))
  return sorted.find(e => e.end >= today) ?? sorted[sorted.length - 1]
}

export async function GET() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { next: { revalidate: 60 } }
    )
    const data = await res.json()
    const event = data?.events?.[0]

    const today = new Date().toISOString().split('T')[0]
    const next_event = getNextEvent(today)

    if (!event) return NextResponse.json({ active: false, next_event })

    const competition = event.competitions?.[0]
    const competitors = competition?.competitors || []
    const status      = competition?.status

    const top10 = (competitors as any[])
      .sort((a, b) => {
        const scoreA = parseFloat(a.score) || 0
        const scoreB = parseFloat(b.score) || 0
        return scoreA - scoreB
      })
      .slice(0, 10)
      .map((c, index: number) => {
        const rawScore = parseFloat(c.score)
        let totalScore = 'E'
        if (!isNaN(rawScore)) {
          if (rawScore < 0) totalScore = String(rawScore)
          else if (rawScore > 0) totalScore = `+${rawScore}`
          else totalScore = 'E'
        }

        // Get current round data from linescores
        const rounds: any[] = c.linescores || []
        const currentRound = rounds.find((r: any) => r.linescores?.length > 0 && (!r.linescores || r.linescores.length < 18 || !rounds[rounds.indexOf(r) + 1]?.linescores?.length))
          || rounds[rounds.length - 1]
        const holeScores: any[] = currentRound?.linescores || []
        const holesPlayed = holeScores.length

        // Today's round score
        let todayScore = 'E'
        if (currentRound?.displayValue) {
          const raw = parseFloat(currentRound.displayValue)
          if (!isNaN(raw)) {
            todayScore = raw < 0 ? String(raw) : raw > 0 ? `+${raw}` : 'E'
          }
        }

        // Position: ESPN doesn't give position in this endpoint, calculate from sort order
        const position = String(index + 1)
        // Handle ties
        const prevScore = index > 0 ? parseFloat((competitors as any[]).sort((a: any, b: any) => (parseFloat(a.score)||0) - (parseFloat(b.score)||0))[index - 1]?.score) : null
        const myScore = parseFloat(c.score)
        const posDisplay = prevScore !== null && prevScore === myScore ? `T${position}` : position

        // Thru: count holes with scores in current round
        const thru = holesPlayed >= 18 ? 'F' : holesPlayed > 0 ? String(holesPlayed) : '—'

        const country = c.athlete?.flag?.alt ?? ''
        const roundNum = rounds.filter((r: any) => r.linescores?.length > 0).length || 1

        return { position: posDisplay, name: c.athlete?.displayName || '', score: totalScore, today: todayScore, thru, country, roundNum }
      })

    const isLive     = status?.type?.state === 'in'
    const isComplete = status?.type?.state === 'post'

    return NextResponse.json({
      active:     true,
      live:       isLive,
      complete:   isComplete,
      tournament: event.shortName || event.name || '',
      round:      status?.type?.shortDetail || '',
      // Venue from ESPN API, fallback to our PGA_2026 schedule data
      course:     competition?.venue?.fullName
        || competition?.venue?.shortName
        || PGA_2026.find(e => (event.name || '').toLowerCase().includes(e.name.toLowerCase().split(' ')[0]))?.venue
        || '',
      players:    top10,
      next_event,
    })
  } catch {
    return NextResponse.json({ active: false })
  }
}
