import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { saveScores, loadScores, clearScores, SCORE_STORAGE_KEY, saveScorerGrupoSnapshot, loadScorerGrupoSnapshot, clearScorerGrupoSnapshot, clearAllScorerGrupoSnapshots, marcarPendientes, confirmarPendientes, leerPendientes, hayPendientes, ID_PENDIENTE_EQUIPO, saveGroupScores, saveGroupTeamScores, limpiarCopiaLocalDeRonda, clearScoresDeRonda, cerrarCopiaLocalAlFinalizar, apartarRechazados, leerRechazados, confirmarRechazados, olvidarRechazado, barrerRechazadosViejos } from './score-storage'
import { DIAS_RETENCION_RECHAZADO_EN_FIRME } from './respaldo-local'
import { contarHoyosPendientes, leerRespaldoPendiente } from './respaldo-local'

beforeEach(() => localStorage.clear())

describe('score-storage', () => {
  it('clearScoresDeRonda borra las tarjetas de todos los jugadores de esa ronda y de ninguna otra', () => {
    saveScores('ABC', 'j1', { 1: 4 })
    saveScores('ABC', 'j2', { 1: 5 })
    saveScores('ABCD', 'j1', { 1: 6 })
    saveGroupScores('ABC', { j1: { 1: 4 } })
    clearScoresDeRonda('ABC')
    expect(loadScores('ABC', 'j1')).toEqual({})
    expect(loadScores('ABC', 'j2')).toEqual({})
    expect(loadScores('ABCD', 'j1')).toEqual({ 1: 6 })
    expect(localStorage.getItem('ronda_grupo_ABC')).not.toBeNull()
  })

  it('roundtrip: save → load', () => {
    saveScores('ABC', 'j1', { 1: 4, 2: 5 })
    expect(loadScores('ABC', 'j1')).toEqual({ 1: 4, 2: 5 })
  })

  it('returns {} when nothing saved', () => {
    expect(loadScores('ABC', 'j1')).toEqual({})
  })

  it('clear removes saved scores', () => {
    saveScores('ABC', 'j1', { 1: 4 })
    clearScores('ABC', 'j1')
    expect(loadScores('ABC', 'j1')).toEqual({})
  })

  it('different jugadorId → isolated', () => {
    saveScores('ABC', 'j1', { 1: 4 })
    saveScores('ABC', 'j2', { 1: 5 })
    expect(loadScores('ABC', 'j1')).toEqual({ 1: 4 })
    expect(loadScores('ABC', 'j2')).toEqual({ 1: 5 })
  })

  it('different codigo → isolated', () => {
    saveScores('ABC', 'j1', { 1: 4 })
    saveScores('XYZ', 'j1', { 1: 5 })
    expect(loadScores('ABC', 'j1')).toEqual({ 1: 4 })
    expect(loadScores('XYZ', 'j1')).toEqual({ 1: 5 })
  })

  it('malformed JSON in localStorage returns {}', () => {
    localStorage.setItem(SCORE_STORAGE_KEY('ABC', 'j1'), 'not-json')
    expect(loadScores('ABC', 'j1')).toEqual({})
  })
})

describe('snapshot del scorer de grupo (abrir sin servidor, caída 04-oct)', () => {
  const snap = {
    at: Date.now(), authUserId: 'u1', anotadorNombre: 'Juanjo', ronda: { id: 'r1' },
    parMap: { 1: 4 }, holeDataMap: {}, playerHcp: { j1: 10 }, playerDisplayHcp: { j1: 10 }, teamEquipos: [],
  }
  beforeEach(() => localStorage.clear())

  it('guarda y lee la copia del mismo usuario', () => {
    saveScorerGrupoSnapshot('ABC', snap)
    expect(loadScorerGrupoSnapshot('ABC', 'u1')?.ronda).toEqual({ id: 'r1' })
  })
  it('sin usuario conocido (sesión no legible) igual devuelve la copia del teléfono', () => {
    saveScorerGrupoSnapshot('ABC', snap)
    expect(loadScorerGrupoSnapshot('ABC', null)?.authUserId).toBe('u1')
  })
  it('nunca entrega la copia de OTRO usuario', () => {
    saveScorerGrupoSnapshot('ABC', snap)
    expect(loadScorerGrupoSnapshot('ABC', 'u2')).toBeNull()
  })
  it('null si está corrupta o es de otra versión', () => {
    localStorage.setItem('scorer_grupo_snapshot_ABC', '{no json')
    expect(loadScorerGrupoSnapshot('ABC', 'u1')).toBeNull()
    localStorage.setItem('scorer_grupo_snapshot_ABC', JSON.stringify({ ...snap, v: 99 }))
    expect(loadScorerGrupoSnapshot('ABC', 'u1')).toBeNull()
  })
  it('clear borra la copia', () => {
    saveScorerGrupoSnapshot('ABC', snap)
    clearScorerGrupoSnapshot('ABC')
    expect(loadScorerGrupoSnapshot('ABC', 'u1')).toBeNull()
  })
})

