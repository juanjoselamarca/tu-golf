// src/lib/draft/share-token.ts
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

export function generateShareToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => ALPHABET[b % ALPHABET.length]).join('')
}

export function isTokenExpired(expiresAtIso: string): boolean {
  return new Date(expiresAtIso).getTime() <= Date.now()
}

export const SHARE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000  // 24h
