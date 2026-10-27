# Setup de Instagram, Meta y el bot RRSS — pasos de Juanjo

> Estado verificado el 27-oct-2026 mirando las cuentas, no de memoria.
> Diseño del sistema: `docs/superpowers/specs/2026-10-26-rrss-sistema-design.md`.
> Los nombres de los botones de Meta cambian seguido: si alguno no calza exacto, busca el más parecido.

## Dónde estamos

| Paso | Estado |
| --- | --- |
| 1. Instagram profesional | ✅ Listo. `@golfers.plus` ya es cuenta profesional, categoría "Deportes y ocio", con correo público y link a `golfersplus.vercel.app`. |
| 2. Cuenta de Facebook | ⛔ **Te toca a ti.** Es el único bloqueo real. |
| 3. App en Meta y token de publicación | ⏸ Depende del paso 2. |
| 4. Bot RRSS en Telegram | 🟡 Creado (`@golfersplus_rrss_bot`). Falta que pegues el token y le escribas `/start`. |

## 2. Cuenta de Facebook (5 min) — el bloqueo

Tu cuenta de Meta (`juanjoselamarca@gmail.com`) hoy tiene **un solo perfil**: el de Instagram. Sin perfil
de Facebook no hay forma de entrar a `developers.facebook.com` — lo verifiqué: la única puerta para crear
cuenta ahí es "Regístrate con Facebook", no existe vía solo-Instagram.

Yo no puedo crear cuentas (es una de las cosas que no hago, por diseño). Tú:

1. Entra a **facebook.com** → **Crear cuenta nueva**, con el mismo correo `juanjoselamarca@gmail.com`.
2. No hace falta publicar nada ni buscar amigos. El perfil solo existe para ser el dueño de la app.
3. Cuando esté, avísame y sigo con el paso 3 sin molestarte más (salvo un token que copiar).

## 3. App en Meta para publicar (15 min, desde el computador)

1. Entra a **developers.facebook.com** con tu usuario de Facebook → **Mis apps** → **Crear app**.
2. Caso de uso: **Administrar mensajes y contenido en Instagram** (Instagram API). Tipo: **Empresa**.
   Nombre: `Golfers+ RRSS`.
3. En la app: **Roles de la app** → **Roles** → **Agregar personas** → **Evaluador de Instagram** →
   escribe `golfers.plus`.
4. En Instagram: **Configuración** → **Apps y sitios web** → **Invitaciones de evaluador** → **Aceptar**.
5. De vuelta en la app de Meta: **Configuración de la API con inicio de sesión de Instagram** →
   **Generar token** junto a la cuenta → inicia sesión en Instagram y acepta los permisos:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
   - `instagram_business_manage_insights`
6. Pega el token en `.env.local` como `RRSS_META_TOKEN=...` y avísame. No lo escribas en el chat:
   así no queda en ningún transcript. Yo lo subo a Vercel como secreto y lo renuevo cada 60 días.

No hace falta App Review: publicar en la cuenta propia funciona con el acceso estándar.

## 4. Bot RRSS en Telegram — falta el token

El bot ya está creado: **`@golfersplus_rrss_bot`**, nombre "Golfers+ RRSS". Es un bot distinto del de
reportes (`@Golfers_App_Bot`), para que nada de Instagram se mezcle con los bugs.

Te quedan dos cosas de 30 segundos:

1. En el chat de **@BotFather** está el token que te devolvió al crearlo (empieza con números y dos
   puntos). Pégalo en `.env.local` como `RRSS_TELEGRAM_BOT_TOKEN=...`. Si no lo encuentras, mándale
   `/token` a BotFather y elige el bot.
2. Abre **@golfersplus_rrss_bot** y escríbele `/start`, para que pueda mandarte las tandas a aprobar.

Igual que el de Meta: no lo escribas en el chat, solo en `.env.local`. Con eso yo saco tu `chat_id`
desde la API y queda configurado.

## 5. Opcional: página de Facebook

Solo si quieres usar música en tendencia en los reels. Una vez que exista el perfil de Facebook, crea una
página de Golfers+ y vincúlala en Instagram → **Centro de cuentas**. Sin esto, los reels usan voz en off
y música con licencia, que es lo que tenía planificado de todas formas.

## Qué hago yo con esto

- Guardo los dos tokens como secretos y pruebo que publicar y leer métricas funcione (con una
  publicación de prueba que te muestro antes).
- Dejo un aviso automático en el bot si el token de Meta está por vencer.
- Mientras esto siga bloqueado, las piezas se renderizan igual y quedan en `out/rrss/` para que las
  mires; lo único que no puedo hacer es publicarlas solo.
