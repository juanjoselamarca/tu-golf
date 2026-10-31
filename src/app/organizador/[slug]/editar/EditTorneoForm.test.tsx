// @vitest-environment jsdom
//
// El bloque "Tee" de editar torneo, con el caso que de verdad hay en prod: un torneo en un modo que
// resuelve por categoría y con jugadores que no tienen de dónde sacar el tee (medido el 31-oct-2026).
// Acá no se prueba la prosa —eso lo cubre `src/golf/tournament-tees-mode.test.ts`— sino que la salida
// que se le ofrece esté CABLEADA: que el botón abra el selector de verdad, que el tee elegido llegue
// al UPDATE, y que los candados aguanten aunque el torneo se ponga en juego DESPUÉS de que esta
// pantalla se cargó. Un botón que avisa el problema y no lo arregla es decoración, y es el único
// arreglo que esos torneos tienen hoy (las categorías solo se crean en el wizard).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditTorneoForm from './EditTorneoForm'
import { MODO_TEES_POR_JUGADOR, type TeeDeCadaJugador } from '@/golf/tournament-tees-mode'
import type { CandadosDeConfiguracion } from '@/golf/tournament-config-locks'

const updates: Record<string, unknown>[] = []
const push = vi.fn()
const toasts: { tipo: string; titulo: string; mensaje?: string }[] = []

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showError: (titulo: string, mensaje?: string) => toasts.push({ tipo: 'error', titulo, mensaje }),
    showSuccess: (titulo: string, mensaje?: string) => toasts.push({ tipo: 'success', titulo, mensaje }),
    showWarning: (titulo: string, mensaje?: string) => toasts.push({ tipo: 'warning', titulo, mensaje }),
    showInfo: (titulo: string, mensaje?: string) => toasts.push({ tipo: 'info', titulo, mensaje }),
  }),
}))

/**
 * Lo que la base responde cuando el guardado RELEE. Es el corazón de estos tests: los candados que
 * la pantalla recibió por props pueden tener minutos de antigüedad, así que lo que decide es esto.
 */
let filaEnLaBase: { format: string; hole_count: number; tees: string; status: string | null }
let senalesEnLaBase: { scores: number | null; compartidas: number | null }

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      if (tabla === 'tournaments') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: filaEnLaBase, error: null }) }) }),
          update: (payload: Record<string, unknown>) => {
            updates.push(payload)
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      if (tabla === 'hole_scores') {
        return {
          select: () => ({
            eq: async () =>
              senalesEnLaBase.scores == null
                ? { count: null, error: new Error('sin red') }
                : { count: senalesEnLaBase.scores, error: null },
          }),
        }
      }
      if (tabla === 'tournament_groups') {
        return {
          select: () => ({
            eq: () => ({
              not: async () =>
                senalesEnLaBase.compartidas == null
                  ? { count: null, error: new Error('sin red') }
                  : { count: senalesEnLaBase.compartidas, error: null },
            }),
          }),
        }
      }
      throw new Error(`tabla no mockeada: ${tabla}`)
    },
  }),
}))

// Los tees de la cancha los trae `useCourseTeeNames` por acá. Se mockea el acceso a datos y no el
// hook, para que el estado (loading → ready) sea el real.
const teesDeLaCancha = vi.fn(async () => [
  { courseId: 'c1', courseName: 'Los Quillayes', tees: [{ nombre: 'blanco' }, { nombre: 'dorado' }] },
])
vi.mock('@/lib/data/course-tees', () => ({ getTeeNamesForCourses: (...a: unknown[]) => teesDeLaCancha(...(a as [])) }))

const SIN_CANDADOS: CandadosDeConfiguracion = { hoyos: null, formato: null, tee: null }
/** El torneo arrancó: `candadosDeConfiguracion` cierra las tres columnas con el motivo 'scores'. */
const CANDADOS_POR_SCORES: CandadosDeConfiguracion = { hoyos: 'scores', formato: 'scores', tee: 'scores' }

/** Ningún jugador resuelve su tee y ninguna de las 3 categorías tiene uno. */
const SIN_CATEGORIA_CON_TEE: TeeDeCadaJugador = { jugadoresSinTee: 0, jugadoresTotal: 0, categoriasConTee: 0, categoriasTotal: 3 }

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
  // El torneo todavía no tiene scores ni tarjeta compartida: el tee se puede cambiar. Es el caso de
  // los 3 torneos de usuarios que están así en prod (2 borradores y 1 abierto, 0 scores).
  candados: SIN_CANDADOS,
  tee_de_cada_jugador: SIN_CATEGORIA_CON_TEE,
}

