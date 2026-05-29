/**
 * Hook que maneja el form "Agregar ronda manual" del historial.
 * Encapsula state de los inputs + handleSave (inclusive lookup de
 * slope/CR + cálculo de diferencial + actualización de nivel + reload).
 */
'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { calcularDiferencial, calcularNivel } from '@/lib/indice-golfers'
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
    if (!userId) return
    setSaving(true)
    try {
      const playedAt = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
      const supabase = createClient()

      // Lookup slope/rating from courses by name for diferencial
      let slopeRating:  number | null = null
      let courseRating: number | null = null
      let courseId:     string | null = null
      if (courseName) {
        const { data: courseData } = await supabase
          .from('courses')
          .select('id, slope_rating, course_rating')
          .ilike('nombre', courseName)
          .limit(1)
          .single()
        if (courseData) {
          courseId = courseData.id
          // Try tee-specific CR/Slope
          if (teeColor && courseData.id) {
            const { data: teeData } = await supabase
              .from('course_tees')
              .select('rating, slope')
              .eq('course_id', courseData.id)
              .ilike('nombre', `${teeColor}%`)
              .limit(1)
              .single()
            if (teeData?.rating) courseRating = teeData.rating
            if (teeData?.slope)  slopeRating  = teeData.slope
          }
          if (!courseRating) courseRating = courseData.course_rating ?? null
          if (!slopeRating)  slopeRating  = courseData.slope_rating  ?? null
        }
      }
      const diferencial = (slopeRating && courseRating && totalGross)
        ? calcularDiferencial(totalGross, courseRating, slopeRating)
        : null

      // holes_played es NOT NULL — contamos hoyos con score real.
      const holesPlayed = scores.filter((s) => s != null).length || 18

      const { error } = await supabase.from('historical_rounds').insert({
        user_id: userId,
        course_name: courseName,
        course_id:   courseId,
        tee_color:   teeColor || null,
        played_at:   playedAt,
        scores,
        total_gross: totalGross,
        holes_played: holesPlayed,
        notes: notes || null,
        privacy,
        slope_rating:  slopeRating,
        course_rating: courseRating,
        diferencial,
      })
      if (error) {
        void captureError(error, { context: 'historial.addRound', userId, meta: { courseName } })
        return
      }

      // Recalcular índice Golfers+ + nivel (fire-and-forget).
      void supabase.rpc('calcular_indice_golfers', { p_user_id: userId })

      const hace90Dias = new Date()
      hace90Dias.setDate(hace90Dias.getDate() - 90)
      void supabase
        .from('historical_rounds')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('played_at', hace90Dias.toISOString())
        .then(({ count }) => {
          const nuevoNivel = calcularNivel(count ?? 0)
          const expira = new Date()
          expira.setDate(expira.getDate() + 60)
          void supabase.from('profiles').update({
            nivel: nuevoNivel,
            nivel_updated_at: new Date().toISOString(),
            nivel_expires_at: expira.toISOString(),
          }).eq('id', userId)
        })

      await trackEvent(supabase, userId, 'tarjeta_historica_agregada', { course_name: courseName })
      resetForm()
      await onSaved()
    } finally {
      setSaving(false)
    }
  }, [userId, year, month, day, courseName, teeColor, scores, totalGross, notes, privacy, resetForm, onSaved])

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
    resetForm,
    handleSave,
  }
}
