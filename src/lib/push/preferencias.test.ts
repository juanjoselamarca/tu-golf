import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CLAVES_PREFERENCIA, PREFERENCIAS_DEFAULT, preferenciasDeFila } from './preferencias'

describe('preferenciasDeFila', () => {
  it('sin fila → defaults', () => {
    expect(preferenciasDeFila(null)).toEqual(PREFERENCIAS_DEFAULT)
  })

  it('deja fuera id/user_id/timestamps (si volvieran en el PUT, el schema strict lo rechaza)', () => {
    const fila = { id: 'x', user_id: 'u', created_at: 't', updated_at: 't', birdies: false, indice_cambios: false }
    expect(preferenciasDeFila(fila)).toEqual({ ...PREFERENCIAS_DEFAULT, birdies: false, indice_cambios: false })
  })

  it('un valor no booleano (null de una columna nullable) cae al default', () => {
    expect(preferenciasDeFila({ marketing: null, eagles: 'no' }).eagles).toBe(true)
  })
})

describe('defaults = DEFAULT de cada columna en la base', () => {
  it('cada clave tiene una columna con ese default en las migraciones', () => {
    const dir = path.join(process.cwd(), 'supabase', 'migrations')
    const sql = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
    for (const k of CLAVES_PREFERENCIA) {
      const re = new RegExp(`\\b${k}"?\\s+boolean\\b[^,\\n]*\\bdefault\\s+(true|false)`, 'i')
      const m = sql.match(re)
      expect(m, k).not.toBeNull()
      expect(m![1].toLowerCase() === 'true', k).toBe(PREFERENCIAS_DEFAULT[k])
    }
  })
})
