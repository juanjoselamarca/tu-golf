import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Sin git: el guard recibe el sha de HEAD como argumento y la stdin del pre-push como texto.
const GUARD = path.resolve('scripts/git-hooks/push-solo-head.sh')
const HEAD = 'a'.repeat(40)
const OTRO = 'b'.repeat(40)
const CERO = '0'.repeat(40)
const correr = stdin => spawnSync('sh', [GUARD, HEAD], { input: stdin, encoding: 'utf8' })

describe('push-solo-head.sh (pre-push)', () => {
  it('push normal de la rama actual: pasa', () => {
    expect(correr(`refs/heads/feat ${HEAD} refs/heads/feat ${OTRO}\n`).status).toBe(0)
  })
  it('push de otra rama (distinta de HEAD): bloquea y dice qué hacer', () => {
    const r = correr(`refs/heads/feat ${HEAD} refs/heads/feat ${OTRO}\nrefs/heads/otra ${OTRO} refs/heads/otra ${CERO}\n`)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('refs/heads/otra -> refs/heads/otra no es tu HEAD: haz el push desde el checkout de esa rama (el pre-push verifica HEAD)')
  })
  it('un sha suelto empujado a una rama remota también cuenta', () => {
    expect(correr(`${OTRO} ${OTRO} refs/heads/x ${CERO}\n`).status).toBe(1)
  })
  it('borrado de rama (sha local en cero, SHA-1 o SHA-256) y push de tag: pasan', () => {
    expect(correr(`(delete) ${CERO} refs/heads/vieja ${OTRO}\n`).status).toBe(0)
    expect(correr(`(delete) ${'0'.repeat(64)} refs/heads/vieja ${OTRO}\n`).status).toBe(0)
    expect(correr(`refs/tags/v1 ${OTRO} refs/tags/v1 ${CERO}\n`).status).toBe(0)
  })
  it('stdin vacía (nada que empujar) pasa; una última línea sin salto de línea se revisa igual', () => {
    expect(correr('').status).toBe(0)
    expect(correr(`refs/heads/otra ${OTRO} refs/heads/otra ${CERO}`).status).toBe(1)
  })
  it('el hook llama al guard antes que cualquier otra verificación', () => {
    const hook = fs.readFileSync(path.resolve('scripts/git-hooks/pre-push'), 'utf8')
    const guard = hook.indexOf('sh scripts/git-hooks/push-solo-head.sh "$(git rev-parse HEAD)"')
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(hook.indexOf('npx tsc'))
  })
})
