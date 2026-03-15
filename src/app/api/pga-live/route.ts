import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { next: { revalidate: 60 } }
    )
    const data = await res.json()
    const event = data?.events?.[0]
    if (!event) return NextResponse.json({ active: false })

    const competition = event.competitions?.[0]
    const competitors = competition?.competitors || []
    const status = competition?.status

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
          const raw = parseFloat(last?.displayValue ?? '')
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

        const thru = c.status?.thru ? `H${c.status.thru}` : 'F'

        const country: string = c.athlete?.flag?.alt ?? ''

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
    })
  } catch {
    return NextResponse.json({ active: false })
  }
}
