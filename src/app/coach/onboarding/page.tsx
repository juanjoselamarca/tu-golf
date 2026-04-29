'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Flag, Zap } from '@/components/icons'
import type { ReactNode } from 'react'
import { trackEvent } from '@/lib/analytics'

/* ─── Questions ─────────────────────────────────────────────── */

interface Question {
  id: string
  text: string
  badge: string
  options: readonly string[]
  multiSelect?: boolean
}

const QUESTIONS: Question[] = [
  {
    id: 'indice_actual',
    text: '¿Cuál es tu índice oficial de golf hoy?',
    badge: 'Base de juego',
    options: ['Más de 25', '16 a 25', '8 a 15', 'Menos de 8'],
  },
  {
    id: 'meta_principal',
    text: '¿Cuál es tu principal objetivo con el golf este año?',
    badge: 'Motivación',
    options: ['Bajar mi índice', 'Disfrutar más', 'Ganar torneos', 'Jugar mejor con mis amigos'],
  },
  {
    id: 'mayor_fortaleza',
    text: '¿Cuál es la parte más fuerte de tu juego?',
    badge: 'Diagnóstico técnico',
    options: ['Mi driver / tee shots', 'Mis hierros / approach', 'Mi juego corto', 'Mi putting'],
  },
  {
    id: 'mayor_debilidad',
    text: '¿Qué área te está costando MÁS strokes actualmente?',
    badge: 'Diagnóstico técnico',
    options: ['Driver / salida', 'Hierros / approach', 'Juego corto', 'Putting'],
  },
  {
    id: 'respuesta_errores',
    text: 'Haces un triple bogey en el hoyo 3. ¿Cómo reaccionas normalmente?',
    badge: 'Resiliencia mental',
    options: [
      'Me repongo rápido y sigo',
      'Me irrita pero lo supero a la vuelta',
      'Me cuesta varios hoyos recuperarme',
      'Me afecta toda la ronda',
    ],
  },
  {
    id: 'presion_torneos',
    text: 'En un torneo importante, cuando estás jugando bien a mitad de ronda...',
    badge: 'Presión',
    options: [
      'Me crezco y sigo atacando',
      'Juego más conservador para cuidar el score',
      'Me pongo nervioso y empiezo a cometer errores',
      'Depende del día',
    ],
  },
  {
    id: 'putting_emocional',
    text: '¿Qué pasa por tu mente cuando tienes un putt importante para par?',
    badge: 'Rutina mental',
    options: [
      'Me fijo en NO fallar',
      'Visualizo la trayectoria y confío',
      'Me tiemblan las manos',
      'Pienso demasiado en la técnica',
    ],
  },
  {
    id: 'tipo_practicante',
    text: '¿Cómo describes tu práctica habitual?',
    badge: 'Hábitos',
    options: [
      'Estructurada con objetivos claros',
      'Practico lo que necesito mejorar',
      'Practico lo que ya hago bien',
      'Prefiero jugar al campo que practicar',
    ],
  },
  {
    id: 'back9_gestion',
    text: 'Vas en -1 después de 9 hoyos. ¿Cómo afrontas el back 9?',
    badge: 'VISION54',
    options: [
      'Sigo atacando igual',
      'Me pongo más conservador',
      'Empiezo a calcular qué score puedo hacer',
      'Juego hoyo a hoyo sin pensar en el total',
    ],
  },
  {
    id: 'rutina_preshot',
    text: 'Antes de ejecutar un golpe, normalmente...',
    badge: 'Proceso',
    options: [
      'Tengo una rutina fija que siempre sigo',
      'A veces la sigo, a veces no',
      'Pienso mucho en la técnica antes de golpear',
      'Me preparo rápido y golpeo',
    ],
  },
  {
    id: 'mal_dia',
    text: 'Cuando nada sale bien (todo al rough, tees malos), ¿qué haces?',
    badge: 'Autocontrol',
    options: [
      'Me frustro pero lo verbalizo y sigo',
      'Me mantengo calmo y lo analizo',
      'La mala racha me baja el ánimo completamente',
      'Finjo que no pasa nada pero por dentro me afecta',
    ],
  },
  {
    id: 'motivaciones',
    text: '¿Qué más describe tu relación con el golf? (Elige todas las que aplican)',
    badge: 'Perfil completo',
    options: [
      'Me importa mucho ganar',
      'Quiero mejorar constantemente',
      'Lo más importante es disfrutar',
      'El aspecto social es clave',
      'Es mi escape del estrés',
      'Me encantan las estadísticas',
    ],
    multiSelect: true,
  },
]

