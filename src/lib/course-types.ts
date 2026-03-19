// Tipos basados en el schema real verificado de Supabase
// Nombres de columna: slope_rating (no slope), course_rating (no rating),
// yardaje_campeonato/azul/blanco/rojo, stroke_index (no hdcp), numero (no hole_number)

export type TipoRecorrido = '9h' | '18h' | '27h' | '36h'
export type TeeGenero = 'M' | 'F' | 'U'

export interface Course {
  id: string
  nombre: string
  ciudad: string | null
  pais: string | null
  slope_rating: number | null
  course_rating: number | null
  par_total: number | null
  foto_url: string | null
  sitio_web: string | null
  latitud: number | null
  longitud: number | null
  fuente: string | null
  fuente_id: string | null
  activa: boolean | null
  created_at: string
  updated_at: string
  // Columnas de migración 002 (opcionales hasta que se ejecute):
  tipo_recorrido?: TipoRecorrido
  parent_id?: string | null
  loop_nombre?: string | null
  datos_verificados?: boolean
}

export interface CourseHole {
  id: string
  course_id: string
  numero: number                       // NO hole_number
  par: number
  stroke_index: number | null          // NO hdcp
  yardaje_campeonato: number | null
  yardaje_azul: number | null
  yardaje_blanco: number | null
  yardaje_rojo: number | null
  descripcion: string | null
}

export interface CourseTee {
  id: string
  course_id: string
  nombre: string
  yardaje_total: number | null
  par_total: number | null
  rating: number | null
  slope: number | null
  genero: TeeGenero
  created_at: string
}

export interface CourseSummary {
  id: string
  nombre: string
  ciudad: string | null
  par_total: number | null
  loop_nombre?: string | null
  tipo_recorrido?: TipoRecorrido
}
