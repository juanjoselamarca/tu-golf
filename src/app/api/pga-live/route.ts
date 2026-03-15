import { NextResponse } from 'next/server'

interface ESPNCompetitor {
  score?: string
  linescores?: { displayValue?: string }[]
  status?: {
    position?: { displayName?: string; id?: string }
    thru?: number
    type?: { shortDetail?: string }
    displayValue?: string
  }
  athlete?: { displayName?: string }
}

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
    const competitors: ESPNCompetitor[] = competition?.competitors || []

    const top10 = competitors
      .map((c) => {
        const totalScore = c.score ?? 'E'

        const linescores = c.linescores || []
        const todayLinescore = linescores[linescores.length - 1]
        const todayScore = todayLinescore?.displayValue ?? 'E'

        const position =
          c.status?.position?.displayName ??
          c.status?.position?.id ??
          '-'

        const thru = c.status?.thru
          ? `H${c.status.thru}`
          : c.status?.type?.shortDetail === 'F' || c.status?.displayValue === 'F'
          ? 'F'
          : c.status?.displayValue ?? '-'

        return { position, name: c.athlete?.displayName || '', score: totalScore, today: todayScore, thru }
      })
      .sort((a, b) => {
        const scoreA = parseFloat(a.score) || 0
        const scoreB = parseFloat(b.score) || 0
        return scoreA - scoreB
      })
      .slice(0, 10)

    return NextResponse.json({
      active:     true,
      tournament: event.name || '',
      round:      competition?.status?.type?.shortDetail || '',
      course:     competition?.venue?.fullName || '',
      players:    top10,
    })
  } catch {
    return NextResponse.json({ active: false })
  }
}
