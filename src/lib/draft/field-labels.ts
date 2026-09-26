// src/lib/draft/field-labels.ts
//
// Etiquetas humanas de los campos del borrador y traducción de issues de zod a
// mensajes en español. Una sola fuente: la usan el badge de confirmación del
// asistente IA, la validación en cliente del autosave y los rechazos del server.

export interface FieldIssue {
  path: Array<string | number>
  message: string
  code?: string
  minimum?: number | string | bigint
  maximum?: number | string | bigint
  expected?: string
  origin?: string
  format?: string
}

/** dot-path (o último segmento) → etiqueta. Para paths desconocidos cae al último segmento. */
export const FIELD_LABELS: Record<string, string> = {
  'format': 'formato',
  'modo': 'modo',
  'use_handicap': 'handicap',
  'name': 'nombre',
  'description': 'descripción',
  'date_start': 'fecha',
  'cover_image_url': 'foto',
  'team_config': 'equipos',
  'team_config.size': 'tamaño equipo',
  'team_config.handicap_pct': '% handicap',
  'team_config.formation_mode': 'armado equipos',
  'team_config.min_drives_per_player': 'mín. drives',
  'match_play_config': 'match play',
  'match_play_config.bracket_mode': 'bracket',
  'match_play_config.handicap_diff': 'diferencia HCP',
  'stableford_config': 'stableford',
  'stableford_config.points_table': 'tabla puntos',
  'categories': 'categorías',
  'rounds': 'rondas',
  'registration': 'inscripción',
  'registration.mode': 'modo inscripción',
  'registration.code': 'código',
  'registration.deadline': 'deadline',
  'registration.max_players': 'cupo máx.',
  'prizes': 'premios',
  'is_practice': 'práctica',
  // Últimos segmentos de paths con índice ("prizes.0.description").
  'size': 'tamaño equipo',
  'handicap_pct': '% handicap',
  'formation_mode': 'armado equipos',
  'min_drives_per_player': 'mín. drives',
  'points_table': 'tabla puntos',
  'handicap_min': 'handicap mín.',
  'handicap_max': 'handicap máx.',
  'gender': 'género',
  'date': 'fecha',
  'course_id': 'cancha',
  'hole_count': 'hoyos',
  'mode': 'modo',
  'code': 'código',
  'deadline': 'deadline',
  'max_players': 'cupo máx.',
  'type': 'tipo',
  'position': 'posición',
  'category_id': 'categoría',
  'hole_number': 'hoyo',
  'kind': 'escala',
}

/** Singular para items de listas: "premio 2", "categoría 1", "ronda 3". */
const ITEM_LABELS: Record<string, string> = {
  prizes: 'premio',
  categories: 'categoría',
  rounds: 'ronda',
}

/** Traduce dot-paths del config a labels legibles en español. */
export function humanizeFieldPath(path: string): string {
  if (FIELD_LABELS[path]) return FIELD_LABELS[path]
  const lastSegment = path.split('.').pop() ?? path
  return FIELD_LABELS[lastSegment] ?? lastSegment.replace(/_/g, ' ')
}

/** ['prizes', 0, 'description'] → "premio 1 · descripción". */
export function describeFieldPath(path: Array<string | number>): string {
  if (path.length === 0) return 'configuración'
  const [root, ...rest] = path
  const rootKey = String(root)
  if (rest.length === 0) return humanizeFieldPath(rootKey)
  const parts: string[] = []
  let i = 0
  if (typeof rest[0] === 'number') {
    parts.push(`${ITEM_LABELS[rootKey] ?? humanizeFieldPath(rootKey)} ${rest[0] + 1}`)
    i = 1
  } else {
    parts.push(humanizeFieldPath(rootKey))
  }
  const leaf = rest.slice(i).filter((p) => typeof p === 'string') as string[]
  if (leaf.length > 0) parts.push(humanizeFieldPath(leaf[leaf.length - 1]))
  return parts.join(' · ')
}

/** Motivo en español a partir del issue de zod (v4). */
export function describeIssueReason(issue: FieldIssue): string {
  switch (issue.code) {
    case 'too_small': {
      const min = issue.minimum
      if (issue.origin === 'string') return Number(min) <= 1 ? 'obligatorio' : `mínimo ${min} caracteres`
      if (issue.origin === 'array') return `mínimo ${min}`
      return `mínimo ${min}`
    }
    case 'too_big':
      return issue.origin === 'string' ? `máximo ${issue.maximum} caracteres` : `máximo ${issue.maximum}`
    case 'invalid_type':
      if (issue.expected === 'int') return 'debe ser un número entero'
      if (issue.expected === 'number') return 'debe ser un número'
      if (issue.expected === 'string') return 'debe ser texto'
      return 'valor inválido'
    case 'invalid_format':
      if (issue.format === 'url') return 'debe ser una URL'
      if (issue.format === 'uuid') return 'identificador inválido'
      return 'formato inválido'
    case 'invalid_value':
    case 'invalid_enum_value':
      return 'opción inválida'
    default:
      return issue.message
  }
}

/** "premio 1 · descripción: obligatorio". */
export function describeIssue(issue: FieldIssue): string {
  return `${describeFieldPath(issue.path)}: ${describeIssueReason(issue)}`
}

/** Varios issues, sin repetidos, separados por "; ". */
export function describeIssues(issues: FieldIssue[]): string {
  return Array.from(new Set(issues.map(describeIssue))).join('; ')
}
