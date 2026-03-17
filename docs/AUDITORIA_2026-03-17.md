# Auditoria Tecnica y de Producto

Fecha: 2026-03-17
Alcance: diagnostico completo del repo, sin cambios de codigo
Metodo: revision de codigo, schema SQL, rutas API, flujos criticos y validacion operativa minima

## Resumen ejecutivo

El proyecto tiene una base funcional clara y una direccion de producto definida, pero hoy presenta una brecha relevante entre:

- el dominio que el frontend asume
- el schema SQL documentado en migraciones
- el estado real de automatizacion de calidad

El riesgo principal no es "codigo feo"; es inconsistencia estructural. Eso ya impacta seguridad operativa, confiabilidad de scoring, mantenibilidad y velocidad de entrega.

## Hallazgos prioritarios

### P0. Inconsistencia de schema y estados de dominio en flujos criticos

Estado: confirmado en codigo

Impacto real:
- puede romper scoring, historial, admin y rutas GWI dependiendo de que SQL este realmente aplicado
- hace dificil saber si un bug es de app, RLS o migracion incompleta
- aumenta mucho el riesgo de regresiones silenciosas

Evidencia:
- `supabase/migrations/001_initial_schema.sql` define `profiles.handicap`, no `profiles.indice` ([supabase/migrations/001_initial_schema.sql:11](../supabase/migrations/001_initial_schema.sql), [supabase/migrations/001_initial_schema.sql:17](../supabase/migrations/001_initial_schema.sql))
- multiples pantallas y APIs consultan `profiles.indice` ([src/app/register/page.tsx:102](../src/app/register/page.tsx), [src/app/perfil/page.tsx:88](../src/app/perfil/page.tsx), [src/app/api/taiger/context/route.ts:11](../src/app/api/taiger/context/route.ts), [src/app/api/admin/users/route.ts:19](../src/app/api/admin/users/route.ts))
- `rounds.status` en SQL solo permite `in_progress | closed | official`, pero el backend escribe `completed` ([supabase/migrations/001_initial_schema.sql:98](../supabase/migrations/001_initial_schema.sql), [src/app/api/game/route.ts:154](../src/app/api/game/route.ts))
- la UI depende de `completed` para marcar rondas terminadas ([src/app/organizador/[slug]/scoring/page.tsx:355](../src/app/organizador/[slug]/scoring/page.tsx), [src/app/organizador/[slug]/scoring/page.tsx:599](../src/app/organizador/[slug]/scoring/page.tsx))
- el repo documenta "schema BD critico", pero el SQL inicial no representa lo que el codigo usa hoy ([README.md](../README.md), [src/types/database.ts](../src/types/database.ts))

Decision recomendada:
- definir una fuente unica de verdad del schema productivo
- congelar naming y enum de estados antes de seguir agregando features
- separar "schema legacy", "schema requerido por app actual" y "sql pendiente"

### P0. Endpoint central de scoring usa service role sin auditoria ni controles de integridad suficientes

Estado: confirmado en codigo

Impacto real:
- un bug en autorizacion o payload puede alterar scores oficiales
- no queda trazabilidad para disputas, correcciones o fraude
- en produccion esto afecta confianza del producto, no solo seguridad tecnica

Evidencia:
- `/api/game` instancia cliente con `SUPABASE_SERVICE_ROLE_KEY` ([src/app/api/game/route.ts:29](../src/app/api/game/route.ts), [src/app/api/game/route.ts:66](../src/app/api/game/route.ts))
- el endpoint sobrepasa RLS para grabar `hole_scores` y `rounds` ([src/app/api/game/route.ts:125](../src/app/api/game/route.ts), [src/app/api/game/route.ts:143](../src/app/api/game/route.ts))
- existe tabla `score_audit_log`, pero el flujo no inserta ningun registro de auditoria ([supabase/migrations/001_initial_schema.sql:145](../supabase/migrations/001_initial_schema.sql), [src/app/api/game/route.ts](../src/app/api/game/route.ts))
- no hay validacion de transicion de estados ni bloqueo por ronda cerrada/oficial antes de actualizar scores

Decision recomendada:
- tratar `/api/game` como superficie critica de negocio
- exigir auditoria de cada cambio, razon y actor
- definir reglas de edicion por estado antes de abrir a usuarios reales

### P1. Login OAuth callback tiene riesgo de open redirect

Estado: confirmado en codigo

Impacto real:
- permite redireccionar al usuario autenticado a una ruta arbitraria si `next` no se sanea
- degrada confianza y puede facilitar phishing interno de sesion

Evidencia:
- `next` entra desde querystring y se concatena directo a la URL final ([src/app/auth/callback/route.ts:9](../src/app/auth/callback/route.ts), [src/app/auth/callback/route.ts:24](../src/app/auth/callback/route.ts), [src/app/auth/callback/route.ts:34](../src/app/auth/callback/route.ts))
- no hay validacion de que `next` sea ruta relativa segura

