/**
 * 七百一十批：Workspace 首刀=G44+G45「布局持久化+落点钉死」
 * （R90 裁决表 P1+P2；G47 a11y 随刀 + G48 配置面板 Esc 收口）。
 * - G44：配置面板勾选显隐与跨度 select 均不调 persist()——全页仅 X 隐藏钮与拖拽
 *   moveTo 落盘，单独勾选/改跨度后刷新布局回跳（R90 lsRaw=null 读数铁证）；副标题
 *   「localStorage 持久化」承诺失实（铁律 B）→ @change=persist() 一行级修。
 * - G45：快速动作「DSL 查询」裸 /search push——种 qh.mode=sandbox 记忆后点击落地
 *   沙盒（R90 读数实证，G40 同族残留消费面）→ 显式 query { mode: 'dsl' } 落点钉死
 *   （708 TemplateGallery toQuery 同范式对称件；深链 mode 优先于记忆）。
 * - G47：配置面板行 checkbox 无 label 关联 + select/grab 无 aria（R90 读数全 null）
 *   → checkbox/select 按部件名 aria-label，grab 装饰字 aria-hidden。
 * - G48：配置面板无 Esc 收口（R90 openAfterEsc=true）→ 裁决收口：window 捕获级
 *   Esc（665 ld-hist-more 同范式）+焦点回「编辑布局」钮+弹层让路守卫
 *   （.msk-box/.cf 在开时 Esc 归弹层单源不抢）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      healthReport: vi.fn().mockResolvedValue({ score: 92, checks: [{ level: 'info' }], summary: { status: 'yellow' } }),
      remoteClusters: vi.fn().mockResolvedValue({ count: 3 }),
      taskDetail: vi.fn().mockResolvedValue({ nodes: { n1: { tasks: { t1: {} } } } }),
      clusterIndices: vi.fn().mockResolvedValue([]),
      overview: vi.fn().mockResolvedValue({}),
      clusterHealth: vi.fn().mockResolvedValue({}),
      sqlJson: vi.fn(),
    },
  };
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
let pushSpy: ReturnType<typeof vi.spyOn> | null = null;

async function mountView() {
  const View = (await import('../views/WorkspaceView.vue')).default;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/search', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  pushSpy = vi.spyOn(router, 'push');
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
  return app;
}

async function flush(n = 4) { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } }

/** 开配置面板并等渲染（入口态先验：709-C1 约定——面板开才有行可操作） */
async function openCfg() {
  const btn = [...host.querySelectorAll('button')].find(b => (b.textContent || '').includes('编辑布局')) as HTMLButtonElement;
  expect(btn, '「编辑布局」钮在场').toBeTruthy();
  if (!host.querySelector('.ws-cfg')) { btn.click(); await flush(); }
  expect(host.querySelector('.ws-cfg'), '配置面板已开').toBeTruthy();
  return btn;
}

const LS_KEY = 'esquerystudio.workspace.v1';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  pushSpy = null;
});

describe('G44：配置面板勾选/跨度即落盘（P1——单独勾选后刷新布局回跳病灶）', () => {
  it('取消勾选 → localStorage 布局即含 on:false（不再等 X 钮/拖拽顺带落盘）', async () => {
    await mountView();
    await openCfg();
    const rows = [...host.querySelectorAll('.ws-cfg-row')];
    expect(rows.length).toBe(8);
    expect(localStorage.getItem(LS_KEY), '改前未落盘（默认布局内存态）').toBeNull();
    const cb = rows[0].querySelector('input[type="checkbox"]') as HTMLInputElement;
    cb.click();
    await flush();
    const raw = localStorage.getItem(LS_KEY);
    expect(raw, '勾选即落盘（副标题「localStorage 持久化」承诺兑现）').toBeTruthy();
    const saved = JSON.parse(raw!);
    const health = saved.find((l: any) => l.k === 'health');
    expect(health.on, '被取消的部件落盘为 off').toBe(false);
    expect(saved.filter((l: any) => l.on).length, '其余部件不受扰').toBe(7);
  });

  it('改跨度 select → localStorage 布局即含新 span', async () => {
    await mountView();
    await openCfg();
    const sel = host.querySelector('.ws-cfg-row select') as HTMLSelectElement;
    sel.value = '3';
    sel.dispatchEvent(new Event('change'));
    await flush();
    const raw = localStorage.getItem(LS_KEY);
    expect(raw, '跨度即落盘').toBeTruthy();
    const saved = JSON.parse(raw!);
    expect(String(saved[0].span), '首部件跨度=3 列（整行）').toBe('3');
  });

  it('源码锁：checkbox 与 select 均挂 @change=persist()', () => {
    const s = read('../views/WorkspaceView.vue');
    expect(s, 'checkbox 勾选落盘').toMatch(/type="checkbox" v-model="w\.on" @change="persist\(\)"/);
    expect(s, 'select 跨度落盘').toMatch(/<select v-model="w\.span"[^>]*@change="persist\(\)"/);
  });
});

