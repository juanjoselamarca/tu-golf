/**
 * Hook que maneja el estado de cards expandidas + cache de pars por cancha.
 * El cache se popula on-demand al expandir (fetch course_holes).
 */
'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { HistoricalRound } from '../lib/types'

export interface UseExpandedRoundsResult {
  expanded:        Set<string>
  isExpanded:      (id: string) => boolean
  toggleExpand:    (round: HistoricalRound) => void
  forceExpand:     (id: string) => void
  courseParCache:  Record<string, Record<number, number>>
}

export function useExpandedRounds(): UseExpandedRoundsResult {
  const [expanded,       setExpanded]       = useState<Set<string>>(new Set())
  const [courseParCache, setCourseParCache] = useState<Record<string, Record<number, number>>>({})

  const fetchCoursePars = useCallback(async (courseId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('course_holes')
      .select('numero, par')
      .eq('course_id', courseId)
      .order('numero')
    if (data && data.length > 0) {
      const pars: Record<number, number> = {}
      data.forEach((h: { numero: number; par: number }) => { pars[h.numero] = h.par })
      setCourseParCache(prev => ({ ...prev, [courseId]: pars }))
    }
  }, [])

  const toggleExpand = useCallback((round: HistoricalRound) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(round.id)) next.delete(round.id); else next.add(round.id)
      return next
    })
    if (round.course_id && !courseParCache[round.course_id]) {
      void fetchCoursePars(round.course_id)
    }
  }, [courseParCache, fetchCoursePars])

  const forceExpand = useCallback((id: string) => {
    setExpanded(prev => { const next = new Set(prev); next.add(id); return next })
  }, [])

  const isExpanded = useCallback((id: string) => expanded.has(id), [expanded])

  return { expanded, isExpanded, toggleExpand, forceExpand, courseParCache }
}