const CANCHAS = [{ id: 'c1', nombre: 'Los Quillayes', ciudad: 'Santiago' }]

/**
 * Monta la pantalla y deja la base COHERENTE con lo que se montó: la fila que el guardado relee
 * tiene los mismos valores que el organizador está viendo, y las señales responden lo que haría un
 * torneo con esos candados. Un test que monta con el candado cerrado y deja la base diciendo "0
 * scores" no probaría nada: el guardado relee y abriría el candado, con razón.
 */
function montar(cambios: Partial<typeof TORNEO> = {}) {
  const torneo = { ...TORNEO, ...cambios }
  filaEnLaBase = { format: torneo.format, hole_count: torneo.hole_count, tees: torneo.tees, status: torneo.status }
  const porScores = torneo.candados.tee === 'scores' || torneo.candados.hoyos === 'scores'
  senalesEnLaBase = { scores: porScores ? 72 : 0, compartidas: 0 }
  return render(<EditTorneoForm tournament={torneo} courses={CANCHAS} />)
}

/** El selector de colores está en pantalla (su botón, no el link que lo abre). */
const botonDeTee = (nombre: RegExp) => screen.queryByRole('button', { name: nombre })

beforeEach(() => {
  updates.length = 0
  toasts.length = 0
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
    // Guardó todo: ni avisos de columnas intactas ni mentiras al revés.
    expect(toasts.map((t) => t.tipo)).toEqual(['success'])
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

  it('con el tee de todos resuelto no se ofrece la salida: ahí el motor SÍ tiene de dónde sacarlo', async () => {
    montar({ tee_de_cada_jugador: { jugadoresSinTee: 0, jugadoresTotal: 4, categoriasConTee: 3, categoriasTotal: 3 } })
    expect(await screen.findByText(/categoría de cada jugador/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Elegir un tee para todo el torneo/ })).toBeNull()
  })

  // El hallazgo de la 7ª vuelta: `players.category_id` es nullable, así que un inscrito sin categoría
  // se queda sin tee aunque TODAS las categorías tengan uno. Contando categorías la pantalla le
  // prometía justo la categoría que no tiene.
  it('un jugador sin tee resoluble se avisa aunque todas las categorías tengan tee, y se le ofrece la salida', async () => {
    montar({ tee_de_cada_jugador: { jugadoresSinTee: 1, jugadoresTotal: 3, categoriasConTee: 2, categoriasTotal: 2 } })
    expect(await screen.findByText(/1 jugador inscrito no tiene tee/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Elegir un tee para todo el torneo/ })).toBeTruthy()
  })

  // El motor resuelve por la categoría DE CADA jugador, así que 1 de 3 con tee no alcanza: quien se
  // inscriba en las otras dos cae al rating de la cancha. La salida se ofrece igual porque el tee del
  // torneo es el último eslabón de la cadena: rescata a esos sin pisarle el tee a la que ya lo tiene.
  it('con algunas categorías sin tee lo dice con los números y ofrece la salida igual', async () => {
    const user = userEvent.setup()
    montar({ tee_de_cada_jugador: { jugadoresSinTee: 0, jugadoresTotal: 2, categoriasConTee: 1, categoriasTotal: 3 } })
    expect(await screen.findByText(/2 de las 3 categorías no tienen tee/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Elegir un tee para todo el torneo/ }))
    // Y la copy NO dice "todos juegan desde este tee": la categoría con tee mantiene el suyo.
    expect(await screen.findByText(/las que ya tienen tee mantienen el suyo/)).toBeTruthy()
    expect(screen.queryByText(/Todos juegan desde este tee/)).toBeNull()
  })

  it('si no se pudo leer, no afirma nada ni ofrece una salida a ciegas', async () => {
    montar({ tee_de_cada_jugador: { jugadoresSinTee: null, jugadoresTotal: 0, categoriasConTee: null, categoriasTotal: 0 } })
    expect(await screen.findByText(/no pudimos leer/)).toBeTruthy()
    expect(screen.queryByText(/no tiene categorías con tee/)).toBeNull()
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

// El P1 de la 6ª vuelta: el tee no se guarda en la tarjeta, entra al CALCULAR el neto
// (`leaderboard.ts` resuelve el course handicap leyendo `tournaments.tees`), así que cambiarlo con
// scores puestos mueve los netos de los hoyos ya jugados en el leaderboard en vivo. Y desde la
// primera tarjeta compartida, `rondas_libres.tees` ya tiene su propia copia (issue #698): el board y
// la tarjeta calcularían dos hándicaps distintos.
describe('EditTorneoForm — el tee con el torneo ya en juego', () => {
  it('no ofrece la salida y dice por qué', async () => {
    montar({ candados: CANDADOS_POR_SCORES })
    expect(await screen.findByText(/el tee no se puede cambiar/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Elegir un tee para todo el torneo/ })).toBeNull()
  })

  it('con un color guardado el selector queda deshabilitado y el guardado no mueve el tee', async () => {
    const user = userEvent.setup()
    montar({ tees: 'blanco', candados: CANDADOS_POR_SCORES })
    await waitFor(() => expect(botonDeTee(/^Blanco$/)).toBeTruthy())
    expect(botonDeTee(/^Dorado$/)!.hasAttribute('disabled')).toBe(true)
    expect(await screen.findByText(/el tee no se puede cambiar/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0].tees).toBe('blanco')
  })

  it('con scores, el guardado tampoco mueve los hoyos ni el formato', async () => {
    const user = userEvent.setup()
    montar({ tees: 'blanco', candados: CANDADOS_POR_SCORES })
    const nueve = await screen.findByRole('button', { name: /9 hoyos/ })
    expect(nueve.hasAttribute('disabled')).toBe(true)
    await user.click(nueve)
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0].hole_count).toBe(18)
    expect(updates[0].format).toBe('stroke_play')
  })

  // El P2 de la 7ª vuelta: `userEvent.click` no despacha sobre un botón `disabled`, así que un test
  // que solo clickea el botón apagado pasa en verde IGUAL con la segunda capa borrada — no discrimina.
  // Acá el estado se mueve con el candado ABIERTO (el click sí entra) y recién después llega el
  // candado, que es exactamente el orden del P1 de la 7ª: el torneo se inicia DESPUÉS de que esta
  // pantalla se cargó. Si el guardado confiara en las props o en el estado del componente, escribiría
  // 'dorado'.
  it('si el torneo se inicia DESPUÉS de cargada la pantalla, el guardado no escribe el tee nuevo', async () => {
    const user = userEvent.setup()
    const { rerender } = montar({ tees: 'blanco' })
    await waitFor(() => expect(botonDeTee(/^Dorado$/)).toBeTruthy())
    expect(botonDeTee(/^Dorado$/)!.hasAttribute('disabled')).toBe(false)
    await user.click(botonDeTee(/^Dorado$/)!)
    await waitFor(() => expect(botonDeTee(/^Dorado$/)!.getAttribute('style')).toMatch(/2px solid/))

    // Alguien inicia el torneo en el medio: llegan los scores y, con ellos, el candado.
    senalesEnLaBase = { scores: 18, compartidas: 0 }
    rerender(
      <EditTorneoForm
        tournament={{ ...TORNEO, tees: 'blanco', candados: CANDADOS_POR_SCORES }}
        courses={CANCHAS}
      />,
    )
    expect(botonDeTee(/^Dorado$/)!.hasAttribute('disabled')).toBe(true)

    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0].tees).toBe('blanco')
    // Y se lo dice, en vez de fingir que guardó todo.
    const aviso = toasts.find((t) => t.tipo === 'warning')
    expect(aviso?.titulo).toBe('Guardamos el resto')
    expect(aviso?.mensaje).toMatch(/el tee quedó como estaba/)
  })

  // La misma carrera, pero con la relectura caída: los conteos vuelven null y
  // `candadosDeConfiguracion` cierra igual (falla CERRADO). El resto de la configuración se guarda:
  // negarle el cambio de nombre por un hiccup de red sería castigarlo por algo que no hizo.
  it('si la relectura falla, el tee no se mueve y el resto se guarda igual', async () => {
    const user = userEvent.setup()
    montar({ tees: 'blanco' })
    await waitFor(() => expect(botonDeTee(/^Dorado$/)).toBeTruthy())
    await user.click(botonDeTee(/^Dorado$/)!)

    senalesEnLaBase = { scores: null, compartidas: null }
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0].tees).toBe('blanco')
    expect(updates[0].name).toBe('Copa de Primavera')
    expect(toasts.find((t) => t.tipo === 'warning')?.titulo).toBe('Guardamos el resto')
  })
})
