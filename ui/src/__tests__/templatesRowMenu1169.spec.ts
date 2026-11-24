/**
 * 1169 批：模板列表行右键（用户「很多地方没有右键能力」的补位）。
 *
 * 模板行此前只有一个删除钮：想拿模板名 / index_patterns / 整段定义只能手抄。
 * 右键按两级给：一级「复制模板名」「复制模板定义 JSON」，「更多…」二级承载
 * patterns 与 DevTools（只读 GET）。破坏性删除**不进右键**，仍留行内按钮。
 *
 * 同时验证 DevTools 入口门与 DevToolsView 页门同源（canReadPage）：无读权时不跳转、
 * 不往 session 写 open 键（否则等于把不可用动作放进可达路径）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const tplSrc = readFileSync(join(__dirname, '../views/TemplatesView.vue'), 'utf-8');

const templatesFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: new Proxy({ ...actual.api, templates: templatesFn }, {
      get(t: any, p) { return p in t ? (t as any)[p] : () => Promise.resolve(null); },
    }),
  };
});

vi.mock('../components/JsonArea.vue', () => ({
  default: { name: 'JsonArea', props: ['modelValue'], template: '<div class="ja" />' },
}));

const TPL = {
  legacy: false,
  index_templates: [
    { name: 'logs-tpl', index_template: { index_patterns: ['logs-*', 'app-*'], priority: 100, template: { settings: { number_of_shards: 1 } } } },
  ],
  component_templates: [],
};

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  location.hash = '#/templates';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/devtools', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const mod = await import('../views/TemplatesView.vue');
  const app = createApp({ render: () => h(mod.default as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { router };
}

describe('1169 模板行右键', () => {
  beforeEach(() => {
    templatesFn.mockResolvedValue(TPL);
    sessionStorage.removeItem('esquerystudio.devtools.open');
  });
  afterEach(() => {
    for (const a of apps.splice(0)) { try { a.unmount(); } catch { /* noop */ } }
    host?.remove();
    document.querySelectorAll('.ccm-mask').forEach(e => e.remove());
  });

  it('源码锁：行挂 contextmenu + 菜单键（统一判据），菜单走共享 CellContextMenu', () => {
    expect(tplSrc).toContain('@contextmenu.prevent="openTplMenu($event, t)"');
    /* 原 @keydown.menu 修饰符匹配不到 ContextMenu 键，1443 改统一判据（含 Shift+F10） */
    expect(tplSrc).toContain('@keydown="onTplMenuKey($event, t)"');
    expect(tplSrc).toMatch(/function onTplMenuKey\(e: KeyboardEvent/);
    expect(tplSrc).toMatch(/<CellContextMenu\s+v-if="tplMenu"/);
  });

  it('菜单键真开菜单（焦点行按 ContextMenu）', async () => {
    await mountView();
    const row = host.querySelector('.tv2-row') as HTMLElement;
    expect(row, '模板行已渲染').toBeTruthy();
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await nextTick();
    const menu = document.querySelector('.ccm-mask .ccm');
    expect(menu, '菜单键已开菜单').toBeTruthy();
    expect((menu!.querySelector('.ccm-hd')?.textContent || '')).toContain('logs-tpl');
  }, 20000); /* 本文件首个挂载用例承担 Monaco/模板冷转译，默认 5s 不够 */

  it('源码锁：一级 2 项 + 更多… 二级；删除不进右键（破坏性动作留行内）', () => {
    const menu = tplSrc.slice(tplSrc.indexOf('const tplMenuItems'), tplSrc.indexOf('function select('));
    expect(menu).toContain("key: 'tpl-name'");
    expect(menu).toContain("key: 'tpl-json'");
    expect(menu).toContain("key: 'tpl-more', label: '更多…'");
    expect(menu).not.toMatch(/key: 'tpl-del'|label: '删除'/);
  });

  it('右键真开菜单：标题带模板名，一级恰好 3 项（含 1 个分组父行）', async () => {
    await mountView();
    const row = host.querySelector('.tv2-row') as HTMLElement;
    expect(row, '列表已渲染').toBeTruthy();
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 300 }));
    await settle();
    const menu = document.querySelector('.ccm-mask .ccm');
    expect(menu, '菜单已开').toBeTruthy();
    expect((menu!.querySelector('.ccm-hd')?.textContent || '')).toContain('logs-tpl');
    const items = [...menu!.querySelectorAll(':scope > .ccm-it')] as HTMLElement[];
    expect(items, '一级 = 复制名 / 复制定义 / 更多…').toHaveLength(3);
    expect(items.filter(i => i.getAttribute('aria-haspopup') === 'menu')).toHaveLength(1);
  }, 20000);

  it('DevTools 项在无读权时不写 open 键（入口门与页门同源）', async () => {
    await mountView();
    const row = host.querySelector('.tv2-row') as HTMLElement;
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 300 }));
    await settle();
    /* 默认 mock 身份未授予 devtools 页 → 点 DevTools 项应被拦下 */
    const menu = document.querySelector('.ccm-mask .ccm')!;
    const more = [...menu.querySelectorAll(':scope > .ccm-it')].find(i => i.getAttribute('aria-haspopup') === 'menu') as HTMLElement;
    more.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await settle();
    const sub = document.querySelector('.ccm-sub') as HTMLElement;
    expect(sub, '二级已出').toBeTruthy();
    const dev = [...sub.querySelectorAll('.ccm-it')].find(i => /DevTools/.test(i.textContent || '')) as HTMLElement;
    expect(dev, 'DevTools 项存在').toBeTruthy();
    dev.click();
    await settle();
    expect(sessionStorage.getItem('esquerystudio.devtools.open'), '无读权不得写 open 键').toBeNull();
  }, 20000);
});
