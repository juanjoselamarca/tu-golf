# Setup de Instagram, Meta y el bot RRSS — pasos de Juanjo

> Una sola vez, unos 30 minutos. Son los pasos que solo puede hacer el dueño de la cuenta.
> Diseño del sistema: `docs/superpowers/specs/2026-10-26-rrss-sistema-design.md`.
> Los nombres de los botones de Meta cambian seguido: si alguno no calza exacto, busca el más parecido.

## 1. Instagram profesional (5 min, desde el teléfono)

1. Instagram → tu perfil de Golfers+ → menú ☰ → **Configuración y privacidad**.
2. **Tipo de cuenta y herramientas** → **Cambiar a cuenta profesional**.
3. Elige **Empresa** (no Creador). Categoría: **Aplicación** o **Software**.
4. No hace falta conectar una página de Facebook en este paso.

## 2. App en Meta para publicar (15 min, desde el computador)

1. Entra a **developers.facebook.com** con tu usuario de Facebook → **Mis apps** → **Crear app**.
2. Caso de uso: **Administrar mensajes y contenido en Instagram** (Instagram API). Tipo: **Empresa**.
   Nombre: `Golfers+ RRSS`.
3. En la app: **Roles de la app** → **Roles** → **Agregar personas** → **Evaluador de Instagram** →
   escribe el usuario de Instagram de Golfers+.
4. En Instagram: **Configuración** → **Apps y sitios web** → **Invitaciones de evaluador** → **Aceptar**.
5. De vuelta en la app de Meta: **Configuración de la API con inicio de sesión de Instagram** →
   **Generar token** junto a la cuenta → inicia sesión en Instagram y acepta los permisos:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
   - `instagram_business_manage_insights`
6. Copia el token que aparece y pásamelo por aquí. Yo lo guardo como secreto (no queda en el repo)
   y lo renuevo solo cada 60 días.

No hace falta App Review: publicar en la cuenta propia funciona con el acceso estándar.

## 3. Bot RRSS en Telegram (5 min)

1. En Telegram, abre **@BotFather** → escribe `/newbot`.
2. Nombre: `Golfers+ RRSS`. Usuario: uno que termine en `bot`, por ejemplo `golfersplus_rrss_bot`.
3. BotFather te devuelve un token (empieza con números y dos puntos). Pásamelo por aquí.
4. Abre el bot nuevo y escríbele `/start`, para que pueda mandarte las tandas a aprobar.

Es un bot distinto del de reportes (`@Golfers_App_Bot`), para que nada de Instagram se mezcle con los bugs.

## 4. Opcional: página de Facebook

Solo si quieres usar música en tendencia en los reels. Crea una página de Facebook de Golfers+ y
vincúlala en Instagram → **Centro de cuentas**. Sin esto, los reels usan voz en off y música con licencia.

## Qué hago yo con esto

- Guardo los dos tokens como secretos y pruebo que publicar y leer métricas funcione (con una
  publicación de prueba que te muestro antes).
- Dejo un aviso automático en el bot si el token de Meta está por vencer.