Decision recomendada:
- permitir solo rutas internas que empiecen con `/`
- rechazar URLs absolutas, dobles slash y patrones ambiguos

### P1. El flujo de ronda libre persiste scoring critico directamente desde cliente y en localStorage

Estado: confirmado en codigo

Impacto real:
- el score de una ronda social se puede desalinear entre participantes
- el modelo actual favorece conflictos de concurrencia y ultima escritura gana
- dificulta evolucionar a score validado, historial confiable o anti-cheat

Evidencia:
- el score se guarda directamente en `ronda_libre_jugadores.scores` desde cliente ([src/app/ronda-libre/[codigo]/score/page.tsx:236](../src/app/ronda-libre/[codigo]/score/page.tsx), [src/app/ronda-libre/[codigo]/score/page.tsx:249](../src/app/ronda-libre/[codigo]/score/page.tsx))
- hay respaldo local en `localStorage` por jugador ([src/app/ronda-libre/[codigo]/score/page.tsx:45](../src/app/ronda-libre/[codigo]/score/page.tsx), [src/app/ronda-libre/[codigo]/score/page.tsx:51](../src/app/ronda-libre/[codigo]/score/page.tsx))
- el flujo finaliza redireccionando sin cerrar estado de ronda ni confirmar consistencia multiusuario ([src/app/ronda-libre/[codigo]/score/page.tsx:321](../src/app/ronda-libre/[codigo]/score/page.tsx), [src/app/ronda-libre/[codigo]/score/page.tsx:338](../src/app/ronda-libre/[codigo]/score/page.tsx))

Decision recomendada:
- definir si ronda libre es "casual no oficial" o "score compartido confiable"
- si es confiable, el estado no puede depender de merge cliente + localStorage

### P1. Admin dashboard depende de una whitelist hardcodeada por email

Estado: confirmado en codigo

Impacto real:
- no escala a equipo, soporte, backoffice o delegacion
- no hay separacion entre entorno, datos y permisos
- expone un anti-patron que termina duplicandose en mas superficies

Evidencia:
- admins definidos en codigo ([src/lib/admin.ts:1](../src/lib/admin.ts))
- rutas admin se protegen solo con `isAdmin(user?.email)` ([src/app/api/admin/health/route.ts:8](../src/app/api/admin/health/route.ts), [src/app/api/admin/overview/route.ts:8](../src/app/api/admin/overview/route.ts), [src/app/api/admin/users/route.ts:8](../src/app/api/admin/users/route.ts))

Decision recomendada:
- mover autorizacion a datos o claims
- distinguir rol de producto, rol operativo y acceso a metricas sensibles

### P1. Producto promete analitica e inteligencia, pero parte de la data base es incompleta o esta mal segmentada

Estado: confirmado en codigo

Impacto real:
- el usuario puede recibir insight incorrecto o sobrepromesa
- el equipo puede tomar decisiones de growth sobre metricas defectuosas

Evidencia:
- historial calcula birdies/eagles suponiendo par 4 en todos los hoyos ([src/app/perfil/historial/page.tsx:49](../src/app/perfil/historial/page.tsx), [src/app/perfil/historial/page.tsx:53](../src/app/perfil/historial/page.tsx), [src/app/perfil/historial/page.tsx:356](../src/app/perfil/historial/page.tsx))
- `taiger/context` lee `historical_rounds` sin filtrar por usuario actual ([src/app/api/taiger/context/route.ts:12](../src/app/api/taiger/context/route.ts))
- `gwi/torneo/[slug]` calcula historial con `historical_rounds` sin filtrar por jugador y luego busca patrones con `user_id = p.id` donde `p.id` es `players.id`, no `profiles.id` ([src/app/api/gwi/torneo/[slug]/route.ts:92](../src/app/api/gwi/torneo/[slug]/route.ts), [src/app/api/gwi/torneo/[slug]/route.ts:106](../src/app/api/gwi/torneo/[slug]/route.ts))

Decision recomendada:
- bajar el tono de promesa del analisis hasta asegurar segmentacion correcta
- marcar internamente que hoy la capa "insights" no es todavia confiable para decisiones importantes

### P2. Calidad automatizada practicamente ausente para un repo que ya se comporta como producto en produccion

Estado: confirmado en codigo / validacion operativa

Impacto real:
- cada sprint agrega riesgo acumulado
- el costo de corregir inconsistencias de schema y scoring seguira subiendo

Evidencia:
- `package.json` no tiene scripts de test ni typecheck dedicados ([package.json](../package.json))
- `npm run lint` no ejecuta validacion: abre el wizard interactivo de configuracion de Next ([package.json](../package.json))
- no hay configuracion ESLint comprometida en el repo y el comando no es CI-safe

Decision recomendada:
- definir un baseline minimo: lint no interactivo, typecheck, smoke de build y un set corto de pruebas criticas

### P2. Onboarding y creacion de ronda/torneo tienen UX friccionada por dependencia fuerte de base parcialmente configurada

