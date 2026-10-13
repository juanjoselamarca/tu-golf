import { describe, it, expect } from 'vitest'
import { hashear, comparar } from './deriva-esquema.mjs'

const guardada = h => JSON.parse(JSON.stringify({ fecha: '2026-10-13T00:00:00.000Z', objetos: Object.fromEntries(hashear(h)) }))

describe('deriva del esquema', () => {
  const base = new Map([
    ['funcion public.f()', '["postgres","CREATE FUNCTION public.f() ... select secreto"]'],
    ['policy public.t.lee', '["PERMISSIVE",["authenticated"],"SELECT","true",null]'],
    ['privilegio t.telefono service_role SELECT', 'false'],
    ['privilegio f(integer, text) service_role EXECUTE', 'false'],
    ['default-acl postgres r service_role SELECT', 'false'],
    ['esquema public service_role USAGE', 'false'],
  ])

  it('lo guardado no lleva definiciones ni quién tiene qué permiso, solo el sha256 de cada objeto', () => {
    const { objetos } = guardada(base)
    expect(Object.keys(objetos)).toEqual([
      'funcion public.f()', 'policy public.t.lee', 'privilegio t.telefono', 'privilegio f(integer, text)',
      'default-acl postgres r', 'esquema public',
    ])
    for (const v of Object.values(objetos)) expect(v).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(objetos)).not.toMatch(/secreto|service_role/)
  })

  it('sin cambios no hay deriva', () => {
    expect(comparar(guardada(base), hashear(base))).toEqual([])
  })

  it('detecta un objeto cambiado, uno nuevo y uno borrado en prod', () => {
    const prod = new Map(base)
    prod.set('policy public.t.lee', '["PERMISSIVE",["anon"],"SELECT","true",null]')
    prod.set('privilegio t.telefono anon SELECT', 'false')
    prod.set('privilegio otra anon DELETE', 'false')
    prod.delete('funcion public.f()')
    const d = comparar(guardada(base), hashear(prod))
    expect(d).toHaveLength(4)
    expect(d.some(x => x.startsWith('distinto: policy public.t.lee'))).toBe(true)
    expect(d.some(x => x.startsWith('distinto: privilegio t.telefono\n'))).toBe(true)
    expect(d).toContain('sobra en prod: privilegio otra')
    expect(d).toContain('falta en prod: funcion public.f()')
    expect(d.join('\n')).not.toContain('anon')
  })
})
