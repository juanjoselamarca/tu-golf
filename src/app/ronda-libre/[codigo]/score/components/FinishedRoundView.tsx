'use client'

import Link from 'next/link'
import { copyToClipboard } from '@/lib/clipboard'
import { createClient } from '@/lib/supabase'
import { publishRound } from '@/lib/data/rounds'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { compartirResultado } from '@/lib/share-card'
import type { ShareCardData } from '@/lib/share-card'
import type { MatchResult } from '@/golf/formats/match-play'
import type { RondaLibre, Jugador, HoleData } from '@/types/ronda'

interface FinishedRoundViewProps {
  ronda: RondaLibre
  finalScore: { gross: number; totalPar: number }
  historicalRoundId: string | null
  activeJugadorId: string | null
  jugadores: Jugador[]
  scores: Record<string, Record<number, number>>
  parMap: Record<number, number>
  playerHcp: Record<string, number>
  holeDataMap: Record<number, HoleData>
  codigo: string
  showStableford: boolean
  totalStableford: number
  isMatchPlay: boolean
  matchResult: MatchResult | null
  onContinueScoring: () => void
}

export function FinishedRoundView(props: FinishedRoundViewProps) {
  const {
    ronda, finalScore, historicalRoundId, activeJugadorId,
    scores, parMap, playerHcp, holeDataMap, codigo,
    showStableford: _showStableford, totalStableford,
    isMatchPlay, matchResult,
    onContinueScoring,
  } = props

  const diff = finalScore.gross - finalScore.totalPar
  const diffLabel = diff === 0 ? 'Par' : diff > 0 ? `+${diff} sobre par` : `${diff} bajo par`
  const diffColor = diff < 0 ? '#4ade80' : diff === 0 ? '#c9a84c' : '#f87171'

  // Count birdies/eagles — usa scores netos cuando el modo es neto
  const playerScores = activeJugadorId ? (scores[activeJugadorId] ?? {}) : {}
  const isStableford = ronda?.formato_juego === 'stableford'
  const isNeto = ronda?.modo_juego === 'neto'
  const shareHcp = activeJugadorId ? (playerHcp[activeJugadorId] ?? 0) : 0
  let birdieCount = 0, eagleCount = 0
  Object.entries(playerScores).forEach(([h, s]) => {
    const p = parMap[parseInt(h)] ?? 4
    let scoreForStats = s
    if (isNeto && shareHcp != null) {
      const si = holeDataMap[parseInt(h)]?.stroke_index ?? parseInt(h)
      scoreForStats = s - strokesRecibidosEnHoyo(shareHcp, si, ronda?.holes ?? 18)
    }
    if (scoreForStats === p - 1) birdieCount++
    if (scoreForStats <= p - 2) eagleCount++
  })

  // Mini scorecard data
  const totalHoles = ronda?.holes ?? 18
  const holeNums = Array.from({ length: totalHoles }, (_, i) => i + 1)

  const handleShareCard = async () => {
    if (!ronda || !activeJugadorId) return
    const jugador = (ronda.ronda_libre_jugadores ?? []).find(j => j.id === activeJugadorId)
    const playerName = jugador?.nombre ?? 'Jugador'
    const vsParStr = diff === 0 ? 'Par' : diff > 0 ? `+${diff}` : String(diff)

    // Si tenemos el ID de la tarjeta, compartir link a /tarjeta/[id]
    if (historicalRoundId) {
      // Compartir = publicar: la tarjeta queda visible para el destinatario.
      // RLS deja publicar solo al dueño; no bloquea el share si falla.
      await publishRound(createClient(), historicalRoundId)
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'
      const tarjetaUrl = `${siteUrl}/tarjeta/${historicalRoundId}`
      const text = isStableford
        ? `${playerName} hizo ${totalStableford} pts en ${ronda.course_name}`
        : `${playerName} jugó ${finalScore.gross} (${vsParStr}) en ${ronda.course_name}`

      if (navigator.share) {
        try { await navigator.share({ title: `${playerName} — Golfers+`, text, url: tarjetaUrl }); return } catch { /* cancelled */ }
      }
      await copyToClipboard(`${text}\n${tarjetaUrl}`)
      return
    }

    // Fallback: compartir imagen canvas (si no hay ID de tarjeta)
    const shareData: ShareCardData = {
      tipo: 'ronda_libre',
      ganador: playerName,
      esEmpate: false,
      scoreGross: isStableford ? totalStableford : finalScore.gross,
      scoreDiff: isStableford ? 0 : diff,
      courseName: ronda.course_name,
      fecha: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }),
      birdies: birdieCount,
      eagles: eagleCount,
      scoresByHole: playerScores,
      parsByHole: parMap,
      holesPlayed: totalHoles,
      formato_juego: ronda.formato_juego,
      modo_juego: ronda.modo_juego,
      // Match Play: pasar el display del resultado ("3&2", "All Square", etc.)
      // para que el share card muestre eso en vez de score + vs-par.
      matchResult: isMatchPlay && matchResult ? matchResult.display : undefined,
      stablefordPoints: isStableford ? totalStableford : undefined,
    }
    await compartirResultado(shareData)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, overflow: 'auto',
      background: 'radial-gradient(ellipse at 50% 20%, rgba(10,31,18,0.97) 0%, rgba(8,12,16,0.99) 100%)',
    }}>
      {/* Confetti particles */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 30 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${Math.random() * 100}%`,
            top: '-20px',
            width: Math.random() > 0.5 ? `${6 + Math.random() * 6}px` : `${4 + Math.random() * 4}px`,
            height: `${6 + Math.random() * 8}px`,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            backgroundColor: ['#c9a84c', '#16a34a', '#ffffff', '#d97706', '#86efac'][Math.floor(Math.random() * 5)],
            animation: `confettiFall ${2 + Math.random() * 2}s ${Math.random() * 2.5}s ease-in forwards`,
          }} />
        ))}
      </div>

      <div style={{ position: 'relative', maxWidth: '400px', margin: '0 auto', padding: '32px 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {/* Trophy */}
        <div style={{ fontSize: '72px', marginBottom: '8px', animation: 'trophyBounce 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>{'🏆'}</div>

        {/* Title */}
        <div style={{ fontSize: '12px', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '4px' }}>Ronda completada</div>

        {/* Score big */}
        <div style={{ fontSize: '72px', fontWeight: 900, color: diffColor, lineHeight: 1, marginBottom: '4px', textShadow: `0 0 40px ${diffColor}40` }}>
          {finalScore.gross}
        </div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: diffColor, marginBottom: '4px' }}>{diffLabel}</div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>{ronda?.course_name}</div>

        {/* Stats pills */}
        {(eagleCount > 0 || birdieCount > 0) && (
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '14px' }}>
            {eagleCount > 0 && <span style={{ color: '#c9a84c' }}>{eagleCount} eagle{eagleCount > 1 ? 's' : ''}</span>}
            {birdieCount > 0 && <span style={{ color: '#4ade80' }}>{birdieCount} birdie{birdieCount > 1 ? 's' : ''}</span>}
          </div>
        )}

        {/* Mini-análisis inteligente post-ronda */}
        {(() => {
          const par3s: number[] = [], par4s: number[] = [], par5s: number[] = []
          holeNums.forEach(h => {
            const s = playerScores[h]; const p = parMap[h] ?? 4
            if (s == null) return
            const d = s - p
            if (p === 3) par3s.push(d)
            else if (p === 4) par4s.push(d)
            else if (p >= 5) par5s.push(d)
          })
          const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
          const best = [
            { label: 'Par 3', avg: avg(par3s), count: par3s.length },
            { label: 'Par 4', avg: avg(par4s), count: par4s.length },
            { label: 'Par 5', avg: avg(par5s), count: par5s.length },
          ].filter(x => x.count > 0).sort((a, b) => a.avg - b.avg)

          const front9Diff = holeNums.slice(0, 9).reduce((sum, h) => sum + ((playerScores[h] ?? parMap[h] ?? 4) - (parMap[h] ?? 4)), 0)
          const back9Diff = totalHoles > 9 ? holeNums.slice(9, 18).reduce((sum, h) => sum + ((playerScores[h] ?? parMap[h] ?? 4) - (parMap[h] ?? 4)), 0) : null

          if (best.length === 0) return null
          return (
            <div style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Análisis rápido</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {best[0] && (
                  <div style={{ fontSize: '13px', color: '#4ade80' }}>
                    Tu fortaleza: {best[0].label} ({best[0].avg <= 0 ? `${best[0].avg.toFixed(1)} vs par` : `+${best[0].avg.toFixed(1)} vs par`})
                  </div>
                )}
                {best.length > 1 && best[best.length - 1].avg > 0.5 && (
                  <div style={{ fontSize: '13px', color: '#fbbf24' }}>
                    A mejorar: {best[best.length - 1].label} (+{best[best.length - 1].avg.toFixed(1)} vs par)
                  </div>
                )}
                {back9Diff !== null && Math.abs(front9Diff - back9Diff) >= 3 && (
                  <div style={{ fontSize: '13px', color: front9Diff < back9Diff ? '#4ade80' : '#f87171' }}>
                    {front9Diff < back9Diff ? `Ida más fuerte que vuelta (${front9Diff >= 0 ? '+' : ''}${front9Diff} vs ${back9Diff >= 0 ? '+' : ''}${back9Diff})` : `Vuelta más fuerte que ida (${back9Diff >= 0 ? '+' : ''}${back9Diff} vs ${front9Diff >= 0 ? '+' : ''}${front9Diff})`}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Scorecard table with OUT/IN/TOTAL */}
        {(() => {
          const front9 = holeNums.slice(0, 9).reduce((sum, h) => sum + (playerScores[h] ?? 0), 0)
          const back9 = holeNums.slice(9, 18).reduce((sum, h) => sum + (playerScores[h] ?? 0), 0)
          const cColor = (h: number) => {
            const s = playerScores[h]; const p = parMap[h] ?? 4
            if (s == null) return '#d1d5db'
            const d = s - p
            if (d <= -2) return '#c4992a'
            if (d === -1) return '#4ade80'
            if (d === 0) return '#4a5568'
            if (d === 1) return '#fbbf24'
            return '#f87171'
          }
          return (
            <div style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px', marginBottom: '20px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '300px', borderCollapse: 'collapse' }}>
                <tbody>
                  {/* Front 9 */}
                  <tr>
                    {holeNums.slice(0, 9).map(h => (
                      <td key={h} style={{ padding: '2px 1px', textAlign: 'center', fontSize: '8px', color: 'var(--text-3)' }}>{h}</td>
                    ))}
                    <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '8px', color: 'var(--text-2)', fontWeight: 700, borderLeft: '1px solid #e2e8f0' }}>OUT</td>
                  </tr>
                  <tr>
                    {holeNums.slice(0, 9).map(h => (
                      <td key={h} style={{ padding: '2px 1px', textAlign: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: cColor(h) }}>{playerScores[h] ?? '·'}</span>
                      </td>
                    ))}
                    <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--text)', borderLeft: '1px solid #e2e8f0' }}>{front9}</td>
                  </tr>
                  {/* Back 9 */}
                  {totalHoles > 9 && (
                    <>
                      <tr><td colSpan={10} style={{ padding: '3px' }} /></tr>
                      <tr>
                        {holeNums.slice(9, 18).map(h => (
                          <td key={h} style={{ padding: '2px 1px', textAlign: 'center', fontSize: '8px', color: 'var(--text-3)' }}>{h}</td>
                        ))}
                        <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '8px', color: 'var(--text-2)', fontWeight: 700, borderLeft: '1px solid #e2e8f0' }}>IN</td>
                      </tr>
                      <tr>
                        {holeNums.slice(9, 18).map(h => (
                          <td key={h} style={{ padding: '2px 1px', textAlign: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: cColor(h) }}>{playerScores[h] ?? '·'}</span>
                          </td>
                        ))}
                        <td style={{ padding: '2px 3px', textAlign: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--text)', borderLeft: '1px solid #e2e8f0' }}>{back9}</td>
                      </tr>
                      {/* Total */}
                      <tr>
                        <td colSpan={9} style={{ borderTop: '1px solid #e2e8f0', padding: '4px 0 0' }} />
                        <td style={{ borderTop: '1px solid #e2e8f0', padding: '4px 3px 0', textAlign: 'center', fontSize: '15px', fontWeight: 900, color: 'var(--text)' }}>{finalScore.gross}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* CTAs — different for solo vs multi-player */}
        {(() => {
          const isMultiPlayer = (ronda?.ronda_libre_jugadores ?? []).length > 1
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {isMultiPlayer ? (
                <>
                  <Link href={`/ronda-libre/${codigo}?finished=true`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', padding: '16px', background: 'linear-gradient(135deg, #c9a84c 0%, #d4a843 50%, #b8972f 100%)',
                    color: '#0a1419', fontWeight: 700, fontSize: '16px', borderRadius: '14px', textDecoration: 'none',
                    boxShadow: '0 4px 20px rgba(201,168,76,0.4)',
                  }}>
                    Ver leaderboard en vivo
                  </Link>
                  <button onClick={handleShareCard} style={{
                    width: '100%', padding: '14px', background: '#f3f4f6',
                    border: '1px solid var(--border)', color: 'var(--text)',
                    fontWeight: 600, fontSize: '14px', borderRadius: '12px', cursor: 'pointer',
                  }}>
                    Compartir mi score
                  </button>
                </>
              ) : (
                <button onClick={handleShareCard} style={{
                  width: '100%', padding: '16px', background: 'linear-gradient(135deg, #c9a84c 0%, #d4a843 50%, #b8972f 100%)',
                  color: '#0a1419', fontWeight: 700, fontSize: '16px', border: 'none', borderRadius: '14px', cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(201,168,76,0.4)',
                }}>
                  Compartir resultado
                </button>
              )}
              <Link href="/coach" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)',
                color: '#c9a84c', fontWeight: 600, fontSize: '14px',
                height: '52px', borderRadius: '12px', textDecoration: 'none',
              }}>
                Analizar con tAIger+
              </Link>
              <button
                onClick={onContinueScoring}
                style={{
                  width: '100%', padding: '12px',
                  background: 'none', border: 'none',
                  color: 'var(--text-3)', fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Editar scores
              </button>
            </div>
          )
        })()}

        <p style={{ color: '#d1d5db', fontSize: '11px', marginTop: '16px' }}>Golfers+ · El golf amateur en español</p>
      </div>

      {/* Confetti + trophy animations */}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes trophyBounce {
          0% { transform: scale(0) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.2) rotate(5deg); opacity: 1; }
          80% { transform: scale(0.95) rotate(-2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
