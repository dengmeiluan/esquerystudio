/**
 * 五百二十五批：useColStats topTotal 内核口径 + ColDetailModal 高频值 kw 过滤。
 * 锁定：
 * 1) statsOf 返回 topTotal=截断前全量条目数（slice 前口径），topN 可配（缺省 5 保契约）；
 * 2) 弹窗标题「高频值（前 N / 共 M）」动态口径；
 * 3) topTotal>20 时出 kw 过滤输入（include 口径），过滤只作用于显示行，空匹配出提示。
 * 弹窗挂载样板：裸挂 ColDetailModal 共享件（rt-cd 类名契约不变）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { useColStats } from '../composables/useColStats';
import ColDetailModal from '../components/ColDetailModal.vue';

const ROWS = ['hot', 'hot', 'hot', 'a', 'b', 'c', 'd', 'e'].map(v => ({ v }));
const base = {
  rows: () => ROWS,
  getVal: (r: any) => r.v,
  labelOf: (v: any) => (v === null || v === undefined ? '∅' : String(v)),
};

describe('useColStats topTotal/topN（五百二十五批）', () => {
  it('topTotal=截断前全量条目数（6 个去重值 → top 截 5、topTotal=6）；缺省 topN=5 契约不变', () => {
    const s = useColStats(base).statsOf('v');
    expect(s.top.length).toBe(5);
    expect(s.topTotal).toBe(6);
    expect(s.top[0]).toEqual({ v: 'hot', n: 3 });
    /* ≤5 首现序契约不受影响 */
    const s2 = useColStats({ rows: () => [{ v: 'x' }, { v: 'y' }], getVal: (r: any) => r.v, labelOf: (v: any) => String(v) }).statsOf('v');
    expect(s2.top.length).toBe(2);
    expect(s2.topTotal).toBe(2);
  });

  it('topN 可配：top.length=topN，topTotal 仍为全量条目数', () => {
    const s = useColStats({ ...base, topN: 3 }).statsOf('v');
    expect(s.top.length).toBe(3);
    expect(s.topTotal).toBe(6);
  });
});

describe('ColDetailModal 高频值标题 + kw 过滤（五百二十五批）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  let host: HTMLElement;

  function mkStats(topTotal: number, col = 'kw1') {
    return reactive({ col, type: '', distinct: topTotal, empty: 0, numeric: null, topTotal,
      top: ['v1', 'v2', 'v3', 'v4', 'v5'].map((v, i) => ({ v, n: 10 - i })) });
  }
  async function mountWith(stats: any) {
    host = document.createElement('div');
    document.body.appendChild(host);
    const pprops = reactive({ show: true, stats, labelOf: (v: any) => String(v) });
    const app = createApp({ setup: () => () => h(ColDetailModal as any, pprops) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    return pprops;
  }
  const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

  beforeEach(() => {
    localStorage.clear();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    document.body.innerHTML = '';
  });

  it('标题「高频值（前 5 / 共 25）」动态口径；topTotal>20 出 kw 输入并过滤显示行', async () => {
    await mountWith(mkStats(25));
    const card = document.body.querySelector('.rt-cd') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('高频值（前 5 / 共 25）');
    const kwInp = document.body.querySelector('.rt-cd-kw') as HTMLInputElement;
    expect(kwInp, 'topTotal>20 应出 kw 过滤').toBeTruthy();
    kwInp.value = 'v3';
    kwInp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    const vals = [...document.body.querySelectorAll('.rt-cd-v')].map(el => el.textContent);
    expect(vals).toEqual(['v3']);
    kwInp.value = 'zzz';
    kwInp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(document.body.querySelector('.rt-cd')!.textContent).toContain('无匹配值');
  });

  it('topTotal≤20 不出 kw 输入（门控）；换列自动清词', async () => {
    const pprops = await mountWith(mkStats(12));
    expect(document.body.querySelector('.rt-cd-kw')).toBeNull();
    /* 换列（stats.col 变化）→ kw 清空（同组件实例喂新列名） */
    const stats2 = mkStats(25, 'kw2');
    pprops.stats = stats2;
    await tick();
    const inp = document.body.querySelector('.rt-cd-kw') as HTMLInputElement;
    expect(inp, '换列后新列 topTotal>20 出 kw').toBeTruthy();
    inp.value = 'v2';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect([...document.body.querySelectorAll('.rt-cd-v')].length).toBe(1);
    pprops.stats = mkStats(25, 'kw3');
    await tick();
    const inp2 = document.body.querySelector('.rt-cd-kw') as HTMLInputElement;
    expect(inp2.value).toBe('');
    expect([...document.body.querySelectorAll('.rt-cd-v')].length).toBe(5);
  });
});
