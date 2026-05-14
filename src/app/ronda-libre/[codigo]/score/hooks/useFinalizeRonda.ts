/**
 * useFinalizeRonda — orquestador de finalizar/descartar ronda libre.
 *
 * Extraído desde page.tsx (Task 6 del scorer-refactor, 14-may-2026).
 * Motivación: aislar las ~200 LOC de logica critica (historical_rounds,
 * WHS index recalc, push notifications) en un hook testeable, dejando
 * page.tsx solo con JSX y estado de UI.
 *
 * REGLA: NO modificar formulas, columnas de historical_rounds, ni logica WHS.
 * Port 1:1 del bloque inline de page.tsx.
 */

'use client'

import { useState } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { addToast } from '@/hooks/useToast'
import { sendPushViaServer } from '@/lib/push-notifications'
import { calcularDiferencial, calcularNivel } from '@/lib/indice-golfers'
import { getMissingHoles, fillMissingHolesWithPar, haptic } from '@/lib/ronda/helpers'
import { saveScores as lsSave, clearScores as lsClear } from '@/lib/ronda/score-storage'
import type { RondaLibre } from '@/types/ronda'

interface UseFinalizeRondaOptions {
  ronda: RondaLibre | null
  activeJugadorId: string | null
  scores: Record<string, Record<number, number>>
  parMap: Record<number, number>
  codigo: string
  saveScores: (jugadorId: string, holeScores: Record<number, number>) => Promise<void>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
  setHistoricalRoundId: React.Dispatch<React.SetStateAction<string | null>>
  onDiscardSuccess?: () => void
  onFinalizeError?: (msg: string) => void
}

export interface UseFinalizeRondaResult {
  finalizeRound: () => Promise<void>
  discardRound: () => Promise<void>
  confirmFinalize: boolean
  setConfirmFinalize: React.Dispatch<React.SetStateAction<boolean>>
  confirmDiscard: boolean
  setConfirmDiscard: React.Dispatch<React.SetStateAction<boolean>>
  discarding: boolean
  roundDone: boolean
  setRoundDone: React.Dispatch<React.SetStateAction<boolean>>
  finalScore: { gross: number; totalPar: number }
}

