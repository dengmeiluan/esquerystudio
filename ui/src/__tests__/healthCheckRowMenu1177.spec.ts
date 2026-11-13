/**
 * 1177：体检报告「检查项」行右键。
 *
 * 背景：warn/critical 检查项正是要贴工单/贴群的内容，此前行尾只有一颗**左键**复制钮
 * （且只复制「级别+名称+详情」拼串）。用户要「只抄详情」「只抄名字」「抄整项 JSON」
 * 时无从下手，而全站其他数据行早已是右键两级菜单。
 *
 * 锁：① 行挂 contextmenu；② 一级只留高频两项 + 分组父行（不平铺）；
 * ③ 二级才出低频项；④ 只读安全（无写动作）；⑤ 真挂载点到菜单出现。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const REPORT = {
  score: 72,
  generatedAt: '2026-10-27T09:00:00Z',
  summary: { nodes: 3, hotNodes: 1, indices: 12, shards: 40, unassigned: 2, unhealthy: 1, pendingTasks: 0, jvmPressure: 0.62 },
  checks: [
    { name: '未分配分片', level: 'warn', message: '2 个副本分片无法分配：节点数少于副本数+1' },
    { name: '磁盘水位', level: 'critical', message: 'node-2 磁盘使用 91%，超过 high watermark' },
    { name: '慢查询', level: 'info', message: '近 1 小时 3 条慢查询' },
  ],
  unhealthyIndices: [],
};

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, healthReport: vi.fn(async () => REPORT), overview: async () => ({}), clusterHealth: async () => ({}), clusterIndices: async () => [] } };
});

import HealthReportView from '../views/HealthReportView.vue';

const src = readFileSync(join(__dirname, '../views/HealthReportView.vue'), 'utf-8');
const tick = async (n = 14) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/'); await router.isReady();
  const app = createApp({ render: () => h(HealthReportView) });
  app.use(createPinia()); app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await tick();
  /* 报告体只在「开始体检」或 session 复原后渲染 —— 点真按钮走真实取数链 */
  const btn = [...host.querySelectorAll('button')].find(b => /开始体检/.test(b.textContent || '')) as HTMLButtonElement | undefined;
  btn?.click();
  await tick(20);
  return host;
}

beforeEach(() => { document.body.innerHTML = ''; sessionStorage.clear(); localStorage.clear(); });

describe('1177 健康报告检查项行右键', () => {
  it('源码锁：行挂 contextmenu，菜单组件在位，一级两项 + 分组父行', () => {
    expect(src).toContain('@contextmenu.prevent="openCheckMenu($event, c)"');
    expect(src).toContain("import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';");
    expect(src).toContain('<CellContextMenu v-if="checkMenu"');
    const body = src.slice(src.indexOf('const checkMenuItems = computed'), src.indexOf('/* 主报告复制 Markdown'));
    expect(body.length).toBeGreaterThan(300);
    expect(body).toContain("label: '复制此检查项（级别+名称+详情）'");
    expect(body).toContain("label: '只复制详情'");
    expect(body).toMatch(/key: 'check-more', label: '更多…',[\s\S]{0,120}children: \[/);
    expect(body).toContain("label: '只复制名称'");
    expect(body).toContain("label: '复制整项 JSON'");
  });

  it('只读安全：菜单里不得出现写动作', () => {
    const body = src.slice(src.indexOf('const checkMenuItems = computed'), src.indexOf('/* 主报告复制 Markdown'));
    for (const bad of ['api.ilm', 'deleteIndex', 'putSettings', 'askConfirm', 'api.reindex', 'sandbox']) {
      expect(body, `检查项右键不得含写动作：${bad}`).not.toContain(bad);
    }
  });

  it('真挂载：检查项行右键出两级菜单，标题带名称', async () => {
    const host = await mountView();
    const rows = host.querySelectorAll('.hr-check');
    expect(rows.length, '前置：检查项必须渲染出来').toBe(3);

    const row = rows[1] as HTMLElement; /* critical 那条 */
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 80 }));
    await new Promise(r => setTimeout(r, 40));

    const mask = document.querySelector('.ccm-mask');
    expect(mask, '右键必须开出菜单').toBeTruthy();
    expect((mask!.querySelector('.ccm-hd') as HTMLElement)?.textContent || '').toContain('磁盘水位');

    const top = [...mask!.querySelectorAll(':scope > .ccm > .ccm-it')].map(b => (b.textContent || '').trim());
    expect(top).toEqual(['复制此检查项（级别+名称+详情）', '只复制详情', '更多…']);

    const parent = [...mask!.querySelectorAll('.ccm-it')].find(b => (b.textContent || '').trim() === '更多…') as HTMLButtonElement;
    expect(parent.getAttribute('aria-haspopup')).toBe('menu');
    parent.click();
    await new Promise(r => setTimeout(r, 40));
    const sub = [...mask!.querySelectorAll('.ccm-sub .ccm-it')].map(b => (b.textContent || '').trim());
    expect(sub).toContain('只复制名称');
    expect(sub).toContain('复制整项 JSON');
  });
});
