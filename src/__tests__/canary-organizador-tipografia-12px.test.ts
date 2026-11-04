import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Canario: las pantallas del organizador (jugadores y scoring) no bajan del piso
 *  tipográfico de DESIGN.md §4 (caption 12 px) ni usan colores de error/éxito
 *  hardcodeados que solo se ven en oscuro (el badge DQ daba 1,5:1 en claro). */
const BASE = join(process.cwd(), 'src/app/organizador/[slug]')
const ARCHIVOS = [
  'jugadores/components/PlayersTable.tsx', 'jugadores/components/GroupsSection.tsx',
  'jugadores/components/InscribirPlayerForm.tsx', 'scoring/components/HoleStatsTable.tsx',
  'scoring/components/PlayerCards.tsx', 'scoring/components/ResumenTab.tsx', 'scoring/components/ScorecardPanel.tsx',
]

describe('canario: organizador ≥12 px y sin colores dark-only', () => {
  it.each(ARCHIVOS)('%s', (rel) => {
    const src = readFileSync(join(BASE, rel), 'utf8')
    const chicos = [...src.matchAll(/fontSize:\s*'?(\d+(?:\.\d+)?)(?:px)?'?/g)].map(m => Number(m[1])).filter(n => n < 12)
    expect(chicos, `fontSize < 12 px en ${rel}`).toEqual([])
    expect(src, `color hardcodeado dark-only en ${rel}`).not.toMatch(/#fca5a5|#22c55e/i)
  })
})
