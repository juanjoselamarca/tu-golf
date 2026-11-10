/**
 * Canario: cualquier cliente (anon o con sesión) ve TODAS las filas de rondas_libres.
 *
 * `fetchEstadoRondaLibre` (src/lib/data/ronda-libre-estado.ts) traduce "0 filas" (PGRST116) a "la ronda no
 * existe", y con eso el conciliador del banner y los dos scorers BORRAN la copia local de la ronda: los
 * golpes sin subir incluidos (PR #763). Eso sólo es cierto mientras la RLS no esconda filas: hoy la policy
 * `ver_rondas` es `for select to public using (true)` y no hay ninguna RESTRICTIVE de lectura. Si mañana
 * una policy filtra rondas (por creador, por jugador, demo...), una ronda viva que el teléfono no puede
 * ver se leería como borrada y se perderían golpes. Entonces este canario tiene que romper ANTES, y quien
 * lo cambie decide: mover esa lectura a una RPC SECURITY DEFINER que distinga "no existe" de "no la ves".
 *
 * También exige que anon pueda leer `codigo` y `estado` (sin ellas la lectura da 42501, que el conciliador
 * trata como sin señal: no borra nada, pero el banner del invitado no se resolvería nunca).
 *
 * Lee supabase/schema.sql, el esquema que dejan las migraciones (el workflow `esquema` lo mantiene igual);
 * corre en `npm run test`, dentro de `npm run verify`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const schema = readFileSync(path.resolve(process.cwd(), 'supabase', 'schema.sql'), 'utf8').replace(/\r\n/g, '\n')

type Policy = { nombre: string; tipo: string; cmd: string; roles: string[]; using: string | null }

const POLICY = /^create policy "([^"]+)" on "public"\."rondas_libres" as (permissive|restrictive) for (\w+) to (.+?)(?: using \((.*?)\))?(?: with check \(.*\))?;$/

const policies: Policy[] = schema.split('\n')
  .filter(l => /^create policy .* on "public"\."rondas_libres" /.test(l))
  .map(l => {
    const m = POLICY.exec(l)
    if (!m) throw new Error(`policy de rondas_libres que el canario no sabe leer: ${l}`)
    return { nombre: m[1], tipo: m[2], cmd: m[3], roles: m[4].split(',').map(r => r.trim().replace(/"/g, '')), using: m[5] ?? null }
  })

const leen = (p: Policy) => p.cmd === 'select' || p.cmd === 'all'
const alcanzaA = (p: Policy, rol: string) => p.roles.includes('public') || p.roles.includes(rol)

describe('canary — rondas_libres: toda fila es visible (PGRST116 = la ronda no existe)', () => {
  it('el canario encuentra las policies (si cambia el formato de schema.sql, que rompa acá y no pase en vacío)', () => {
    expect(policies.length).toBeGreaterThan(0)
    expect(policies.some(leen)).toBe(true)
  })

  it.each(['anon', 'authenticated'])('%s tiene una policy PERMISSIVE de lectura con USING (true)', rol => {
    const abiertas = policies.filter(p => leen(p) && p.tipo === 'permissive' && alcanzaA(p, rol) && p.using === 'true')
    expect(abiertas.map(p => p.nombre)).not.toEqual([])
  })

  it('ninguna policy RESTRICTIVE filtra la lectura (se suma con AND y escondería rondas vivas)', () => {
    expect(policies.filter(p => leen(p) && p.tipo === 'restrictive').map(p => p.nombre)).toEqual([])
  })

  it('anon puede leer codigo y estado; authenticated, la tabla', () => {
    const anon = /^grant SELECT \(([^)]*)\) on table public\."rondas_libres" to anon;$/m.exec(schema)
    const columnas = anon?.[1].split(',').map(c => c.trim().replace(/"/g, '')) ?? []
    expect(columnas).toEqual(expect.arrayContaining(['codigo', 'estado']))
    expect(schema).toMatch(/^grant [A-Z, ]*\bSELECT\b[A-Z, ]* on table public\."rondas_libres" to authenticated;$/m)
  })
})
