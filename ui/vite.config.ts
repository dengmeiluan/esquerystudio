import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONTRACT_PATH = fileURLToPath(new URL('../platform/src/main/resources/META-INF/esquerystudio-pages.json', import.meta.url));

/* 2.5.0：starter 版本构建期注入（接入文档抽屉展示 Maven 坐标用）。
   ESM 配置无 __dirname，用 import.meta.url 定位；锁定本 starter artifactId 后 300 字符窗口内的
   version，防误抓 parent pom 的版本。 */
function starterVersion(): string {
  const pom = readFileSync(new URL('../pom.xml', import.meta.url), 'utf8');
  const i = pom.indexOf('<artifactId>esquerystudio</artifactId>');
  const m = i >= 0 ? pom.slice(i, i + 300).match(/<version>([^<]+)<\/version>/) : null;
  return m ? m[1] : 'unknown';
}

export default defineConfig({
  plugins: [vue()],
  base: './',
  define: { __STARTER_VERSION__: JSON.stringify(starterVersion()) },
  resolve: {
    alias: { '@': '/src', '@contract': CONTRACT_PATH },
    /* .ts 优先于 .js：src 下存在整树 .js 快照（并行迁移中间态，内容冻结于生成时刻），
       默认 .js 优先会让快照遮蔽 .ts 正源——对 app.ts/router.ts 的修复全部静默失效
       （1.0.42 前的产线 bundle 实锤）。.ts 是 tracked 正源，必须先解析。 */
    extensions: ['.mts', '.ts', '.mjs', '.jsx', '.tsx', '.js', '.json'],
  },
  build: {
    outDir: '../modules/console/src/main/resources/static/esquerystudio',
    emptyOutDir: true,
    sourcemap: false, /* 三百一十七批：显式关闭（默认即 false，写明防有人顺手打开泄漏源码进产线 jar） */
    chunkSizeWarningLimit: 6000, /* 300 批注：monaco chunk ~2.9MB 为既有取舍，非失控信号 */
    rollupOptions: {
      output: {
        /* R92-B2：必须用函数形式——对象形式下 vite 的 preload-helper 虚拟模块会被 Rollup 塞进
           monaco chunk（monaco esm 内部也有动态 import），入口因此静态依赖 monaco，
           index.html 被注入 modulepreload，首屏白驮 2.8MB（产线 1.30.4 实锤） */
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) return 'vendor'; // 共享 helper 钉进 vendor，断入口→monaco 静态链
          if (id.includes('node_modules/monaco-editor')) return 'monaco';
          if (/node_modules[\\/](vue|@vue|vue-router|pinia|naive-ui)[\\/]/.test(id)) return 'vendor';
        },
      },
    },
  },
  /* 页面契约 JSON 在 platform/ 模块内，dev 服务器放行上层目录 */
  server: { port: 5174, fs: { allow: ['..'] } },
});
