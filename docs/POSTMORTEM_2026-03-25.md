# POST-MORTEM: Caída de App en Producción

**Fecha del incidente:** 25 Mar 2026, ~22:15 UTC-3
**Duración:** ~12 horas (hasta restauración en sesión siguiente)
**Severidad:** CRÍTICA — app inutilizable para todos los usuarios logueados
**Autor del post-mortem:** Claude (CTO)

---

## Resumen

Un refactor del componente Navbar durante un sprint de seguridad causó
que todas las páginas protegidas (/perfil, /historial, /dashboard, /coach)
mostraran carga infinita para usuarios logueados. La app estuvo caída
desde las ~22:15 del 25-mar hasta la restauración al día siguiente.

## Causa raíz

**Commit:** `9928d96` — "fix: Navbar — auth listener ahora carga isAdmin al login"

El cambio convirtió el callback de `onAuthStateChange` de síncrono (con `.then()`)
a `async/await`. Esto causó que `supabase.auth.getUser()` en el cliente dejara
de resolver correctamente en el contexto del Navbar, que es un componente global
presente en TODAS las páginas via `layout.tsx`.

**Código problemático:**
```typescript
// ANTES (funcionaba):
const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
  setUser(session?.user ?? null)
})

// DESPUÉS (causó la caída):
const { data: listener } = supabase.auth.onAuthStateChange(async (_e, session) => {
  if (cancelled) return
  setUser(session?.user ?? null)
  if (session?.user) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', session.user.id).single()
    if (!cancelled) setIsAdmin(profile?.role === 'admin')
  } else {
    setIsAdmin(false)
  }
})
```

## Por qué no se detectó

1. **Sin tests automáticos** — no había tests canario que detectaran patrones peligrosos
2. **Sin pre-push hook** — el push pasó sin verificación
3. **Build exitoso** — TypeScript y Next.js no detectan race conditions
4. **No se probó manualmente** — se asumió que el cambio era seguro
5. **Sprint de 12 horas** — fatiga, muchos commits, cambios acumulados

## Intentos de arreglo (que empeoraron la situación)

Se hicieron 5 commits adicionales intentando arreglar sin identificar la causa:
- `993b401` — timeout 15s + error detail (solo historial)
- `0fa0997` — error detallado en historial
- `fc9e32d` — force-dynamic en 3 APIs
- `2d02194` — force-dynamic en 40 APIs
- `c226187` — fix loop infinito en historial

Ninguno resolvió el problema porque la causa era el Navbar, no las páginas individuales.

## Qué se perdió

| Funcionalidad | Impacto |
|---|---|
| Historial v2 (diseño premium) | Revertido, se hará en sprint dedicado |
| API /historial/stats | Revertido junto con historial v2 |
| Navbar admin al login | Restaurado con fix mínimo post-incidente |
| Historial límite 500 | Restaurado post-incidente |
| Historial ?add=true URL | Restaurado post-incidente |

## Medidas correctivas implementadas

1. **Pre-push hook** (.git/hooks/pre-push) — bloquea push si tsc, tests o build fallan
2. **Tests canario** (src/__tests__/canary-stability.test.ts) — 15 tests que detectan:
   - Archivos críticos faltantes
   - Patrones peligrosos en Navbar (async en onAuthStateChange)
   - Páginas sin loading state controlado
   - API routes sin force-dynamic
   - Layout con imports pesados
3. **Protocolo en CLAUDE.md** — archivos protegidos, protocolo de modificación, patrones prohibidos
4. **Regla de commits separados** — archivos protegidos van en commit individual

## Lecciones aprendidas

1. Un componente global (Navbar) es el punto más peligroso de la app — cualquier cambio afecta TODAS las páginas
2. `async` en callbacks de Supabase auth puede causar race conditions silenciosas
3. Un sprint largo sin parar a verificar en producción es una receta para desastres
4. Intentar arreglar sin diagnosticar primero genera commits basura que complican el revert
5. La regla de "si compila y buildea, funciona" es FALSA para problemas de runtime

---

*Este documento debe revisarse antes de cualquier sprint que toque auth, middleware o componentes globales.*
