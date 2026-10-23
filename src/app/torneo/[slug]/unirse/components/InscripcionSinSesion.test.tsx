// @vitest-environment jsdom
// Hunter 22/23-oct-2026 (torneo e2e-hunter-insc-9yk7ge, organizador free): el visitante sin sesión
// veía "Scorear como invitado", llenaba nombre e índice y recién al enviar recibía el 403
// "El organizador necesita plan Pro para invitados". El formulario no debió mostrarse.
// Contrato: cada estado del torneo muestra la salida que sirve, nunca un formulario que el backend rechaza.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InscripcionSinSesion, COPY_SIN_INVITADOS, COPY_PLAN_SIN_VERIFICAR } from './InscripcionSinSesion'
import type { JoinInfoTournament } from '@/lib/data/tournaments/joinFlow'

const torneo = (status = 'open') => ({
  id: 't1', name: 'Copa', slug: 'copa', format: 'stroke_play', formato_juego: 'stroke_play', status,
  organizer_id: 'o1', hcp_calc_mode: 'whs', date_start: '2026-12-20', codigo: 'ABC123', course_name: null, courses: null,
}) as JoinInfoTournament

const SIN_CUPO = { full: false, maxPlayers: null, approved: 3 }

function pintar(props: Partial<Parameters<typeof InscripcionSinSesion>[0]> = {}) {
  const onReintentar = vi.fn()
  const utils = render(
    <InscripcionSinSesion
      slug="copa"
      tournament={torneo()}
      capacity={SIN_CUPO}
      invitados={{ permitido: true }}
      guestName=""
      onGuestName={() => {}}
      guestHandicap=""
      onGuestHandicap={() => {}}
      guestJoining={false}
      onJoin={() => {}}
      onReintentar={onReintentar}
      {...props}
    />,
  )
  return { ...utils, onReintentar }
}

const formularioInvitado = () => screen.queryByLabelText(/Tu nombre/)
const linkSesion = () => screen.getByRole('link', { name: /Iniciar sesión/ }) as HTMLAnchorElement

describe('InscripcionSinSesion', () => {
  it('organizador sin Pro: no hay formulario de invitado; la salida es iniciar sesión o crear cuenta', () => {
    pintar({ invitados: { permitido: false, motivo: 'pro_required' } })
    expect(formularioInvitado()).toBeNull()
    expect(screen.queryByText('Scorear como invitado')).toBeNull()
    expect(screen.getByText(COPY_SIN_INVITADOS.titulo)).toBeTruthy()
    expect(screen.getByText(COPY_SIN_INVITADOS.detalle)).toBeTruthy()
    const link = linkSesion()
    expect(link.textContent).toBe(COPY_SIN_INVITADOS.link)
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain('/torneo/copa/unirse')
  })

  it('plan del organizador sin verificar: ofrece reintentar (es un hipo, no un "no") y la sesión', () => {
    const { onReintentar } = pintar({ invitados: { permitido: false, motivo: 'plan_unavailable', mensaje: 'No pudimos verificar el plan del organizador. Intenta de nuevo en unos segundos.' } })
    expect(formularioInvitado()).toBeNull()
    expect(screen.getByText(COPY_PLAN_SIN_VERIFICAR.titulo)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onReintentar).toHaveBeenCalledTimes(1)
    expect(linkSesion()).toBeTruthy()
  })

  it('cupo lleno: "Torneo completo" con el cupo real, sin formulario', () => {
    pintar({ capacity: { full: true, maxPlayers: 24, approved: 24 } })
    expect(formularioInvitado()).toBeNull()
    expect(screen.getByText('Torneo completo')).toBeTruthy()
    expect(screen.getByText(/cupo de 24 jugadores/)).toBeTruthy()
  })

  it('torneo cerrado o en borrador: aviso honesto con link al leaderboard', () => {
    pintar({ tournament: torneo('in_progress') })
    expect(formularioInvitado()).toBeNull()
    expect(screen.getByText('Las inscripciones de este torneo están cerradas')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Ver leaderboard/ })).toBeTruthy()
  })

  it('organizador con Pro y cupo: el formulario de invitado, con la opción de iniciar sesión', () => {
    pintar()
    expect(formularioInvitado()).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scorear como invitado' })).toBeTruthy()
    expect(linkSesion()).toBeTruthy()
  })
})
