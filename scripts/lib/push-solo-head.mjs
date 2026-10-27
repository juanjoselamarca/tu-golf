/**
 * El pre-push (scripts/verify.mjs --pre-push) verifica el checkout: tsc, tests, build y verify-db-schema corren sobre
 * lo que hay en disco. Si el push manda a una rama remota un commit distinto de HEAD, esas verificaciones no cubren
 * lo que se empuja.
 *
 * `stdin`: la del pre-push, una línea por ref: "<ref local> <sha local> <ref remota> <sha remoto>".
 * Devuelve "<ref local> -> <ref remota>" de cada línea que va a refs/heads/* (venga de una rama, de HEAD o de un sha
 * suelto) con un sha local distinto de HEAD. No cuenta tags ni borrados (sha local todo en cero, SHA-1 o SHA-256).
 */
export function pushesQueNoSonHead(stdin, headSha) {
  return String(stdin ?? '')
    .split(/\r?\n/)
    .map(linea => linea.trim().split(/\s+/))
    .filter(([localRef, localSha = '', remoteRef = '']) =>
      !!localRef && remoteRef.startsWith('refs/heads/') && /[^0]/.test(localSha) && localSha !== headSha)
    .map(([localRef, , remoteRef]) => `${localRef} -> ${remoteRef}`)
}

export const mensajePushNoHead = refs =>
  `pre-push: ${refs.join(', ')} no es tu HEAD: haz el push desde el checkout de esa rama (el pre-push verifica HEAD)`
