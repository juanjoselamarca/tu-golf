'use client'

import { useState, useCallback } from 'react'

interface StepSurveyProps {
  onComplete: (recommendation: 'photos' | 'garmin_zip') => void
}

type Q1Answer = 'menos_10' | 'entre_10_50' | 'mas_50' | 'no_garmin'
type Q2Answer = 'registrar' | 'patrones' | 'coaching'

const Q1_OPTIONS: { value: Q1Answer; label: string }[] = [
  { value: 'menos_10', label: 'Menos de 10' },
  { value: 'entre_10_50', label: 'Entre 10 y 50' },
  { value: 'mas_50', label: 'Mas de 50' },
  { value: 'no_garmin', label: 'No uso Garmin' },
]

const Q2_OPTIONS: { value: Q2Answer; label: string }[] = [
  { value: 'registrar', label: 'Registrar mis scores y tener mi historial' },
  { value: 'patrones', label: 'Entender mis patrones y tendencias' },
  { value: 'coaching', label: 'Coaching personalizado con inteligencia artificial' },
]

function getRecommendation(q1: Q1Answer, q2: Q2Answer): 'photos' | 'garmin_zip' {
  if (q1 === 'menos_10') return 'photos'
  if (q1 === 'no_garmin') return 'photos'
  if (q1 === 'mas_50') return 'garmin_zip'
  // entre_10_50
  if (q2 === 'registrar') return 'photos'
  return 'garmin_zip'
}

export default function StepSurvey({ onComplete }: StepSurveyProps) {
  const [question, setQuestion] = useState<1 | 2>(1)
  const [q1Answer, setQ1Answer] = useState<Q1Answer | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [slideDirection, setSlideDirection] = useState<'enter' | 'exit'>('enter')

  const handleQ1 = useCallback((answer: Q1Answer) => {
    setQ1Answer(answer)
    localStorage.setItem('golfers_import_survey_q1', answer)
    setSlideDirection('exit')
    setTimeout(() => {
      setQuestion(2)
      setSlideDirection('enter')
    }, 300)
  }, [])

  const handleQ2 = useCallback((answer: Q2Answer) => {
    if (!q1Answer) return
    localStorage.setItem('golfers_import_survey_q2', answer)
    localStorage.setItem('golfers_import_survey_done', 'true')
    localStorage.setItem('golfers_analysis_level', answer)

    // Save survey answers to profiles (non-blocking)
    const saveToProfile = async () => {
      try {
        const { createClient } = await import('@/lib/supabase')
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('profiles').update({
            analysis_level: answer,       // "registrar" | "patrones" | "coaching"
            golf_goals: q1Answer,         // "menos_10" | "entre_10_50" | "mas_50" | "no_garmin"
          }).eq('id', user.id)
        }
      } catch { /* non-blocking */ }
    }
    saveToProfile()

    setFinishing(true)
    const rec = getRecommendation(q1Answer, answer)

    setTimeout(() => {
      onComplete(rec)
    }, 600)
  }, [q1Answer, onComplete])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 'calc(100vh - 100px)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes surveySlideIn {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes surveySlideOut {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(-40px); }
        }
        @keyframes surveyFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes surveyCheckmark {
          0%   { opacity: 0; transform: scale(0.5); }
          60%  { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Step indicator */}
      <div style={{
        position: 'absolute',
        top: '0px',
        fontSize: '12px',
        color: 'var(--text-2)',
        fontFamily: "'DM Sans', sans-serif",
        letterSpacing: '0.05em',
        opacity: finishing ? 0 : 0.7,
        transition: 'opacity 0.3s ease',
      }}>
        {question} de 2
      </div>

      {/* Finishing animation */}
      {finishing && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          animation: 'surveyCheckmark 0.5s ease-out both',
        }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#c4992a" strokeWidth="2" fill="rgba(196,153,42,0.08)" />
            <polyline points="15,24 22,31 33,18" fill="none" stroke="#c4992a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--text, #fff)',
          }}>
            Listo
          </span>
        </div>
      )}

      {/* Questions */}
      {!finishing && (
        <div
          key={question}
          style={{
            width: '100%',
            maxWidth: '420px',
            animation: slideDirection === 'enter'
              ? 'surveySlideIn 0.3s ease-out both'
              : 'surveySlideOut 0.3s ease-out both',
          }}
        >
          {question === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '22px',
                fontWeight: 700,
                color: 'var(--text, #fff)',
                textAlign: 'center',
                marginBottom: '32px',
                lineHeight: 1.3,
              }}>
                Cuantas rondas tienes en Garmin Golf?
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                {Q1_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    onClick={() => handleQ1(opt.value)}
                    style={{
                      width: '100%',
                      height: '56px',
                      borderRadius: '14px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text, #fff)',
                      fontSize: '15px',
                      fontWeight: 500,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: 'pointer',
                      transition: 'border-color 0.2s, background 0.2s, color 0.2s, transform 0.15s',
                      animation: `surveyFadeIn 0.3s ease-out ${0.05 + i * 0.06}s both`,
                      padding: '0 20px',
                      textAlign: 'center',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(196,153,42,0.5)'
                      e.currentTarget.style.color = '#c4992a'
                      e.currentTarget.style.transform = 'scale(1.01)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                      e.currentTarget.style.color = 'var(--text, #fff)'
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {question === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '22px',
                fontWeight: 700,
                color: 'var(--text, #fff)',
                textAlign: 'center',
                marginBottom: '32px',
                lineHeight: 1.3,
              }}>
                Que nivel de analisis buscas?
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                {Q2_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    onClick={() => handleQ2(opt.value)}
                    style={{
                      width: '100%',
                      height: '56px',
                      borderRadius: '14px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text, #fff)',
                      fontSize: '15px',
                      fontWeight: 500,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: 'pointer',
                      transition: 'border-color 0.2s, background 0.2s, color 0.2s, transform 0.15s',
                      animation: `surveyFadeIn 0.3s ease-out ${0.05 + i * 0.06}s both`,
                      padding: '0 20px',
                      textAlign: 'center',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(196,153,42,0.5)'
                      e.currentTarget.style.color = '#c4992a'
                      e.currentTarget.style.transform = 'scale(1.01)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                      e.currentTarget.style.color = 'var(--text, #fff)'
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
