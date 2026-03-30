'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

interface RondaOption {
  id: string
  codigo: string
  course_name: string
  fecha: string
}

export default function NuevaSesionPage() {
  const router = useRouter()
  const [rondas, setRondas] = useState<RondaOption[]>([])
  const [showRondaSelector, setShowRondaSelector] = useState(false)
  const [selectedRonda, setSelectedRonda] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRondas = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Try join query first
      const { data: rondasJoin, error: joinErr } = await supabase
        .from('ronda_libre_jugadores')
        .select('ronda_id, rondas_libres!inner(id, codigo, course_name, fecha, holes)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      if (!joinErr && rondasJoin && rondasJoin.length > 0) {
        setRondas(rondasJoin.map((r: any) => ({
          id: r.rondas_libres.id,
          codigo: r.rondas_libres.codigo,
          course_name: r.rondas_libres.course_name,
          fecha: r.rondas_libres.fecha,
        })))
        return
      }

      // Fallback: direct query
      const { data: rondasCreadas } = await supabase
        .from('rondas_libres')
        .select('id, codigo, course_name, fecha')
        .eq('creador_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      if (rondasCreadas) {
        setRondas(rondasCreadas.map(r => ({
          id: r.id,
          codigo: r.codigo,
          course_name: r.course_name,
          fecha: r.fecha,
        })))
      }
    }

    fetchRondas()
  }, [])

  const handleAnalyzeRound = async (codigo: string) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/taiger/analyze-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ronda_libre_id: codigo }),
      })

      const data = await res.json()

      if (res.status === 429 && data.code === 'limit_reached') {
        setError('Has alcanzado el límite de sesiones gratuitas por hoy. Vuelve mañana para un nuevo análisis.')
        setLoading(false)
        return
      }

      if (res.status === 409 && data.session_id) {
        router.push(`/coach/sesion/${data.session_id}`)
        return
      }

      if (!res.ok) {
        setError(data.error || 'Error al analizar la ronda')
        setLoading(false)
        return
      }

      if (data.session_id) {
        router.push(`/coach/sesion/${data.session_id}`)
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.')
      setLoading(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: '#0e1c2f',
    border: '1px solid rgba(196,153,42,0.2)',
    borderRadius: 14,
    padding: 24,
    cursor: 'pointer',
    transition: 'border-color 0.2s, transform 0.2s',
  }

  if (loading) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 20,
      }}>
        <div style={{
          fontSize: 48,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          🐯
        </div>
        <p style={{
          color: '#c4992a',
          fontSize: 16,
          fontWeight: 500,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          tAIger+ está analizando tu ronda...
        </p>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 600, margin: '0 auto' }}>
      <Link href="/coach" style={{
        color: '#94a8c0', fontSize: '13px', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        marginBottom: '16px', minHeight: '44px',
      }}>
        ← Coach
      </Link>
      <h1 style={{
        color: '#edeae4',
        fontSize: 22,
        fontWeight: 700,
        marginBottom: 8,
        fontFamily: '"Playfair Display", serif',
      }}>
        Nueva sesión
      </h1>
      <p style={{ color: '#94a8c0', fontSize: 14, marginBottom: 24 }}>
        ¿Qué quieres trabajar hoy?
      </p>

      {error && (
        <div style={{
          background: 'rgba(220,38,38,0.12)',
          border: '1px solid rgba(220,38,38,0.3)',
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
          color: '#fca5a5',
          fontSize: 14,
        }}>
          {error}
          <button
            onClick={() => { setError(null); router.push('/coach') }}
            style={{
              display: 'block',
              marginTop: 12,
              background: 'rgba(196,153,42,0.15)',
              border: '1px solid rgba(196,153,42,0.3)',
              borderRadius: 8,
              padding: '8px 16px',
              color: '#c4992a',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Entendido
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Card 1: Análisis post-ronda */}
        <div
          style={cardStyle}
          onClick={() => setShowRondaSelector(!showRondaSelector)}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#c4992a')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(196,153,42,0.2)')}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>🏌️</div>
          <h2 style={{ color: '#edeae4', fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
            Análisis post-ronda
          </h2>
          <p style={{ color: '#94a8c0', fontSize: 13, margin: 0 }}>
            Revisamos hole a hole qué pasó, qué área te costó más y qué hacer esta semana para corregirlo.
          </p>

          {showRondaSelector && (
            <div
              style={{ marginTop: 16 }}
              onClick={e => e.stopPropagation()}
            >
              {rondas.length === 0 ? (
                <p style={{ color: '#94a8c0', fontSize: 13 }}>
                  No tienes rondas registradas aún.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ color: '#94a8c0', fontSize: 12, marginBottom: 4 }}>
                    Selecciona una ronda:
                  </label>
                  <select
                    value={selectedRonda || ''}
                    onChange={e => setSelectedRonda(e.target.value)}
                    style={{
                      background: '#070d18',
                      border: '1px solid rgba(196,153,42,0.3)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: '#edeae4',
                      fontSize: 14,
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    <option value="">— Elige ronda —</option>
                    {rondas.map(r => (
                      <option key={r.id} value={r.codigo}>
                        {r.course_name} — {r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR') : 'Sin fecha'}
                      </option>
                    ))}
                  </select>
                  {selectedRonda && (
                    <button
                      onClick={() => handleAnalyzeRound(selectedRonda)}
                      style={{
                        background: '#c4992a',
                        color: '#070d18',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 20px',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: 'pointer',
                        marginTop: 4,
                      }}
                    >
                      Analizar ronda
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 2: Plan semanal */}
        <div
          style={cardStyle}
          onClick={() => router.push('/coach/sesion/nueva/chat?tipo=weekly_plan')}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#c4992a')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(196,153,42,0.2)')}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>📅</div>
          <h2 style={{ color: '#edeae4', fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
            Plan semanal
          </h2>
          <p style={{ color: '#94a8c0', fontSize: 13, margin: 0 }}>
            Recibe un plan de práctica personalizado para la semana
          </p>
        </div>

        {/* Card 3: Consulta libre */}
        <div
          style={cardStyle}
          onClick={() => router.push('/coach/sesion/nueva/chat?tipo=free')}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#c4992a')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(196,153,42,0.2)')}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>💬</div>
          <h2 style={{ color: '#edeae4', fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
            Consulta libre
          </h2>
          <p style={{ color: '#94a8c0', fontSize: 13, margin: 0 }}>
            Pregúntale lo que quieras a tAIger+ sobre tu juego
          </p>
        </div>
      </div>
    </div>
  )
}
