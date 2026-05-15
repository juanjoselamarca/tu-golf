/**
 * scripts/inbox-download.mjs
 *
 * Descarga una foto del bucket inbox-photos via signed URL.
 *
 * Uso:
 *   node --env-file=.env.local scripts/inbox-download.mjs \
 *     --path=reports/2026/05/abc.jpg \
 *     --out=.claude/inbox-cache/abc.jpg
 *
 * Spec: docs/superpowers/specs/2026-05-15-inbox-5b-consumer-design.md §3.3 PASO 1
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)=(.*)$/);
      return m ? [m[1], m[2]] : [a, true];
    }),
  );
  const storagePath = args.path;
  const outFile = args.out;
  if (!storagePath || !outFile) {
    console.error('Uso: --path=reports/.../abc.jpg --out=.claude/inbox-cache/abc.jpg');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Supabase env vars missing');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.storage
    .from('inbox-photos')
    .createSignedUrl(storagePath, 3600);
  if (error) {
    console.error('signed url error:', error.message);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await new Promise((resolve, reject) => {
    https
      .get(data.signedUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const f = fs.createWriteStream(outFile);
        res.pipe(f);
        f.on('finish', () => f.close(resolve));
        f.on('error', reject);
      })
      .on('error', reject);
  });
  console.log(`saved: ${outFile} (${fs.statSync(outFile).size} bytes)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
