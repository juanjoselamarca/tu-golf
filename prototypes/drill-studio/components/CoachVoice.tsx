'use client'

/**
 * CoachVoice — Web Speech API en español + waveform animado.
 *
 * Decisión: Web Speech API en lugar de OpenAI TTS porque (a) $0,
 * (b) cero dependencias de servidor, (c) en macOS/iOS la voz "Mónica"
 * suena premium en español. En Windows Chrome la calidad cae un poco
 * pero sigue siendo aceptable para validación. Cuando migremos a app
 * real, swap a OpenAI TTS para calidad universal.
 *
 * UI: orbe dorado pulsante (no humanoide), waveform que se anima con
 * el audio en curso, botón play/pause discreto.
 */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { DrillData } from '@/lib/sample-drill'

export default function CoachVoice({ drill }: { drill: DrillData }) {
  const [playing, setPlaying] = useState(false)
  const [currentLine, setCurrentLine] = useState(-1)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const queueRef = useRef<SpeechSynthesisUtterance[]>([])

  // Build queue al montar
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const queue = drill.voiceScript.map((line, i) => {
      const u = new SpeechSynthesisUtterance(line)
      u.lang = 'es-ES'
      u.rate = 0.88
      u.pitch = 0.95
      u.volume = 0.85
      u.onstart = () => setCurrentLine(i)
      u.onend = () => {
        if (i === drill.voiceScript.length - 1) {
          setPlaying(false)
          setCurrentLine(-1)
        }
      }
      return u
    })
    queueRef.current = queue

    // Esperar a que las voces estén disponibles (algunos browsers tardan)
    const tryAssignVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      const es = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Monica') || v.name.includes('Mónica')))
        || voices.find(v => v.lang.startsWith('es-ES'))
        || voices.find(v => v.lang.startsWith('es'))
      if (es) queue.forEach(u => (u.voice = es))
    }
    tryAssignVoice()
    window.speechSynthesis.onvoiceschanged = tryAssignVoice

    return () => {
      window.speechSynthesis.cancel()
    }
  }, [drill])

  const toggle = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (playing) {
      window.speechSynthesis.cancel()
      setPlaying(false)
      setCurrentLine(-1)
    } else {
      window.speechSynthesis.cancel()
      setPlaying(true)
      queueRef.current.forEach(u => window.speechSynthesis.speak(u))
    }
  }

  return (
    <div className="flex items-center gap-4 pointer-events-auto">
      {/* Orbe coach */}
      <button
        onClick={toggle}
        aria-label={playing ? 'Pausar voz del coach' : 'Reproducir voz del coach'}
        className="group relative flex items-center justify-center"
      >
        <motion.div
          animate={playing ? { scale: [1, 1.18, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: 0.85 }}
          transition={playing ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }}
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(201,161,74,0.55) 0%, rgba(201,161,74,0) 70%)',
            filter: 'blur(8px)',
          }}
        />
        <div
          className="relative w-12 h-12 rounded-full flex items-center justify-center"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #ebd285, #c9a14a 60%, #634717)',
            boxShadow: '0 0 24px rgba(201,161,74,0.45), inset 0 0 10px rgba(0,0,0,0.3)',
          }}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="#1a1714">
              <rect x="3" y="2" width="3" height="10" rx="0.5" />
              <rect x="8" y="2" width="3" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="#1a1714">
              <path d="M3 2 L11 7 L3 12 Z" />
            </svg>
          )}
        </div>
      </button>

      {/* Línea actual del script */}
      <div className="min-w-0 max-w-md">
        <p className="text-[10px] tracking-[0.3em] text-gold-400 uppercase mb-1">
          {playing ? 'Coach' : 'Toca para escuchar al coach'}
        </p>
        <p className="editorial-italic text-base text-bone-100 leading-snug truncate">
          {currentLine >= 0
            ? drill.voiceScript[currentLine]
            : drill.voiceScript[0]}
        </p>
      </div>
    </div>
  )
}
