import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONTRACT_PATH = fileURLToPath(new URL('../platform/src/main/resources/META-INF/esquerystudio-pages.json', import.meta.url));

function starterVersion(): string {
  const pom = readFileSync(new URL('../pom.xml', import.meta.url), 'utf8');
  const i = pom.indexOf('<artifactId>esquerystudio</artifactId>');
  const m = i >= 0 ? pom.slice(i, i + 300).match(/<version>([^<]+)<\/version>/) : null;
  return m ? m[1] : 'unknown';
}

/* 静态演示构建：与 server 同一套 Vue 源码，api.ts 的 transport 切到 demoApi。
   产出 dist/demo，可部署到任意静态站点（默认 GitHub Pages）。 */
export default defineConfig({
  plugins: [vue()],
  base: './',
  define: { __STARTER_VERSION__: JSON.stringify(starterVersion()) },
  resolve: {
    alias: { '@': '/src', '@contract': CONTRACT_PATH },
    extensions: ['.mts', '.ts', '.mjs', '.jsx', '.tsx', '.js', '.json'],
  },
  build: {
    outDir: '../dist/demo',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) return 'vendor';
          if (id.includes('node_modules/monaco-editor')) return 'monaco';
          if (/node_modules[\\/](vue|@vue|vue-router|pinia|naive-ui)[\\/]/.test(id)) return 'vendor';
        },
      },
    },
  },
});
