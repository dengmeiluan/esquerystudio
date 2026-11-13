/**
 * 七百四十二批·件B：G151 指南弹窗带名残留收口（R123 随批小刀；741 批观察新记）。
 *
 * 病灶（741 批 probe D3 时序暴露）：行菜单「安装/卸载指南」带名打开过弹窗后，
 * 页头/空态的「安装指南」钮直接 `showGuide = true` 开弹窗而不清 currentPlugin——
 * 空开仍显示上次插件名（pill + aria-label 带名 + 示例码用旧插件名），
 * 与「通用安装指南」语义不符（示例码 analysis-ik 兜底恒在场缓解了码面，pill 面裸露）。
 *
 * 修法（741 批备案候选）：两钮改走 openGuide('') 空名清名一行刀（×2 处：
 * 页头 PageHeader actions 钮 + 空态 EmptyState 插槽钮）——openGuide 先置
 * currentPlugin 再开弹窗，空名即清名，行菜单带名路径不受扰。
 *
 * 驱动范式照 pluginsFirstCut741（vue-router 轻 mock + 只 mock ../api +
 * Monaco stub）。断言域：.pl-mo-b 弹窗在 host 内（非 teleport），CellContextMenu
 * 菜单项在 document.body（741-② 断言域与 teleport 目标对齐）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

const routeMock = { path: '/plugins', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* JsonArea 内核=Monaco——happy-dom canvas 崩（pluginsFirstCut741 同款 stub；
   本 spec 对编辑器内容零驱动，RawIoModal 内 Monaco 只读不涉） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

const pluginsMatrixFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      pluginsMatrix: (...a: any[]) => pluginsMatrixFn(...a),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import PluginsView from '../views/PluginsView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const app = createApp({ render: () => h(PluginsView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: HTMLElement, re: RegExp): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => re.test((b.textContent || '').replace(/\s+/g, '')));
  expect(btn, `按钮必须存在：${re}`).toBeTruthy();
  return btn!;
}

function collapse(s: string | null): string { return (s || '').replace(/\s+/g, ''); }

const PLUGINS_OK = {
  available: true, reason: '',
  nodeCount: 3, pluginCount: 4,
  mismatches: ['mapper-murmur3'],
  nodes: [
    { name: 'es-node-1', component: 'analysis-ik', version: '7.10.0', description: 'IK 分词器' },
    { name: 'es-node-2', component: 'analysis-ik', version: '7.10.0', description: 'IK 分词器' },
    { name: 'es-node-3', component: 'analysis-ik', version: '7.10.0', description: 'IK 分词器' },
    { name: 'es-node-1', component: 'mapper-murmur3', version: '7.10.0', description: 'murmur3 哈希映射' },
    { name: 'es-node-2', component: 'mapper-murmur3', version: '7.10.0', description: 'murmur3 哈希映射' },
    { name: 'es-node-1', component: 'ingest-attachment', version: '7.10.0', description: '附件摄取' },
    { name: 'es-node-2', component: 'ingest-attachment', version: '7.10.0', description: '附件摄取' },
    { name: 'es-node-3', component: 'ingest-attachment', version: '7.10.0', description: '附件摄取' },
    { name: 'es-node-1', component: 'repository-s3', version: '7.10.0', description: 'S3 快照仓库' },
    { name: 'es-node-2', component: 'repository-s3', version: '7.10.0', description: 'S3 快照仓库' },
    { name: 'es-node-3', component: 'repository-s3', version: '7.10.0', description: 'S3 快照仓库' },
  ],
  summary: [
    { plugin: 'analysis-ik', installedOn: ['es-node-1', 'es-node-2', 'es-node-3'], complete: true, count: 3 },
    { plugin: 'mapper-murmur3', installedOn: ['es-node-1', 'es-node-2'], complete: false, count: 2 },
    { plugin: 'ingest-attachment', installedOn: ['es-node-1', 'es-node-2', 'es-node-3'], complete: true, count: 3 },
    { plugin: 'repository-s3', installedOn: ['es-node-1', 'es-node-2', 'es-node-3'], complete: true, count: 3 },
  ],
};

/** 行菜单带名打开指南（复刻用户时序：先带名→关→再空开）——返回带名档的 aria-label */
async function openNamedGuide(host: HTMLElement): Promise<string | null> {
  const rowBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => /安装\/卸载/.test(collapse(b.textContent)));
  expect(rowBtn, '行尾安装/卸载钮在场').toBeTruthy();
  rowBtn!.click();
  await settle(4);
  const guideItem = Array.from(document.body.querySelectorAll('.ccm-it'))
    .find(el => /安装\/卸载指南/.test(el.textContent || ''));
  expect(guideItem, '菜单项在场（CellContextMenu 在 body）').toBeTruthy();
  (guideItem as HTMLElement).click();
  await settle(4);
  const body = host.querySelector('.pl-mo-b');
  expect(body, '指南弹窗开（带名档）').toBeTruthy();
  return body!.getAttribute('aria-label');
}

function closeGuide(host: HTMLElement) {
  const close = host.querySelector('.pl-mo-b .pl-close') as HTMLButtonElement | null;
  expect(close, '关钮在场').toBeTruthy();
  close!.click();
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pluginsMatrixFn.mockReset().mockResolvedValue(PLUGINS_OK);
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('742 G151 指南弹窗带名残留收口（页头/空态空开清名一行刀）', () => {
  it('G151 病灶链：行菜单带名打开→关→页头「安装指南」空开 → aria-label 复归无名+pill 消失（修前=带名残留红）', async () => {
    const host = await mountView();
    const named = await openNamedGuide(host);
    expect(named, '带名档前置成立（aria-label 含插件名）').toMatch(/^[^·]+ · 插件安装指南$/);
    expect(host.querySelectorAll('.pl-mo-b .pill').length, '带名档 pill 在场').toBe(1);

    closeGuide(host);
    await settle(4);
    expect(host.querySelector('.pl-mo-b'), '弹窗已关').toBeFalsy();

    /* 页头「安装指南」钮空开——语义=通用指南，不得残留上次插件名 */
    findBtn(host, /安装指南/).click();
    await settle(4);
    const body = host.querySelector('.pl-mo-b');
    expect(body, '页头空开弹窗在场').toBeTruthy();
    expect(body!.getAttribute('aria-label'), 'G151 病灶：空开仍带上次插件名').toBe('插件安装指南');
    expect(host.querySelectorAll('.pl-mo-b .pill').length, 'G151 病灶：空开 pill 残留').toBe(0);
  });

  it('源码锁：模板直开字面零残留——两钮均走 openGuide 空名清名（页头+空态恰 2 处）', () => {
    const v = read('../views/PluginsView.vue');
    expect((v.match(/@click="showGuide = true"/g) || []).length,
      'G151 修法：模板直开 showGuide 字面必须清零（改走 openGuide(\'\')）').toBe(0);
    expect((v.match(/openGuide\(''\)/g) || []).length,
      '页头+空态两钮 openGuide(\'\') 字面').toBe(2);
  });

  it('负锚（防过修）：行菜单带名档不受扰——openGuide(name) 带名语义原样', async () => {
    const host = await mountView();
    const named = await openNamedGuide(host);
    expect(named, '带名档仍含插件名（清名只发生在空开路径）').toMatch(/^[^·]+ · 插件安装指南$/);
    expect(host.querySelectorAll('.pl-mo-b .pill').length).toBe(1);
  });
});
