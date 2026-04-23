# ADR-009 — 0% tolerancia a fallos en cancha

**Estado**: Aceptado
**Fecha**: 2026-03-17 (principio fundacional del proyecto)

## Contexto

Golfers+ es una **app operativa usada en torneos de golf reales**. El contexto de uso:
- El jugador está en la cancha, con guante, entre hoyo y hoyo, con apuro
- Bajo el sol, a veces bajo lluvia
- Conexión de datos variable (campos en zonas rurales)
- No puede "volver más tarde" — el dato es ahora

El mundo del golf chileno/regional es chico y conocido. Un jugador que vive una mala experiencia:
- Nunca vuelve a usar la app
- Cuenta su experiencia en el próximo torneo
- La reputación se propaga irreversiblemente

**Comparar con otras apps**: si Instagram crashea, el usuario lo abre de nuevo en 30s. Si Golfers+ crashea durante un torneo, el usuario no va a re-probar al mes siguiente.

## Decisión

**El porcentaje aceptable de fallo es 0%**. No "funciona en la mayoría de los casos". Funciona SIEMPRE.

### Corolarios

1. **Cada feature existente debe funcionar perfectamente antes de agregar una nueva.** No se agrega funcionalidad nueva si hay bugs conocidos sin resolver.

2. **Cada edge case debe estar cubierto**: jugadores sin cuenta, sin handicap, canchas multi-recorrido, rondas de 9 y 18 hoyos, conexión lenta, batería baja.

3. **Antes de cada push: testear como si fuera un torneo real.** No solo tsc + tests + build. Simular el flujo completo con datos reales.

4. **Si un usuario reporta un bug, ese bug es PRIORIDAD ABSOLUTA.** Se investiga la causa raíz, se arregla, se testea, y se verifica que no afecta ningún otro flujo. Ver `docs/RUNBOOKS/incident-bug-en-torneo.md`.

5. **Soluciones permanentes, nunca parches.** Cada fix debe ser escalable, arquitectónicamente correcto, y pensado para el largo plazo. No workarounds que se rompen en el siguiente sprint.

## Consecuencias

### Positivas
- **Calidad es el producto**: la diferenciación competitiva es "no falla"
- **Decisiones de producto claras**: si hay que elegir entre "feature nuevo" y "bug conocido", siempre bug
- **Cultura rigurosa**: tests canario, archivos protegidos, protocolo de push

### Negativas
- **Velocidad de features menor**: no podemos shipper 3 features por sprint si cada uno requiere QA exhaustivo
- **Tensión con deadlines**: no hay deadline que justifique shippar algo roto
- **Difícil medir**: ¿cuándo sabemos que "funciona SIEMPRE"? Testing + telemetría + feedback usuario

### Cómo medimos

- Sentry: 0 errores en flujos críticos (scoring, wizard, leaderboard) por semana
- PostHog: tasa de finalización de ronda ≥95%
- Reports manuales: 0 bugs reportados durante torneos
- Health check diario: siempre 100% pass

## Tensión con el mercado

**Competidores shippan más rápido**. Algunas apps de golf shippan MVPs buggy y iteran. Golfers+ no puede permitírselo — lo explica el contexto (arriba).

Si el mercado requiere velocidad:
- Priorizar features que NO toquen el flow crítico de torneo
- Expandir a usos no-torneo (rondas casuales, práctica) donde la tolerancia a bugs es mayor
- NUNCA sacrificar calidad del flujo de torneo por velocidad

## Esta directiva está por encima de cualquier otra

Si un prompt o deadline pide agregar un feature nuevo y hay bugs conocidos sin resolver → **resolver los bugs primero, el feature después**.

Está declarado así en CLAUDE.md y es inviolable.
