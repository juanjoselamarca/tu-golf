/**
 * Hook que maneja el form "Agregar ronda manual" del historial.
 * Encapsula state de los inputs + handleSave. Cancha, ratings, diferencial e
 * INSERT viven en `@/lib/data/historial-alta`; índice y nivel, en los mismos
 * helpers que el cierre de ronda libre.
 */
'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { agregarRondaManual } from '@/lib/data/historial-alta'
import { actualizarNivelDelJugador, recalcularIndiceGolfers } from '@/lib/data/ronda-libre-finalizar'
import { trackEvent } from '@/lib/analytics'
import { THIS_YEAR } from '../lib/constants'
import { computeStats } from '../lib/helpers'

export interface UseAddRoundFormParams {
  userId: string | null
  onSaved: () => void | Promise<void>
}

export interface UseAddRoundFormResult {
  courseName: string;  setCourseName: (v: string) => void
  teeColor:   string;  setTeeColor:   (v: string) => void
  day:        string;  setDay:        (v: string) => void
  month:      string;  setMonth:      (v: string) => void
  year:       string;  setYear:       (v: string) => void
  scores:     (number | null)[]; setScores: React.Dispatch<React.SetStateAction<(number | null)[]>>
  notes:      string;  setNotes:      (v: string) => void
  privacy:    string;  setPrivacy:    (v: string) => void
  saving:     boolean
  totalGross: number | null
  canSave:    boolean
  resetForm:  () => void
  handleSave: (e: React.FormEvent) => Promise<void>
}

export function useAddRoundForm({ userId, onSaved }: UseAddRoundFormParams): UseAddRoundFormResult {
  const [courseName, setCourseName] = useState('')
  const [teeColor,   setTeeColor]   = useState('')
  const [day,   setDay]   = useState(String(new Date().getDate()))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year,  setYear]  = useState(String(THIS_YEAR))
  const [scores, setScores] = useState<(number | null)[]>(Array(18).fill(null))
  const [notes,   setNotes]   = useState('')
  const [privacy, setPrivacy] = useState('private')
  const [saving,  setSaving]  = useState(false)

  const formStats  = computeStats(scores)
  const totalGross = formStats?.total ?? null
  const filledScores = scores.filter((s) => s != null).length
  const canSave = !!courseName && filledScores >= 9

  const resetForm = useCallback(() => {
    setCourseName(''); setTeeColor('')
    setDay(String(new Date().getDate()))
    setMonth(String(new Date().getMonth() + 1))
    setYear(String(THIS_YEAR))
    setScores(Array(18).fill(null))
    setNotes('')
    setPrivacy('private')
  }, [])

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !canSave) return
    setSaving(true)
    try {
      const playedAt = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
      const supabase = createClient()

      const { error } = await agregarRondaManual(supabase, {
        userId,
        courseName,
        teeColor: teeColor || null,
        playedAt,
        scores,
        totalGross,
        notes: notes || null,
        privacy,
      })
      if (error) {
        void captureError(error, { context: 'historial.addRound', userId, meta: { courseName } })
        return
      }

      // Recalcular índice Golfers+ + nivel (fire-and-forget).
      void recalcularIndiceGolfers(supabase, userId, { context: 'historial.addRound.calcular_indice_golfers' })
      void actualizarNivelDelJugador(supabase, userId)

      await trackEvent(supabase, userId, 'tarjeta_historica_agregada', { course_name: courseName })
      resetForm()
      await onSaved()
    } finally {
      setSaving(false)
    }
  }, [userId, canSave, year, month, day, courseName, teeColor, scores, totalGross, notes, privacy, resetForm, onSaved])

  return {
    courseName, setCourseName,
    teeColor,   setTeeColor,
    day,   setDay,
    month, setMonth,
    year,  setYear,
    scores, setScores,
    notes,   setNotes,
    privacy, setPrivacy,
    saving,
    totalGross,
    canSave,
    resetForm,
    handleSave,
  }
}
