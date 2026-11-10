// Finalizar del scorer de grupo con el envío REAL (useGrupoScoreSave) y el almacenamiento real:
// Finalizar no clasifica los errores del guardado por su cuenta (PR #763, vuelta 5). Antes contaba
// P0001 / P0004 como "sin servidor": con la ronda cerrada mostraba "No se pudo finalizar todavía" y,
// con un jugador que ya no está en la ronda o un golpe inválido, pedía reintentar para siempre.
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { useGrupoScoreSave } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'
import { useFinalizeGrupo } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useFinalizeGrupo'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { leerPendientes } from '@/lib/ronda/score-storage'
import { AVISO_FINALIZAR_SIN_SERVIDOR } from '@/components/ronda/finalizar-copy'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
// Lecturas de `rondas_libres.estado` en orden (la de Finalizar y la que confirma un P0001); después, la última.
const { lecturas, cliente } = vi.hoisted(() => {
  const lecturas: string[] = []
  let ultima = 'en_curso'
  const cliente = {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => {
      ultima = lecturas.shift() ?? ultima
      return { data: { estado: ultima }, error: null }
    } }) }) }),
  }
  return { lecturas, cliente }
})
vi.mock('@/lib/supabase', () => ({ createClient: () => cliente }))
const addToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ addToast: (...a: unknown[]) => addToast(...a) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))

const saveRondaLibreScores = vi.fn(async (_c: unknown, _a: { jugadorId: string }) => ({ error: null as { code: string } | null }))
const finalizarRondaLibre = vi.fn(async () => ({ finalizada: true, error: null as unknown }))
vi.mock('@/lib/data/ronda-libre-scores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/ronda-libre-scores')>()),
  saveRondaLibreScores: (...a: unknown[]) => saveRondaLibreScores(...(a as [unknown, { jugadorId: string }])),
  saveRondaEquiposScores: vi.fn(async () => ({ error: null })),
  finalizarRondaLibre: (...a: unknown[]) => finalizarRondaLibre(...(a as [])),
}))
const guardarTarjetaEnHistorial = vi.fn(async () => ({ status: 'insertada', id: null, tarjeta: {} }))
const recalcularIndiceGolfers = vi.fn(async () => true)
vi.mock('@/lib/data/ronda-libre-finalizar', async () => {
  const estado = await import('@/lib/data/ronda-libre-estado')
  return {
    RONDA_NO_EXISTE: estado.RONDA_NO_EXISTE,
    esRondaCerrada: estado.esRondaCerrada,
    fetchEstadoRondaLibre: estado.fetchEstadoRondaLibre,
    guardarTarjetaEnHistorial: (...a: unknown[]) => guardarTarjetaEnHistorial(...(a as [])),
    recalcularIndiceGolfers: (...a: unknown[]) => recalcularIndiceGolfers(...(a as [])),
    actualizarNivelDelJugador: vi.fn(async () => {}),
    avisarAlCoachRondaNueva: vi.fn(),
  }
})

const PAR: Record<number, number> = { 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
const back9 = hoyosDeLaRonda(10, 9)
const ronda = {
  id: 'r1', codigo: 'ABC', course_name: 'X', course_id: 'c1', tees: 'azul', holes: 9, fecha: '2026-09-30', estado: 'en_curso',
  modo_juego: 'gross', formato_juego: 'stroke_play', hoyo_inicio: 10,
  ronda_libre_jugadores: [
    { id: 'p1', nombre: 'Ana', user_id: 'u1', scores: {} },
    { id: 'p2', nombre: 'Beto', user_id: null, scores: {} },
  ],
} as never

function montar() {
  return renderHook(() => {
    const [scores, setScores] = useState<Record<string, Record<number, number>>>({ p1: { 10: 4 }, p2: { 10: 5 } })
    const save = useGrupoScoreSave({ ronda, codigo: 'ABC', currentHole: 18, scores, setScores, parMap: PAR, teamEquipos: [] })
    const fin = useFinalizeGrupo({
      ronda, codigo: 'ABC', hoyos: back9, scores, setScores, parMap: PAR, teamEquipos: [],
      completarEquiposConPar: (e => e) as never, matchResult: null, authUserId: 'u1', enviarPendientes: save.saveAllScores,
    })
    return { save, fin }
  })
}
async function finalizar(r: ReturnType<typeof montar>['result']) {
  await act(async () => { await r.current.fin.finalizeRound() })
  await act(async () => { await r.current.fin.finalizeRound() })
}
const rechazaA = (jugadorId: string, code: string) => saveRondaLibreScores.mockImplementation(async (_c, a) => ({ error: a.jugadorId === jugadorId ? { code } : null }))
const avisoSinServidor = expect.objectContaining({ title: AVISO_FINALIZAR_SIN_SERVIDOR.title })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  lecturas.length = 0
  lecturas.push('en_curso')
  saveRondaLibreScores.mockImplementation(async () => ({ error: null }))
  finalizarRondaLibre.mockResolvedValue({ finalizada: true, error: null })
})

describe('Finalizar (grupo) usa la clasificación del envío', () => {
  it('todo entra: guarda el historial, cierra y borra la copia del grupo', async () => {
    const { result } = montar()
    await finalizar(result)
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(2)
    expect(guardarTarjetaEnHistorial).toHaveBeenCalledTimes(1)
    expect(finalizarRondaLibre).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('ronda_grupo_ABC')).toBeNull()
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC?finished=true')
  })

  it('P0001 con la ronda CERRADA (el RPC busca la fila antes del estado): no es "sin servidor"; historial sí, cierre no, golpes guardados', async () => {
    rechazaA('p2', 'P0001')
    lecturas.push('finalizada') // la confirmación del P0001
    const { result } = montar()
    await finalizar(result)
    expect(addToast).not.toHaveBeenCalledWith(avisoSinServidor)
    expect(guardarTarjetaEnHistorial).toHaveBeenCalledTimes(1)
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(leerPendientes('ABC').p2).toBeDefined()
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC?finished=true')
  })

  it.each(['P0001', 'P0004'])('rechazo firme de una tarjeta con la ronda viva (%s): avisa ese golpe y finaliza, sin pedir reintentar para siempre', async (code) => {
    rechazaA('p2', code)
    const { result } = montar()
    await finalizar(result)
    expect(addToast).not.toHaveBeenCalledWith(avisoSinServidor)
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Un golpe no se pudo guardar' }))
    expect(finalizarRondaLibre).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC?finished=true')
  })

  it('P0002 al enviar: historial sí, NO se vuelve a cerrar y lo que no subió queda en el teléfono', async () => {
    rechazaA('p1', 'P0002')
    const { result } = montar()
    await finalizar(result)
    expect(addToast).not.toHaveBeenCalledWith(avisoSinServidor)
    expect(guardarTarjetaEnHistorial).toHaveBeenCalledTimes(1)
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(leerPendientes('ABC').p1).toMatchObject({ 10: 4, 18: 5 })
  })

  it('inverso: sin respuesta del servidor no cierra ni guarda historial, y avisa', async () => {
    saveRondaLibreScores.mockImplementation(async () => ({ error: { code: 'SIN_RESPUESTA' } }))
    const { result } = montar()
    await finalizar(result)
    expect(addToast).toHaveBeenCalledWith(avisoSinServidor)
    expect(guardarTarjetaEnHistorial).not.toHaveBeenCalled()
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