/* ─── Golf DNA derivation ───────────────────────────────────── */

function deriveGolfDNA(answers: Record<string, string | string[]>) {
  // Level from Q1
  const idx = answers.indice_actual as string
  let level = 'Jugador intermedio'
  if (idx === 'Más de 25') level = 'Jugador en desarrollo'
  else if (idx === '16 a 25') level = 'Jugador intermedio'
  else if (idx === '8 a 15') level = 'Jugador avanzado'
  else if (idx === 'Menos de 8') level = 'Jugador elite'

  // Mental profile from Q5 (respuesta_errores) + Q6 (presion_torneos) + Q11 (mal_dia)
  const q5 = answers.respuesta_errores as string
  const q6 = answers.presion_torneos as string
  const q11 = answers.mal_dia as string

  let mentalScore = 0
  // Q5 scoring
  if (q5 === 'Me repongo rápido y sigo') mentalScore += 3
  else if (q5 === 'Me irrita pero lo supero a la vuelta') mentalScore += 2
  else if (q5 === 'Me cuesta varios hoyos recuperarme') mentalScore += 1
  // Q6 scoring
  if (q6 === 'Me crezco y sigo atacando') mentalScore += 3
  else if (q6 === 'Juego más conservador para cuidar el score') mentalScore += 2
  else if (q6 === 'Depende del día') mentalScore += 1
  // Q11 scoring
  if (q11 === 'Me mantengo calmo y lo analizo') mentalScore += 3
  else if (q11 === 'Me frustro pero lo verbalizo y sigo') mentalScore += 2
  else if (q11 === 'Finjo que no pasa nada pero por dentro me afecta') mentalScore += 1

  let mentalProfile = 'Mental en desarrollo'
  let mentalEmoji: ReactNode = <Zap size={16} />
  if (mentalScore >= 7) { mentalProfile = 'Fortaleza mental alta'; mentalEmoji = <Zap size={16} /> }
  else if (mentalScore >= 4) { mentalProfile = 'Mental con potencial'; mentalEmoji = <Zap size={16} /> }

  // Priority area from Q4
  const weakness = answers.mayor_debilidad as string
  let priority = weakness || 'Juego general'

  // Approach description
  const goal = answers.meta_principal as string
  let approach = 'Te ayudaré a mejorar tu juego con datos y estrategia mental.'
  if (goal === 'Bajar mi índice') approach = 'Nos enfocaremos en tu área débil y gestión del campo para bajar strokes reales.'
  else if (goal === 'Disfrutar más') approach = 'Trabajaremos tu relación emocional con el golf para que cada ronda sea placentera.'
  else if (goal === 'Ganar torneos') approach = 'Entrenaremos tu mentalidad competitiva y gestión de presión en torneos.'
  else if (goal === 'Jugar mejor con mis amigos') approach = 'Potenciaremos tu consistencia y confianza para disfrutar y competir con tus amigos.'

  return { level, mentalProfile, mentalEmoji, priority, approach }
}

/* ─── Component ─────────────────────────────────────────────── */

