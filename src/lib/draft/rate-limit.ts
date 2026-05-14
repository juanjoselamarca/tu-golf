// src/lib/draft/rate-limit.ts
const WINDOW_MS = 60 * 60 * 1000   // 1 hour
const MAX_CALLS = 30
const LOOP_WINDOW_MS = 2 * 60 * 1000  // 2 min
const LOOP_MAX_REPEATS = 5
const LOOP_BLOCK_MS = 10 * 60 * 1000  // 10 min

interface UserState {
  calls: number[]            // timestamps
  loopBlockedUntil: number   // 0 = not blocked
  lastMsgs: Array<{ msg: string; ts: number }>
}

const store = new Map<string, UserState>()

export interface RateLimitResult {
  allowed: boolean
  reason?: 'rate_limit' | 'loop_detected'
  retry_after_ms?: number
}

export function checkRateLimit(userId: string, message: string): RateLimitResult {
  const now = Date.now()
  let s = store.get(userId)
  if (!s) {
    s = { calls: [], loopBlockedUntil: 0, lastMsgs: [] }
    store.set(userId, s)
  }

  if (s.loopBlockedUntil > now) {
    return { allowed: false, reason: 'loop_detected', retry_after_ms: s.loopBlockedUntil - now }
  }

  s.calls = s.calls.filter(ts => now - ts < WINDOW_MS)
  s.lastMsgs = s.lastMsgs.filter(m => now - m.ts < LOOP_WINDOW_MS)

  if (s.calls.length >= MAX_CALLS) {
    return { allowed: false, reason: 'rate_limit', retry_after_ms: WINDOW_MS - (now - s.calls[0]) }
  }

  // Loop detection
  const sameRecent = s.lastMsgs.filter(m => m.msg === message)
  if (sameRecent.length >= LOOP_MAX_REPEATS) {
    s.loopBlockedUntil = now + LOOP_BLOCK_MS
    return { allowed: false, reason: 'loop_detected', retry_after_ms: LOOP_BLOCK_MS }
  }

  s.calls.push(now)
  s.lastMsgs.push({ msg: message, ts: now })

  return { allowed: true }
}

export function _resetForTest() {
  store.clear()
}
