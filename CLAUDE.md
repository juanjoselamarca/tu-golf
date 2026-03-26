# CLAUDE.md — Tu Golf

## VERIFICACIÓN OBLIGATORIA AL INICIAR CADA SESIÓN

Antes de cualquier acción ejecutar en orden:

1. git remote -v
   DEBE mostrar: origin https://github.com/juanjoselamarca/tu-golf.git
   Si muestra CUALQUIER otra URL → DETENER inmediatamente y avisar a Juanjo.

2. git branch --show-current
   DEBE mostrar: main

3. git pull origin main

Confirmar con: "✅ Repositorio verificado: github.com/juanjoselamarca/tu-golf"

4. Si el usuario pega contenido de un archivo health-issue-*.md:
   → Es un reporte de Health Check con problemas que no se pudieron resolver automaticamente
   → Diagnosticar y arreglar CADA problema listado antes de hacer cualquier otra cosa
   → Esto tiene prioridad maxima

## POR QUÉ VERIFICAR EL REPOSITORIO Y NO LA CARPETA

El proyecto puede estar en cualquier carpeta o computador.
La carpeta local NO define el proyecto correcto.
El repositorio GitHub ES la identidad permanente del proyecto.

## STACK

- Next.js 14 + TypeScript + Tailwind CSS
- Supabase: https://hoswfwhvcgqlqdmzpnce.supabase.co
- Producción: https://tu-golf.vercel.app
- GitHub: https://github.com/juanjoselamarca/tu-golf

## COLORES GARMIN GOLF — NO MODIFICAR SIN VERIFICACION

La fuente de verdad esta en `src/lib/garmin-colors.ts`.
Verificado contra capturas reales el 24 Mar 2026.

| Color | Scorecard (Formato 1) | Activity Bar (Formato 2) | Score vs Par |
|-------|----------------------|--------------------------|-------------|
| Azul oscuro | Circulo | Segmento | Eagle o mejor (-2+) |
| Celeste | Circulo | Segmento | Birdie (-1) |
| Sin borde | Sin borde | Verde segmento | Par (0) |
| Dorado/naranja | Cuadrado | Segmento | Bogey (+1) |
| Rojo | Cuadrado | Segmento | Doble bogey+ (+2+) |

NUNCA cambiar estos colores sin verificar contra la app real de Garmin Golf.

## API ROUTES — REGLA CRITICA

TODA API route (src/app/api/**/route.ts) que importe `createClient` de
`@/utils/supabase/server` DEBE tener:

```typescript
export const dynamic = 'force-dynamic'
```

Sin esto, Next.js intenta renderizar la ruta como estatica en Vercel
y FALLA silenciosamente en produccion (DYNAMIC_SERVER_USAGE error).
El usuario ve "no carga" sin explicacion.

ANTES de cada push, verificar con:
```bash
grep -rL "force-dynamic" src/app/api/**/route.ts | while read f; do
  grep -q "supabase/server" "$f" && echo "FALTA dynamic: $f"
done
```

## REGLAS OBLIGATORIAS

1. NUNCA push sin: npx tsc --noEmit (0 errores)
2. NUNCA push sin: npm run build exitoso
3. Commits en español descriptivo
4. Variables de entorno: siempre desde .env.local
5. HEALTH CHECK OBLIGATORIO antes de cada push de sprint:
   - Ejecutar GET /api/admin/health-check (via fetch o desde /admin/sistema)
   - Si hay checks en FAIL → arreglar antes de push
   - Si hay WARN → evaluar si es aceptable, documentar en commit
   - Reportar resultado: "Health Check: X passed, Y warnings, Z failed"

## SOBRE ONEDRIVE Y .next

OneDrive puede corromper la carpeta .next por sincronización.
Si hay errores de build relacionados con .next:
- rmdir /s /q .next
- npm run build
Esto es normal y esperado en este entorno.

## CONTACTO

- PM: Juan José Lamarca (juanjoselamarca@gmail.com)
- CTO: Claude
- Producción: https://tu-golf.vercel.app

---

## DOCUMENTACIÓN — ACTUALIZAR AL FINAL DE CADA SPRINT

OBLIGATORIO antes de cada push de sprint:

1. Agregar entrada en docs/SPRINT_LOG.md (al inicio del archivo)
2. Ejecutar: node scripts/update-docs.js
3. Incluir docs/ en el commit del sprint

Los docs son la memoria del proyecto.
Sin docs actualizados, la próxima IA empieza de cero.
