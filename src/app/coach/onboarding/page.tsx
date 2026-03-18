'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
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
    text: '\u00bfCu\u00e1l es tu \u00edndice oficial de golf hoy?',
    badge: '\u26f3 Base de juego',
    options: ['M\u00e1s de 25', '16 a 25', '8 a 15', 'Menos de 8'],
  },
  {
    id: 'meta_principal',
    text: '\u00bfCu\u00e1l es tu principal objetivo con el golf este a\u00f1o?',
    badge: '\ud83c\udfaf Motivaci\u00f3n',
    options: ['Bajar mi \u00edndice', 'Disfrutar m\u00e1s', 'Ganar torneos', 'Jugar mejor con mis amigos'],
  },
  {
    id: 'mayor_fortaleza',
    text: '\u00bfCu\u00e1l es la parte m\u00e1s fuerte de tu juego?',
    badge: '\ud83d\udcca Diagn\u00f3stico t\u00e9cnico',
    options: ['Mi driver / tee shots', 'Mis hierros / approach', 'Mi juego corto', 'Mi putting'],
  },
  {
    id: 'mayor_debilidad',
    text: '\u00bfQu\u00e9 \u00e1rea te est\u00e1 costando M\u00c1S strokes actualmente?',
    badge: '\ud83d\udcca Diagn\u00f3stico t\u00e9cnico',
    options: ['Driver / salida', 'Hierros / approach', 'Juego corto', 'Putting'],
  },
  {
    id: 'respuesta_errores',
    text: 'Haces un triple bogey en el hoyo 3. \u00bfC\u00f3mo reaccionas normalmente?',
    badge: '\ud83e\udde0 Resiliencia mental',
    options: [
      'Me repongo r\u00e1pido y sigo',
      'Me irrita pero lo supero a la vuelta',
      'Me cuesta varios hoyos recuperarme',
      'Me afecta toda la ronda',
    ],
  },
  {
    id: 'presion_torneos',
    text: 'En un torneo importante, cuando est\u00e1s jugando bien a mitad de ronda...',
    badge: '\ud83e\udde0 Presi\u00f3n',
    options: [
      'Me crezco y sigo atacando',
      'Juego m\u00e1s conservador para cuidar el score',
      'Me pongo nervioso y empiezo a cometer errores',
      'Depende del d\u00eda',
    ],
  },
  {
    id: 'putting_emocional',
    text: '\u00bfQu\u00e9 pasa por tu mente cuando tienes un putt importante para par?',
    badge: '\ud83c\udfcc\ufe0f Rutina mental',
    options: [
      'Me fijo en NO fallar',
      'Visualizo la trayectoria y conf\u00edo',
      'Me tiemblan las manos',
      'Pienso demasiado en la t\u00e9cnica',
    ],
  },
  {
    id: 'tipo_practicante',
    text: '\u00bfC\u00f3mo describes tu pr\u00e1ctica habitual?',
    badge: '\ud83e\udde0 H\u00e1bitos',
    options: [
      'Estructurada con objetivos claros',
      'Practico lo que necesito mejorar',
      'Practico lo que ya hago bien',
      'Prefiero jugar al campo que practicar',
    ],
  },
  {
    id: 'back9_gestion',
    text: 'Vas en -1 despu\u00e9s de 9 hoyos. \u00bfC\u00f3mo afrontas el back 9?',
    badge: '\ud83c\udfcc\ufe0f VISION54',
    options: [
      'Sigo atacando igual',
      'Me pongo m\u00e1s conservador',
      'Empiezo a calcular qu\u00e9 score puedo hacer',
      'Juego hoyo a hoyo sin pensar en el total',
    ],
  },
  {
    id: 'rutina_preshot',
    text: 'Antes de ejecutar un golpe, normalmente...',
    badge: '\ud83c\udfcc\ufe0f Proceso',
    options: [
      'Tengo una rutina fija que siempre sigo',
      'A veces la sigo, a veces no',
      'Pienso mucho en la t\u00e9cnica antes de golpear',
      'Me preparo r\u00e1pido y golpeo',
    ],
  },
  {
    id: 'mal_dia',
    text: 'Cuando nada sale bien (todo al rough, tees malos), \u00bfqu\u00e9 haces?',
    badge: '\ud83e\udde0 Autocontrol',
    options: [
      'Me frustro pero lo verbalizo y sigo',
      'Me mantengo calmo y lo analizo',
      'La mala racha me baja el \u00e1nimo completamente',
      'Finjo que no pasa nada pero por dentro me afecta',
    ],
  },
  {
    id: 'motivaciones',
    text: '\u00bfQu\u00e9 m\u00e1s describe tu relaci\u00f3n con el golf? (Elige todas las que aplican)',
    badge: '\ud83c\udfaf Perfil completo',
    options: [
      'Me importa mucho ganar',
      'Quiero mejorar constantemente',
      'Lo m\u00e1s importante es disfrutar',
      'El aspecto social es clave',
      'Es mi escape del estr\u00e9s',
      'Me encantan las estad\u00edsticas',
    ],
    multiSelect: true,
  },
]

/* ─── Golf DNA derivation ───────────────────────────────────── */

