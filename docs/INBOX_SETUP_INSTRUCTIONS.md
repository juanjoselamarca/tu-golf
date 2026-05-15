# Inbox System — Runbook

Sistema de Inbox del Agente 5A. Recibe mensajes de Telegram (`@Golfers_App_Bot`)
y los persiste en Supabase para triage de Claude vía `/inbox`.

## Tu intervención total: ~3 minutos en 3 toques

1. **Pegar token de Telegram en `.env.local`** (1 min) — único blocker
   pre-trabajo de Claude.
2. **Mergear el PR** después de revisarlo (1 min).
3. **`/start` al bot + pegar tu chat_id al chat de Claude + mandar foto de
   prueba** (1 min).

Todo lo demás lo hace Claude solo.

---

## Paso a paso

### 1. Crear el bot (solo vos podés — BotFather)

Si todavía no lo hiciste:

1. Abrí Telegram → buscá `@BotFather` → `/newbot`.
2. Nombre: `Golfers+ Inbox` (lo que ve el usuario).
3. Username: `Golfers_App_Bot` (ya está creado).
4. BotFather te responde con el token (formato `1234567890:ABCdef...`).
5. Abrí `.env.local` con tu editor y agregá al final:
   ```
   TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
   ```
   Guardá. Cerrá.

### 2. Avisar a Claude

Decile "token listo en `.env.local`". Claude continúa autónomamente:

- Genera `TELEGRAM_WEBHOOK_SECRET` e `INBOX_SETUP_SECRET` random (32 chars).
- Aplica la migration de Supabase (con verificación de idempotencia).
- Corre tests, tsc, build, lint, graphify.
- Commit + push + abre PR contra main.
- **Intenta** subir las 4 vars a Vercel via REST API. Si el token cacheado
  de Vercel CLI está vencido, omite este paso y deja instrucciones para
  vos (ver paso 3.5).

### 3. Revisar y mergear el PR

Claude te pasa el link del PR. Lo revisás, lo mergeás. Vercel auto-deployea
production en ~2-3 min.

### 3.5. Subir secrets a Vercel (si Claude no pudo)

Si Claude reportó que el token Vercel cacheado estaba vencido, hay que
renovar antes de que el bot funcione. **30 segundos**:

1. Asegurarte que Vercel CLI está instalado:
   ```powershell
   npm i -g vercel
   ```
2. Loguearte (abre el browser para autorizar):
   ```powershell
   vercel login
   ```
3. Re-correr el script de sync:
   ```powershell
   node --env-file=.env.local scripts/setup-inbox-vercel-env.mjs
   ```

Este paso sube las 4 env vars (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`INBOX_SETUP_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID` vacío por ahora) a Vercel
con `type=encrypted` y `target=[production, preview, development]`.

### 4. Configurar el webhook

Una vez deployado, Claude llama:

```
GET https://golfersplus.vercel.app/api/inbox/setup?key=<INBOX_SETUP_SECRET>
```

Esto le dice a Telegram que mande updates a tu webhook. Idempotente:
re-llamarlo no rompe nada.

### 5. Obtener tu `chat_id` (solo vos podés)

Abrí Telegram, buscá `@Golfers_App_Bot`, mandale `/start`. El bot te responde
con:

```
Tu chat_id es: 123456789
```

**Copiá ese número y pegalo al chat de Claude** (sin formato especial, solo
el número).

### 6. Test E2E

Claude te pide que mandes "test" + 1 foto al bot. Verifica:

- Bot responde "✓ recibido" en <5s.
- Hay una row nueva en `inbox_reports` con `status='nuevo'`.
- Hay un archivo en `storage.objects` del bucket `inbox-photos`.

Si ✅ → sistema listo. A partir de ahora, cualquier mensaje al bot crea un
reporte y Claude puede triagearlo con `/inbox` (Agente 5B, próximo).

---

## Verificación manual del estado actual

En cualquier momento, podés chequear:

- **Webhook status**:
  ```
  GET https://golfersplus.vercel.app/api/inbox/setup?key=<INBOX_SETUP_SECRET>
  ```
  Devuelve `getWebhookInfo` con `url`, `pending_update_count`, `last_error_*`.

- **Pendientes en BD** (desde Supabase Studio o `run-sql.mjs`):
  ```sql
  SELECT count(*) FROM inbox_reports WHERE status='nuevo';
  SELECT id, recibido_en, status, prioridad, texto
  FROM inbox_reports
  ORDER BY recibido_en DESC
  LIMIT 10;
  ```

- **Logs de Vercel**:
  ```
  Vercel dashboard → Functions → /api/inbox/webhook → Logs
  ```
  Buscar `level:"error"` para incidentes.

---

## Troubleshooting

**El bot no responde al `/start`**: el webhook no está configurado.
Re-llamar el setup endpoint.

**El webhook responde 401**: `TELEGRAM_WEBHOOK_SECRET` está mal sincronizado
entre Vercel y Telegram. Re-correr:
```bash
node --env-file=.env.local scripts/setup-inbox-vercel-env.mjs
```
y después el setup endpoint.

**Mando un mensaje y no llega a la BD**: chat_id no autorizado. Verificar
que `TELEGRAM_ALLOWED_CHAT_ID` en Vercel coincide con tu chat. El bot
devuelve 200 silencioso intencional para no leakear su existencia.

**El bot dice "❌ archivo muy grande" con una foto chica**: chequear el
`file_size` que reporta Telegram en `getFile`. Es el size original; puede
haber compresión preview que dispara falsos positivos. Cap actual: 10MB.

**El bot dice "❌ tipo de archivo no soportado"**: estás mandando algo que
no está en el MIME whitelist. Permitidos: jpeg, png, webp (fotos), ogg, mpeg
(audio). PDFs y videos no se aceptan por ahora.
