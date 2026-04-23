# ADR-007 — Español LatAm neutro (tú, no vos)

**Estado**: Aceptado
**Fecha**: 2026-03-20 (establecido al inicio del proyecto)

## Contexto

Golfers+ se lanza inicialmente en clubes chilenos, pero la base de usuarios proyectada es regional (Chile, México, Argentina, España). Los strings que ve el jugador en cancha deben sonar naturales en todos esos mercados sin localizaciones separadas.

Decisión implícita al usar "vos" (voseo argentino): el jugador chileno lo siente forzado, el español lo siente muy regional, el mexicano no lo reconoce.

Decisión implícita al usar "usted": formal y distante, no encaja con el tono de una app de golf amateur.

## Decisión

**Español LatAm neutro con "tú"**. Spanglish golf permitido.

### Regla de `tú`

Todos los strings que ve el usuario usan `tú`:
- ✅ "¿Querés crear una ronda?" → ❌ NO
- ✅ "¿Quieres crear una ronda?" → ✅ SÍ
- ✅ "Ingresa tu email" → SÍ
- ❌ "Ingresá tu email" → NO

### Spanglish de golf

Los términos técnicos de golf se mantienen en inglés cuando son convención global en el deporte:
- ✅ birdie, bogey, eagle, par
- ✅ stroke play, match play, stableford
- ✅ tee, fairway, green, handicap

No traducir a "pájaro chico", "bocanada", etc. — los jugadores no lo usan.

### Qué SÍ se traduce

Conceptos genéricos no-técnicos:
- `score` → puntaje (pero `Score` en UI de scoring está aceptado)
- `round` → ronda
- `course` → cancha (no "curso")
- `tournament` → torneo
- `scorecard` → tarjeta

## Consecuencias

### Positivas
- **Un solo idioma, un solo archivo de strings** (futuro i18n) — no necesitamos variantes
- **Natural para 90%+ de hispanohablantes**: `tú` es el consenso LatAm
- **Lower barrier para golfistas**: vocabulario técnico intacto

### Negativas
- **Argentinos extrañan el vos**: minoría relativa, tolerable
- **Españoles pueden encontrar frases un pelo LatAm**: aceptable con el vocabulario golf en común
- **Disciplina editorial**: cualquier agente IA que genere strings debe respetar la regla

### Testing
- Test canario podría escanear por "vos" en strings de UI: pendiente (deuda técnica)
- Revisión humana al agregar strings nuevos

## Cuándo reconsiderar

- Si lanzamos mercado Argentina + volumen justifica variante
- Si feedback de usuarios indica fricción real en algún mercado
- Si i18n se implementa formalmente

Por ahora: **un solo idioma neutro**.
