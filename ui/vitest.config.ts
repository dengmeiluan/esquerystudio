import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONTRACT_PATH = fileURLToPath(new URL('../platform/src/main/resources/META-INF/esquerystudio-pages.json', import.meta.url));

/* R57：单测设施 0→1。happy-dom 提供 window/localStorage/sessionStorage，
   覆盖 api 头合并（R55 P0 回归防御）、favReplay 分发矩阵（R54/R56）、纯函数工具。
   秒级反馈，部署链（build-console-starter.ps1）红了即中止。

   #68：加 vue() 插件，让 .vue 能被单测直接挂载。缺陷 #68 的两个成因都只在
   「真组件跑起来」时才现形（一个是模板 v-if 的 step 门，一个是状态更新时序），
   纯函数单测无论写多少条都照不到 —— 61 条 diffConfig 全绿而界面 0 行就是实证。
   @vitejs/plugin-vue 本来就是 devDependency（vite build 在用），零新增依赖。 */
function starterVersion(): string {
  const pom = readFileSync(new URL('../pom.xml', import.meta.url), 'utf8');
  const i = pom.indexOf('<artifactId>esquerystudio</artifactId>');
  const m = i >= 0 ? pom.slice(i, i + 300).match(/<version>([^<]+)<\/version>/) : null;
  return m ? m[1] : 'unknown';
}

export default defineConfig({
  plugins: [vue()],
  define: { __STARTER_VERSION__: JSON.stringify(starterVersion()) },
  resolve: {
    alias: { '@contract': CONTRACT_PATH },
    /* .ts 优先于 .js：src 下存在整树 .js 快照（并行迁移中间态，内容冻结于生成时刻），
       vite 默认 .js 优先会让快照遮蔽 .ts 正源——d469e2c 已修 vite.config.ts 的 build 面，
       vitest 走本配置的 resolver 同病（queryAstOps.ts 新导出在 vitest 里读成 .js 快照
       实锤），同语义补齐：tracked .ts 是正源。 */
    extensions: ['.mts', '.ts', '.mjs', '.jsx', '.tsx', '.js', '.json'],
  },
  server: { fs: { allow: ['..'] } }, // 契约 JSON 在 platform/ 模块内
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
    /* 242 批：串行跑文件——AdhocRebuildView 引入 naive-ui（NModal）后其全量模块进
       挂载类 spec 的模块图，并发 worker 下内存/CPU 放大使最重的挂载用例偶发超时
       （单跑恒绿、串行 2757 全绿实证）。正确性优先，接受串行时长。 */
    fileParallelism: false,
    /* 242 批：全局 fetch 兜底——组件挂载类 spec 并发跑时，个别未逐 spec mock 的
       相对路径请求（store 轮询等）会打到 happy-dom 默认 origin(localhost:3000) 的真实
       网络上，ECONNREFUSED 以 unhandledrejection 形态偶发击穿用例（单跑恒绿）。
       兜底为同源空 200：被测语义永远走各 spec 自己的 api mock，此处只吸网络噪声。 */
    setupFiles: ['src/__tests__/setupFetchGuard.ts'],
  },
});
