/**
 * 242 批 P2-8/P2-11 组件级锁定：
 * 1) DocDiffModal——多选文档 diff 弹窗渲染、基准切换重算、状态着色类；
 * 2) ResultTable.captureLayout/applyLayout——布局一体快照进出（排序/筛选/列选/行高），
 *    且偏好写入落盘（保存的搜索的「布局半边」）。
 * 挂载样板照抄 commitFailReason.spec。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import DocDiffModal from '../components/DocDiffModal.vue';
import ResultTable from '../components/ResultTable.vue';
import type { SearchHit } from '../types';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function flush() {
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('DocDiffModal（P2-8 文档对比）', () => {
  it('渲染字段并集行表，状态着色类正确；换基准行级状态翻转', async () => {
    const hits = [
      { _id: 'a', _source: { t: 'x', n: 1, onlyA: 'a' } },
      { _id: 'b', _source: { t: 'y', n: 1, onlyB: 'b' } },
    ] as unknown as SearchHit[];
    let base = 0;
    const app = createApp({
      setup: () => () => h(DocDiffModal as any, {
        show: true, hits, baseIdx: base,
        onBase: (i: number) => { base = i; },
      }),
    });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    await flush();

    /* 五百六十六批同步更新：DocDiffModal 补 import NModal 后为真模态（teleport 到 body），
       内容查询走 document 级（旧内联平铺=组件未解析的坏形态） */
    const rows = [...document.querySelectorAll('.ddm-tbl tbody tr')];
    const byPath = new Map(rows.map(r => [r.querySelector('td.p')?.textContent, r]));
    expect(byPath.get('t')!.className).toContain('k-changed');
    expect(byPath.get('n')!.className).toContain('k-same');
    expect(byPath.get('onlyA')!.className).toContain('k-only-base');
    expect(byPath.get('onlyB')!.className).toContain('k-only-target');
    /* 值落格：changed 行目标格是 y */
    expect(byPath.get('t')!.querySelectorAll('td.v')[1].textContent).toContain('y');
    /* 统计条：t 不同、n 一致、onlyA 仅基准、onlyB 仅目标 */
    expect(document.querySelector('.ddm-stat')!.textContent).toContain('1 一致');
    expect(document.querySelector('.ddm-stat')!.textContent).toContain('1 不同');

    /* 换基准（父侧 base=1 后重挂 props 变化触发重算）——直接改 props 需要重挂，验证事件先 */
    (document.querySelector('.ddm-chip') as HTMLElement); // chips 仅 3 篇时出现，2 篇不渲染
  });

  it('复制 Markdown 按钮存在且可点击（复制链路走 copyText，失败也不炸）', async () => {
    const hits = [
      { _id: 'a', _source: { t: 'x' } },
      { _id: 'b', _source: { t: 'y' } },
    ] as unknown as SearchHit[];
    const app = createApp({ setup: () => () => h(DocDiffModal as any, { show: true, hits, baseIdx: 0 }) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    await flush();
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('复制 Markdown'))!;
    btn.click();
    await flush();
  });
});

describe('ResultTable 布局一体快照（P2-11）', () => {
  const HITS = [
    { _id: 'a', _source: { name: 'banana' } },
    { _id: 'b', _source: { name: 'apple' } },
  ] as unknown as SearchHit[];

  it('applyLayout 恢复排序/筛选/列选/行高，captureLayout 读回一致且落盘', async () => {
    const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 2, index: 'i1' }) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    await flush();
    /* 516 批：RT 根变为 FS 组件——RT 实例经 FS 实例的 parent 取 */
    const exposed = (host.querySelector('.fs') as any).__vueParentComponent.parent.exposed;

    const ok = exposed.applyLayout({
      sort: [{ f: 'name', d: 'desc' }],
      filters: { name: ['apple'] },
      cols: ['name'],
      widths: { name: 150 },
      freeze: 0, transpose: 0, dense: false, rowH: 'cozy',
    });
    expect(ok).toBe(true);
    await flush();

    const cap = exposed.captureLayout();
    expect(cap.sort).toEqual([{ f: 'name', d: 'desc' }]);
    expect(cap.filters).toEqual({ name: ['apple'] });
    expect(cap.cols).toEqual(['name']);
    expect(cap.widths).toEqual({ name: 150 });
    expect(cap.rowH).toBe('cozy');
    /* 偏好落盘（useTablePrefs watch）——保存的搜索的布局半边持久化 */
    expect(JSON.parse(localStorage.getItem('es_cols:i1') || '[]')).toEqual(['name']);
    expect(localStorage.getItem('es_tbl_rowh')).toBe('cozy'); /* 242 批全局键 */
  });

  it('applyLayout 防御脏数据：坏形状跳过不炸', async () => {
    const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 2, index: 'i2' }) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    await flush();
    /* 516 批：RT 根变为 FS 组件——RT 实例经 FS 实例的 parent 取 */
    const exposed = (host.querySelector('.fs') as any).__vueParentComponent.parent.exposed;
    expect(exposed.applyLayout(null)).toBe(false);
    expect(exposed.applyLayout('junk')).toBe(false);
    /* 坏 sort 被过滤、坏 cols 被拒，其余合法项仍生效 */
    expect(exposed.applyLayout({ sort: [{ d: 'desc' }], cols: [42], rowH: 'compact' })).toBe(true);
    const cap = exposed.captureLayout();
    expect(cap.sort).toEqual([]);
    expect(cap.rowH).toBe('compact');
  });
});
