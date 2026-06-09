export function getCpiColor(score: number): string {
  if (score >= 75) return '#16a34a'
  if (score >= 60) return '#c4992a'
  if (score >= 40) return '#94a8c0'
  if (score >= 25) return '#d97706'
  return '#dc2626'
}

export function getCpiLabel(score: number): string {
  if (score >= 75) return 'Forma excepcional'
  if (score >= 60) return 'En forma'
  if (score >= 40) return 'Estable'
  if (score >= 25) return 'Bajo su nivel'
  return 'Fuera de forma'
}

export function getPlayerTier(indice: number | null) {
  if (indice == null) return 'Perfil en construcción'
  if (indice <= 5) return 'Competidor avanzado'
  if (indice <= 12) return 'Competidor consistente'
  if (indice <= 20) return 'Amateur en progreso'
  return 'Jugador activo'
}