describe('pendientes de confirmar (revisión Fable, caída 04-oct)', () => {
  beforeEach(() => localStorage.clear())
  it('marca y confirma sólo el valor exacto enviado', () => {
    marcarPendientes('ABC', 'j1', { 5: 6 })
    confirmarPendientes('ABC', 'j1', { 5: 4 }) // viajaba un valor viejo: NO limpia
    expect(leerPendientes('ABC')).toEqual({ j1: { 5: 6 } })
    confirmarPendientes('ABC', 'j1', { 5: 6 })
    expect(hayPendientes('ABC')).toBe(false)
  })
  it('equipos con su propia clave', () => {
    marcarPendientes('ABC', ID_PENDIENTE_EQUIPO('e1'), { 3: 4 })
    expect(leerPendientes('ABC')).toEqual({ 'eq:e1': { 3: 4 } })
  })
  it('la copia del scorer vence a las 24 h', () => {
    saveScorerGrupoSnapshot('ABC', { at: Date.now() - 25 * 3_600_000, authUserId: 'u1', anotadorNombre: '', ronda: { id: 'r' }, parMap: {}, holeDataMap: {}, playerHcp: {}, playerDisplayHcp: {}, teamEquipos: [] })
    expect(loadScorerGrupoSnapshot('ABC', 'u1')).toBeNull()
  })
  it('al cerrar sesión se borran todas las copias del scorer', () => {
    saveScorerGrupoSnapshot('A1', { at: Date.now(), authUserId: 'u1', anotadorNombre: '', ronda: { id: 'r' }, parMap: {}, holeDataMap: {}, playerHcp: {}, playerDisplayHcp: {}, teamEquipos: [] })
    localStorage.setItem('otra_cosa', '1')
    clearAllScorerGrupoSnapshots()
    expect(loadScorerGrupoSnapshot('A1', 'u1')).toBeNull()
    expect(localStorage.getItem('otra_cosa')).toBe('1')
  })
})

describe('limpiarCopiaLocalDeRonda', () => {
  it('borra snapshot, golpes por jugador, golpes de equipo y pendientes de ESA ronda (no de otra)', () => {
    saveScorerGrupoSnapshot('ABC', { at: Date.now(), authUserId: 'u1', anotadorNombre: 'A', ronda: { id: 'r' }, parMap: {}, holeDataMap: {}, playerHcp: {}, playerDisplayHcp: {}, teamEquipos: [] })
    saveGroupScores('ABC', { p1: { 1: 4 } })
    saveGroupTeamScores('ABC', { e1: { '1': 3 } })
    marcarPendientes('ABC', 'p1', { 2: 5 })
    saveGroupScores('XYZ', { p9: { 1: 4 } })
    limpiarCopiaLocalDeRonda('ABC')
    const claves = Object.keys(localStorage)
    expect(claves.filter(k => k.includes('ABC'))).toEqual([])
    expect(claves).toContain('ronda_grupo_XYZ')
  })

  it('una sola limpieza para los dos scorers: también tarjetas individuales, respaldos y puntitos (PR #763)', () => {
    saveScores('ABC', 'p1', { 1: 4 })
    localStorage.setItem('golfers_score_ABC_p1', JSON.stringify({ scores: { 1: 4 }, sincronizado: false, codigoRonda: 'ABC', jugadorId: 'p1' }))
    localStorage.setItem('ronda_puntitos_pendientes_ABC', '{}')
    saveScores('ABCD', 'p1', { 1: 6 })
    localStorage.setItem('golfers_score_ABCD_p1', '{}')
    limpiarCopiaLocalDeRonda('ABC')
    const claves = Object.keys(localStorage)
    expect(claves.filter(k => /ABC(_|$)/.test(k))).toEqual([])
    expect(loadScores('ABCD', 'p1')).toEqual({ 1: 6 })
    expect(claves).toContain('golfers_score_ABCD_p1')
  })
})

