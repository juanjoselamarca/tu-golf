// src/app/organizador/nuevo/types.ts
//
// Tipos compartidos del wizard de creación de torneos.
//
// `CourseOption` estaba declarado dos veces (TournamentDraftEditor y
// RondasSection) con formas distintas — la de RondasSection no tenía forma de
// enterarse de nada que el servidor calculara. Una sola declaración: el que
// toca, unifica.

import type { AptitudPorHoyos } from '@/golf/courses/aptitud-torneo'

/** Borrador reciente del organizador, para "Continuar un borrador". */
export interface DraftSummary {
  id: string
  name: string
  updated_at: string
}

/** Torneo previo del organizador, para "Duplicar desde un torneo previo". */
export interface TournamentSummary {
  id: string
  name: string
  format: string
  date_start: string
  slug: string
}

export interface CourseOption {
  id: string
  nombre: string
  ciudad?: string | null
  /**
   * Veredicto del guardarrail de rating, precalculado en el servidor para 9 y
   * 18 hoyos. `undefined` cuando la cancha no se pudo leer: en ese caso no se
   * bloquea nada en el cliente y manda el gate del servidor.
   */
  aptitud?: AptitudPorHoyos
}
