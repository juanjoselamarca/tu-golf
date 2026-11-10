// src/lib/local-storage-prefijo.ts
//
// Borrar de localStorage todas las claves que empiezan con un prefijo. Fuente única
// para las limpiezas por ronda (tarjetas, respaldos) y por sesión (copias del scorer).

/**
 * Borra todas las claves de localStorage que empiezan con `prefijo`. Recorre de atrás
 * hacia adelante: borrar corre los índices de las que quedan. Silencioso si el storage
 * no está disponible (modo privado de Safari).
 */
export function borrarClavesConPrefijo(prefijo: string): void {
  if (!prefijo) return
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefijo)) localStorage.removeItem(k)
    }
  } catch {
    // noop
  }
}
