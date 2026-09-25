'use client'

// src/app/organizador/nuevo/hooks/useCourseTeeNames.ts
//
// Carga los nombres de tee de las canchas elegidas en las rondas del borrador.
// Recarga solo cuando cambia el conjunto de canchas, no en cada tecla.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getTeeNamesForCourses } from '@/lib/data/course-tees'
import { captureError } from '@/lib/error-tracking'
import type { CourseTees } from '@/golf/courses/category-tee-options'

export type CourseTeeNamesState =
  | { status: 'no-course' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; courses: CourseTees[] }

export function useCourseTeeNames(courseIds: Array<string | null | undefined>): CourseTeeNamesState {
  // Clave estable: mismas canchas en el mismo orden → misma clave.
  const key = useMemo(
    () => [...new Set(courseIds.filter((id): id is string => !!id))].join(','),
    [courseIds],
  )
  const [state, setState] = useState<CourseTeeNamesState>({ status: 'loading' })

  useEffect(() => {
    if (!key) {
      setState({ status: 'no-course' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    getTeeNamesForCourses(createClient(), key.split(','))
      .then(courses => {
        if (!cancelled) setState({ status: 'ready', courses })
      })
      .catch(err => {
        void captureError(err, { context: 'draft.categorias.tee-names', level: 'warning' })
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return state
}
