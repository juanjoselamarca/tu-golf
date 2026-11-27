/**
 * «Terminar mi equipo» (un celular por equipo, 27-nov): cada celular cierra las tarjetas que anota y la ronda se cierra
 * sola con el último equipo. Reemplaza al cierre exclusivo del creador (antes `useFinalizeGrupo` con
 * `unCelularPorEquipo`): sus casos de drives y de equipo sin reclamar incompleto siguen cubiertos aquí.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef } from 'react'
import { useTerminarEquipo } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useTerminarEquipo'
import type { CierreEnCurso } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useFinalizeGrupo'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import type { ResultadoEnvio } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'
import type { ResultadoTerminarEquipo } from '@/lib/data/ronda-libre-anotador'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const addToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ addToast: (...a: unknown[]) => addToast(...a) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))
const cerrarCopiaLocalAlFinalizar = vi.fn()
vi.mock('@/lib/ronda/score-storage', () => ({
  hayPendientes: () => false, cerrarCopiaLocalAlFinalizar: (...a: unknown[]) => cerrarCopiaLocalAlFinalizar(...a),
}))
const drives = { pendientes: false, orden: [] as string[], cuelga: false }
vi.mock('@/lib/ronda/drives-pendientes', () => ({
  PLAZO_DRIVES_AL_FINALIZAR_MS: 6_000,
  hayDrivesPendientes: () => drives.pendientes,
  reenviarDrivesPendientes: async () => {
    drives.orden.push('drives')
    if (drives.cuelga) await new Promise(() => {})
    drives.pendientes = false
    return { confirmados: [], rechazados: [], pendientes: 0 }
  },
}))
const servidor = { respuestas: {} as Record<string, ResultadoTerminarEquipo>, llamadas: [] as string[] }
vi.mock('@/lib/data/ronda-libre-anotador', () => ({
  terminarEquipoDeRonda: async (_s: unknown, _c: string, equipoId: string) => {
    servidor.llamadas.push(equipoId)
    drives.orden.push(`terminar:${equipoId}`)
    return servidor.respuestas[equipoId] ?? { estado: 'ok', rondaCerrada: false }
  },
}))

const PAR: Record<number, number> = { 1: 4, 2: 3, 3: 4, 4: 4, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5 }
const hoyos = hoyosDeLaRonda(1, 9)
const lleno = Object.fromEntries(hoyos.map(h => [String(h), PAR[h]]))
const hasta8 = Object.fromEntries(hoyos.filter(h => h < 9).map(h => [String(h), PAR[h]]))
const CREADOR = 'u-creador'
const ronda = {
  id: 'r1', codigo: 'ABC', course_name: 'X', holes: 9, estado: 'en_curso', formato_juego: 'scramble', hoyo_inicio: 1,
  admin_mode: false, creador_id: CREADOR, ronda_libre_jugadores: [],
}
const eq = (id: string, nombre: string, anotador: string | null, scores: Record<string, number>, terminado: string | null = null) =>
  ({ id, nombre, handicap_origen: 'club', scores, jugadorIds: [], jugadorNombres: [], anotador_user_id: anotador, anotador_nombre: null, terminado_at: terminado })

const enviarPendientes = vi.fn(async (): Promise<ResultadoEnvio> => ({ estado: 'ronda_abierta', rechazadas: [] }))
const completarEquiposConPar = vi.fn((eqs: unknown[]) => eqs)
const confirmarHoyoEnPantalla = vi.fn(async () => {})
const recargar = vi.fn(async () => {})

function montar(teamEquipos: unknown[], opciones: { userId?: string; hoyoEnPantalla?: number; cierre?: CierreEnCurso } = {}) {
  return renderHook(() => {
    const cierreEnCurso = useRef<CierreEnCurso>(opciones.cierre ?? null)
    return useTerminarEquipo({
      ronda: ronda as never, codigo: 'ABC', hoyos, teamEquipos: teamEquipos as never, authUserId: opciones.userId ?? CREADOR,
      hoyoEnPantalla: opciones.hoyoEnPantalla ?? 9, confirmarHoyoEnPantalla, completarEquiposConPar: completarEquiposConPar as never,
      enviarPendientes: enviarPendientes as never, cierreEnCurso, recargar,
    })
  })
}

async function terminar(result: { current: ReturnType<typeof useTerminarEquipo> }) {
  await act(async () => { await result.current.terminar() }) // abre la hoja
  expect(result.current.confirmarTerminar).toBe(true)
  await act(async () => { await result.current.terminar() }) // confirma
}

beforeEach(() => {
  vi.clearAllMocks()
  servidor.respuestas = {}; servidor.llamadas = []
  drives.pendientes = false; drives.orden = []; drives.cuelga = false
  enviarPendientes.mockImplementation(async () => ({ estado: 'ronda_abierta', rechazadas: [] }))
  confirmarHoyoEnPantalla.mockImplementation(async () => {})
})

describe('useTerminarEquipo', () => {
  it('el primer toque solo abre la hoja: no confirma el hoyo ni toca el servidor', async () => {
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', hasta8)], { userId: 'u-pedro' })
    await act(async () => { await result.current.terminar() })
    expect(result.current.confirmarTerminar).toBe(true)
    expect(confirmarHoyoEnPantalla).not.toHaveBeenCalled()
    expect(servidor.llamadas).toEqual([])
  })

  it('confirmar: rellena con par, confirma el hoyo en pantalla, envía, termina y pasa a la ronda en vivo', async () => {
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', hasta8)], { userId: 'u-pedro' })
    await terminar(result)
    expect(completarEquiposConPar).toHaveBeenCalledTimes(1)
    expect(confirmarHoyoEnPantalla).toHaveBeenCalledTimes(1)
    expect(enviarPendientes).toHaveBeenCalledWith(undefined, { reintentarRechazados: true })
    expect(servidor.llamadas).toEqual(['e1'])
    expect(cerrarCopiaLocalAlFinalizar).toHaveBeenCalledWith('ABC')
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC')
    expect(result.current.terminando).toBe(true) // sigue en «Terminando…» mientras navega
  })

  it('el último equipo cierra la ronda: va al resultado final', async () => {
    servidor.respuestas = { e1: { estado: 'ok', rondaCerrada: true } }
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro' })
    await terminar(result)
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC?finished=true')
  })

  it('el creador termina todos los que anota (el suyo y uno sin reclamar completo), y solo los no terminados', async () => {
    const { result } = montar([
      eq('e1', 'Los Tigres', CREADOR, hasta8), eq('e2', 'Los Pumas', null, lleno), eq('e3', 'Los Linces', null, lleno, '2026-11-28T12:00:00Z'),
    ])
    await terminar(result)
    expect(servidor.llamadas).toEqual(['e1', 'e2'])
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC')
  })

  it('drives en cola: suben ANTES de terminar', async () => {
    drives.pendientes = true
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro' })
    await terminar(result)
    expect(drives.orden).toEqual(['drives', 'terminar:e1'])
  })

  it('drives que no suben (sin señal) no frenan: se termina al vencer el plazo', async () => {
    vi.useFakeTimers()
    try {
      drives.pendientes = true; drives.cuelga = true
      const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro' })
      await act(async () => { await result.current.terminar() })
      let fin: Promise<void> = Promise.resolve()
      await act(async () => { fin = result.current.terminar() })
      await act(async () => { await vi.advanceTimersByTimeAsync(6_500) })
      await act(async () => { await fin })
      expect(servidor.llamadas).toEqual(['e1'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('P1-a: un equipo SIN RECLAMAR con un hoyo vacío (fuera del de pantalla) frena antes de la hoja, con su nombre y el hoyo', async () => {
    const sinEl5 = { ...lleno }; delete sinEl5['5']
    const { result } = montar([eq('e1', 'Los Tigres', CREADOR, lleno), eq('e2', 'Los Pumas', null, sinEl5)])
    await act(async () => { await result.current.terminar() })
    expect(result.current.confirmarTerminar).toBe(false)
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Los Pumas no tiene golpes en el hoyo 5. Anótalo y vuelve a tocar Terminar mi equipo.' }))
    expect(servidor.llamadas).toEqual([])
  })

  it('inverso: el hoyo vacío es el de pantalla: no frena (se confirma al terminar)', async () => {
    const { result } = montar([eq('e1', 'Los Tigres', CREADOR, lleno), eq('e2', 'Los Pumas', null, hasta8)], { hoyoEnPantalla: 9 })
    await act(async () => { await result.current.terminar() })
    expect(result.current.confirmarTerminar).toBe(true)
  })

  it('el servidor responde incompleto: avisa con el hoyo, relee y no navega', async () => {
    servidor.respuestas = { e1: { estado: 'incompleto' } }
    const sinEl3 = { ...lleno }; delete sinEl3['3']
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', sinEl3)], { userId: 'u-pedro' })
    await terminar(result)
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Los Tigres no tiene golpes en el hoyo 3. Anótalo y vuelve a tocar Terminar mi equipo.' }))
    expect(recargar).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(result.current.terminando).toBe(false)
  })

  it('sin servidor al terminar: avisa, no navega y el botón vuelve a responder', async () => {
    servidor.respuestas = { e1: { estado: 'error', ronda: 'sin_respuesta', mensaje: 'x' } }
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro' })
    await terminar(result)
    expect(addToast).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(cerrarCopiaLocalAlFinalizar).not.toHaveBeenCalled()
    expect(result.current.terminando).toBe(false)
  })

  it('ya no es suyo (lo liberaron): avisa con el mensaje y relee', async () => {
    servidor.respuestas = { e1: { estado: 'error', ronda: 'sin_permiso', mensaje: 'Cambió quién anota este equipo. Revisa la tarjeta.' } }
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro' })
    await terminar(result)
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cambió quién anota este equipo. Revisa la tarjeta.' }))
    expect(recargar).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('sesión cerrada: avisa de la sesión, no relee ni sale del scorer', async () => {
    servidor.respuestas = { e1: { estado: 'error', ronda: 'sin_sesion', mensaje: 'Tu sesión se cerró. Inicia sesión y vuelve a intentar.' } }
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro' })
    await terminar(result)
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: 'Tu sesión se cerró. Inicia sesión y vuelve a intentar.' }))
    expect(recargar).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(cerrarCopiaLocalAlFinalizar).not.toHaveBeenCalled()
  })

  it('el envío rebotó porque el equipo ya estaba terminado: corta (lo apartado no se borra) sin otro aviso', async () => {
    enviarPendientes.mockImplementation(async () => ({ estado: 'ronda_abierta', rechazadas: [], equipoTerminado: true }))
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro' })
    await terminar(result)
    expect(servidor.llamadas).toEqual([])
    expect(cerrarCopiaLocalAlFinalizar).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(addToast).not.toHaveBeenCalled()
  })

  it('una tarjeta rechazada al enviar (golpe inválido): no termina y queda en el teléfono', async () => {
    enviarPendientes.mockImplementation(async () => ({ estado: 'ronda_abierta', rechazadas: [{ id: 'eq:e1' }] as never }))
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro' })
    await terminar(result)
    expect(servidor.llamadas).toEqual([])
    expect(push).not.toHaveBeenCalled()
  })

  it('la ronda ya estaba cerrada al enviar: va al resultado final sin terminar', async () => {
    enviarPendientes.mockImplementation(async () => ({ estado: 'ronda_cerrada', rechazadas: [] }))
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro' })
    await terminar(result)
    expect(servidor.llamadas).toEqual([])
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC?finished=true')
  })

  it('con Finalizar o Descartar en curso no hace nada', async () => {
    const { result } = montar([eq('e1', 'Los Tigres', 'u-pedro', lleno)], { userId: 'u-pedro', cierre: 'descartar' })
    await act(async () => { await result.current.terminar() })
    expect(result.current.confirmarTerminar).toBe(false)
  })
})
