# Architecture Decision Records (ADRs)

Decisiones arquitecturales importantes del proyecto. Cada ADR documenta **por qué** algo es como es, no sólo **qué** es.

## Formato

Cada ADR sigue el template lightweight:

```markdown
# ADR-NNN — Título

**Estado**: Aceptado | Propuesto | Deprecado | Superado por ADR-XXX
**Fecha**: YYYY-MM-DD

## Contexto
Qué problema estamos resolviendo.

## Decisión
Qué elegimos.

## Consecuencias
Qué ganamos y qué perdimos con esta decisión.
```

## Índice

| ADR | Título | Estado |
|---|---|---|
| [ADR-001](ADR-001-supabase-backend.md) | Supabase como backend | Aceptado |
| [ADR-002](ADR-002-nextjs-app-router.md) | Next.js 14 App Router | Aceptado |
| [ADR-003](ADR-003-garmin-colors.md) | Colores Garmin Golf inmutables | Aceptado |
| [ADR-004](ADR-004-motor-golf-centralizado.md) | Motor de reglas de golf centralizado en `src/golf/` | Aceptado |
| [ADR-005](ADR-005-commits-puros.md) | Commits puros — un scope por commit | Aceptado |
| [ADR-006](ADR-006-archivos-protegidos.md) | Archivos protegidos y protocolo anti-caída | Aceptado |
| [ADR-007](ADR-007-espanol-latam-neutro.md) | Español LatAm neutro (tú, no vos) | Aceptado |
| [ADR-008](ADR-008-branch-unica-main.md) | Branch única `main` sin develop | Aceptado |
| [ADR-009](ADR-009-cero-fallos-en-cancha.md) | 0% tolerancia a fallos en cancha | Aceptado |
| [ADR-010](ADR-010-taiger-anthropic.md) | tAIger+ coach con Anthropic (no Gemini/OpenAI) | Aceptado |

## Cómo agregar un ADR nuevo

1. Copiar el template de arriba
2. Número secuencial siguiente
3. Título descriptivo (máx 6 palabras)
4. Llenar las 3 secciones
5. Agregar al índice
6. Commit con scope `docs(adrs): agregar ADR-NNN — <titulo>`

## Cuándo deprecar un ADR

Cuando una decisión cambia:
1. Crear ADR nuevo que la supere
2. Editar el ADR viejo: cambiar estado a `Superado por ADR-XXX`
3. **NO borrar el ADR viejo** — el historial importa