export default function CoachOnboarding() {
  const router = useRouter()
  const [step, setStep] = useState(-1) // -1=welcome, 0-11=questions, 12=DNA
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Check if already completed → redirect
  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: psych } = await supabase
        .from('player_psych_profile')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle()
      if (psych?.onboarding_completed) {
        router.replace('/coach')
      }
    }
    check()
  }, [router])

  /* ── Handlers ── */

  const handleSingleSelect = (questionId: string, option: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: option }))
    // Auto-advance after 300ms
    setTimeout(() => setStep(prev => prev + 1), 300)
  }

  const handleMultiToggle = (questionId: string, option: string) => {
    setAnswers(prev => {
      const current = (prev[questionId] as string[]) || []
      const next = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option]
      return { ...prev, [questionId]: next }
    })
  }

  const handleFinish = async () => {
    setSaving(true)
    setSaveError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaveError('Debes estar logueado para continuar')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('player_psych_profile').upsert({
      user_id: user.id,
      onboarding_completed: true,
      onboarding_answers: answers,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    if (error) {
      console.error('Onboarding error:', JSON.stringify(error))
      setSaving(false)
      setSaveError(error.message || 'Error desconocido al guardar')
      return
    }

    await trackEvent(supabase, user.id, 'onboarding_completado', { questions: QUESTIONS.length })

    setSaving(false)
    router.push('/coach')
  }

  /* ── Styles ── */

  const colors = {
    bg: 'var(--bg)',
    gold: '#C4992A',
    ivory: 'var(--text)',
    gray: 'var(--text-2)',
    card: 'var(--bg-surface)',
    border: 'var(--border-md)',
  }

  const pillStyle: React.CSSProperties = {
    display: 'inline-block',
    background: 'rgba(196,153,42,0.1)',
    border: `1px solid ${colors.border}`,
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '13px',
    color: colors.gold,
    fontWeight: 500,
  }

  const btnGold: React.CSSProperties = {
    background: colors.gold,
    color: colors.bg,
    border: 'none',
    borderRadius: '12px',
    padding: '0 32px',
    minHeight: '52px',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
  }

  /* ─── Welcome Screen (step -1) ─────────────────────────────── */

  if (step === -1) {
    return (
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>{''}</div>

        <h1 style={{
          color: colors.gold, fontSize: '24px',
          fontFamily: '"Playfair Display", serif', fontWeight: 700,
          marginBottom: '12px',
        }}>
          Conócete como golfista
        </h1>

        <p style={{ color: colors.gray, fontSize: '15px', lineHeight: 1.6, marginBottom: '28px' }}>
          12 preguntas basadas en ciencia deportiva.<br />
          3 minutos. Sin respuestas correctas ni incorrectas.<br />
          Tu perfil es único y tAIger+ se adaptará a ti.
        </p>

        {/* Scientific badges */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px',
          justifyContent: 'center', marginBottom: '36px',
        }}>
          {[
            'ACSI-28',
            'Rotella',
            'VISION54',
            'SMTQ',
          ].map(b => (
            <span key={b} style={pillStyle}>{b}</span>
          ))}
        </div>

        <button onClick={() => setStep(0)} style={btnGold}>
          Comenzar →
        </button>
      </div>
    )
  }

  /* ─── Final DNA Screen (step 12) ───────────────────────────── */

  if (step === 12) {
    const dna = deriveGolfDNA(answers)

    if (saveError) {
      return (
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>{''}</div>
          <p style={{ color: '#dc2626', fontSize: '15px', marginBottom: '20px' }}>{saveError}</p>
          <button onClick={handleFinish} style={btnGold}>
            Reintentar
          </button>
        </div>
      )
    }

    return (
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{''}</div>

        <h1 style={{
          color: colors.gold, fontSize: '24px',
          fontFamily: '"Playfair Display", serif', fontWeight: 700,
          marginBottom: '8px',
        }}>
          Golfers+ DNA
        </h1>
        <p style={{ color: colors.gray, fontSize: '14px', marginBottom: '28px' }}>
          Así te ve tAIger+ después de conocerte
        </p>

        {/* DNA Summary Card */}
        <div style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: '14px',
          padding: '24px 20px',
          textAlign: 'left',
          marginBottom: '28px',
        }}>
          {[
            { label: 'Nivel', value: dna.level, emoji: <Flag size={16} /> },
            { label: 'Perfil mental', value: dna.mentalProfile, emoji: dna.mentalEmoji },
            { label: 'Área prioritaria', value: dna.priority, emoji: '' },
          ].map((row, i) => (
            <div key={row.label} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 0',
              borderBottom: i < 2 ? `1px solid ${colors.border}` : 'none',
            }}>
              <span style={{ fontSize: '20px', width: '28px', textAlign: 'center' }}>{row.emoji}</span>
              <div>
                <div style={{ color: colors.gray, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                  {row.label}
                </div>
                <div style={{ color: colors.ivory, fontSize: '15px', fontWeight: 600 }}>
                  {row.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Approach */}
        <div style={{
          background: 'rgba(196,153,42,0.06)',
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '16px 18px',
          marginBottom: '32px',
          textAlign: 'left',
        }}>
          <p style={{ color: colors.gray, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            {''} Cómo trabajará tAIger+ contigo
          </p>
          <p style={{ color: colors.ivory, fontSize: '14px', lineHeight: 1.5 }}>
            {dna.approach}
          </p>
        </div>

        <button
          onClick={handleFinish}
          disabled={saving}
          style={{
            ...btnGold,
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Guardando...' : 'Comenzar con tAIger+ →'}
        </button>
      </div>
    )
  }

  /* ─── Question Screen (step 0-11) ──────────────────────────── */

  const question = QUESTIONS[step]
  const progress = ((step + 1) / QUESTIONS.length) * 100
  const isMulti = question.multiSelect === true
  const multiAnswers = (isMulti ? (answers[question.id] as string[]) || [] : [])

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '32px 20px' }}>

      {/* Progress bar */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: colors.gold, fontSize: '13px', fontWeight: 600 }}>
            Pregunta {step + 1} de {QUESTIONS.length}
          </span>
          <span style={{ color: colors.gray, fontSize: '12px' }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ background: 'rgba(122,143,168,0.15)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
          <div style={{
            background: colors.gold, height: '100%', borderRadius: '4px',
            width: `${progress}%`, transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Badge */}
      <div style={{ marginBottom: '16px' }}>
        <span style={pillStyle}>{question.badge}</span>
      </div>

      {/* Question */}
      <h2 style={{
        color: colors.ivory, fontSize: '18px', fontWeight: 600,
        marginBottom: '28px', lineHeight: 1.45,
      }}>
        {question.text}
      </h2>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {question.options.map((opt) => {
          const isSelected = isMulti
            ? multiAnswers.includes(opt)
            : answers[question.id] === opt

          return (
            <button
              key={opt}
              onClick={() => isMulti ? handleMultiToggle(question.id, opt) : handleSingleSelect(question.id, opt)}
              style={{
                background: isSelected ? colors.gold : colors.card,
                color: isSelected ? colors.bg : colors.ivory,
                border: `1px solid ${isSelected ? colors.gold : colors.border}`,
                borderRadius: '12px',
                padding: '14px 18px',
                minHeight: '56px',
                fontSize: '15px',
                fontWeight: isSelected ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isMulti && (
                <span style={{
                  width: '20px', height: '20px', borderRadius: '4px',
                  border: `2px solid ${isSelected ? colors.bg : colors.gray}`,
                  background: isSelected ? colors.bg : 'transparent',
                  marginRight: '12px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', color: isSelected ? colors.gold : 'transparent',
                }}>
                  {isSelected ? '' : ''}
                </span>
              )}
              {opt}
            </button>
          )
        })}
      </div>

      {/* Multi-select continue button */}
      {isMulti && (
        <button
          onClick={() => setStep(prev => prev + 1)}
          disabled={multiAnswers.length === 0}
          style={{
            ...btnGold,
            marginTop: '20px',
            opacity: multiAnswers.length === 0 ? 0.4 : 1,
            cursor: multiAnswers.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Continuar →
        </button>
      )}
    </div>
  )
}
