import { describe, it, expect } from 'vitest'
import {
  AUTH_TABLAS,
  NO_RESTAURABLES,
  SCHEMAS_RESPALDADOS,
  SCHEMAS_RESTAURABLES,
  esTablaRestaurable,
} from './tablas-auth.mjs'

// `esTablaRestaurable` es el guard que corre ANTES de armar cualquier SQL de escritura contra prod
// (`restaurar.mjs --tabla`). Tiene test propio porque ya se escribió mal una vez: un `\.` dentro de
// un template literal perdió la barra, el punto quedó de comodín y `authXusers` pasaba el filtro.
// No se vio porque se probó con el regex rearmado a mano en vez de llamar al predicado de verdad.

describe('esTablaRestaurable (guard de --tabla)', () => {
  it('pasa lo que el dump respalda, en los tres schemas', () => {
    for (const t of ['public.courses', 'respaldos.yardaje_blanco_dorado_20261030', 'auth.users', 'auth.identities']) {
      expect(esTablaRestaurable(t), t).toBe(true)
    }
  })

  it('el punto es un PUNTO, no un comodín: ningún separador falso pasa', () => {
    // Ésta es la regresión: con el patrón interpolado roto, los cuatro pasaban.
    for (const t of ['authXusers', 'auth_users', 'auth users', 'auth-users']) {
      expect(esTablaRestaurable(t), t).toBe(false)
    }
  })

  it('exige exactamente un punto y un schema de la lista', () => {
    for (const t of ['public.a.b', 'public.', '.courses', 'courses', 'storage.objects', 'publicx.courses', 'pg_catalog.pg_class']) {
      expect(esTablaRestaurable(t), t).toBe(false)
    }
  })

  it('el nombre de la tabla va en minúscula, sin espacios ni puntuación: nada de SQL colado', () => {
    for (const t of ['respaldos.Mala', 'public.COURSES', 'public.courses; drop table x', 'public.courses--', 'public."courses"', 'public.cour ses', 'public.canchás']) {
      expect(esTablaRestaurable(t), t).toBe(false)
    }
  })

  it('sin --tabla no pasa: undefined, null y vacío', () => {
    for (const t of [undefined, null, '', ' ', 'public']) {
      expect(esTablaRestaurable(t), String(t)).toBe(false)
    }
  })

  it('lo que NO se restaura igual pasa el guard de forma: lo corta su propia lista, no ésta', () => {
    // `auth.mfa_factors` es un nombre válido; que no se restaure es otra decisión (NO_RESTAURABLES).
    // Si este guard lo cortara por forma, borrar esa regla dejaría la tabla restaurable sin que
    // nadie lo note.
    for (const t of NO_RESTAURABLES) {
      expect(esTablaRestaurable(t), t).toBe(true)
      expect(NO_RESTAURABLES.includes(t)).toBe(true)
    }
  })
})

describe('las listas de schemas son una sola fuente', () => {
  it('restaurable = respaldado + auth, sin repetidos', () => {
    expect(SCHEMAS_RESTAURABLES).toEqual([...SCHEMAS_RESPALDADOS, 'auth'])
    expect(new Set(SCHEMAS_RESTAURABLES).size).toBe(SCHEMAS_RESTAURABLES.length)
  })

  it('`auth` no se respalda como schema completo: de ahí van solo las tablas elegidas', () => {
    // Si alguien agregara 'auth' a SCHEMAS_RESPALDADOS, el dump exportaría `auth.sessions`,
    // `auth.refresh_tokens` y los tokens de un solo uso que AUTH_TABLAS saca a propósito.
    expect(SCHEMAS_RESPALDADOS).not.toContain('auth')
    expect(Object.keys(AUTH_TABLAS).every(t => t.startsWith('auth.'))).toBe(true)
  })

  it('cada tabla de auth que se respalda es restaurable: si no, el respaldo no sirve de nada', () => {
    for (const t of Object.keys(AUTH_TABLAS)) {
      expect(esTablaRestaurable(t), t).toBe(true)
    }
  })

  it('todo schema respaldado es restaurable: el respaldo de una migración no puede quedar atrapado', () => {
    // Fue el bug real: `respaldos` entró al dump y el restore lo rechazaba, así que la ÚNICA copia
    // de las yardas del dorado quedaba sin forma de volver.
    for (const s of SCHEMAS_RESPALDADOS) {
      expect(esTablaRestaurable(`${s}.una_tabla`), s).toBe(true)
    }
  })
})
