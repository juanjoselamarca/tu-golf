// @vitest-environment jsdom
// La ficha de inscripción nombra el formato con la fuente única (`formatLabel` de @/golf/core/rules).
// Antes tenía su propia lista sin Foursome: un torneo foursome se mostraba como "foursome" (la clave cruda).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TarjetaTorneoInscripcion } from './TarjetaTorneoInscripcion'
import type { JoinInfoTournament } from '@/lib/data/tournaments/joinFlow'

afterEach(cleanup)

const torneo = (format: string): JoinInfoTournament => ({
  id: 't1', name: 'Copa', slug: 'copa', format, status: 'open', organizer_id: 'o',
  hcp_calc_mode: null, date_start: '2026-10-30', codigo: null, course_name: 'Club', courses: null,
})

describe('TarjetaTorneoInscripcion · formato', () => {
  it.each([
    ['foursome', 'Foursome'],
    ['scramble', 'Scramble'],
    ['best_ball', 'Best Ball'],
    ['stableford', 'Stableford'],
  ])('%s → "%s"', (format, label) => {
    render(<TarjetaTorneoInscripcion tournament={torneo(format)} />)
    expect(screen.getByText(label)).toBeTruthy()
  })
})
