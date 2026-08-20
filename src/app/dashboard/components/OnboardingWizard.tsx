'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Step = 1 | 2 | 3

type Props = {
  userId: string
  userName: string
}

// ────────────────────────── Styles ──────────────────────────

const CONTAINER: React.CSSProperties = {
  minHeight: '100dvh',
  background: 'var(--bg, #ffffff)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
}

const CARD: React.CSSProperties = {
  width: '100%',
  maxWidth: 400,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 32,
}

const HEADING: React.CSSProperties = {
  fontFamily: 'var(--font-display, "Playfair Display", serif)',
  fontSize: '1.75rem',
  fontWeight: 700,
  color: 'var(--text, #111)',
  textAlign: 'center',
  lineHeight: 1.2,
  margin: 0,
}

const SUBTEXT: React.CSSProperties = {
  fontSize: '0.9375rem',
  color: 'var(--text-3, #888)',
  textAlign: 'center',
  lineHeight: 1.5,
  margin: 0,
}

const CTA: React.CSSProperties = {
  width: '100%',
  padding: '14px 0',
  borderRadius: 12,
  border: 'none',
  background: 'var(--brand, #b8860b)',
  color: '#fff',
  fontFamily: 'var(--font-display, "Playfair Display", serif)',
  fontSize: '1.0625rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
}

const SECONDARY_BTN: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-2, #666)',
  fontSize: '0.875rem',
  cursor: 'pointer',
  padding: '8px 0',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
}

const INPUT: React.CSSProperties = {
  width: '100%',
  maxWidth: 180,
  padding: '14px 16px',
  borderRadius: 12,
  border: '1.5px solid var(--border, #e0e0e0)',
  background: 'var(--bg-surface, #fafafa)',
  fontSize: '2rem',
  fontWeight: 700,
  textAlign: 'center',
  color: 'var(--text, #111)',
  outline: 'none',
  fontFamily: 'inherit',
}

// ────────────────────────── Dots ──────────────────────────

function StepDots({ current }: { current: Step }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {([1, 2, 3] as const).map((s) => (
        <div
          key={s}
          style={{
            width: s === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: s === current ? 'var(--brand, #b8860b)' : 'var(--border, #e0e0e0)',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}

// ────────────────────────── Component ──────────────────────────

export function OnboardingWizard({ userId, userName }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [handicap, setHandicap] = useState('')
  const [noHandicap, setNoHandicap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [courseQuery, setCourseQuery] = useState('')
  const [courseResults, setCourseResults] = useState<Array<{ id: string; nombre: string; club_name: string }>>([])
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const firstName = userName.split(' ')[0]

  // ── Step 1: save handicap ──
  const handleSaveHandicap = useCallback(async () => {
    setSaving(true)
    try {
      const supabase = createClient()
      const indice = noHandicap ? null : parseFloat(handicap)
      await supabase.from('profiles').update({ indice }).eq('id', userId)
      setStep(2)
    } finally {
      setSaving(false)
    }
  }, [handicap, noHandicap, userId])

  const canAdvanceStep1 = noHandicap || (handicap !== '' && !isNaN(parseFloat(handicap)) && parseFloat(handicap) >= 0 && parseFloat(handicap) <= 54)

  // ── Step 2: course search ──
  const handleSearch = useCallback(async (q: string) => {
    setCourseQuery(q)
    if (q.length < 2) {
      setCourseResults([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setCourseResults((data.courses || data || []).slice(0, 5))
      }
    } finally {
      setSearching(false)
    }
  }, [])

  const handleSelectCourse = useCallback((course: { id: string; nombre: string; club_name: string }) => {
    setSelectedCourse(course.nombre)
    try {
      localStorage.setItem('gp_home_course', JSON.stringify({ id: course.id, nombre: course.nombre, club_name: course.club_name }))
    } catch {
      // localStorage may not be available
    }
    setStep(3)
  }, [])

  // ── Render steps ──
  return (
    <div style={CONTAINER}>
      <div style={CARD}>
        <StepDots current={step} />

        {/* ── STEP 1: Handicap ── */}
        {step === 1 && (
          <div style={{ ...CARD, animation: 'fadeIn 0.3s ease' }}>
            <h1 style={HEADING}>Bienvenido, {firstName}</h1>
            <p style={SUBTEXT}>
              Tu handicap nos ayuda a calcular tu score neto y darte insights personalizados.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
              <label style={{ fontSize: '0.8125rem', color: 'var(--text-2, #666)', fontWeight: 500 }}>
                Handicap Index
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={54}
                step={0.1}
                placeholder="18.4"
                value={noHandicap ? '' : handicap}
                disabled={noHandicap}
                onChange={(e) => setHandicap(e.target.value)}
                style={{
                  ...INPUT,
                  opacity: noHandicap ? 0.4 : 1,
                }}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-2, #666)' }}>
                <input
                  type="checkbox"
                  checked={noHandicap}
                  onChange={(e) => {
                    setNoHandicap(e.target.checked)
                    if (e.target.checked) setHandicap('')
                  }}
                  style={{ accentColor: 'var(--brand, #b8860b)' }}
                />
                No tengo / No se
              </label>
            </div>

            <button
              onClick={handleSaveHandicap}
              disabled={!canAdvanceStep1 || saving}
              style={{ ...CTA, opacity: canAdvanceStep1 && !saving ? 1 : 0.5 }}
            >
              {saving ? 'Guardando...' : 'Siguiente'}
            </button>
          </div>
        )}

        {/* ── STEP 2: Course ── */}
        {step === 2 && (
          <div style={{ ...CARD, animation: 'fadeIn 0.3s ease' }}>
            <h1 style={HEADING}>Tu cancha habitual</h1>
            <p style={SUBTEXT}>
              Asi pre-llenamos tu cancha cuando crees una ronda nueva.
            </p>

            <div style={{ width: '100%', position: 'relative' }}>
              <input
                type="text"
                placeholder="Buscar cancha..."
                value={courseQuery}
                onChange={(e) => handleSearch(e.target.value)}
                style={{
                  ...INPUT,
                  maxWidth: '100%',
                  fontSize: '1rem',
                  fontWeight: 400,
                  textAlign: 'left',
                }}
              />

              {courseResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  background: 'var(--bg-surface, #fff)',
                  border: '1px solid var(--border, #e0e0e0)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  zIndex: 20,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                }}>
                  {courseResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCourse(c)}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: '1px solid var(--border, #f0f0f0)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '0.9375rem',
                        color: 'var(--text, #111)',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                      {c.club_name && (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-3, #999)', marginTop: 2 }}>
                          {c.club_name}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {searching && (
                <div style={{ ...SUBTEXT, marginTop: 8 }}>Buscando...</div>
              )}
            </div>

            <button
              onClick={() => setStep(3)}
              style={SECONDARY_BTN}
            >
              Saltar por ahora
            </button>
          </div>
        )}

        {/* ── STEP 3: Ready ── */}
        {step === 3 && (
          <div style={{ ...CARD, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ fontSize: '3rem', lineHeight: 1 }}>&#9971;</div>

            <h1 style={HEADING}>
              {selectedCourse ? 'Listo para jugar' : 'Listo'}
            </h1>

            <p style={{ ...SUBTEXT, maxWidth: 320 }}>
              tAIger+ necesita conocer tu juego. Scorea una ronda y tu coach empieza a trabajar.
            </p>

            <button
              onClick={() => router.push('/ronda-libre/nueva')}
              style={CTA}
            >
              Scorear mi primera ronda
            </button>

            <button
              onClick={() => router.push('/importar')}
              style={SECONDARY_BTN}
            >
              Importar tarjetas
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
