// Canario: el navegador nunca llama al envío masivo de push.
// Bug 29-sep-2026: el scorer llamaba /api/push/send sin userIds al anotar un
// birdie/eagle/ace o al finalizar; para un admin eso llegaba a TODOS los
// usuarios con cuenta. Los avisos de una ronda van a sus seguidores por
// /api/push/round-update; /api/push/send queda solo para el admin en servidor.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'api' ? [] : files(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

describe('canario — el cliente no dispara broadcast de push', () => {
  it('ningún archivo fuera de src/app/api llama /api/push/send ni sendPushViaServer', () => {
    const offenders = files('src').filter((p) => {
      const src = readFileSync(p, 'utf8')
      return src.includes("'/api/push/send'") || src.includes('sendPushViaServer')
    })
    expect(offenders).toEqual([])
  })
})
