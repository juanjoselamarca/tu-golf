import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MENSAJE_SKINS_YA_EMPEZO } from '@/lib/data/skins-editar'
import { MAX_JUGADORES_POR_RONDA } from '@/golf/ronda-libre/plantilla-de-jugadores'
import { EditarSkins, TEXTO_EDITAR, textoDelPie } from './EditarSkins'
import { MENSAJE_EDITAR_SIN_SENAL, MENSAJE_EDITAR_TOPE, pedidoDeEdicion, puedeEditarElSkins, filasIniciales } from '../../hooks/useEditarSkins'

vi.mock('@/lib/data/ronda-libre-nueva', () => ({
  fetchTeesDeCancha: async () => [
    { nombre: 'Azul', yardaje_total: 6400, rating: 72, slope: 130 },
    { nombre: 'Blanco', yardaje_total: 6000, rating: 70, slope: 125 },
  ],
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
// La búsqueda de cuentas de TarjetaDeRival no corre en estas pruebas (los nuevos entran como invitados).
vi.mock('../../../nueva/hooks/usePlayerSearch', () => ({
  usePlayerSearch: () => ({ results: [], searching: false, open: false, dismiss: () => {}, containerRef: { current: null } }),
}))

const CREADOR = 'u-creador'
const JUGADORES = [
  { id: 'j2', nombre: 'Beto Soto', user_id: null, handicap: 18.4, tees: 'blanco' },
  { id: 'j1', nombre: 'Ana Pérez', user_id: CREADOR, handicap: 10.2, tees: 'azul' },
]
const ORDEN = ['j1', 'j2']

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function montar(over: Partial<Parameters<typeof EditarSkins>[0]> = {}) {
  const onGuardado = vi.fn()
  render(
    <EditarSkins
      visible codigo="ABC123" creadorId={CREADOR} jugadores={JUGADORES} orden={ORDEN} courseId="c1" recorridos={null}
      teeGlobal="blanco" pozoPorJugador={10_000} onGuardado={onGuardado} {...over}
    />,
  )
  return { onGuardado }
}
const abrir = () => fireEvent.click(screen.getByRole('button', { name: TEXTO_EDITAR }))
const hoja = () => screen.getByRole('dialog', { name: 'Editar jugadores del Skins' })
const responder = (status: number, cuerpo: unknown) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } }))

describe('quién ve «Editar» (puedeEditarElSkins)', () => {
  const vista = { empezado: false, rondaCerrada: false, jugadorIds: ORDEN }
  it('el creador, sin empezar, con la lista que calza: sí', () => {
    expect(puedeEditarElSkins({ userId: CREADOR, creadorId: CREADOR, vista, jugadores: JUGADORES })).toBe(true)
  })
  it('otro jugador o un espectador sin sesión: no', () => {
    expect(puedeEditarElSkins({ userId: 'otro', creadorId: CREADOR, vista, jugadores: JUGADORES })).toBe(false)
    expect(puedeEditarElSkins({ userId: null, creadorId: CREADOR, vista, jugadores: JUGADORES })).toBe(false)
  })
  it('empezado, sin saberlo (campo ausente) o con la ronda cerrada: no', () => {
    expect(puedeEditarElSkins({ userId: CREADOR, creadorId: CREADOR, vista: { ...vista, empezado: true }, jugadores: JUGADORES })).toBe(false)
    expect(puedeEditarElSkins({ userId: CREADOR, creadorId: CREADOR, vista: { rondaCerrada: false, jugadorIds: ORDEN }, jugadores: JUGADORES })).toBe(false)
    expect(puedeEditarElSkins({ userId: CREADOR, creadorId: CREADOR, vista: { ...vista, rondaCerrada: true }, jugadores: JUGADORES })).toBe(false)
  })
  it('la pantalla tiene una lista vieja (falta o sobra alguien): no, guardarla sacaría a alguien', () => {
    expect(puedeEditarElSkins({ userId: CREADOR, creadorId: CREADOR, vista: { ...vista, jugadorIds: ['j1', 'j2', 'j3'] }, jugadores: JUGADORES })).toBe(false)
  })
})

describe('el botón', () => {
  it('no visible: no hay botón', () => {
    montar({ visible: false })
    expect(screen.queryByRole('button', { name: TEXTO_EDITAR })).toBeNull()
  })
  it('visible: dice exactamente «Editar» y abre la hoja con el creador primero', async () => {
    montar()
    abrir()
    const filas = within(hoja()).getAllByRole('listitem')
    expect(filas[0].textContent).toContain('Ana Pérez')
    expect(filas[0].textContent).toContain('(tú)')
    // El creador no se puede quitar.
    expect(within(filas[0]).queryByRole('button', { name: /Quitar/ })).toBeNull()
    expect(await within(hoja()).findAllByRole('combobox', { name: /Tee de/ })).toHaveLength(2)
  })
})

