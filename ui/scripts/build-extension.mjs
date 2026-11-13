/* Build the same Vue console in `browser` mode for the Chrome extension.
 * Run from ui/: `npm run build:extension`.
 * The only Chrome-specific change is an external boot script (MV3 CSP blocks inline JS). */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ui = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(ui, '..', 'extensions', 'chrome', 'app');
execSync(`npx vite build --mode browser --outDir ${JSON.stringify(out)} --emptyOutDir`, {
  cwd: ui, stdio: 'inherit', shell: true,
});
const index = join(out, 'index.html');
let html = readFileSync(index, 'utf8');
html = html.replace(/<script>try\{.*?<\/script>/, '<script src="./boot.js"></script>');
writeFileSync(index, html, 'utf8');
writeFileSync(join(out, 'boot.js'), [
  "try{var ht=new URLSearchParams(location.search).get('hostTheme');",
  "var t=localStorage.getItem('es_theme');",
  "var mode=t||(window.parent!==window?'host':'dark');",
  "var eff=mode==='host'?(ht==='light'?'light':'dark'):(mode==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode);",
  "if(eff==='light'){document.documentElement.style.background='#f7f8fa';}",
  "}catch(e){}\n",
].join(''), 'utf8');
console.log('[extension] built browser-mode Vue console -> extensions/chrome/app');
