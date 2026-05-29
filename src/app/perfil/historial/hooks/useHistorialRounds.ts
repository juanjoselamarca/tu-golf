/**
 * Hook que maneja auth + carga de rondas históricas del usuario.
 *
 * Reemplaza la lógica de auth + loadRounds del page.tsx monolítico.
 * Expone: { userId, loading, loadError, roundsLoaded, rounds, setRounds, reload }
 *
 * Nota arquitectónica: por ahora el hook hace supabase.from() directo —
 * la regla "el que toca, ordena" pide capa src/lib/data/ pero el scorer
 * refactor también se quedó con el supabase directo dentro del hook
 * (commit e98e3e3). Si esta capa se materializa más adelante, el hook
 * solo cambia el import sin tocar componentes ni page.tsx.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { HistoricalRound } from '../lib/types'

const SELECT_COLUMNS =
  'id, course_name, course_id, tee_color, played_at, scores, total_gross, holes_played, notes, privacy, created_at, formato_juego, modo_juego, par_per_hole, excluded_from_handicap, diferencial'

const AUTH_TIMEOUT_MS = 8000

export interface UseHistorialRoundsResult {
  userId:       string | null
  loading:      boolean
  loadError:    boolean
  roundsLoaded: boolean
  rounds:       HistoricalRound[]
  setRounds:    React.Dispatch<React.SetStateAction<HistoricalRound[]>>
  setLoadError: React.Dispatch<React.SetStateAction<boolean>>
  reload:       () => Promise<void>
}

export function useHistorialRounds(): UseHistorialRoundsResult {
  const router = useRouter()

  const [userId,       setUserId]       = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(false)
  // roundsLoaded distingue "cargando rondas" de "cargué y están vacías".
  // Sin esta separación el JSX flasheaba el empty state en el gap entre
  // auth done y loadRounds() done (inbox 9e37669f).
  const [roundsLoaded, setRoundsLoaded] = useState(false)
  const [rounds,       setRounds]       = useState<HistoricalRound[]>([])

  /* Auth check */
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return
        if (!user) { router.replace('/login?redirect=/perfil/historial'); return }
        setUserId(user.id)
        setLoading(false)
      } catch {
        if (cancelled) return
        setLoading(false)
        setLoadError(true)
      }
    }
    check()
    return () => { cancelled = true }
  }, [router])

  /* Timeout — si auth tarda más de 8s, mostrar estado vacío */
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false)
        setLoadError(true)
      }
    }, AUTH_TIMEOUT_MS)
    return () => clearTimeout(timeout)
  }, [loading])

  /* Carga de rondas — extraído de loadRounds() del monolito */
  const reload = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('historical_rounds')
        .select(SELECT_COLUMNS)
        .order('played_at', { ascending: false })
        .limit(500)
      if (error) { setLoadError(true); return }
      setRounds((data as HistoricalRound[]) || [])
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      // Marcamos roundsLoaded incluso si hubo error, para que el JSX
      // deje de mostrar el skeleton; el loadError ya cubre la rama de fallo.
      setRoundsLoaded(true)
    }
  }, [])

  useEffect(() => { if (!loading) void reload() }, [loading, reload])

  return { userId, loading, loadError, roundsLoaded, rounds, setRounds, setLoadError, reload }
}
