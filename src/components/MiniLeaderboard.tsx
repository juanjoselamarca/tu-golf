'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'

interface JugadorLB {
  id: string
  nombre: string
  user_id: string | null
  holesCompleted: number
  totalGross: number
  totalVsPar: number | null
  totalStableford: number
  totalNetVsPar: number | null
  lastHole: number | null
}

interface Props {
  codigoRonda: string
  parMap: Record<number, number>
  currentUserId: string | null
  totalHoles: number
  modoJuego?: ModoJuego
  formatoJuego?: FormatoJuego
  hcpMap?: Record<string, number>
  siMap?: Record<number, number>
}

export default function MiniLeaderboard({ codigoRonda, parMap, currentUserId, totalHoles, modoJuego = 'gross', formatoJuego = 'stroke_play', hcpMap = {}, siMap = {} }: Props) {
  const [jugadores, setJugadores] = useState<JugadorLB[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLB = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('rondas_libres')
      .select('ronda_libre_jugadores(id,nombre,user_id,scores)')
      .eq('codigo', codigoRonda)
      .single()

    if (!data) return

    const jug: JugadorLB[] = (data.ronda_libre_jugadores ?? []).map((j: { id: string; nombre: string; user_id: string | null; scores: Record<string, number> }) => {
      const sc = j.scores ?? {}
      const entries = Object.entries(sc).filter(([, s]) => Number(s) > 0)
      const holesCompleted = entries.length
      const totalGross = entries.reduce((a, [, s]) => a + Number(s), 0)
      const parForPlayedHoles = entries.reduce((a, [h]) => a + (parMap[parseInt(h)] ?? 4), 0)
      const totalVsPar = holesCompleted > 0 ? totalGross - parForPlayedHoles : null
      // Neto y Stableford para sorting correcto
      const hcp = hcpMap[j.id] ?? 18
      let totalStableford = 0
      let totalNetVsPar: number | null = null
      if (holesCompleted > 0) {
        let netSum = 0
        for (const [h, s] of entries) {
          const hNum = parseInt(h)
          const par = parMap[hNum] ?? 4
          const si = siMap[hNum] ?? hNum
          const strokes = strokesRecibidosEnHoyo(hcp, si)
          netSum += (Number(s) - strokes)
          totalStableford += puntosStablefordHoyo(Number(s), par, hcp, si)
        }
        totalNetVsPar = netSum - parForPlayedHoles
      }
      const holeNums = entries.map(([h]) => parseInt(h)).filter(n => !isNaN(n))
      const lastHole = holeNums.length > 0 ? Math.max(...holeNums) : null
      return { id: j.id, nombre: j.nombre, user_id: j.user_id ?? null, holesCompleted, totalGross, totalVsPar, totalStableford, totalNetVsPar, lastHole }
    })

    // Ordenar según modo de juego
    jug.sort((a, b) => {
      if (a.holesCompleted === 0 && b.holesCompleted === 0) return 0
      if (a.holesCompleted === 0) return 1
      if (b.holesCompleted === 0) return -1
      if (formatoJuego === 'stableford') return b.totalStableford - a.totalStableford // más puntos = mejor
      if (modoJuego === 'neto') return (a.totalNetVsPar ?? 0) - (b.totalNetVsPar ?? 0) // menos = mejor
      return (a.totalVsPar ?? 0) - (b.totalVsPar ?? 0) // gross: menos vs par = mejor
    })

    setJugadores(jug)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hcpMap/siMap son objetos nuevos cada render, parMap es estable
  }, [codigoRonda, parMap, modoJuego, formatoJuego])

  useEffect(() => {
    fetchLB()

    // Realtime como mecanismo primario
    const supabase = createClient()
    const channel = supabase.channel(`lb-${codigoRonda}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ronda_libre_jugadores',
      }, () => fetchLB())
      .subscribe()

    // Polling como fallback (60s en vez de 15s, Realtime cubre el caso normal)
    const interval = setInterval(fetchLB, 60000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetchLB, codigoRonda])

  if (loading || jugadores.length < 2) return null

  return (
    <div style={{ width: '100%', padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {jugadores.map((j, idx) => {
          const esYo = j.user_id === currentUserId
          const isLeading = idx === 0 && j.totalGross > 0
          const thruText = j.lastHole != null ? `H.${j.lastHole}` : '—'

          return (
            <div
              key={j.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderRadius: '10px', padding: '8px 12px',
                background: isLeading ? 'rgba(201,168,76,0.08)' : esYo ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isLeading ? 'rgba(201,168,76,0.2)' : esYo ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '12px', fontWeight: 700, width: '16px', textAlign: 'center',
                  color: isLeading ? '#c4992a' : 'rgba(255,255,255,0.3)',
                }}>{idx + 1}</span>
                <div>
                  <div style={{
                    fontSize: '13px', fontWeight: isLeading ? 600 : 400, lineHeight: 1.2,
                    color: isLeading ? '#edeae4' : 'rgba(255,255,255,0.55)',
                  }}>
                    {j.nombre}
                    {esYo && <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', marginLeft: '6px' }}>tu</span>}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.2 }}>
                    {j.holesCompleted}/{totalHoles} · {thruText}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {j.totalGross > 0 ? (
                  <>
                    <div style={{
                      fontSize: '14px', fontWeight: 700, lineHeight: 1.2,
                      // Paleta Garmin: under-par = birdie celeste, par = dorado neutral, over-par = discreto
                      color: j.totalVsPar != null && j.totalVsPar < 0 ? '#14B3D9' : j.totalVsPar === 0 ? '#c4992a' : 'rgba(255,255,255,0.55)',
                    }}>{j.totalGross}</div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.2 }}>
                      {j.totalVsPar == null ? '–' : j.totalVsPar === 0 ? 'Par' : j.totalVsPar > 0 ? `+${j.totalVsPar}` : `${j.totalVsPar}`}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.15)' }}>–</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ textAlign: 'center', fontSize: '9px', color: 'rgba(255,255,255,0.15)', marginTop: '6px' }}>Actualiza en tiempo real</div>
    </div>
  )
}
