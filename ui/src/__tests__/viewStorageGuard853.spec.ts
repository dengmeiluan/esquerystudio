/* 视图/组件层存储通道写入防御看守（853 批·852 kernel 层约定的视图层合并件）。
 *
 * 852 批 G 系看守域=kernel（composables/stores/utils + api.ts + router.ts），
 * 视图/组件层 89 位点/32 文件备案下批（853 实勘口径=剥注释后代码域，与 852
 * 备案吻合）；853 批全量合并进 utils/safeJson 单源
 * （writeStoredRaw/removeStoredRaw——try+吞异常+回执布尔），本守卫把看守域
 * 扩满全站：
 *  - G3：views/+components/ 裸写恒零（全站最后一个裸写域清零，无正面清单）。
 *  - G4：33 合并文件单源接线在场 + safeJson import 在场（文件集冻结，只减不增）。
 *  - W9：视图层代表链行为锁——SideNav 组折叠持久化，配额抛写环境下不外抛、
 *        内存态照常翻转、存储值保持旧值（存储不可用 ≠ 交互不可用）。
 *
 * 探针课承 852：配额膛=spy 实例自身属性（原型 patch 不经实例分发）；拆膛持
 * 引用逐个 mockRestore（restoreAllMocks 对本环境实例 spy 不还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import SideNav from '../components/SideNav.vue';
import { useAuthStore } from '../stores/auth';

const srcDir = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(srcDir, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const RAW_OP = /(localStorage|sessionStorage)\.(setItem|removeItem)\(/;
const WIRING = /(writeStoredRaw|removeStoredRaw)\(/;

/* 853 合并文件集（时点实勘 89 位点/32 文件，剥注释代码域口径；只减不增） */
const COLLECTED = [
  'views/DslQueryView.vue',
  'views/QueryHubView.vue',
  'components/CmdPalette.vue',
  'views/DevToolsView.vue',
  'views/WatcherView.vue',
  'views/SqlConsoleView.vue',
  'views/PitScrollView.vue',
  'views/IndexHubView.vue',
  'views/WorkspaceView.vue',
  'views/TemplateGalleryView.vue',
  'views/SqlBridgeView.vue',
  'views/SearchSandboxView.vue',
  'views/RemoteClustersView.vue',
  'views/MatchMatrixView.vue',
  'views/LuceneQueryView.vue',
  'views/IlmView.vue',
  'views/FavoritesView.vue',
  'components/SideNav.vue',
  'views/UpdateByQueryView.vue',
  'views/SearchTemplatesView.vue',
  'views/RestView.vue',
  'views/ReindexPreviewView.vue',
  'views/ReindexAdvancedView.vue',
  'views/PainlessLabView.vue',
  'views/MappingView.vue',
  'views/LifecycleView.vue',
  'views/HealthReportView.vue',
  'views/DiffEditorView.vue',
  'views/BulkEditorView.vue',
  'views/BoostTunerView.vue',
  'views/AdhocRebuildView.vue',
  'components/WelcomeWizard.vue',
];

let quotaSpies: Array<{ mockRestore: () => void }> = [];
function armQuotaFailure() {
  quotaSpies = [];
  for (const st of [localStorage, sessionStorage] as const) {
    quotaSpies.push(
      vi.spyOn(st, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError (simulated)');
      }),
      vi.spyOn(st, 'removeItem').mockImplementation(() => {
        throw new Error('QuotaExceededError (simulated)');
      }),
    );
  }
}

describe('viewStorageGuard853 · 视图/组件层存储写入防御', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    quotaSpies.forEach((s) => s.mockRestore());
    quotaSpies = [];
    vi.restoreAllMocks();
  });

  /* —— G 组：全站看守（853 起视图/组件层入域） —— */

  it('G3 views/components 裸写恒零（853 合并后全站最后裸写域清零）', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        const st = statSync(p);
        if (st.isDirectory()) { if (f !== '__tests__') walk(p); }
        else if (/\.vue$/.test(f)) files.push(p);
      }
    };
    walk(join(srcDir, 'views'));
    walk(join(srcDir, 'components'));
    const dirty: string[] = [];
    for (const p of files) {
      const rel = p.replace(/\\/g, '/').split('/src/').pop() as string;
      const lines = stripComments(readFileSync(p, 'utf8')).split('\n');
      lines.forEach((ln, i) => {
        if (RAW_OP.test(ln)) dirty.push(`${rel}:${i + 1}`);
      });
    }
    expect(dirty, '视图/组件层裸写复燃（须走 writeStoredRaw/removeStoredRaw 单源）：\n' + dirty.join('\n')).toEqual([]);
  });

  it('G4 合并文件集冻结：32 文件单源接线 + safeJson import 在场', () => {
    for (const f of COLLECTED) {
      const code = read(f);
      expect(code, `${f} 缺 safeJson import`).toContain("from '../utils/safeJson'");
      expect(code, `${f} 缺单源接线`).toMatch(WIRING);
    }
  });

  /* —— W 组：行为锁（视图层代表链抽针） —— */

  it('W9 SideNav 组折叠链：配额抛写下不外抛、内存态翻转、存储保持旧值', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    });
    await router.push('/');
    await router.isReady();
    const host = document.createElement('div');
    document.body.appendChild(host);
    /* 探测在途不出菜单（身份确认中态）：折叠链用例需先落定探测态，菜单组才渲染 */
    useAuthStore().probed = true;
    const app = createApp({ render: () => h(SideNav) });
    app.use(pinia);
    app.use(router);
    app.config.warnHandler = () => {};
    app.mount(host);
    await nextTick();
    try {
      const hd = host.querySelector('.nav-g-hd') as HTMLElement;
      expect(hd).toBeTruthy();
      const LS_KEY = 'esquerystudio.nav.collapsed';
      /* 阶段一（无膛）：点击翻转并持久化=链路本身是活的 */
      hd.click();
      await nextTick();
      expect(hd.getAttribute('aria-expanded')).toBe('false');
      const stored1 = localStorage.getItem(LS_KEY);
      expect(stored1).not.toBeNull();
      /* 阶段二（上膛）：再点击不外抛、内存态翻转、存储保持旧值 */
      armQuotaFailure();
      expect(() => hd.click()).not.toThrow();
      await nextTick();
      expect(hd.getAttribute('aria-expanded')).toBe('true');
      expect(localStorage.getItem(LS_KEY)).toBe(stored1);
    } finally {
      quotaSpies.forEach((s) => s.mockRestore());
      quotaSpies = [];
      app.unmount();
      host.remove();
    }
  });
});
