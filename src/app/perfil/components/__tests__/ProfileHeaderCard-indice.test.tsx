// Perfil: la cabecera muestra el índice plus con "+" y un decimal ("Índice: +1.0", no "Índice: -1").
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ProfileHeaderCard } from '../ProfileHeaderCard'
import type { Profile } from '@/lib/data/perfil'

describe('ProfileHeaderCard — índice', () => {
  it('plus con "+"', () => {
    const profile = { id: 'u1', name: 'Ana', indice: -1, avatar_url: null } as Profile
    const { container } = render(<ProfileHeaderCard profile={profile} tourneysPlayed={0} onAddIndice={() => {}} />)
    expect(container.textContent).toContain('Índice: +1.0')
    expect(container.textContent).not.toContain('-1')
  })
})
