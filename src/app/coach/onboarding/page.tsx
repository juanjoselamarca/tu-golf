'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'

const QUESTIONS = [
  { id: 'reaccion_bogey', text: '¿Cómo reaccionas cuando haces un bogey en el hoyo 1?', options: ['Me afecta el resto de la ronda', 'Un poco pero lo supero', 'Lo supero rápido'] },
  { id: 'motivacion', text: '¿Qué te motiva más en el golf?', options: ['Ganar torneos', 'Mejorar mi índice', 'Disfrutar con amigos'] },
  { id: 'rutina_preshot', text: '¿Tienes una rutina pre-shot definida?', options: ['Sí, siempre la misma', 'Más o menos', 'No tengo rutina'] },
  { id: 'juego_presion', text: '¿Cómo es tu juego bajo presión en torneos?', options: ['Subo mi nivel', 'Me pongo tenso', 'Depende del día'] },
  { id: 'mayor_miedo', text: '¿Cuál es tu mayor miedo en el campo?', options: ['El agua y el OB', 'Los par 3', 'La gente mirando', 'Decepcionar'] },
  { id: 'mejor_momento', text: '¿Cuándo juegas mejor?', options: ['En la mañana', 'En la tarde', 'Solo', 'Con amigos'] },
  { id: 'reaccion_hoyo_malo', text: '¿Qué haces después de un hoyo malo?', options: ['Me enojo', 'Trato de olvidarlo', 'Analizo qué falló'] },
  { id: 'concentracion', text: '¿Cómo describes tu concentración en la ronda?', options: ['Constante las 18', 'Se va en el back 9', 'Irregular'] },
  { id: 'practica_mental', text: '¿Practicas mentalmente fuera del campo?', options: ['Visualizo mis rondas', 'A veces', 'No, nunca'] },
  { id: 'importancia_score', text: '¿Cuánto te importa el score al final?', options: ['Muchísimo', 'Bastante', 'Me importa más disfrutar'] },
  { id: 'descripcion_golf', text: '¿Qué frase describe mejor tu golf?', options: ['Soy consistente', 'Soy explosivo e inconsistente', 'Me traiciono mentalmente'] },
  { id: 'objetivo_taiger', text: '¿Qué quieres lograr con el tAIger?', options: ['Bajar mi índice', 'Rendir mejor en torneos', 'Disfrutar más el golf', 'Todo lo anterior'] },
] as const

export default function CoachOnboarding() {
  const router = useRouter()
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [completed, setCompleted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Check if already completed
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

  const handleSelect = async (option: string) => {
    const question = QUESTIONS[currentQ]
    const newAnswers = { ...answers, [question.id]: option }
    setAnswers(newAnswers)

    if (currentQ < QUESTIONS.length - 1) {
      setTimeout(() => setCurrentQ(currentQ + 1), 300)
    } else {
      // Last question answered — save profile
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
        onboarding_answers: newAnswers,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

      if (error) {
        console.error('Onboarding error completo:', JSON.stringify(error))
        setSaving(false)
        setSaveError(error.message || 'Error desconocido al guardar')
        return
      }

      await trackEvent(supabase, user.id, 'onboarding_completado', {})

      setSaving(false)
      setCompleted(true)
    }
  }

  if (completed) {
    return (
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🐯</div>
        <h1 style={{ color: '#c4992a', fontSize: '24px', fontFamily: '"Playfair Display", serif', fontWeight: 700, marginBottom: '12px' }}>
          Perfecto. Ya conozco tu perfil.
        </h1>
        <p style={{ color: '#7a8fa8', fontSize: '15px', marginBottom: '24px' }}>
          Ahora puedo darte insights personalizados sobre tu juego mental.
        </p>

        {/* Progression levels */}
        <div style={{
          background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)',
          borderRadius: '10px', padding: '16px 20px', marginBottom: '32px',
          textAlign: 'left',
        }}>
          <p style={{ color: '#7a8fa8', fontSize: '12px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Cómo mejora el tAIger con el tiempo
          </p>
          {[
            { icon: '📊', range: '1-4 rondas', desc: 'Análisis orientativo' },
            { icon: '📈', range: '5-9 rondas', desc: 'Tendencias detectadas' },
            { icon: '🎯', range: '10-19 rondas', desc: 'Patrones estadísticos' },
            { icon: '🔬', range: '20-39 rondas', desc: 'Perfil profundo' },
            { icon: '🏆', range: '40+ rondas', desc: 'Precisión de élite' },
          ].map((l) => (
            <div key={l.range} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
              <span style={{ fontSize: '14px', width: '20px', textAlign: 'center' }}>{l.icon}</span>
              <span style={{ color: '#7a8fa8', fontSize: '13px', width: '90px', flexShrink: 0 }}>{l.range}</span>
              <span style={{ color: '#edeae4', fontSize: '13px' }}>{l.desc}</span>
            </div>
          ))}
          <p style={{ color: '#7a8fa8', fontSize: '12px', marginTop: '12px', fontStyle: 'italic' }}>
            Mientras más registres, más preciso seré.
          </p>
        </div>

        <button
          onClick={() => router.push('/coach')}
          style={{
            background: '#c4992a', color: '#070d18', border: 'none',
            borderRadius: '10px', padding: '14px 32px', fontSize: '16px',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Comenzar con el tAIger →
        </button>
      </div>
    )
  }

  if (saving) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#7a8fa8' }}>
        Guardando tu perfil...
      </div>
    )
  }

  if (saveError && !completed) {
    return (
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🐯</div>
        <p style={{ color: '#dc2626', fontSize: '15px', marginBottom: '20px' }}>{saveError}</p>
        <button
          onClick={() => { setSaveError(''); handleSelect(answers[QUESTIONS[QUESTIONS.length - 1].id]) }}
          style={{
            background: '#c4992a', color: '#070d18', border: 'none',
            borderRadius: '10px', padding: '14px 32px', fontSize: '16px',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }

  const question = QUESTIONS[currentQ]
  const progress = ((currentQ) / QUESTIONS.length) * 100

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '32px 20px' }}>

      {/* Progress bar */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: '#7a8fa8', fontSize: '12px' }}>Pregunta {currentQ + 1} de {QUESTIONS.length}</span>
          <span style={{ color: '#7a8fa8', fontSize: '12px' }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ background: 'rgba(122,143,168,0.15)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
          <div style={{
            background: '#c4992a', height: '100%', borderRadius: '4px',
            width: `${progress}%`, transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Question */}
      <h2 style={{ color: '#edeae4', fontSize: '18px', fontWeight: 600, marginBottom: '28px', lineHeight: 1.4 }}>
        {question.text}
      </h2>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {question.options.map((opt) => {
          const isSelected = answers[question.id] === opt
          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              style={{
                background: isSelected ? '#c4992a' : '#0e1c2f',
                color: isSelected ? '#070d18' : '#edeae4',
                border: `1px solid ${isSelected ? '#c4992a' : 'rgba(196,153,42,0.3)'}`,
                borderRadius: '10px', padding: '14px 18px', fontSize: '15px',
                fontWeight: isSelected ? 600 : 400, cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.2s ease',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
