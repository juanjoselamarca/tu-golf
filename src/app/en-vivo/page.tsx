'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { formatLabel } from '@/golf/core/rules'
import { Radio, Flag } from '@/components/icons'

interface JugadorEnVivo {
  id: string
  nombre: string
  holesCompleted: number
  totalGross: number
  vsPar: number
  stablefordPts: number
  totalHoles: number
}

function formatVsPar(vsPar: number): string {
  if (vsPar === 0) return 'E'
  if (vsPar > 0) return `+${vsPar}`
  return `${vsPar}`
}

interface RondaEnVivo {
  id: string
  codigo: string
  course_name: string
  tees: string
  holes: number
  fecha: string
  hoyo_inicio: number
  formato_juego: string
  jugadores: JugadorEnVivo[]
  maxHolesCompleted: number
  totalJugadores: number
}

export default function EnVivoPage() {
  const [rondas, setRondas] = useState<RondaEnVivo[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  // Ref espejo de busqueda para que cargarFeed sea estable.
  // Sin esto, cada keystroke recreaba el callback y destruía/creaba
  // la suscripción Supabase realtime (WebSocket churn en mobile).
  const busquedaRef = useRef('')
  useEffect(() => { busquedaRef.current = busqueda }, [busqueda])

  const cargarFeed = useCallback(async () => {
    try {
      const busq = busquedaRef.current
      const params = busq.trim().length >= 2 ? `?cancha=${encodeURIComponent(busq.trim())}` : ''
      const res = await fetch(`/api/en-vivo${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setRondas(json.rondas ?? [])
      setFetchError(false)
    } catch {
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Check auth
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => setIsLoggedIn(!!data.session))
  }, [])

  // Load + Realtime + polling fallback (montaje único, no se recrea con búsqueda)
  useEffect(() => {
    cargarFeed()

    const supabase = createClient()
    const channel = supabase.channel('feed-global-en-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rondas_libres' }, () => cargarFeed())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ronda_libre_jugadores' }, () => cargarFeed())
      .subscribe()

    const interval = setInterval(cargarFeed, 60000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [cargarFeed])

  // Debounce search — skip first run para evitar doble fetch en montaje
  const isFirstSearchRef = useRef(true)
  useEffect(() => {
    if (isFirstSearchRef.current) {
      isFirstSearchRef.current = false
      return
    }
    const t = setTimeout(cargarFeed, 400)
    return () => clearTimeout(t)
  }, [busqueda, cargarFeed])

  const tiempoRelativo = (fecha: string) => {
    const diff = Date.now() - new Date(fecha).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Ahora'
    if (mins < 60) return `Hace ${mins}m`
    const hrs = Math.floor(mins / 60)
    return `Hace ${hrs}h`
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', padding: '0 0 100px' }}>
      {/* Header sticky */}
      <div style={{
        position: 'sticky', top: 56, zIndex: 40,
        background: 'var(--bg-surface)', backdropFilter: 'blur(12px)',
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: rondas.length >= 3 ? '12px' : '0' }}>
          {/* Dot pulsante */}
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: rondas.length > 0 ? '#4ade80' : 'var(--border-md)',
            boxShadow: rondas.length > 0 ? '0 0 8px rgba(74,222,128,0.6)' : 'none',
            animation: rondas.length > 0 ? 'livePulse 2s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }} />
          <h1 style={{
            fontFamily: 'var(--font-playfair)', fontSize: '22px', fontWeight: 700,
            color: 'var(--text)', margin: 0, flex: 1,
          }}>En Vivo</h1>
          {rondas.length > 0 && (
            <span style={{
              fontSize: '9px', fontWeight: 700, fontFamily: 'DM Mono, monospace',
              letterSpacing: '0.08em', padding: '2px 8px', borderRadius: '4px',
              background: 'rgba(74,222,128,0.15)', color: '#4ade80',
              border: '1px solid rgba(74,222,128,0.3)',
            }}>{rondas.length} ACTIVA{rondas.length > 1 ? 'S' : ''}</span>
          )}
        </div>

        {/* Buscador — solo si hay 3+ rondas */}
        {rondas.length >= 3 && (
          <input
            type="text"
            placeholder="Buscar cancha..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: '10px', color: 'var(--text)', fontSize: '14px',
              fontFamily: 'var(--font-dm-sans)', outline: 'none',
            }}
          />
        )}
      </div>

      {/* Feed */}
      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>Cargando...</div>
        ) : fetchError ? (
          /* Error de conexión */
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}><Radio size={56} strokeWidth={1.5} /></div>
            <h2 style={{
              fontFamily: 'var(--font-playfair)', fontSize: '22px', fontWeight: 700,
              color: 'var(--text)', marginBottom: '8px',
            }}>Sin conexión</h2>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '14px',
              color: 'var(--text-2)', marginBottom: '24px', lineHeight: 1.6,
            }}>
              No pudimos cargar las rondas en vivo. Verifica tu conexión a internet.
            </p>
            <button onClick={() => { setFetchError(false); setLoading(true); cargarFeed() }} style={{
              padding: '14px 28px', background: 'var(--brand)', color: 'var(--brand-dark)',
              borderRadius: '10px', fontSize: '15px', fontWeight: 700, border: 'none', cursor: 'pointer',
            }}>Reintentar</button>
          </div>
        ) : rondas.length === 0 ? (
          /* Estado vacío */
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}><Flag size={56} strokeWidth={1.5} /></div>
            <h2 style={{
              fontFamily: 'var(--font-playfair)', fontSize: '22px', fontWeight: 700,
              color: 'var(--text)', marginBottom: '8px',
            }}>Nadie jugando ahora</h2>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '14px',
              color: 'var(--text-2)', marginBottom: '24px', lineHeight: 1.6,
            }}>
              Las rondas activas aparecen aquí en tiempo real.
            </p>
            {isLoggedIn ? (
              <Link href="/ronda-libre/nueva" style={{
                display: 'inline-block', padding: '14px 28px',
                background: 'var(--brand)', color: 'var(--brand-dark)',
                borderRadius: '10px', fontSize: '15px', fontWeight: 700,
                textDecoration: 'none',
              }}>Crea una ronda y empieza a jugar →</Link>
            ) : (
              <Link href="/register" style={{
                display: 'inline-block', padding: '14px 28px',
                background: 'var(--brand)', color: 'var(--brand-dark)',
                borderRadius: '10px', fontSize: '15px', fontWeight: 700,
                textDecoration: 'none',
              }}>Crear cuenta — es gratis →</Link>
            )}
          </div>
        ) : (
          /* Rondas activas — agrupadas por cancha (H15: evita duplicación del header de club) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {(() => {
              // Agrupa rondas manteniendo orden del feed (rondas ya vienen ordenadas por recencia)
              const orderedCourses: string[] = []
              const byCourse = new Map<string, RondaEnVivo[]>()
              rondas.forEach(r => {
                const key = r.course_name
                if (!byCourse.has(key)) {
                  byCourse.set(key, [])
                  orderedCourses.push(key)
                }
                byCourse.get(key)!.push(r)
              })
              return orderedCourses.map(courseName => {
                const grupo = byCourse.get(courseName)!
                const showHeader = grupo.length > 1
                return (
                  <div key={courseName} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {showHeader && (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: '10px', padding: '0 2px',
                      }}>
                        <h2 style={{
                          fontFamily: 'var(--font-playfair)', fontSize: '16px', fontWeight: 700,
                          color: 'var(--text)', margin: 0, letterSpacing: '-0.01em',
                        }}>{courseName}</h2>
                        <span style={{
                          fontSize: '10px', fontWeight: 600, fontFamily: 'DM Mono, monospace',
                          color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>{grupo.length} rondas</span>
                      </div>
                    )}
                    {grupo.map(ronda => (
              <Link
                key={ronda.id}
                href={`/ronda-libre/${ronda.codigo}`}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px', padding: '16px',
                  transition: 'background 0.15s',
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Si el grupo tiene header, omitimos el course_name para evitar duplicación (H15) */}
                        {!showHeader && (
                          <div style={{
                            fontSize: '15px', fontWeight: 700, color: 'var(--text)',
                            fontFamily: 'var(--font-dm-sans)',
                          }}>{ronda.course_name}</div>
                        )}
                        {/* Badge defensivo "9/18 HOYOS" — nunca confundir rondas de 9 con 18 */}
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 9px',
                          background: ronda.holes <= 9 ? 'rgba(196,153,42,0.22)' : 'rgba(196,153,42,0.12)',
                          color: '#8A6A16',
                          border: ronda.holes <= 9 ? '1px solid rgba(196,153,42,0.55)' : '1px solid rgba(196,153,42,0.28)',
                          borderRadius: '999px',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          fontFamily: 'DM Mono, monospace',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}>{ronda.holes} HOYOS</span>
                        {/* Badge de formato — el espectador siempre sabe qué modalidad se juega */}
                        {ronda.formato_juego && (
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 9px',
                            background: 'rgba(196,153,42,0.15)',
                            color: '#8A6A16',
                            border: '1px solid rgba(196,153,42,0.32)',
                            borderRadius: '999px',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            fontFamily: 'DM Mono, monospace',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>{formatLabel(ronda.formato_juego)}</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '11px', fontFamily: 'DM Mono, monospace',
                        color: 'var(--text-3)', marginTop: '2px',
                      }}>
                        {ronda.totalJugadores} jugador{ronda.totalJugadores > 1 ? 'es' : ''} · {tiempoRelativo(ronda.fecha)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, fontFamily: 'DM Mono, monospace',
                      padding: '3px 8px', borderRadius: '6px',
                      background: 'rgba(200,165,90,0.18)', color: 'var(--gold)',
                      letterSpacing: '0.04em',
                    }}>THRU H.{ronda.maxHolesCompleted}</span>
                  </div>

                  {/* Jugadores */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {(() => { const isStab = ronda.formato_juego === 'stableford'; return ronda.jugadores
                      .slice()
                      .sort((a, b) => {
                        // Jugadores sin hoyos jugados van al final
                        if (a.holesCompleted === 0 && b.holesCompleted === 0) return 0
                        if (a.holesCompleted === 0) return 1
                        if (b.holesCompleted === 0) return -1
                        // Stableford: mayor pts primero. Stroke/otros: menor vsPar primero.
                        if (isStab) return b.stablefordPts - a.stablefordPts
                        return a.vsPar - b.vsPar
                      })
                      .slice(0, 4)
                      .map((j: JugadorEnVivo, idx: number) => (
                        <div key={j.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '4px 8px', borderRadius: '6px',
                          background: idx === 0 ? 'rgba(200,165,90,0.08)' : 'transparent',
                        }}>
                          <span style={{
                            fontSize: '13px', color: idx === 0 ? 'var(--ivory)' : 'var(--text-2)',
                            fontWeight: idx === 0 ? 600 : 400,
                          }}>
                            {idx + 1}. {j.nombre}
                          </span>
                          {isLoggedIn && j.holesCompleted > 0 && (
                            <span style={{
                              fontSize: '12px', fontWeight: 700, fontFamily: 'DM Mono, monospace',
                              color: 'var(--text-2)',
                              display: 'flex', alignItems: 'baseline', gap: '6px',
                            }}>
                              <span style={{ color: 'var(--text)' }}>
                                {isStab ? `${j.stablefordPts} pts` : formatVsPar(j.vsPar)}
                              </span>
                              {j.holesCompleted < j.totalHoles ? (
                                <span style={{
                                  fontSize: '10px', fontWeight: 500, color: 'var(--text-3)',
                                }}>
                                  en {j.holesCompleted} {j.holesCompleted === 1 ? 'hoyo' : 'hoyos'}
                                </span>
                              ) : !isStab ? (
                                <span style={{
                                  fontSize: '10px', fontWeight: 500, color: 'var(--text-3)',
                                }}>
                                  ({j.totalGross})
                                </span>
                              ) : null}
                            </span>
                          )}
                          {!isLoggedIn && (
                            <span style={{
                              fontSize: '10px', fontWeight: 600,
                              color: 'var(--brand)', letterSpacing: '0.02em',
                            }}>Ver →</span>
                          )}
                        </div>
                      )) })()}
                    {ronda.totalJugadores > 4 && (
                      <div style={{ fontSize: '12px', color: 'var(--text-3)', padding: '2px 8px' }}>
                        +{ronda.totalJugadores - 4} más
                      </div>
                    )}
                  </div>
                </div>
              </Link>
                    ))}
                  </div>
                )
              })
            })()}
          </div>
        )}

        {/* CTA para no registrados */}
        {!isLoggedIn && rondas.length > 0 && (
          <div style={{
            marginTop: '20px', padding: '16px',
            background: 'var(--gold-soft)', border: '1px solid var(--border-md)',
            borderRadius: '14px', textAlign: 'center',
          }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>
              Regístrate para ver scores completos
            </p>
            <Link href="/register" style={{
              fontSize: '14px', fontWeight: 700, color: 'var(--brand)',
              textDecoration: 'none',
            }}>Crear cuenta — es gratis →</Link>
          </div>
        )}
      </div>
    </div>
  )
}
