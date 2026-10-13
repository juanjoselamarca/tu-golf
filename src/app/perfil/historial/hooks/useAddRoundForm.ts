/**
 * Hook que maneja el form "Agregar ronda manual" del historial.
 * Encapsula state de los inputs + handleSave: la ronda entra por `importRound`
 * (el mismo camino que la foto y el Garmin), y luego índice + nivel.
 */
'use client'

import { useCallback, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { importRound, tarjetaDelFormularioManual } from '@/lib/import-round'
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
  // 18 hoyos o exactamente 9: una tarjeta a medias no da un diferencial honesto.
  const tarjeta = useMemo(() => tarjetaDelFormularioManual(scores), [scores])
  const canSave = !!courseName && tarjeta != null

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
    if (!userId || !canSave || !tarjeta) return
    setSaving(true)
    try {
      const playedAt = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
      const supabase = createClient()

      // Un solo camino para crear una ronda del historial (#545): cancha, CR/slope
      // del tee, Adjusted Gross Score (WHS 3.1) y diferencial salen de importRound,
      // igual que en la foto o el Garmin.
      const result = await importRound(supabase, {
        userId,
        courseName,
        teeColor: teeColor || null,
        playedAt,
        scores: tarjeta.scores,
        holesPlayed: tarjeta.scores.length,
        notes: notes || null,
        privacy: privacy === 'public' ? 'public' : 'private',
        source: 'manual',
        metadata: { hoyos: tarjeta.hoyos },
      })
      if (!result.success) {
        void captureError(new Error(result.warnings[0] ?? 'importRound falló'), { context: 'historial.addRound', userId, meta: { courseName } })
        return
      }

      // Recalcular índice Golfers+ + nivel (sin esperar).
      void recalcularIndiceGolfers(supabase, userId, { context: 'historial.addRound.calcular_indice', level: 'warning' })
      void actualizarNivelDelJugador(supabase, userId).catch((err: unknown) => {
        void captureError(err, { context: 'historial.addRound.nivel', level: 'warning', userId })
      })

      await trackEvent(supabase, userId, 'tarjeta_historica_agregada', { course_name: courseName })
      resetForm()
      await onSaved()
    } finally {
      setSaving(false)
    }
  }, [userId, canSave, tarjeta, year, month, day, courseName, teeColor, notes, privacy, resetForm, onSaved])

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
