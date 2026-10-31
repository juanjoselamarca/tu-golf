import { describe, it, expect } from 'vitest'
import {
  candadosDeConfiguracion,
  candadoIndeterminado,
  type SenalesDeTorneoEnJuego,
  type ColumnaDeConfiguracion,
} from './tournament-config-locks'

const COLUMNAS: ColumnaDeConfiguracion[] = ['hoyos', 'formato', 'tee']

/** Un borrador recién creado: nadie lo vio, nadie anotó nada. */
const BORRADOR: SenalesDeTorneoEnJuego = { scores: 0, tarjetasCompartidas: 0, status: 'draft' }

describe('candadosDeConfiguracion', () => {
  it('en un borrador sin scores no bloquea nada: el organizador puede arreglar lo que configuró mal', () => {
    expect(candadosDeConfiguracion(BORRADOR)).toEqual({ hoyos: null, formato: null, tee: null })
  })

  // El formato se congela desde que el torneo sale del borrador, no desde el primer score: los
  // grupos y los equipos ya se armaron con ese formato y los inscritos ya vieron a qué entraban.
  it('con el torneo publicado se congela el formato, pero los hoyos y el tee siguen editables', () => {
    const abierto = candadosDeConfiguracion({ ...BORRADOR, status: 'open' })
    expect(abierto.formato).toBe('publicado')
    expect(abierto.hoyos).toBeNull()
    expect(abierto.tee).toBeNull()
  })

  it('un status desconocido cuenta como fuera del borrador: no se afirma que sigue privado', () => {
    expect(candadosDeConfiguracion({ ...BORRADOR, status: 'archivado_2027' }).formato).toBe('publicado')
  })

  // El P1 de la 6ª vuelta: el tee no viaja en la tarjeta, entra al CALCULAR el neto
  // (`leaderboard.ts` resuelve el course handicap leyendo `tournaments.tees`), así que moverlo con
  // scores puestos cambia los netos de los hoyos YA jugados en el leaderboard en vivo.
  it('con un solo score se cierran las tres columnas, y el motivo son los scores', () => {
    const conScores = candadosDeConfiguracion({ scores: 1, tarjetasCompartidas: 0, status: 'in_progress' })
    for (const c of COLUMNAS) expect(conScores[c], c).toBe('scores')
  })

  // `startTournament` le copia `tournaments.tees` a `rondas_libres.tees` al crear la tarjeta
  // (issue #698): desde ese momento el board y la tarjeta calcularían dos hándicaps distintos.
  it('la primera tarjeta compartida cierra el tee aunque todavía no haya ni un score', () => {
    const conTarjeta = candadosDeConfiguracion({ scores: 0, tarjetasCompartidas: 1, status: 'in_progress' })
    expect(conTarjeta.tee).toBe('tarjeta-compartida')
    // Y no contagia a los hoyos: sin scores, 9↔18 no invalida ninguna fila.
    expect(conTarjeta.hoyos).toBeNull()
  })

  it('con scores Y tarjeta, el motivo del tee son los scores: es el daño más concreto', () => {
    expect(candadosDeConfiguracion({ scores: 5, tarjetasCompartidas: 2, status: 'in_progress' }).tee).toBe('scores')
  })

  // El bug que este módulo vino a cerrar: la consulta de scores filtraba por una columna que
  // `hole_scores` no tiene, PostgREST devolvía error, el conteo venía null y el candado era SIEMPRE
  // false. Un conteo que no se pudo hacer tiene que CERRAR, no abrir.
  it('un conteo de scores que no se pudo hacer cierra las tres columnas', () => {
    const sinLeer = candadosDeConfiguracion({ scores: null, tarjetasCompartidas: 0, status: 'draft' })
    for (const c of COLUMNAS) expect(sinLeer[c], c).toBe('indeterminado')
  })

  it('un conteo de tarjetas que no se pudo hacer cierra el tee y no toca el resto', () => {
    const sinLeer = candadosDeConfiguracion({ scores: 0, tarjetasCompartidas: null, status: 'draft' })
    expect(sinLeer.tee).toBe('indeterminado')
    expect(sinLeer.hoyos).toBeNull()
    expect(sinLeer.formato).toBeNull()
  })

  // `tournaments.status` es NOT NULL con default 'draft': un null no sale de la base, sale de que
  // no se pudo leer. Tratarlo como borrador abriría el formato de un torneo quizás publicado.
  it('un status que no se pudo leer cierra el formato sin afirmar que fue publicado', () => {
    const sinStatus = candadosDeConfiguracion({ scores: 0, tarjetasCompartidas: 0, status: null })
    expect(sinStatus.formato).toBe('indeterminado')
    expect(sinStatus.hoyos).toBeNull()
    expect(sinStatus.tee).toBeNull()
  })

  // Los scores pesan más que el status: con scores puestos el motivo es el score, que es lo que de
  // verdad se rompe. Decirle "no se puede cambiar el formato una vez publicado" a un organizador
  // cuyo torneo está andando es verdad pero más vago.
  it('con scores, el motivo del formato son los scores y no la publicación', () => {
    expect(candadosDeConfiguracion({ scores: 3, tarjetasCompartidas: 0, status: 'published' }).formato).toBe('scores')
  })

  it('nunca devuelve un motivo fuera de los cuatro, para cualquier combinación', () => {
    const valores = [null, 0, 1] as const
    const estados = [null, 'draft', 'open', 'in_progress', 'closed', 'published', 'inventado'] as const
    for (const scores of valores) {
      for (const tarjetasCompartidas of valores) {
        for (const status of estados) {
          const candados = candadosDeConfiguracion({ scores, tarjetasCompartidas, status })
          expect(Object.keys(candados).sort()).toEqual([...COLUMNAS].sort())
          for (const c of COLUMNAS) {
            expect(
              candados[c] == null || ['scores', 'publicado', 'tarjeta-compartida', 'indeterminado'].includes(candados[c]!),
              `${c}=${candados[c]}`,
            ).toBe(true)
          }
        }
      }
    }
  })

  // La propiedad que importa de verdad: si una señal no se pudo leer, NINGUNA columna que dependa
  // de ella queda abierta. Es lo que distingue "fallar cerrado" de "fallar abierto".
  it('ninguna señal sin leer deja una columna abierta', () => {
    for (const senales of [
      { scores: null, tarjetasCompartidas: null, status: null },
      { scores: null, tarjetasCompartidas: 0, status: 'draft' },
      { scores: 0, tarjetasCompartidas: null, status: 'draft' },
      { scores: 0, tarjetasCompartidas: 0, status: null },
    ] satisfies SenalesDeTorneoEnJuego[]) {
      const candados = candadosDeConfiguracion(senales)
      if (senales.scores == null) for (const c of COLUMNAS) expect(candados[c], c).not.toBeNull()
      if (senales.tarjetasCompartidas == null) expect(candados.tee).not.toBeNull()
      if (senales.status == null) expect(candados.formato).not.toBeNull()
    }
  })
})

describe('candadoIndeterminado', () => {
  // La pantalla lo usa para no afirmar un motivo que no miró: con esto en true, la copy cae a la
  // frase neutral en vez de decirle "los jugadores comenzaron a scorear" a un torneo con 0 scores.
  it('distingue el candado que se confirmó del que solo se asumió', () => {
    expect(candadoIndeterminado(candadosDeConfiguracion(BORRADOR))).toBe(false)
    expect(candadoIndeterminado(candadosDeConfiguracion({ scores: 9, tarjetasCompartidas: 1, status: 'in_progress' }))).toBe(false)
    expect(candadoIndeterminado(candadosDeConfiguracion({ scores: null, tarjetasCompartidas: 0, status: 'draft' }))).toBe(true)
    expect(candadoIndeterminado(candadosDeConfiguracion({ scores: 0, tarjetasCompartidas: null, status: 'draft' }))).toBe(true)
  })
})