// PR #763 vuelta 4: finalizar no es borrar. La ronda se puede reabrir (reabrir un torneo devuelve sus
// rondas a 'en_curso') y los golpes del individual que no subieron son lo único que hay de esos hoyos.
describe('cerrarCopiaLocalAlFinalizar', () => {
  it('borra la copia del scorer de grupo, pero los respaldos sin subir del individual se marcan, no se borran', () => {
    saveGroupScores('ABC', { p1: { 1: 4 } })
    marcarPendientes('ABC', 'p1', { 1: 4 })
    localStorage.setItem('golfers_score_ABC_p1', JSON.stringify({ scores: { 18: 5 }, timestamp: Date.now(), sincronizado: false, codigoRonda: 'ABC', jugadorId: 'p1' }))
    expect(contarHoyosPendientes()).toBe(1)
    cerrarCopiaLocalAlFinalizar('ABC')
    expect(localStorage.getItem('ronda_grupo_ABC')).toBeNull()
    expect(hayPendientes('ABC')).toBe(false)
    expect(leerRespaldoPendiente('ABC', 'p1')).toEqual({ 18: 5 })
    expect(contarHoyosPendientes()).toBe(0)
  })

  it('las marcas de puntitos sin subir se conservan (si la ronda se reabre, suben); sin marcas, la clave se va', () => {
    localStorage.setItem('ronda_puntitos_pendientes_ABC', JSON.stringify({ p1: { 3: 1 } }))
    cerrarCopiaLocalAlFinalizar('ABC')
    expect(JSON.parse(localStorage.getItem('ronda_puntitos_pendientes_ABC') ?? '{}')).toEqual({ p1: { 3: 1 } })
    localStorage.setItem('ronda_puntitos_pendientes_ABC', '{}')
    cerrarCopiaLocalAlFinalizar('ABC')
    expect(localStorage.getItem('ronda_puntitos_pendientes_ABC')).toBeNull()
  })
})

describe('loadScorerGrupoSnapshot — snapshot corrupto', () => {
  it('sin teamEquipos (array) no abre: devuelve null en vez de tumbar el scorer offline', () => {
    localStorage.setItem('scorer_grupo_snapshot_ABC', JSON.stringify({ v: 1, at: Date.now(), authUserId: 'u1', ronda: { id: 'r' }, parMap: {}, holeDataMap: {}, playerHcp: {}, playerDisplayHcp: {} }))
    expect(loadScorerGrupoSnapshot('ABC', 'u1')).toBeNull()
  })
})