describe('la hoja', () => {
  it('quitar pide confirmación y Cancelar no quita', () => {
    montar()
    abrir()
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Quitar a Beto Soto' }))
    expect(within(hoja()).getByText('¿Quitar a Beto Soto del Skins?')).toBeTruthy()
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Cancelar' }))
    expect(within(hoja()).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Quitar a Beto Soto' }))
    const grupo = within(hoja()).getByRole('group', { name: 'Quitar a Beto Soto' })
    fireEvent.click(within(grupo).getByRole('button', { name: 'Quitar' }))
    expect(within(hoja()).getAllByRole('listitem')).toHaveLength(1)
    expect(within(hoja()).getByText('Pozo: $10.000 · 1 jugador')).toBeTruthy()
  })

  it('el pie cambia al sumar un jugador con nombre, y «+ Sumar jugador» se apaga al llegar al tope', () => {
    montar()
    abrir()
    expect(within(hoja()).getByText('Pozo: $20.000 · 2 jugadores')).toBeTruthy()
    const sumar = () => fireEvent.click(within(hoja()).getByRole('button', { name: '+ Sumar jugador' }))
    sumar()
    // Una tarjeta sin nombre todavía no cuenta.
    expect(within(hoja()).getByText('Pozo: $20.000 · 2 jugadores')).toBeTruthy()
    fireEvent.change(within(hoja()).getByLabelText('Nombre del jugador 3'), { target: { value: 'Coni Díaz' } })
    expect(within(hoja()).getByText('Pozo: $30.000 · 3 jugadores')).toBeTruthy()
    sumar()
    expect(within(hoja()).getAllByRole('listitem')).toHaveLength(MAX_JUGADORES_POR_RONDA)
    const boton = within(hoja()).getByRole('button', { name: '+ Sumar jugador' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    expect(within(hoja()).getByText(MENSAJE_EDITAR_TOPE)).toBeTruthy()
  })

  it('un índice inválido bloquea «Guardar»', () => {
    montar()
    abrir()
    fireEvent.change(within(hoja()).getAllByLabelText('Índice')[1], { target: { value: 'abc' } })
    expect((within(hoja()).getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('guardar: PUT con ids de los que estaban, sin perfil_sugerido_id; con éxito cierra y recarga', async () => {
    responder(200, { ok: true })
    const { onGuardado } = montar()
    abrir()
    fireEvent.change(within(hoja()).getAllByLabelText('Índice')[1], { target: { value: '20' } })
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/ronda-libre/ABC123/skins/jugadores')
    expect(init.method).toBe('PUT')
    const cuerpo = JSON.parse(init.body as string) as { jugadores: Record<string, unknown>[] }
    expect(cuerpo.jugadores).toEqual([
      { id: 'j1', nombre: 'Ana Pérez', user_id: CREADOR, handicap: 10.2, tees: 'azul' },
      { id: 'j2', nombre: 'Beto Soto', user_id: null, handicap: 20, tees: 'blanco' },
    ])
  })

  it('409 «ya empezó»: muestra el mensaje y «Entendido» cierra y recarga', async () => {
    responder(409, { error: MENSAJE_SKINS_YA_EMPEZO })
    const { onGuardado } = montar()
    abrir()
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja()).findByText(MENSAJE_SKINS_YA_EMPEZO)).toBeTruthy()
    expect(onGuardado).not.toHaveBeenCalled()
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onGuardado).toHaveBeenCalledTimes(1)
  })

  it('400 de validación: el mensaje se muestra y se puede corregir sin cerrar', async () => {
    responder(400, { error: 'Índice de Beto Soto: usa un decimal.' })
    montar()
    abrir()
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja()).findByText('Índice de Beto Soto: usa un decimal.')).toBeTruthy()
    expect(within(hoja()).getByRole('button', { name: 'Guardar' })).toBeTruthy()
  })

  it('sin señal: no reintenta solo (sumaría de nuevo a los nuevos); pide cerrar y mirar', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    montar()
    abrir()
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja()).findByText(MENSAJE_EDITAR_SIN_SENAL)).toBeTruthy()
    expect(within(hoja()).getByRole('button', { name: 'Entendido' })).toBeTruthy()
  })
})

describe('el pedido', () => {
  it('un nuevo invitado va sin cuenta y con sus datos; uno con cuenta, con la sugerencia; los sin nombre no van', () => {
    const filas = [
      ...filasIniciales(JUGADORES, CREADOR, ORDEN),
      { clave: 'n1', tipo: 'nuevo' as const, rival: { id: 'n1', tipo: 'invitado' as const, nombre: ' Coni ', telefono: '+569', handicap: 5, tees: null, profileId: 'p-x' } },
      { clave: 'n2', tipo: 'nuevo' as const, rival: { id: 'n2', tipo: 'cuenta' as const, nombre: 'Dani', telefono: '', handicap: 7, tees: 'azul', profileId: 'p-dani' } },
      { clave: 'n3', tipo: 'nuevo' as const, rival: { id: 'n3', tipo: 'invitado' as const, nombre: '  ', telefono: '', handicap: null, tees: null, profileId: null } },
    ]
    const pedido = pedidoDeEdicion(filas, CREADOR)
    expect(pedido).toHaveLength(4)
    expect(pedido[2]).toEqual({
      nombre: 'Coni', user_id: null, perfil_sugerido_id: null, handicap: 5, tees: null, is_guest: true, telefono_invitado: '+569', nombre_invitado: 'Coni',
    })
    expect(pedido[3]).toMatchObject({ nombre: 'Dani', perfil_sugerido_id: 'p-dani', is_guest: false })
    expect('perfil_sugerido_id' in pedido[1]).toBe(false)
  })

  it('textoDelPie', () => {
    expect(textoDelPie(40_000, 4)).toBe('Pozo: $40.000 · 4 jugadores')
    expect(textoDelPie(0, 3)).toBe('Sin pozo · 3 jugadores')
  })
})
