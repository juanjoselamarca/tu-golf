function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalize(name: string): string {
  const cleaned = stripAccents(name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\b(c\s*g|c\s*c|s\s*c|s\s*a|cc|cg|club de golf|club de|golf club|country club|club|golf|c\s*g\s*p|damas|varones|caballeros|masculino|femenino|de|la|el|los|las|y|cancha|antigua|nueva|oficial|verde)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = cleaned.split(' ').filter(t => t.length > 0)
  return Array.from(new Set(tokens)).join(' ')
}

function extractClubName(name: string): string {
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim()
  const parts = withoutParens.split(/\s*-\s*/)
  for (const p of parts) {
    const norm = normalize(p)
    if (norm.length > 2) return p.trim()
  }
  return parts[0] || name
}

function generateQueries(courseName: string): string[] {
  const queries = new Set<string>()
  const full = normalize(courseName)
  if (full) queries.add(full)
  const words = full.split(' ').filter(Boolean)
  if (words.length > 3) queries.add(words.slice(0, 3).join(' '))
  if (words.length > 2) queries.add(words.slice(0, 2).join(' '))
  const clubName = normalize(extractClubName(courseName))
  if (clubName && clubName !== full) queries.add(clubName)
  if (words.length > 0 && words[0].length >= 4) queries.add(words[0])
  return Array.from(queries).filter(q => q.length >= 3)
}

const tests = [
  'C.G. Angostura - Angostura (DAMAS)',
  'C.G. Cachagua - Cachagua (VARONES)',
  'Club De Polo y Equitacion S.C. - Club de Polo (VARONES)',
  'Hacienda Santa Martina - Cancha Oficial (VARONES)',
  'Prince Of Wales C.C. - Prince of Wales (VARONES)',
  'Marbella C.C. - Andes Pro - Pacifico Norte (VARONES)',
  'C.G. Rocas De Santo Domingo - Antigua (VARONES)',
  'Club de Golf Los Leones',
]
for (const t of tests) {
  console.log(`\ninput: "${t}"`)
  console.log(`  normalize: "${normalize(t)}"`)
  console.log(`  club:      "${extractClubName(t)}"`)
  console.log(`  queries:   ${JSON.stringify(generateQueries(t))}`)
}
