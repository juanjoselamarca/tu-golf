// hooks/useTees.ts
//
// Estado + handler para asignar tee_id a jugadores (feature bug #6 inbox).
// Carga course_tees del course del torneo y dispara PATCH al API route.

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { captureError } from '@/lib/error-tracking'

export function useTees({
  slug,
  courseId,
}: {
  slug: string
  courseId: string | null
}) {
  const [courseTees, setCourseTees] = useState<CourseTeeRow[]>([])
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('course_tees')
          .select('id, nombre, rating, slope, yardaje_total, genero')
          .eq('course_id', courseId)
          .order('yardaje_total', { ascending: false })
        if (error) throw error
        if (!cancelled) setCourseTees((data ?? []) as unknown as CourseTeeRow[])
      } catch (err) {
        void captureError(err, {
          context: 'useTees.loadTees',
          meta: { courseId },
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [courseId])

  const assignTee = useCallback(
    async (playerId: string, teeId: string | null) => {
      setLoading(prev => {
        const s = new Set(prev)
        s.add(playerId)
        return s
      })
      setErrors(prev => {
        const m = new Map(prev)
        m.delete(playerId)
        return m
      })
      try {
        const res = await fetch(`/api/torneos/${slug}/players/${playerId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tee_id: teeId }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown'
        setErrors(prev => new Map(prev).set(playerId, msg))
        setTimeout(() => {
          setErrors(prev => {
            const m = new Map(prev)
            m.delete(playerId)
            return m
          })
        }, 3000)
        void captureError(err, {
          context: 'useTees.assignTee',
          meta: { playerId, teeId, slug },
        })
        throw err
      } finally {
        setLoading(prev => {
          const s = new Set(prev)
          s.delete(playerId)
          return s
        })
      }
    },
    [slug]
  )

  return { courseTees, loading, errors, assignTee }
}
