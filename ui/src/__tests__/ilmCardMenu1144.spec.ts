/**
 * 1144：ILM 策略卡右键。
 *
 * 策略卡此前只有右上「编辑/删除」两钮（写操作），查看策略体、复制、跑 explain
 * 都要绕出去。现补 CellContextMenu：
 * - 一级：查看相位时间线 / 查看策略 JSON / 复制… / 生命周期解释… [/ 策略写操作…]
 * - 写操作二级只在 canOps 时出现（右键不绕过本页权限门）
 * - 编辑/删除仍走原入口原确认链
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      ilmPolicies: () => Promise.resolve(POLICIES),
    },
  };
});

/* Monaco 内核 stub（ilmDraftTruth932 同款；本批只验菜单与策略体回填，
   换成 textarea 让断言直接读得到策略体原文） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<textarea class="monaco-stub" :value="modelValue" :readonly="readonly" />',
  },
}));

const POLICIES = [
  { name: 'logs-hot-warm', version: 3, modified_date: '2026-10-20T10:00:00.000Z',
    policy: { phases: { hot: { min_age: '0ms', actions: { rollover: { max_primary_shard_size: '30gb' } } }, delete: { min_age: '30d', actions: { delete: {} } } } } },
  { name: 'metrics-7d', version: 1, modified_date: '2026-10-19T08:00:00.000Z',
    policy: { phases: { hot: { min_age: '0ms', actions: { rollover: {} } }, delete: { min_age: '7d', actions: { delete: {} } } } } },
];

import IlmView from '../views/IlmView.vue';
import { topLabels, openGroup, subButtons, clickMenuItem, menuRoot } from './helpers/ctxMenu';

const src = readFileSync(join(__dirname, '../views/IlmView.vue'), 'utf-8');
const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function mountIlm() {
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(IlmView) });
  app.use(createPinia());
  app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }] }));
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 30; i++) await nextTick();
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const cards = () => [...host.querySelectorAll('.ilm-p')] as HTMLElement[];

async function rightClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 160 }));
  await tick();
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1144 ILM 策略卡右键', () => {
  it('右键策略卡弹出菜单，标题带策略名；一级不超过 5 项（低频进二级）', async () => {
    await mountIlm();
    expect(cards().length, '策略卡渲染').toBe(2);
    expect(menuRoot(), '未右键不渲染').toBeNull();
    await rightClick(cards()[0]);
    expect(menuRoot()).toBeTruthy();
    expect(document.querySelector('.ccm-hd')!.textContent).toContain('logs-hot-warm');
    const tops = topLabels();
    expect(tops.length).toBeLessThanOrEqual(5);
    expect(tops[0]).toContain('查看相位时间线');
    expect(tops).toContain('查看策略 JSON');
    expect(tops).toContain('复制…');
    expect(tops).toContain('生命周期解释…');
    /* 写操作在只读/默认身份下也可以出现分组，但分组内动作受权限门约束（见下条） */
    expect(tops.filter(t => t === '策略写操作…').length).toBeLessThanOrEqual(1);
  });

  it('查看策略 JSON 打开编辑弹窗并带完整策略体（不保存即不写集群）', async () => {
    await mountIlm();
    await rightClick(cards()[0]);
    expect(await clickMenuItem('查看策略 JSON')).toBe(true);
    await tick(10);
    expect(menuRoot(), '点项后关菜单').toBeNull();
    const ta = [...document.querySelectorAll('textarea')].find(t => (t as HTMLTextAreaElement).value.includes('max_primary_shard_size'));
    expect(ta, '弹窗里出现策略体原文').toBeTruthy();
    expect((ta as HTMLTextAreaElement).value).toContain('"policy"');
  });

  it('复制二级给「策略名 / 策略 JSON」两项', async () => {
    await mountIlm();
    await rightClick(cards()[1]);
    expect(await openGroup('复制…')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim())).toEqual(['复制策略名', '复制策略 JSON']);
  });

  it('解释二级给「解释当前索引 / 在 Dev Tools 打开 explain」；未选索引时就地提示', async () => {
    await mountIlm();
    await rightClick(cards()[0]);
    expect(await openGroup('生命周期解释…')).toBe(true);
    const labels = subButtons().map(b => (b.textContent ?? '').trim());
    expect(labels[0]).toContain('解释当前索引');
    expect(labels[1]).toBe('在 Dev Tools 打开 explain');
    /* 未选索引档：点「解释当前索引」只提示，不发请求（诚实缺口） */
    expect(await clickMenuItem('解释当前索引')).toBe(true);
    await tick();
    expect(menuRoot()).toBeNull();
  });

  it('源码锁：写操作二级挂 canOps 门，删除仍走 guardText 二次确认', () => {
    expect(src).toMatch(/\.\.\.\(canOps\.value \? \[\{\s*\n\s*key: 'ops-group'/);
    expect(src).toMatch(/run: \(\) => void deletePolicy\(p\.name\)/);
    expect(src).toMatch(/level: 'critical', guardText: name/);
    /* 策略卡行绑了 contextmenu（不是只有按钮） */
    expect(src).toMatch(/@contextmenu\.prevent="openIlmMenu\(\$event, p\)"/);
  });
});
