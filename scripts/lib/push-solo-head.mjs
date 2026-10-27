/**
 * La stdin del pre-push: una línea por ref, "<ref local> <sha local> <ref remota> <sha remoto>". Parser único (lo usan
 * pushesQueNoSonHead y el atajo del árbol verificado de scripts/verify.mjs). Se lee desde la derecha: los tres últimos
 * campos no tienen espacios, la ref local sí puede (`git push origin 'HEAD@{1 hour ago}':refs/heads/x`). CRLF
 * normalizado; las líneas sin cuatro campos se descartan.
 */
export function lineasDelPrePush(stdin) {
  return String(stdin ?? '')
    .split(/\r?\n/)
    .map(linea => /^\s*(.*\S)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/.exec(linea))
    .filter(Boolean)
    .map(([, localRef, localSha, remoteRef, remoteSha]) => ({ localRef, localSha, remoteRef, remoteSha }))
}

/** Sha local de un borrado de rama: todo en cero (SHA-1 o SHA-256). */
export const esBorrado = sha => !/[^0]/.test(sha ?? '')

/**
 * El pre-push (scripts/verify.mjs --pre-push) verifica el checkout: tsc, tests, build y verify-db-schema corren sobre
 * lo que hay en disco. Si el push manda a una rama remota un commit distinto de HEAD, esas verificaciones no cubren
 * lo que se empuja.
 *
 * Devuelve "<ref local> -> <ref remota>" de cada línea que va a refs/heads/* (venga de una rama, de HEAD o de un sha
 * suelto) con un sha local distinto de HEAD. No cuenta tags ni borrados.
 */
export function pushesQueNoSonHead(stdin, headSha) {
  return lineasDelPrePush(stdin)
    .filter(l => l.remoteRef.startsWith('refs/heads/') && !esBorrado(l.localSha) && l.localSha !== headSha)
    .map(l => `${l.localRef} -> ${l.remoteRef}`)
}

export const mensajePushNoHead = refs =>
  `pre-push: ${refs.join(', ')} no es tu HEAD: haz el push desde el checkout de esa rama (el pre-push verifica HEAD)`
