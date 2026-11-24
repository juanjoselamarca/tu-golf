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

  it('sesión perdida en plena ronda: "Tu sesión se cerró" con el botón, aunque haya pendientes (no "Sin conexión")', () => {
    render(<ConexionScorerBanner conexion="ok" pendienteDeEnvio codigo="ABC123" sesionPerdida />)
    expect(screen.getByRole('status').textContent).toMatch(/^Tu sesión se cerró\./)
    expect(screen.getByRole('status').textContent).not.toContain('Sin conexión')
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe(loginUrl('/ronda-libre/ABC123/score-grupo'))
  })

  it('sin conexión o con pendientes: el aviso de conexión; al día: nada', () => {
    expect(textoConexionScorer('sin_conexion', false, 'ABC123')).toMatch(/^Sin conexión con el servidor/)
    expect(textoConexionScorer('ok', true, 'ABC123')).toMatch(/^Sin conexión con el servidor/)
    expect(textoConexionScorer('ok', false, 'ABC123')).toBeNull()
  })

  it('en «Elige tu equipo» sin conexión habla de la lista de equipos, no de golpes; sin sesión, el copy canónico', () => {
    const t = textoConexionScorer('sin_conexion', false, 'ABC123', false, true)
    expect(t).toBe('Sin conexión con el servidor. La lista de equipos se actualiza sola cuando vuelva la señal.')
    expect(t).not.toContain('golpes')
    render(<ConexionScorerBanner conexion="sin_conexion" pendienteDeEnvio={false} codigo="ABC123" eleccion />)
    expect(screen.getByRole('status').textContent).toContain('La lista de equipos se actualiza sola')
    expect(textoConexionScorer('sin_sesion', false, 'ABC123', false, true)).toMatch(/^Inicia sesión para guardar/)
    expect(textoConexionScorer('ok', false, 'ABC123', false, true)).toBeNull()
  })

  it('en «Elige tu equipo» va como tarjeta (radio y borde completo, como las de la lista); en el scorer, franja a todo el ancho', () => {
    const { unmount } = render(<ConexionScorerBanner conexion="sin_conexion" pendienteDeEnvio={false} codigo="ABC123" eleccion />)
    const tarjeta = screen.getByRole('status').style
    expect(tarjeta.borderRadius).toBe('12px')
    expect(tarjeta.border).toBe('1px solid rgba(217, 119, 6, 0.45)')
    unmount()
    render(<ConexionScorerBanner conexion="sin_conexion" pendienteDeEnvio={false} codigo="ABC123" />)
    const franja = screen.getByRole('status').style
    expect(franja.borderRadius).toBe('')
    expect(franja.borderBottom).toBe('1px solid rgba(217, 119, 6, 0.45)')
    expect(franja.borderTop).toBe('')
  })
})
