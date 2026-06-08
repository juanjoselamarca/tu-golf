// src/lib/import-types.ts — Types for the import wizard

export interface ImportJob {
  id: string
  user_id: string
  source: string
  status: 'pending' | 'processing' | 'review_required' | 'confirmed' | 'completed' | 'failed'
  total_detected: number
  total_valid: number
  total_excluded: number
  total_imported: number
  raw_data?: unknown
  mapped_data?: unknown
  errors?: unknown
  created_at: string
  updated_at: string
  completed_at?: string | null
}

export interface ImportRoundData {
  tempId: string
  played_at: string
  course_name: string
  total_gross: number
  holes_played: 9 | 18
  scores: Record<string, number>
  par_per_hole?: Record<string, number>
  course_rating?: number | null
  slope_rating?: number | null
  // Identidad de cancha resuelta en el match (garmin-zip). Se propaga al confirm
  // para resolver CR/slope desde course_tees y para vincular la ronda.
  course_id?: string | null
  tee_color?: string | null
  // Formato de juego + modo. Si no están presentes, el API aplica
  // stroke_play + gross por default (no romper imports previos).
  formato_juego?: 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'
  modo_juego?: 'gross' | 'neto'
  metadata?: {
    putts?: number
    putts_per_hole?: Record<string, number>
    fairways?: number
    gir?: number
    gir_per_hole?: Record<string, number>
    reconstruction_method?: 'color_bar'
    ambiguous_holes?: number[]
    // Garmin-specific fields
    garmin_scorecard_id?: string
    penalties?: number
    tee_box?: string
    course_rating?: number
    slope_rating?: number
    distance_walked?: number
    import_source?: 'garmin_zip' | 'csv' | 'photo_scan' | 'fit'
    is_duplicate?: boolean
    existing_id?: boolean
  }
  import_confidence: number
  validation: {
    valid: boolean
    holesPlayed: number
    issues: ImportIssue[]
  }
}

export interface ImportIssue {
  type: 'missing_score' | 'score_out_of_range' | 'unknown_course' | 'incomplete_round'
  holeNumber?: number
  message: string
  canFix: boolean
}
