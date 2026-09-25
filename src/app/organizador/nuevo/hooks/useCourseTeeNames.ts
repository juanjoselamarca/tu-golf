'use client'

// src/app/organizador/nuevo/hooks/useCourseTeeNames.ts
//
// Carga los nombres de tee de las canchas elegidas en las rondas del borrador.
// Recarga solo cuando cambia el conjunto de canchas, no en cada tecla. El estado
// visible se deriva del último resultado y de la clave actual: si la clave
// cambió y su resultado aún no llega, está "cargando" (nunca muestra tees de
// canchas anteriores).

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getTeeNamesForCourses } from '@/lib/data/course-tees'
import { captureError } from '@/lib/error-tracking'
import type { CourseTees } from '@/golf/courses/category-tee-options'

export type CourseTeeNamesState =
  | { status: 'no-course' }
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; courses: CourseTees[] }

type Loaded = { key: string; state: { status: 'ready'; courses: CourseTees[] } | { status: 'error' } }

/** Clave estable del conjunto de canchas: mismas canchas en el mismo orden → misma clave. */
export function courseSetKey(courseIds: Array<string | null | undefined>): string {
  return [...new Set(courseIds.filter((id): id is string => !!id))].join(',')
}

export function useCourseTeeNames(courseIds: Array<string | null | undefined>): CourseTeeNamesState {
  // String: estable entre renders aunque `courseIds` sea un array nuevo cada vez.
  const key = courseSetKey(courseIds)
  // Cada reintento es una carga nueva: la clave de carga incluye el intento.
  const [attempt, setAttempt] = useState(0)
  const loadKey = `${key}#${attempt}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const retry = useCallback(() => setAttempt(a => a + 1), [])

  useEffect(() => {
    if (!key) return
    let cancelled = false
    getTeeNamesForCourses(createClient(), key.split(','))
      .then(courses => {
        if (!cancelled) setLoaded({ key: loadKey, state: { status: 'ready', courses } })
      })
      .catch(err => {
        void captureError(err, { context: 'draft.categorias.tee-names', level: 'warning' })
        if (!cancelled) setLoaded({ key: loadKey, state: { status: 'error' } })
      })
    return () => {
      cancelled = true
    }
  }, [key, loadKey])

  if (!key) return { status: 'no-course' }
  if (!loaded || loaded.key !== loadKey) return { status: 'loading' }
  if (loaded.state.status === 'error') return { status: 'error', retry }
  return loaded.state
}
