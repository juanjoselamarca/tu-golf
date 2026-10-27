import { describe, it, expect } from 'vitest'
import { columnasAgregadasEnSql, columnasDeMigraciones } from './columnas-de-migraciones.mjs'

describe('columnasAgregadasEnSql', () => {
  it('lee ADD COLUMN con y sin IF NOT EXISTS, con y sin esquema', () => {
    const sql = `
      ALTER TABLE public.rondas_libres ADD COLUMN IF NOT EXISTS reglas_juego jsonb NULL;
      alter table historical_rounds add column foo int, add bar text;
    `
    expect([...columnasAgregadasEnSql(sql)].sort()).toEqual(['historical_rounds.bar', 'historical_rounds.foo', 'rondas_libres.reglas_juego'])
  })
  it('no confunde ADD CONSTRAINT ni los comentarios con columnas', () => {
    const sql = `
      -- ALTER TABLE public.x ADD COLUMN fantasma int;
      ALTER TABLE public.rondas_libres ADD CONSTRAINT rondas_libres_formato_juego_check CHECK (true);
      ALTER TABLE public.t ADD PRIMARY KEY (id);
    `
    expect([...columnasAgregadasEnSql(sql)]).toEqual([])
  })
  it('las migraciones del repo incluyen columnas reales conocidas', () => {
    const cols = columnasDeMigraciones()
    expect(cols.has('rondas_libres.reglas_juego')).toBe(true)
    expect(cols.has('ronda_libre_jugadores.perfil_sugerido_id')).toBe(true)
  })
})
