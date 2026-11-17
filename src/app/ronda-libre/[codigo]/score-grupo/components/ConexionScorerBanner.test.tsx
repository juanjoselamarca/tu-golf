import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ConexionScorerBanner, textoConexionScorer } from './ConexionScorerBanner'
import { avisoSesionCerrada } from '@/lib/auth/aviso-sesion-cerrada'
import { loginUrl } from '@/lib/auth/login-url'

describe('ConexionScorerBanner (score-grupo)', () => {
  it('sin sesión: el copy canónico de los scorers ("Inicia sesión para guardar"), no uno propio', () => {
    const aviso = avisoSesionCerrada('/ronda-libre/ABC123/score-grupo', { habiaSesion: false })
    expect(textoConexionScorer('sin_sesion', false, 'ABC123')).toBe(`${aviso.titulo}. ${aviso.detalle}`)
    expect(aviso.titulo).toBe('Inicia sesión para guardar')
  })

  it('sin sesión: botón "Iniciar sesión" que vuelve al scorer de grupo', () => {
    render(<ConexionScorerBanner conexion="sin_sesion" pendienteDeEnvio={false} codigo="ABC123" />)
    const cta = screen.getByRole('link', { name: 'Iniciar sesión' })
    expect(cta.getAttribute('href')).toBe(loginUrl('/ronda-libre/ABC123/score-grupo'))
  })

  it('sin conexión o con pendientes: el aviso de conexión; al día: nada', () => {
    expect(textoConexionScorer('sin_conexion', false, 'ABC123')).toMatch(/^Sin conexión con el servidor/)
    expect(textoConexionScorer('ok', true, 'ABC123')).toMatch(/^Sin conexión con el servidor/)
    expect(textoConexionScorer('ok', false, 'ABC123')).toBeNull()
  })
})
