import { NextResponse } from 'next/server'

const PGA_2026 = [
  { name: 'Valspar Championship',           start: '2026-03-20', end: '2026-03-23', venue: 'Innisbrook Resort (Copperhead)' },
  { name: "Texas Children's Houston Open",  start: '2026-03-27', end: '2026-03-30', venue: 'Memorial Park GC' },
  { name: 'The Masters',                    start: '2026-04-09', end: '2026-04-12', venue: 'Augusta National GC' },
  { name: 'RBC Heritage',                   start: '2026-04-16', end: '2026-04-19', venue: 'Harbour Town GL' },
  { name: 'Zurich Classic of New Orleans',  start: '2026-04-23', end: '2026-04-26', venue: 'TPC Louisiana' },
  { name: 'Wells Fargo Championship',       start: '2026-05-07', end: '2026-05-10', venue: 'Quail Hollow Club' },
  { name: 'PGA Championship',               start: '2026-05-21', end: '2026-05-24', venue: 'Valhalla GC' },
  { name: 'the Memorial Tournament',        start: '2026-06-04', end: '2026-06-07', venue: 'Muirfield Village GC' },
  { name: 'U.S. Open',                      start: '2026-06-18', end: '2026-06-21', venue: 'Shinnecock Hills GC' },
  { name: 'THE PLAYERS Championship',       start: '2026-03-12', end: '2026-03-15', venue: 'TPC Sawgrass' },
]

function getNextEvent(today: string) {
  const sorted = [...PGA_2026].sort((a, b) => a.start.localeCompare(b.start))
  return sorted.find(e => e.start >= today) ?? sorted[sorted.length - 1]
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        const linescores: { displayValue?: string }[] = c.linescores || []
        let todayScore = 'E'
        if (linescores.length > 0) {
          const last = linescores[linescores.length - 1]
          const raw  = parseFloat(last?.displayValue ?? '')
          if (!isNaN(raw)) {
            if (raw < 0) todayScore = String(raw)
            else if (raw > 0) todayScore = `+${raw}`
            else todayScore = 'E'
          } else {
            todayScore = last?.displayValue ?? 'E'
          }
        }

        const position =
          c.status?.position?.displayName ??
          c.status?.position?.id ??
          String(index + 1)

        const thru    = c.status?.thru ? `H${c.status.thru}` : 'F'
        const country = c.athlete?.flag?.alt ?? ''

        return { position, name: c.athlete?.displayName || '', score: totalScore, today: todayScore, thru, country }
      })

    const isLive     = status?.type?.state === 'in'
    const isComplete = status?.type?.state === 'post'

    return NextResponse.json({
      active:     true,
      live:       isLive,
      complete:   isComplete,
      tournament: event.shortName || event.name || '',
      round:      status?.type?.shortDetail || '',
      course:     competition?.venue?.fullName || 'TPC Sawgrass',
      players:    top10,
      next_event,
    })
  } catch {
    return NextResponse.json({ active: false })
  }
}
