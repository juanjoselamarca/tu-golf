# ADR-006 — Archivos protegidos y protocolo anti-caída

**Estado**: Aceptado
**Fecha**: 2026-03-25 (post-incidente caída total de producción)

## Contexto

El 25 de marzo de 2026, un refactor del `Navbar.tsx` causó una caída total de la app en producción. El patrón exacto:

```typescript
// ❌ Patrón que causó la caída
supabase.auth.onAuthStateChange(async (event, session) => {
  await getUserProfile()  // await en callback sync bloquea render
})
```

El `async` en el callback de `onAuthStateChange` hizo que el render inicial del Navbar bloqueara indefinidamente cuando el usuario no tenía sesión activa → pantalla blanca en TODAS las páginas (el Navbar es global).

## Decisión

**Designar archivos "protegidos"** — los que aparecen en TODAS las páginas o son single-points-of-failure. Modificarlos requiere **protocolo explícito** (ver CLAUDE.md).

### Archivos protegidos

| Archivo | Por qué |
|---|---|
| `src/components/Navbar.tsx` | Aparece en todas las páginas — un bug rompe la app completa |
| `src/app/layout.tsx` | Layout raíz — un bug rompe el HTML shell |
| `src/middleware.ts` | Interceptor global — un bug rompe auth o routing |
| `src/lib/supabase.ts` | Cliente singleton — un bug rompe toda la data |

### Protocolo para modificar archivos protegidos

1. **Explicar al usuario** qué se va a cambiar y por qué
2. **Cambio mínimo** — no aprovechar para refactorear
3. **`npm run test`** antes de commit (tests canario)
4. **`npm run build`** antes de commit
5. **Si tocás Navbar**: verificar que `onAuthStateChange` NO sea async
6. **Commit separado** — solo este archivo, no mezclado con otros cambios
7. **Push + esperar confirmación** del usuario que producción funciona

### Patrones prohibidos en Navbar

- `onAuthStateChange(async` — causó la caída del 25-mar
- `async function` dentro de useEffect de auth — mismo patrón
- Cualquier `await` que pueda bloquear el render inicial

### Tests canario

`src/__tests__/canary-stability.test.ts` verifica que estos patrones NO estén en el código:
- Detecta `onAuthStateChange(\s*async` en Navbar
- Verifica que los archivos críticos existan
- Pre-push hook bloquea si los canarios fallan

## Consecuencias

### Positivas
- **No vuelve a pasar el incidente del 25-mar**: el test canario lo detectaría
- **Disciplina explícita**: cualquier dev/agente sabe que esos archivos son diferentes
- **Commits puros forzados**: no se puede mezclar cambio protegido con otra cosa

### Negativas
- **Fricción para cambios legítimos**: 7 pasos en lugar de 1 commit
- **Posible falso sentido de seguridad**: archivos NO protegidos también pueden romper cosas (ej: un cambio en `app/layout.tsx` de una ruta específica). La lista debe actualizarse.

## Actualización de la lista

Agregar un archivo a la lista si:
- Cualquier error en él rompe la app completa (no sólo una ruta)
- Es un singleton crítico (cliente DB, auth middleware)
- Un incidente previo demostró su criticidad

Remover un archivo si:
- Se refactorizó y ya no es single-point-of-failure
- Se agregó redundancia que compensa su criticidad

Cada cambio a la lista requiere ADR nuevo que actualice éste.

## Pre-push hook

`.git/hooks/pre-push` bloquea push si:
- TypeScript tiene errores
- Tests fallan (incluyendo canarios)
- Build falla

Este hook **no se puede desactivar** sin aprobación explícita del usuario.