// PR #763, vuelta 6: una tarjeta rechazada en firme sale de pendientes (sin bucle ni aviso pegado) pero sus
// golpes quedan apartados en el teléfono hasta que suban o se corrijan; se van con la copia del grupo.
describe('tarjetas rechazadas en firme', () => {
  beforeEach(() => localStorage.clear())

  it('apartar saca los golpes de pendientes y los guarda aparte', () => {
    marcarPendientes('R1', 'p2', { 10: 5, 11: 4 })
    apartarRechazados('R1', 'p2', { 10: 5, 11: 4 })
    expect(hayPendientes('R1')).toBe(false)
    expect(leerRechazados('R1')).toEqual({ p2: { 10: 5, 11: 4 } })
  })

  it('corregir un hoyo olvida sólo ese valor rechazado; sin hoyos, la tarjeta deja de estar apartada', () => {
    apartarRechazados('R1', 'p2', { 10: 5, 11: 4 })
    olvidarRechazado('R1', 'p2', 10)
    expect(leerRechazados('R1')).toEqual({ p2: { 11: 4 } })
    olvidarRechazado('R1', 'p2', 11)
    expect(leerRechazados('R1')).toEqual({})
    olvidarRechazado('R1', 'p9', 3) // sin nada apartado: no hace nada
    expect(leerRechazados('R1')).toEqual({})
  })

  it('confirmar quita todos los hoyos que el servidor aceptó, con el valor que sea', () => {
    apartarRechazados('R1', 'p2', { 10: 5, 11: 4, 12: 3 })
    confirmarRechazados('R1', 'p2', { 10: 5, 11: 6 })
    expect(leerRechazados('R1')).toEqual({ p2: { 12: 3 } })
  })

  it('apartar sólo aparta el valor exacto enviado: un hoyo corregido mientras viajaba no se toca', () => {
    marcarPendientes('R1', 'p2', { 10: 5, 11: 4 })
    marcarPendientes('R1', 'p2', { 11: 6 }) // corrección del marcador con el envío en vuelo
    apartarRechazados('R1', 'p2', { 10: 5, 11: 4 })
    expect(leerPendientes('R1')).toEqual({ p2: { 11: 6 } })
    expect(leerRechazados('R1')).toEqual({ p2: { 10: 5 } })
  })

  it('se borran con la copia del grupo al limpiar la ronda, y de ninguna otra', () => {
    apartarRechazados('R1', 'p2', { 10: 5 })
    apartarRechazados('R2', 'p2', { 10: 5 })
    limpiarCopiaLocalDeRonda('R1')
    expect(leerRechazados('R1')).toEqual({})
    expect(leerRechazados('R2')).toEqual({ p2: { 10: 5 } })
  })

  it('cerrar la ronda al finalizar también los borra: nadie los vuelve a leer (P3-3 del #763)', () => {
    apartarRechazados('R1', 'p2', { 10: 5 })
    cerrarCopiaLocalAlFinalizar('R1')
    expect(leerRechazados('R1')).toEqual({})
    expect(Object.keys(localStorage).filter(k => k.includes('R1'))).toEqual([])
  })

  describe('barrido de los apartados que quedaron (nunca se finalizó)', () => {
    const DIA = 24 * 60 * 60 * 1000
    const T0 = Date.UTC(2026, 10, 1)
    afterEach(() => vi.useRealTimers())

    it('a los 30 días del último rechazo se borran; antes, no; los de otra ronda más nueva se quedan', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(T0)
      apartarRechazados('R1', 'p2', { 10: 5 })
      vi.setSystemTime(T0 + 10 * DIA)
      apartarRechazados('R2', 'p3', { 4: 7 })
      barrerRechazadosViejos(T0 + DIAS_RETENCION_RECHAZADO_EN_FIRME * DIA)
      expect(leerRechazados('R1')).toEqual({ p2: { 10: 5 } })
      barrerRechazadosViejos(T0 + DIAS_RETENCION_RECHAZADO_EN_FIRME * DIA + 1)
      expect(leerRechazados('R1')).toEqual({})
      expect(leerRechazados('R2')).toEqual({ p3: { 4: 7 } })
      expect(Object.keys(localStorage).filter(k => k.includes('R1'))).toEqual([])
    })

    it('un rechazo nuevo de la misma ronda reinicia el plazo', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(T0)
      apartarRechazados('R1', 'p2', { 10: 5 })
      vi.setSystemTime(T0 + 20 * DIA)
      apartarRechazados('R1', 'p2', { 11: 4 })
      barrerRechazadosViejos(T0 + 31 * DIA)
      expect(leerRechazados('R1')).toEqual({ p2: { 10: 5, 11: 4 } })
    })

    it('los apartados de antes de este cambio (sin fecha) empiezan a contar desde el primer barrido', () => {
      localStorage.setItem('ronda_grupo_rechazados_R1', JSON.stringify({ p2: { 10: 5 } }))
      barrerRechazadosViejos(T0)
      expect(leerRechazados('R1')).toEqual({ p2: { 10: 5 } })
      barrerRechazadosViejos(T0 + DIAS_RETENCION_RECHAZADO_EN_FIRME * DIA + 1)
      expect(leerRechazados('R1')).toEqual({})
      expect(Object.keys(localStorage)).toEqual([])
    })

    it('una marca con fecha futura (reloj adelantado al apartar) reinicia el plazo desde el barrido', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(T0 + 365 * DIA)
      apartarRechazados('R1', 'p2', { 10: 5 })
      barrerRechazadosViejos(T0)
      expect(leerRechazados('R1')).toEqual({ p2: { 10: 5 } })
      barrerRechazadosViejos(T0 + DIAS_RETENCION_RECHAZADO_EN_FIRME * DIA)
      expect(leerRechazados('R1')).toEqual({ p2: { 10: 5 } })
      barrerRechazadosViejos(T0 + DIAS_RETENCION_RECHAZADO_EN_FIRME * DIA + 1)
      expect(leerRechazados('R1')).toEqual({})
    })

    it('no toca los pendientes ni la copia del grupo', () => {
      marcarPendientes('R1', 'p1', { 1: 4 })
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(T0)
      apartarRechazados('R1', 'p2', { 10: 5 })
      barrerRechazadosViejos(T0 + 365 * DIA)
      expect(leerPendientes('R1')).toEqual({ p1: { 1: 4 } })
    })
  })
})