Estado: confirmado en codigo

Impacto real:
- un usuario nuevo o el propio founder puede chocar con errores de setup que parecen errores de producto
- el flujo mezcla casos de uso reales con fallback de entorno de desarrollo

Evidencia:
- crear ronda libre muestra alertas de "ejecuta SQL en Supabase" al usuario final si faltan tablas ([src/app/ronda-libre/nueva/page.tsx:157](../src/app/ronda-libre/nueva/page.tsx), [src/app/ronda-libre/nueva/page.tsx:167](../src/app/ronda-libre/nueva/page.tsx))
- nuevo torneo intenta escribir columnas opcionales y reintenta si el schema no existe ([src/app/organizador/nuevo/NuevoTorneoForm.tsx:178](../src/app/organizador/nuevo/NuevoTorneoForm.tsx), [src/app/organizador/nuevo/NuevoTorneoForm.tsx:186](../src/app/organizador/nuevo/NuevoTorneoForm.tsx))

Decision recomendada:
- separar errores de configuracion interna de errores de usuario
- si el schema no esta listo, el producto debe fallar con degradacion controlada, no con instrucciones tecnicas visibles

## Hallazgos secundarios relevantes

### P2. Generacion de codigo de ronda libre sin garantia de unicidad

Estado: confirmado en codigo

Evidencia:
- codigo de 6 caracteres generado con `Math.random()` sin reintentos ni constraint visible en codigo ([src/app/ronda-libre/nueva/page.tsx:119](../src/app/ronda-libre/nueva/page.tsx))

Riesgo:
- colision baja pero real a medida que crezcan rondas y reintentos

### P2. Falta observabilidad real para produccion

Estado: confirmado en codigo

Evidencia:
- logger solo usa console y deja Sentry "para despues" ([src/utils/logger.ts](../src/utils/logger.ts))
- admin health reporta servicios como `claude` y `garmin` no configurados, pero no existe telemetria de errores de usuario ni trazas de flujo ([src/app/api/admin/health/route.ts](../src/app/api/admin/health/route.ts))

Riesgo:
- cuando falle auth, scoring o SQL, el equipo no tendra evidencia suficiente para diagnosticar rapido

### P2. Middleware protege pocas rutas y no expresa un modelo de acceso completo

Estado: confirmado en codigo

Evidencia:
- solo protege `/dashboard` y `/organizador` ([src/middleware.ts:27](../src/middleware.ts))

Riesgo:
- hay varias paginas que confian en chequeos cliente o server locales en vez de una politica clara y central

### P3. Deuda de consistencia visual y de componentes

Estado: confirmado en codigo

Evidencia:
- gran parte de la app usa estilos inline extensivos en vez de primitives reutilizables en una app que ya tiene bastantes vistas ([src/app/dashboard/page.tsx](../src/app/dashboard/page.tsx), [src/app/perfil/historial/page.tsx](../src/app/perfil/historial/page.tsx), [src/app/organizador/[slug]/scoring/page.tsx](../src/app/organizador/[slug]/scoring/page.tsx))

Riesgo:
- baja velocidad para iterar UX consistente
- aumenta fragilidad mobile y costo de mantenimiento

## Confirmado vs probable vs validacion manual

### Confirmado en codigo

- mismatch de schema `indice` vs `handicap`
- mismatch de estados `completed` vs enum SQL
- admin por email hardcodeado
- callback OAuth con `next` sin sanitizar
- `/api/game` usa service role sin audit log
- GWI/TAIGER consultan historial o patrones con segmentacion incorrecta
- lint no esta realmente configurado

### Probable

- hay SQL manual fuera de migraciones que hoy sostiene el sistema real
- RLS y schema productivo han quedado parcialmente "por fuera" del repo
- parte de las pantallas admin pueden fallar o devolver datos sesgados en entornos nuevos

### Requiere validacion manual

- que SQL exacto esta aplicado hoy en el proyecto Supabase productivo
- si `rondas_libres`, `historical_rounds`, `player_patterns`, `analytics_events` y tablas GWI tienen RLS correcto
- si existen constraints unicos para `rondas_libres.codigo`
- si el flujo OAuth en Vercel esta expuesto a redirecciones abiertas explotables en entorno real

## Oportunidades de producto

- El nucleo valioso ya existe: scoring mobile-first, torneo amateur, ronda libre y capas de insight.
- La mayor oportunidad no es sumar mas features; es convertir los flujos actuales en producto confiable.
- "Confianza del score" parece ser la capacidad central que desbloquea todo lo demas: leaderboard, TV, GWI, coaching, growth loops y monetizacion.

## Recomendacion de secuencia

1. Congelar y reconciliar schema real vs schema versionado.
2. Blindar scoring oficial y auth redirect.
3. Corregir segmentacion de datos para GWI/TAIGER/admin.
4. Instalar baseline de calidad automatizada.
5. Recién despues seguir expandiendo analytics, IA o monetizacion.