export function useFinalizeRonda(opts: UseFinalizeRondaOptions): UseFinalizeRondaResult {
  const {
    ronda, activeJugadorId, scores, parMap, codigo,
    saveScores, setScores, setHasUnsaved, setHistoricalRoundId,
    onDiscardSuccess,
  } = opts

  const [roundDone, setRoundDone] = useState(false)
  const [finalScore, setFinalScore] = useState({ gross: 0, totalPar: 0 })
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  const discardRound = async () => {
    if (!ronda || discarding) return
    if (!confirmDiscard) {
      setConfirmDiscard(true)
      haptic([20, 40, 20])
      setTimeout(() => setConfirmDiscard(false), 5000)
      return
    }
    setDiscarding(true)
    haptic(30)
    const supabase = createClient()
    const { error: e1 } = await supabase.from('ronda_libre_jugadores').delete().eq('ronda_id', ronda.id)
    if (e1) { setDiscarding(false); addToast({ title: `Error al descartar: ${e1.message}`, type: 'error' }); return }
    const { error: e2 } = await supabase.from('rondas_libres').delete().eq('id', ronda.id)
    if (e2) { setDiscarding(false); addToast({ title: `Error al descartar: ${e2.message}`, type: 'error' }); return }
    // Limpia localStorage para esta ronda
    try {
      for (const j of ronda.ronda_libre_jugadores) lsClear(codigo, j.id)
    } catch { /* no bloquear */ }
    addToast({ title: 'Ronda descartada', type: 'info' })
    onDiscardSuccess?.()
  }

  const finalizeRound = async () => {
    if (!ronda || !activeJugadorId) return
    if (!confirmFinalize) {
      setConfirmFinalize(true)
      haptic(15)
      return
    }
    setConfirmFinalize(false)
    haptic(30)
    // Bug fix 30-abr-2026: el ultimo hoyo en par no se persistia. La UI mostraba
    // par como placeholder visual (sensacion de registrado), pero el state era
    // undefined porque sin tap +/- nunca se disparaba handleScoreChange. Y como
    // goToNextHole no corre en el ultimo hoyo, el auto-fill no aplicaba.
    // Detectar todos los hoyos sin marcar y rellenarlos con par antes de guardar.
    const currentScores = scores[activeJugadorId] ?? {}
    const missing = getMissingHoles(currentScores, ronda.holes ?? 18)
    const playerScores = missing.length > 0
      ? fillMissingHolesWithPar(currentScores, missing, parMap)
      : currentScores
    if (missing.length > 0) {
      setScores(prev => ({ ...prev, [activeJugadorId]: playerScores }))
      lsSave(codigo, activeJugadorId, playerScores)
    }
    await saveScores(activeJugadorId, playerScores)
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await trackEvent(supabase, authUser?.id ?? null, 'ronda_completada', { codigo })

    // Save to historical_rounds — array de scores en orden de hoyo (1..N)
    const totalHolesForSave = ronda.holes ?? 18
    const scoresArray: (number | null)[] = Array.from({ length: totalHolesForSave }, (_, i) => {
      const h = i + 1
      return playerScores[h] ?? null
    })
    const grossTotal = scoresArray.filter((s): s is number => s != null).reduce((a, b) => a + b, 0)
    // holes_played = hoyos REALMENTE jugados (no el config de la ronda).
    // Sin esto, una ronda de 15/18 se guardaba como "18 hoyos" y el diferencial WHS salia mal.
    const actualHolesPlayed = scoresArray.filter((s): s is number => s != null).length
    if (actualHolesPlayed === 0) {
      // Sin scores = no tiene sentido crear historial. Usar "Descartar ronda".
      addToast({ title: 'Sin hoyos jugados', message: 'Usa "Descartar ronda" si no quieres guardarla.', type: 'info' })
      setRoundDone(true)
      setHasUnsaved(false)
      return
    }
    try {
      // Fetch slope/rating from courses for diferencial calculation
      // Usar el tee del jugador que esta finalizando (fallback al tee global de la ronda)
      const activePlayer = ronda.ronda_libre_jugadores.find(p => p.id === activeJugadorId)
      const effectivePlayerTee = activePlayer?.tees || ronda.tees
      let slopeRating: number | null = null
      let courseRating: number | null = null
      let nineHoleRatings: { cr9h: number; slope9h: number } | null = null
      if (ronda.course_id) {
        // Try tee-specific CR/Slope first (mas preciso)
        if (effectivePlayerTee) {
          const { data: teeData } = await supabase
            .from('course_tees')
            .select('rating, slope, front_course_rating, front_slope_rating, back_course_rating, back_slope_rating')
            .eq('course_id', ronda.course_id)
            .ilike('nombre', `${effectivePlayerTee}%`)
            .limit(1)
            .single()
          if (teeData?.rating && teeData?.slope) {
            courseRating = teeData.rating
            slopeRating = teeData.slope
          }
          // Extract 9h ratings if available (front 9 default, could be back based on recorrido)
          if (teeData?.front_course_rating && teeData?.front_slope_rating) {
            nineHoleRatings = { cr9h: teeData.front_course_rating, slope9h: teeData.front_slope_rating }
          }
        }
        // Fallback to course-level ratings
        if (!courseRating || !slopeRating) {
          const { data: courseData } = await supabase
            .from('courses')
            .select('slope_rating, course_rating')
            .eq('id', ronda.course_id)
            .single()
          slopeRating = slopeRating ?? courseData?.slope_rating ?? null
          courseRating = courseRating ?? courseData?.course_rating ?? null
        }
      }
      // Diferencial WHS: solo si jugo >= 9 hoyos. Con menos, WHS no permite calcular.
      const diferencial = (slopeRating && courseRating && actualHolesPlayed >= 9)
        ? calcularDiferencial(grossTotal, courseRating, slopeRating, actualHolesPlayed, nineHoleRatings)
        : null

      // El historial pertenece al JUGADOR, no al dueno del dispositivo. Si el jugador
      // activo tiene cuenta propia, usar su user_id; si no (invitado), usar la sesion actual.
      const historicalUserId = activePlayer?.user_id ?? authUser?.id
      if (!historicalUserId) throw new Error('no-user-id-for-historical')
      const { data: insertedRound } = await supabase.from('historical_rounds').insert({
        user_id: historicalUserId,
        course_name: ronda.course_name,
        course_id: ronda.course_id ?? null,
        played_at: ronda.fecha || new Date().toISOString().split('T')[0],
        total_gross: grossTotal,
        scores: scoresArray,
        holes_played: actualHolesPlayed,
        tee_color: effectivePlayerTee ?? null,
        privacy: 'private',
        slope_rating: slopeRating,
        course_rating: courseRating,
        diferencial,
        formato_juego: ronda.formato_juego ?? 'stroke_play',
        modo_juego: ronda.modo_juego ?? 'gross',
      }).select('id').single()

      if (insertedRound?.id) {
        setHistoricalRoundId(insertedRound.id)
      }

      // Recalcular Indice Golfers+ y nivel del dueno de la tarjeta (no del dispositivo)
      supabase.rpc('calcular_indice_golfers', { p_user_id: historicalUserId }).then(() => {})
      const hace90Dias = new Date()
      hace90Dias.setDate(hace90Dias.getDate() - 90)
      supabase
        .from('historical_rounds')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', historicalUserId)
        .gte('played_at', hace90Dias.toISOString())
        .then(({ count }) => {
          const nuevoNivel = calcularNivel(count ?? 0)
          const expira = new Date()
          expira.setDate(expira.getDate() + 60)
          supabase.from('profiles').update({
            nivel: nuevoNivel,
            nivel_updated_at: new Date().toISOString(),
            nivel_expires_at: expira.toISOString(),
          }).eq('id', historicalUserId).then(() => {})
        })

      // Detectar patrones del dueno de la sesion (tAIger+ patterns es del usuario logged-in)
      if (authUser?.id) {
        fetch('/api/taiger/patterns', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(() => {}).catch(() => {})
      }
    } catch { /* don't block finalization */ }

    // Check if ALL players have completed all holes -> finalize round
    // Guard: verificar que la ronda no fue finalizada por otro jugador simultaneamente
    const holesCount = ronda.holes ?? 18
    const { data: freshRonda } = await supabase
      .from('rondas_libres')
      .select('estado, ronda_libre_jugadores(id, scores)')
      .eq('codigo', codigo)
      .single()
    if (freshRonda?.estado === 'finalizada') {
      // Otro jugador ya finalizo — no duplicar
      setRoundDone(true)
    } else {
      const allDone = (freshRonda?.ronda_libre_jugadores ?? []).every((j: { scores: Record<string, number> }) => {
        const count = Object.keys(j.scores ?? {}).filter(k => { const n = parseInt(k); return n >= 1 && n <= holesCount }).length
        return count >= holesCount
      })
      if (allDone) {
        // Usar update condicional para evitar race condition
        await supabase.from('rondas_libres')
          .update({ estado: 'finalizada' })
          .eq('codigo', codigo)
          .eq('estado', 'en_curso') // Solo actualiza si aun esta en curso
        sendPushViaServer({
          title: 'Ronda finalizada',
          body: `Resultado final listo en ${ronda.course_name}`,
          tag: `round-finished-${codigo}`,
          url: `/ronda-libre/${codigo}?finished=true`,
        })
      }
    }

    // Calculate final score for modal
    const finalPlayerScores = scores[activeJugadorId] ?? {}
    const finalGross = Object.values(finalPlayerScores).reduce((a: number, b: number) => a + b, 0)
    let finalTotalPar = 0
    for (const [hStr] of Object.entries(finalPlayerScores)) {
      finalTotalPar += parMap[parseInt(hStr)] ?? 4
    }
    setFinalScore({ gross: finalGross, totalPar: finalTotalPar })
    setRoundDone(true)
    setHasUnsaved(false)
  }

  return {
    finalizeRound,
    discardRound,
    confirmFinalize,
    setConfirmFinalize,
    confirmDiscard,
    setConfirmDiscard,
    discarding,
    roundDone,
    setRoundDone,
    finalScore,
  }
}
