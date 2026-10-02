# PROTECCIÓN ANTI-CAÍDA — archivos protegidos

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.

Después del incidente del 25-mar-2026 (refactor del Navbar tumbó la app entera en producción), estas reglas son ABSOLUTAS:

### Archivos protegidos — nunca modificar sin el protocolo completo

- `src/components/Navbar.tsx` — global en TODAS las páginas
- `src/app/layout.tsx` — layout raíz
- `src/proxy.ts` — proxy de auth (antes `src/middleware.ts`)
- `src/lib/supabase.ts` — cliente Supabase

### Protocolo para tocar archivos protegidos

1. Explicar al usuario qué se cambia y por qué
2. Cambio MÍNIMO necesario, no refactorizar
3. `npm run test` ANTES del commit (canarios detectan patrones peligrosos)
4. `npm run build` ANTES del commit
5. Si es Navbar: verificar que `onAuthStateChange` NO sea async
6. Commit individual (no mezclar con otros cambios)
7. Push y esperar confirmación de Juanjo de que prod funciona

### Patrones PROHIBIDOS en Navbar

- `onAuthStateChange(async ...)` — causó la caída del 25-mar
- `async function` dentro de `useEffect` de auth — causó la caída del 25-mar
- Cualquier `await` que pueda bloquear el render inicial

### Pre-push hook automático

`.git/hooks/pre-push` bloquea push si TS tiene errores, tests fallan o build falla. NO desactivar sin aprobación explícita de Juanjo.
