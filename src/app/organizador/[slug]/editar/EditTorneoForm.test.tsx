// @vitest-environment jsdom
//
// El bloque "Tee" de editar torneo, con el caso que de verdad hay en prod: un torneo en un modo que
// resuelve por categoría y SIN ninguna categoría con tee (6 torneos en curso el 30-oct-2026). Acá no
// se prueba la prosa —eso lo cubre `src/golf/tournament-tees-mode.test.ts`— sino que la salida que se
// le ofrece esté CABLEADA: que el botón abra el selector de verdad y que el tee elegido llegue al
// UPDATE. Un botón que avisa el problema y no lo arregla es decoración, y es el único arreglo que
// esos torneos tienen hoy (las categorías solo se crean en el wizard).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditTorneoForm from './EditTorneoForm'
import { MODO_TEES_POR_JUGADOR } from '@/golf/tournament-tees-mode'

const updates: Record<string, unknown>[] = []
const push = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updates.push(payload)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

// Los tees de la cancha los trae `useCourseTeeNames` por acá. Se mockea el acceso a datos y no el
// hook, para que el estado (loading → ready) sea el real.
const teesDeLaCancha = vi.fn(async () => [
  { courseId: 'c1', courseName: 'Los Quillayes', tees: [{ nombre: 'blanco' }, { nombre: 'dorado' }] },
])
vi.mock('@/lib/data/course-tees', () => ({ getTeeNamesForCourses: (...a: unknown[]) => teesDeLaCancha(...(a as [])) }))

const TORNEO = {
  id: 't1',
  name: 'Copa de Primavera',
  slug: 'copa-de-primavera',
  format: 'stroke_play',
  hole_count: 18,
  // `as string` para que el fixture no fije el literal 'per_player': los casos de abajo pisan
  // `tees` con 'manual' y con un color.
  tees: MODO_TEES_POR_JUGADOR as string,
  use_handicap: true,
  date_start: '2026-11-15',
  cover_image_url: null,
  courses: { id: 'c1', nombre: 'Los Quillayes' },
  status: 'in_progress',
  hay_categoria_con_tee: false,
}

const CANCHAS = [{ id: 'c1', nombre: 'Los Quillayes', ciudad: 'Santiago' }]

function montar(cambios: Partial<typeof TORNEO> = {}) {
  return render(<EditTorneoForm tournament={{ ...TORNEO, ...cambios }} courses={CANCHAS} />)
}

/** El selector de colores está en pantalla (su botón, no el link que lo abre). */
const botonDeTee = (nombre: RegExp) => screen.queryByRole('button', { name: nombre })

beforeEach(() => {
  updates.length = 0
  push.mockClear()
  teesDeLaCancha.mockClear()
})

afterEach(cleanup)

describe('EditTorneoForm — tee del torneo sin ninguna categoría con tee', () => {
  it('avisa que el hándicap sale del rating de la cancha, no promete la categoría', async () => {
    montar()
    expect(await screen.findByText(/no tiene categorías con tee/)).toBeTruthy()
    expect(screen.queryByText(/categoría de cada jugador/)).toBeNull()
    // Y no manda al panel de jugadores: en este modo ese panel no tiene asignador de tees.
    expect(screen.queryByText(/panel de jugadores/)).toBeNull()
  })

  it('el selector no se muestra hasta que el organizador lo pide', async () => {
    montar()
    await screen.findByText(/no tiene categorías con tee/)
    expect(botonDeTee(/^Blanco$/)).toBeNull()
  })

  it('el botón ABRE el selector con los tees de la cancha (está cableado, no es decoración)', async () => {
    const user = userEvent.setup()
    montar()
    await user.click(await screen.findByRole('button', { name: /Elegir un tee para todo el torneo/ }))
    await waitFor(() => expect(botonDeTee(/^Blanco$/)).toBeTruthy())
    expect(botonDeTee(/^Dorado$/)).toBeTruthy()
    // Y avisa qué le va a pasar al modo, antes de guardar.
    expect(screen.getByText(/Reemplaza el modo/)).toBeTruthy()
  })

  it('el tee elegido llega al UPDATE y reemplaza el modo', async () => {
    const user = userEvent.setup()
    montar()
    await user.click(await screen.findByRole('button', { name: /Elegir un tee para todo el torneo/ }))
    await waitFor(() => expect(botonDeTee(/^Dorado$/)).toBeTruthy())
    await user.click(botonDeTee(/^Dorado$/)!)
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0].tees).toBe('dorado')
  })

  it('arrepentirse deja el modo como estaba, sin guardar nada', async () => {
    const user = userEvent.setup()
    montar()
    await user.click(await screen.findByRole('button', { name: /Elegir un tee para todo el torneo/ }))
    await waitFor(() => expect(botonDeTee(/^Dorado$/)).toBeTruthy())
    await user.click(botonDeTee(/^Dorado$/)!)
    // El aviso y la vuelta atrás siguen ahí DESPUÉS de elegir el tee: es el paso donde hacen falta.
    expect(screen.getByText(/Reemplaza el modo/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Dejar el modo como está/ }))
    // Vuelve la prosa del modo y el selector desaparece.
    expect(await screen.findByText(/no tiene categorías con tee/)).toBeTruthy()
    expect(botonDeTee(/^Dorado$/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0].tees).toBe(MODO_TEES_POR_JUGADOR)
  })

  it('con alguna categoría con tee no se ofrece la salida: ahí el motor SÍ tiene de dónde sacarlo', async () => {
    montar({ hay_categoria_con_tee: true })
    expect(await screen.findByText(/categoría de cada jugador/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Elegir un tee para todo el torneo/ })).toBeNull()
  })

  it('si la cancha no responde, el selector avisa y ofrece reintentar', async () => {
    const user = userEvent.setup()
    teesDeLaCancha.mockRejectedValueOnce(new Error('sin red'))
    montar()
    await user.click(await screen.findByRole('button', { name: /Elegir un tee para todo el torneo/ }))
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeTruthy()
    expect(screen.getByText(/No pudimos cargar los tees/)).toBeTruthy()
    // Sin catálogo, `opcionesDeTeeDelTorneo` cae a los colores genéricos para no dejar el campo
    // vacío, marcados como ajenos al catálogo. El aviso de arriba es lo que dice que no son los de
    // la cancha; la vuelta atrás sigue disponible para no guardar nada a ciegas.
    expect(botonDeTee(/^Blanco$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Dejar el modo como está/ })).toBeTruthy()
  })

  it('el modo manual sigue mandando al panel de jugadores y no ofrece la salida', async () => {
    montar({ tees: 'manual' })
    expect(await screen.findByRole('link', { name: /Asignarlos en el panel de jugadores/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Elegir un tee para todo el torneo/ })).toBeNull()
  })

  it('con un color guardado el selector se muestra de entrada, sin pedir permiso', async () => {
    montar({ tees: 'blanco' })
    await waitFor(() => expect(botonDeTee(/^Blanco$/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Elegir un tee para todo el torneo/ })).toBeNull()
    expect(screen.queryByText(/Reemplaza el modo/)).toBeNull()
  })
})
