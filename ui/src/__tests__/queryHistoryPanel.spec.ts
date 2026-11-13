/**
 * R130 五十七批：QueryHistoryPanel 共享面板守卫（QueryHub 抽屉 / DslQueryView 弹窗双入口复用）。
 * 锁定：
 * 1) 条目渲染 + 计数（x/y 条）；
 * 2) 过滤：按查询文本/索引名过滤、计数联动、无匹配空态；
 * 3) 清空 emit（确认由父组件做，组件只发事件）；
 * 4) actions 配置化：未配置的按钮不渲染；
 * 5) 复制：copy 钮走 utils/format copyText 并 notify。
 * 挂载：裸 createApp + pinia；useRoute mock（组件过滤词草稿按 route.path 维度）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/search' }),
  useRouter: () => ({ push: vi.fn() }), /* 二百四十七批：索引名芯片跳转 */
}));

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

const copyMock = vi.fn((_text: string) => Promise.resolve(true));
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: (text: string) => copyMock(text) };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import { useAppStore } from '../stores/app';

const ITEMS = [
  { id: 'a', mode: 'dsl', query: 'match_all', index: 'idx-a', ts: Date.now() - 1000 },
  { id: 'b', mode: 'sql', query: 'SELECT * FROM t', index: undefined, ts: Date.now() - 2000, took: 150 },
  { id: 'c', mode: 'lucene', query: 'name:foo', index: 'idx-b', ts: Date.now() - 3000 },
];

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

type Emitted = Record<string, unknown[][]>;
async function mountPanel(props: Record<string, any> = {}) {
  const emitted: Emitted = {};
  const app = createApp({
    setup() {
      const store = useAppStore();
      void store;
      return () => h(QueryHistoryPanel as any, {
        items: ITEMS,
        actions: ['play', 'copy', 'del'],
        clearable: true,
        showMode: true,
        onPlay: (it: unknown) => (emitted.play = [...(emitted.play || []), [it]]),
        onFill: (it: unknown) => (emitted.fill = [...(emitted.fill || []), [it]]),
        onDel: (it: unknown) => (emitted.del = [...(emitted.del || []), [it]]),
        onClear: () => { emitted.clear = [...(emitted.clear || []), []]; },
        ...props,
      }, undefined);
    },
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return emitted;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  copyMock.mockClear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

const q = (sel: string) => host.querySelector(sel);
const qa = (sel: string) => Array.from(host.querySelectorAll(sel));

describe('QueryHistoryPanel 共享面板', () => {
  it('条目渲染 + 计数 x/y 条 + mode 徽标（showMode）', async () => {
    await mountPanel();
    expect(q('.qhp-cnt')!.textContent).toBe('3/3 条');
    expect(qa('.qhp-item').length).toBe(3);
    expect(qa('.qhp-mode').map(e => e.textContent)).toEqual(['DSL', 'ES-SQL', 'Lucene']);
    expect(q('.qhp-q')!.textContent).toContain('match_all');
  });

  it('过滤：查询文本/索引名匹配、计数联动、无匹配空态', async () => {
    await mountPanel();
    const inp = q('.qhp-filter') as HTMLInputElement;
    inp.value = 'foo';
    inp.dispatchEvent(new Event('input'));
    await nextTick();
    expect(qa('.qhp-item').length).toBe(1);
    expect(q('.qhp-cnt')!.textContent).toBe('1/3 条');
    inp.value = 'idx-a';
    inp.dispatchEvent(new Event('input'));
    await nextTick();
    expect(qa('.qhp-item').length).toBe(1);
    inp.value = '不存在的词';
    inp.dispatchEvent(new Event('input'));
    await nextTick();
    expect(q('.qhp-empty')!.textContent).toContain('无匹配');
  });

  it('1071 参数徽标：合法数组出「参数 N」+ 原文 tooltip，过滤命中参数值', async () => {
    await mountPanel({
      items: [
        { id: 'p1', mode: 'sql', query: 'SELECT * FROM t WHERE a = ?', params: '["宁德时代"]', ts: Date.now() },
        { id: 'p2', mode: 'sql', query: 'SELECT * FROM t', ts: Date.now() - 1000 },
      ],
    });
    const chip = q('.qhp-params')!;
    expect(chip.textContent?.trim()).toBe('参数 1');
    expect(chip.getAttribute('title')).toContain('["宁德时代"]');
    const inp = q('.qhp-filter') as HTMLInputElement;
    inp.value = '宁德';
    inp.dispatchEvent(new Event('input'));
    await nextTick();
    expect(qa('.qhp-item').length).toBe(1);
    expect(q('.qhp-cnt')!.textContent).toBe('1/2 条');
  });

  it('清空/删除/播放 emit；未配置的 fill 按钮不渲染', async () => {
    const emitted = await mountPanel();
    (qa('.qhp-acts .btn').find(b => b.getAttribute('title') === '删除此条') as HTMLElement).click();
    (qa('.qhp-acts .btn').find(b => b.getAttribute('title') === '回放/执行') as HTMLElement).click();
    (q('.qhp-bar .danger') as HTMLButtonElement).click();
    await nextTick();
    expect((emitted.del || []).length).toBe(1);
    expect((emitted.play || []).length).toBe(1);
    expect((emitted.clear || []).length).toBe(1);
    expect(qa('.qhp-acts .btn').some(b => b.getAttribute('title') === '仅填入')).toBe(false);
  });

  it('name 徽标渲染 + ts 缺省不渲染时间（五十八批保存类/模板类条目支持）', async () => {
    await mountPanel({ items: [
      { name: '我的常用查询', query: 'match_all', ts: 1234567890000 },
      { name: '模板-聚合', query: 'agg by x', },
    ] });
    const names = qa('.qhp-name').map(e => e.textContent);
    expect(names).toEqual(['我的常用查询', '模板-聚合']);
    expect(qa('.qhp-time').length).toBe(1); // 只有带 ts 的条目渲染时间
    expect(qa('.qhp-q')[1].textContent).toContain('agg by x');
  });

  it('复制：copy 钮走 copyText 并 notify', async () => {
    await mountPanel();
    (qa('.qhp-acts .btn').find(b => b.getAttribute('title') === '复制查询文本') as HTMLElement).click();
    await nextTick();
    await Promise.resolve();
    expect(copyMock).toHaveBeenCalledWith('match_all');
    const store = useAppStore();
    expect(store.notifyQueue.some((n: any) => n.msg === '已复制查询文本')).toBe(true);
  });
});