function deriveGolfDNA(answers: Record<string, string | string[]>) {
  // Level from Q1
  const idx = answers.indice_actual as string
  let level = 'Jugador intermedio'
  if (idx === 'M\u00e1s de 25') level = 'Jugador en desarrollo'
  else if (idx === '16 a 25') level = 'Jugador intermedio'
  else if (idx === '8 a 15') level = 'Jugador avanzado'
  else if (idx === 'Menos de 8') level = 'Jugador elite'

  // Mental profile from Q5 (respuesta_errores) + Q6 (presion_torneos) + Q11 (mal_dia)
  const q5 = answers.respuesta_errores as string
  const q6 = answers.presion_torneos as string
  const q11 = answers.mal_dia as string

  let mentalScore = 0
  // Q5 scoring
  if (q5 === 'Me repongo r\u00e1pido y sigo') mentalScore += 3
  else if (q5 === 'Me irrita pero lo supero a la vuelta') mentalScore += 2
  else if (q5 === 'Me cuesta varios hoyos recuperarme') mentalScore += 1
  // Q6 scoring
  if (q6 === 'Me crezco y sigo atacando') mentalScore += 3
  else if (q6 === 'Juego m\u00e1s conservador para cuidar el score') mentalScore += 2
  else if (q6 === 'Depende del d\u00eda') mentalScore += 1
  // Q11 scoring
  if (q11 === 'Me mantengo calmo y lo analizo') mentalScore += 3
  else if (q11 === 'Me frustro pero lo verbalizo y sigo') mentalScore += 2
  else if (q11 === 'Finjo que no pasa nada pero por dentro me afecta') mentalScore += 1

  let mentalProfile = 'Mental en desarrollo'
  let mentalEmoji = '\ud83e\udde0'
  if (mentalScore >= 7) { mentalProfile = 'Fortaleza mental alta'; mentalEmoji = '\ud83d\udcaa' }
  else if (mentalScore >= 4) { mentalProfile = 'Mental con potencial'; mentalEmoji = '\u26a1' }

  // Priority area from Q4
  const weakness = answers.mayor_debilidad as string
  let priority = weakness || 'Juego general'

  // Approach description
  const goal = answers.meta_principal as string
  let approach = 'Te ayudar\u00e9 a mejorar tu juego con datos y estrategia mental.'
  if (goal === 'Bajar mi \u00edndice') approach = 'Nos enfocaremos en tu \u00e1rea d\u00e9bil y gesti\u00f3n del campo para bajar strokes reales.'
  else if (goal === 'Disfrutar m\u00e1s') approach = 'Trabajaremos tu relaci\u00f3n emocional con el golf para que cada ronda sea placentera.'
  else if (goal === 'Ganar torneos') approach = 'Entrenaremos tu mentalidad competitiva y gesti\u00f3n de presi\u00f3n en torneos.'
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
    bg: '#070d18',
    gold: '#C4992A',
    ivory: '#edeae4',
    gray: '#7a8fa8',
    card: '#0e1c2f',
    border: 'rgba(196,153,42,0.2)',
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
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>{'\ud83d\udc2f'}</div>

        <h1 style={{
          color: colors.gold, fontSize: '24px',
          fontFamily: '"Playfair Display", serif', fontWeight: 700,
          marginBottom: '12px',
        }}>
          Con\u00f3cete como golfista
        </h1>

        <p style={{ color: colors.gray, fontSize: '15px', lineHeight: 1.6, marginBottom: '28px' }}>
          12 preguntas basadas en ciencia deportiva.<br />
          3 minutos. Sin respuestas correctas ni incorrectas.<br />
          Tu perfil es \u00fanico y el tAIger se adaptar\u00e1 a ti.
        </p>

        {/* Scientific badges */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px',
          justifyContent: 'center', marginBottom: '36px',
        }}>
          {[
            '\ud83e\udde0 ACSI-28',
            '\ud83c\udfcc\ufe0f Rotella',
            '\ud83d\udcca VISION54',
            '\ud83d\udd2c SMTQ',
          ].map(b => (
            <span key={b} style={pillStyle}>{b}</span>
          ))}
        </div>

        <button onClick={() => setStep(0)} style={btnGold}>
          Comenzar \u2192
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
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>{'\ud83d\udc2f'}</div>
          <p style={{ color: '#dc2626', fontSize: '15px', marginBottom: '20px' }}>{saveError}</p>
          <button onClick={handleFinish} style={btnGold}>
            Reintentar
          </button>
        </div>
      )
    }

    return (
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{'\ud83e\uddec'}</div>

        <h1 style={{
          color: colors.gold, fontSize: '24px',
          fontFamily: '"Playfair Display", serif', fontWeight: 700,
          marginBottom: '8px',
        }}>
          Tu Golf DNA
        </h1>
        <p style={{ color: colors.gray, fontSize: '14px', marginBottom: '28px' }}>
          As\u00ed te ve el tAIger despu\u00e9s de conocerte
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
            { label: 'Nivel', value: dna.level, emoji: '\u26f3' },
            { label: 'Perfil mental', value: dna.mentalProfile, emoji: dna.mentalEmoji },
            { label: '\u00c1rea prioritaria', value: dna.priority, emoji: '\ud83c\udfaf' },
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
            {'\ud83d\udc2f'} C\u00f3mo trabajar\u00e1 el tAIger contigo
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
          {saving ? 'Guardando...' : 'Comenzar con el tAIger \u2192'}
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
                  {isSelected ? '\u2713' : ''}
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
          Continuar \u2192
        </button>
      )}
    </div>
  )
}
