import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { esBorrado, lineasDelPrePush, mensajePushNoHead, pushesQueNoSonHead } from './push-solo-head.mjs'

// Sin git: el sha de HEAD va como argumento y la stdin del pre-push como texto.
const HEAD = 'a'.repeat(40)
const OTRO = 'b'.repeat(40)
const CERO = '0'.repeat(40)

describe('lineasDelPrePush y esBorrado (parser único de la stdin del pre-push)', () => {
  it('lee desde la derecha: la ref local puede traer espacios; CRLF y líneas incompletas', () => {
    const stdin = `HEAD@{1 hour ago} ${OTRO} refs/heads/x ${CERO}\r\nrefs/heads/feat ${HEAD} refs/heads/feat ${OTRO}\r\nincompleta ${HEAD}\n\n`
    expect(lineasDelPrePush(stdin)).toEqual([
      { localRef: 'HEAD@{1 hour ago}', localSha: OTRO, remoteRef: 'refs/heads/x', remoteSha: CERO },
      { localRef: 'refs/heads/feat', localSha: HEAD, remoteRef: 'refs/heads/feat', remoteSha: OTRO },
    ])
    expect(pushesQueNoSonHead(stdin, HEAD)).toEqual(['HEAD@{1 hour ago} -> refs/heads/x'])
  })
  it('esBorrado: todo en cero (SHA-1 o SHA-256); cualquier otro dígito no', () => {
    expect(esBorrado(CERO)).toBe(true)
    expect(esBorrado('0'.repeat(64))).toBe(true)
    expect(esBorrado(HEAD)).toBe(false)
    expect(esBorrado('0'.repeat(39) + '1')).toBe(false)
  })
  it('verify.mjs usa este parser para el atajo del árbol verificado (no uno propio)', () => {
    const verify = fs.readFileSync(path.resolve('scripts/verify.mjs'), 'utf8')
    expect(verify).toContain('lineasDelPrePush(stdin)')
    expect(verify).not.toMatch(/split\(' '\)/)
  })
})

describe('pushesQueNoSonHead (pre-push)', () => {
  it('push normal de la rama actual (también HEAD:otra-rama): pasa', () => {
    expect(pushesQueNoSonHead(`refs/heads/feat ${HEAD} refs/heads/feat ${OTRO}\n`, HEAD)).toEqual([])
    expect(pushesQueNoSonHead(`HEAD ${HEAD} refs/heads/x ${CERO}\n`, HEAD)).toEqual([])
  })
  it('push de otra rama (distinta de HEAD), o de un sha suelto a una rama remota: la nombra', () => {
    const stdin = `refs/heads/feat ${HEAD} refs/heads/feat ${OTRO}\nrefs/heads/otra ${OTRO} refs/heads/otra ${CERO}\n${OTRO} ${OTRO} refs/heads/x ${CERO}`
    expect(pushesQueNoSonHead(stdin, HEAD)).toEqual(['refs/heads/otra -> refs/heads/otra', `${OTRO} -> refs/heads/x`])
    expect(mensajePushNoHead(['refs/heads/otra -> refs/heads/otra'])).toBe(
      'pre-push: refs/heads/otra -> refs/heads/otra no es tu HEAD: haz el push desde el checkout de esa rama (el pre-push verifica HEAD)')
  })
  it('borrado de rama (sha local en cero, SHA-1 o SHA-256), push de tag, stdin vacía y CRLF: pasan', () => {
    expect(pushesQueNoSonHead(`(delete) ${CERO} refs/heads/vieja ${OTRO}\n`, HEAD)).toEqual([])
    expect(pushesQueNoSonHead(`(delete) ${'0'.repeat(64)} refs/heads/vieja ${OTRO}\n`, HEAD)).toEqual([])
    expect(pushesQueNoSonHead(`refs/tags/v1 ${OTRO} refs/tags/v1 ${CERO}\n`, HEAD)).toEqual([])
    expect(pushesQueNoSonHead('', HEAD)).toEqual([])
    expect(pushesQueNoSonHead(`refs/heads/feat ${HEAD} refs/heads/feat ${OTRO}\r\n`, HEAD)).toEqual([])
  })
  it('verify.mjs --pre-push corre el guard antes del atajo del árbol verificado y de los checks', () => {
    const verify = fs.readFileSync(path.resolve('scripts/verify.mjs'), 'utf8')
    const guard = verify.indexOf('pushesQueNoSonHead(')
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(verify.indexOf('skipping the checks'))
    expect(guard).toBeLessThan(verify.indexOf("run('tsc'"))
  })
})
