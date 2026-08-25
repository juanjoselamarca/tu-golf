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
import { calcularMatchPlay } from '@/golf/formats/match-play'
import { isTeamFormat } from '@/golf/formats'
import { captureError } from '@/lib/error-tracking'
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

    // Guard: verificar que la ronda no fue finalizada por otro dispositivo/jugador
    const supabaseGuard = createClient()
    const { data: currentRound } = await supabaseGuard
      .from('rondas_libres')
      .select('estado')
      .eq('codigo', codigo)
      .single()
    if (currentRound?.estado === 'finalizada') {
      addToast({ title: 'Esta ronda ya fue finalizada', type: 'info' })
      setRoundDone(true)
      setHasUnsaved(false)
      return
    }

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

      // Match result para match play: calcular el display ("3&2", "1 UP", "All Square")
      let matchResult: string | null = null
      if (ronda.formato_juego === 'match_play' && ronda.ronda_libre_jugadores.length === 2) {
        const opponent = ronda.ronda_libre_jugadores.find(p => p.id !== activeJugadorId)
        if (opponent && ronda.course_id) {
          const { data: holeRows } = await supabase
            .from('course_holes')
            .select('numero, par, stroke_index')
            .eq('course_id', ronda.course_id)
            .order('numero')
          if (holeRows && holeRows.length > 0) {
            const opponentScores = scores[opponent.id] ?? {}
            const matchCalc = calcularMatchPlay(
              playerScores as Record<string, number>,
              opponentScores as Record<string, number>,
              holeRows,
              {
                courseHandicapA: activePlayer?.handicap ?? 0,
                courseHandicapB: opponent.handicap ?? 0,
                totalHoles: totalHolesForSave,
                modo: ronda.modo_juego === 'gross' ? 'gross' : 'neto',
              },
              {
                nombreA: activePlayer?.nombre,
                nombreB: opponent.nombre,
              }
            )
            matchResult = matchCalc.display
          }
        }
      }

      // Team name para formatos de equipo: buscar el equipo al que pertenece el jugador
      let teamName: string | null = null
      if (isTeamFormat(ronda.formato_juego)) {
        const { data: equipoData } = await supabase
          .from('ronda_equipo_jugadores')
          .select('ronda_equipos!inner(nombre)')
          .eq('jugador_id', activeJugadorId)
          .eq('ronda_equipos.ronda_id', ronda.id)
          .limit(1)
          .single()
        if (equipoData && (equipoData as Record<string, unknown>).ronda_equipos) {
          const eq = (equipoData as Record<string, unknown>).ronda_equipos as { nombre: string }
          teamName = eq.nombre ?? null
        }
      }

      // El historial pertenece al JUGADOR, no al dueno del dispositivo. Si el jugador
      // activo tiene cuenta propia, usar su user_id; si no (invitado), usar la sesion actual.
      const historicalUserId = activePlayer?.user_id ?? authUser?.id
      if (!historicalUserId) throw new Error('no-user-id-for-historical')
      const { data: insertedRound, error: insertErr } = await supabase.from('historical_rounds').insert({
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
        match_result: matchResult,
        team_name: teamName,
      }).select('id').single()

      // Duplicate entry (unique constraint): silently continue — round already saved
      if (insertErr?.code === '23505') {
        // Already saved from a previous finalization attempt — no-op
      } else if (insertedRound?.id) {
        setHistoricalRoundId(insertedRound.id)
        // Cerebro v2 — wire plan outcomes para que el coach aprenda de la ronda.
        // Sin esto, plan_outcomes queda en 0 filas y el coach no aprende. Non-blocking.
        fetch('/api/coach/plan-outcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ historical_round_id: insertedRound.id }),
        }).then(() => {}).catch(() => {})
      }

      // ── Task 2.8: capturar índice ANTES del recálculo ──
      const { data: beforeProfile } = await supabase
        .from('profiles')
        .select('indice')
        .eq('id', historicalUserId)
        .single()
      const indiceBefore = beforeProfile?.indice as number | null | undefined

      // Recalcular Indice Golfers+ con retry exponencial (no bloquea la finalización)
      let rpcSucceeded = false
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error: rpcErr } = await supabase.rpc('calcular_indice_golfers', { p_user_id: historicalUserId })
        if (!rpcErr) { rpcSucceeded = true; break }
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt))) // 1s, 2s
        } else {
          void captureError(rpcErr, {
            context: 'finalize-ronda.calcular_indice_golfers',
            level: 'error',
            meta: { historicalUserId, attempts: 3 },
          })
        }
      }

      // ── Task 2.8: capturar índice DESPUÉS y mostrar toast ──
      if (rpcSucceeded) {
        const { data: afterProfile } = await supabase
          .from('profiles')
          .select('indice')
          .eq('id', historicalUserId)
          .single()
        const indiceAfter = (afterProfile?.indice as number | null | undefined) ?? null

        if (indiceBefore != null && indiceAfter != null && indiceBefore !== indiceAfter) {
          const direction = indiceAfter < indiceBefore ? 'bajó' : 'subió'
          addToast({
            title: `Tu índice ${direction}`,
            message: `${indiceBefore.toFixed(1)} → ${indiceAfter.toFixed(1)}`,
            type: indiceAfter < indiceBefore ? 'success' : 'info',
          })
        } else if (indiceAfter != null) {
          addToast({
            title: 'Ronda guardada',
            message: `Índice actual: ${indiceAfter.toFixed(1)}`,
            type: 'success',
          })
        }
      } else {
        addToast({
          title: 'Ronda guardada',
          message: 'Tu índice se actualizará pronto',
          type: 'info',
        })
      }

      // ── Task 2.7: trigger coach analysis post-ronda (non-blocking) ──
      if (insertedRound?.id) {
        void fetch('/api/coach/post-round-trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roundId: insertedRound.id, userId: historicalUserId }),
        }).catch(() => {})
      }

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
