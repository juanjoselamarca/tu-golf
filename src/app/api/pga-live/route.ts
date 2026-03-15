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

    const top10 = competitors
      .sort((a: { status?: { position?: { id?: string } } }, b: { status?: { position?: { id?: string } } }) => {
        const posA = parseInt(a.status?.position?.id || '99')
        const posB = parseInt(b.status?.position?.id || '99')
        return posA - posB
      })
      .slice(0, 10)
      .map((c: {
        status?: { position?: { displayName?: string }; thru?: number; displayValue?: string }
        athlete?: { displayName?: string }
        statistics?: { displayValue?: string }[]
      }) => ({
        position: c.status?.position?.displayName || '-',
        name:     c.athlete?.displayName || '',
        score:    c.statistics?.[0]?.displayValue || 'E',
        today:    c.statistics?.[1]?.displayValue || 'E',
        thru:     c.status?.thru || c.status?.displayValue || 'F',
      }))

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
