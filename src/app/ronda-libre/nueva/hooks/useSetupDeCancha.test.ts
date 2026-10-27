import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useState } from 'react'
import type { SetupDeCancha } from '@/lib/data/ronda-libre-nueva'

const fetchSetupDeCancha = vi.fn()
vi.mock('@/lib/data/ronda-libre-nueva', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/data/ronda-libre-nueva')>()),
  fetchSetupDeCancha: (...args: unknown[]) => fetchSetupDeCancha(...args),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { useSetupDeCancha } from './useSetupDeCancha'
import { useTeesCoherentes } from './useTeesCoherentes'
import type { RivalDelCreador } from './useFormularioDeRonda'

function setupCon(tees: string[], loops: string[] = []): SetupDeCancha {
  return {
    details: null,
    tees: tees.map(nombre => ({ nombre, yardaje_total: null, rating: null, slope: null })),
    loops: loops.map(recorrido => ({ recorrido })) as SetupDeCancha['loops'],
  }
}

function rival(tees: string | null): RivalDelCreador {
  return { id: 'r1', tipo: 'invitado', nombre: 'Nico', telefono: '', handicap: null, tees, profileId: null }
}

/** Página mínima: cancha + tees del formulario, con los dos hooks como en `page.tsx`. */
function usePagina(inicial: { courseId: string | null; tee: string; rivalTee: string | null }) {
  const [courseId, setCourseId] = useState(inicial.courseId)
  const [tee, setTee] = useState(inicial.tee)
  const [rivales, setRivales] = useState([rival(inicial.rivalTee)])
  const setup = useSetupDeCancha({ courseId })
  const onTeeGlobal = vi.fn(setTee)
  useTeesCoherentes({
    tees: setup.tees,
    recorridos: setup.recorridosElegidos,
    teeGlobal: tee,
    onTeeGlobal,
    rivales,
    onTeeDeRival: (idx, t) => setRivales(rs => rs.map((r, i) => (i === idx ? { ...r, tees: t } : r))),
  })
  /** Lo que hace "repetir ronda": cancha y tees en el mismo batch. */
  const repetir = (otra: string, t: string, rivalTee: string | null) => {
    setCourseId(otra)
    setTee(t)
    setRivales([rival(rivalTee)])
  }
  return { setup, tee, rivales, repetir }
}

beforeEach(() => fetchSetupDeCancha.mockReset())

describe('useSetupDeCancha', () => {
  it('desde el render en que cambia la cancha no entrega los tees ni recorridos de la anterior', async () => {
    fetchSetupDeCancha.mockResolvedValueOnce(setupCon(['negras', 'blanco'], ['Norte', 'Sur']))
    const { result, rerender } = renderHook(({ id }) => useSetupDeCancha({ courseId: id }), {
      initialProps: { id: 'A' as string | null },
    })
    await waitFor(() => expect(result.current.tees).toHaveLength(2))
    expect(result.current.recorridosElegidos).toEqual(['Norte', 'Sur'])

    let resolverB: (s: SetupDeCancha) => void = () => {}
    fetchSetupDeCancha.mockReturnValueOnce(new Promise<SetupDeCancha>(r => { resolverB = r }))
    rerender({ id: 'B' })
    expect(result.current.tees).toEqual([])
    expect(result.current.recorridosElegidos).toEqual([])
    expect(result.current.cargando).toBe(true)

    await act(async () => resolverB(setupCon(['azul'])))
    expect(result.current.tees.map(t => t.nombre)).toEqual(['azul'])
    expect(result.current.cargando).toBe(false)
  })

  it('una respuesta tardía de la cancha anterior no se cuela', async () => {
    let resolverA: (s: SetupDeCancha) => void = () => {}
    fetchSetupDeCancha.mockReturnValueOnce(new Promise<SetupDeCancha>(r => { resolverA = r }))
    fetchSetupDeCancha.mockResolvedValueOnce(setupCon(['azul']))
    const { result, rerender } = renderHook(({ id }) => useSetupDeCancha({ courseId: id }), {
      initialProps: { id: 'A' as string | null },
    })
    rerender({ id: 'B' })
    await waitFor(() => expect(result.current.tees.map(t => t.nombre)).toEqual(['azul']))
    await act(async () => resolverA(setupCon(['negras'])))
    expect(result.current.tees.map(t => t.nombre)).toEqual(['azul'])
  })

  it('sin cancha no hay nada cargando', () => {
    const { result } = renderHook(() => useSetupDeCancha({ courseId: null }))
    expect(result.current.cargando).toBe(false)
    expect(result.current.tees).toEqual([])
  })
})

describe('repetir una ronda en otra cancha (useSetupDeCancha + useTeesCoherentes)', () => {
  it('el tee de la ronda repetida no se corrige contra la cancha anterior', async () => {
    // Cancha A no tiene azul; la ronda repetida en B salió de azules.
    fetchSetupDeCancha.mockResolvedValueOnce(setupCon(['negras', 'blanco', 'rojo']))
    const { result } = renderHook(() => usePagina({ courseId: 'A', tee: 'blanco', rivalTee: null }))
    await waitFor(() => expect(result.current.setup.tees).toHaveLength(3))

    let resolverB: (s: SetupDeCancha) => void = () => {}
    fetchSetupDeCancha.mockReturnValueOnce(new Promise<SetupDeCancha>(r => { resolverB = r }))
    act(() => result.current.repetir('B', 'azul', 'dorado'))
    expect(result.current.tee).toBe('azul')
    expect(result.current.rivales[0].tees).toBe('dorado')

    await act(async () => resolverB(setupCon(['azul', 'blanco', 'dorado'])))
    expect(result.current.tee).toBe('azul')
    expect(result.current.rivales[0].tees).toBe('dorado')
  })

  it('un tee que no existe en la cancha nueva se corrige una vez y se estabiliza', async () => {
    fetchSetupDeCancha.mockResolvedValueOnce(setupCon(['blanco_roja_azul', 'azul_roja_azul'], ['Roja', 'Azul']))
    const { result } = renderHook(() => usePagina({ courseId: 'A', tee: 'azul', rivalTee: 'blanco' }))
    await waitFor(() => expect(result.current.tee).toBe('azul_roja_azul'))
    expect(result.current.rivales[0].tees).toBe('blanco_roja_azul')
    // Estable: otro render no vuelve a corregir nada.
    const antes = { tee: result.current.tee, rival: result.current.rivales[0].tees }
    await act(async () => {})
    expect({ tee: result.current.tee, rival: result.current.rivales[0].tees }).toEqual(antes)
  })
})
