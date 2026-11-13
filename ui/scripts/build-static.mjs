/* Build the same Vue console as a plain static directory (no Spring Boot, no extension).
 *
 * Output: dist/esquerystudio-static/ — serve it from nginx/any static host. The app
 * connects directly to Elasticsearch from the browser, so Elasticsearch must allow
 * the page origin via CORS (see docs/browser-mode.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ui = dirname(dirname(fileURLToPath(import.meta.url)));
const root = dirname(ui);
const out = join(root, 'dist', 'esquerystudio-static');
execSync(`npx vite build --mode browser --outDir ${JSON.stringify(out)} --emptyOutDir`, {
  cwd: ui, stdio: 'inherit', shell: true,
});

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'DEPLOY.txt'), [
  'ESQueryStudio static build',
  '',
  '1. Serve this directory over HTTP (not file://).',
  '2. Elasticsearch must allow this page origin:',
  '   http.cors.enabled: true',
  '   http.cors.allow-origin: "https://your-console.example.com"',
  '   http.cors.allow-headers: X-Requested-With,Content-Type,Content-Length,Authorization',
  '3. Open index.html and connect with an ES account/API key.',
  '',
  'The first-run dialog probes GET / and shows the cluster version before entering.',
  'MCP keys are a server-mode feature; in static mode use window.ESQueryStudioMCP for in-page agents.',
].join('\n'), 'utf8');

const zip = join(root, 'dist', 'esquerystudio-static.zip');
try {
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${out.replace(/'/g, "''")}\\*' -DestinationPath '${zip.replace(/'/g, "''")}' -Force"`, {
      stdio: 'inherit', shell: true,
    });
  } else {
    execSync(`cd ${JSON.stringify(out)} && zip -qr ${JSON.stringify(zip)} .`, {
      stdio: 'inherit', shell: true,
    });
  }
  console.log('[static] ' + zip);
} catch {
  console.log('[static] zip unavailable; directory is ready at dist/esquerystudio-static');
}