describe('G45：快速动作「DSL 查询」显式 mode=dsl 落点钉死（G40 同族）', () => {
  it('点 DSL 钮 → router.push 带 { path: /search, query: { mode: dsl } }', async () => {
    await mountView();
    /* 种沙盒记忆（R90 病根复现前置：QueryHub 无 ?mode= 时吃 qh.mode 记忆） */
    localStorage.setItem('esquerystudio.pref.qh.mode', 'sandbox');
    const btn = [...host.querySelectorAll('.ws-sc button')].find(b => (b.textContent || '').includes('DSL 查询')) as HTMLButtonElement;
    expect(btn, 'DSL 快速动作钮在场').toBeTruthy();
    btn.click();
    await flush();
    expect(pushSpy, 'push 已调用').toHaveBeenCalled();
    const arg = pushSpy!.mock.calls[pushSpy!.mock.calls.length - 1][0] as any;
    expect(typeof arg).toBe('object');
    expect(arg.path).toBe('/search');
    expect(arg.query?.mode).toBe('dsl');
  });

  it('源码锁：裸 push(\'/search\') 退役；沙盒/SQL 显式 mode 对称件原样', () => {
    const s = read('../views/WorkspaceView.vue');
    expect(s, '裸 /search push 退役').not.toMatch(/\$router\.push\('\/search'\)/);
    expect(s, '沙盒对称件原样').toContain('/search?mode=sandbox');
    expect(s, 'SQL 对称件原样').toContain('/search?mode=sql');
  });
});

describe('G47：配置面板行三件 a11y（checkbox/select aria-label + grab aria-hidden）', () => {
  it('每行 checkbox/select 的 aria-label 含部件名；grab 装饰字 aria-hidden', async () => {
    await mountView();
    await openCfg();
    const rows = [...host.querySelectorAll('.ws-cfg-row')];
    expect(rows.length).toBe(8);
    for (const row of rows) {
      const name = (row.querySelector('.ws-cfg-name') as HTMLElement).textContent || '';
      const cb = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const sel = row.querySelector('select') as HTMLSelectElement;
      expect(cb.getAttribute('aria-label'), `${name} checkbox aria-label`).toContain(name);
      expect(sel.getAttribute('aria-label'), `${name} select aria-label`).toContain(name);
      const grab = row.querySelector('.ws-cfg-grab') as HTMLElement;
      expect(grab.getAttribute('aria-hidden'), `${name} grab 装饰字`).toBe('true');
    }
  });
});

describe('G48：配置面板 Esc 收口（665 window 捕获级范式+弹层让路守卫）', () => {
  it('面板开 → Esc 关面板 + 焦点回「编辑布局」钮', async () => {
    await mountView();
    const btn = await openCfg();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(host.querySelector('.ws-cfg'), 'Esc 关配置面板').toBeFalsy();
    expect(document.activeElement, '焦点回触发钮').toBe(btn);
  });

  it('弹层让路：.cf 确认弹层在开时 Esc 不关配置面板（569 弹层单源）', async () => {
    await mountView();
    await openCfg();
    const cf = document.createElement('div');
    cf.className = 'cf';
    document.body.appendChild(cf);
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flush();
      expect(host.querySelector('.ws-cfg'), '弹层在开——Esc 归弹层，配置面板不动').toBeTruthy();
    } finally {
      cf.remove();
    }
  });
});

describe('1439 配置行右键', () => {
  it('右键/菜单键：隐藏、列宽、排序，均落盘（共享 CellContextMenu）', async () => {
    await mountView();
    await openCfg();
    const row = host.querySelector<HTMLElement>('.ws-cfg-row')!;
    const open = async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }));
      await flush();
      const menu = document.body.querySelector<HTMLElement>('.ccm');
      expect(menu, '右键菜单').toBeTruthy();
      return menu!;
    };
    let menu = await open();
    expect(menu.textContent).toContain('组件 · 集群体检 · 1 列');
    expect(menu.textContent).toContain('隐藏此组件');
    expect(menu.textContent).toContain('列宽');
    expect(menu.textContent).toContain('排序');
    (menu.querySelector('[data-key="ws-toggle"]') as HTMLElement).click();
    await flush();
    expect((host.querySelector('.ws-cfg-row input[type=checkbox]') as HTMLInputElement).checked).toBe(false);
    expect(JSON.parse(localStorage.getItem(LS_KEY) || '[]')[0].on, '隐藏即落盘').toBe(false);

    menu = await open();
    (menu.querySelector('[data-key="ws-span"]') as HTMLElement).click();
    await flush();
    const span3 = menu.querySelector('[data-key="ws-span-3"]') as HTMLElement;
    expect(span3, '列宽二级项').toBeTruthy();
    span3.click();
    await flush();
    expect((host.querySelector('.ws-cfg-row select') as HTMLSelectElement).value).toBe('3');
    expect(JSON.parse(localStorage.getItem(LS_KEY) || '[]')[0].span, '列宽即落盘').toBe(3);

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    await flush();
    expect(document.body.querySelector('.ccm'), '菜单键开同一菜单').toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(document.body.querySelector('.ccm'), 'Esc 关闭').toBeNull();

    menu = await open();
    (menu.querySelector('[data-key="ws-move"]') as HTMLElement).click();
    await flush();
    (menu.querySelector('[data-key="ws-down"]') as HTMLElement).click();
    await flush();
    expect(JSON.parse(localStorage.getItem(LS_KEY) || '[]')[1].k, '下移即落盘').toBe('health');
  });
});
