import { describe, it, expect } from 'vitest'
import { isAllowedPushEndpoint, PushSubscriptionJsonSchema, PushSubscriptionProofSchema } from './schemas'

describe('allowlist de servicios de push (SSRF / amplificador)', () => {
  it('acepta los servicios reales', () => {
    for (const e of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://web.push.apple.com/QBx8',
      'https://eu.push.apple.com/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://db5p.notify.windows.com/w/?token=x',
    ]) expect(isAllowedPushEndpoint(e), e).toBe(true)
  })

  it('rechaza cualquier otro host, http, y trucos de subdominio', () => {
    for (const e of [
      'https://victima.com/webhook',
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.evil.com/x',
      'https://evilfcm.googleapis.com/x',
      'https://push.apple.com.attacker.net/x',
      'https://localhost/x',
      'not a url',
    ]) expect(isAllowedPushEndpoint(e), e).toBe(false)
  })

  it('el schema de suscripción usa la allowlist', () => {
    const keys = { p256dh: 'BPUBLICKEYPUBLICKEYPUBLICKEY', auth: 'AUTHSECRET123' }
    expect(PushSubscriptionJsonSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys }).success).toBe(true)
    expect(PushSubscriptionJsonSchema.safeParse({ endpoint: 'https://victima.com/webhook', keys }).success).toBe(false)
    expect(PushSubscriptionProofSchema.safeParse({ endpoint: 'https://victima.com/webhook', keys: { auth: keys.auth } }).success).toBe(false)
  })
})
