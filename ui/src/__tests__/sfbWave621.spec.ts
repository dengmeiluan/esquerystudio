/**
 * 六百二十一批：轨4 单源化（非 RT/QRT 工具行的自造过滤框 → SearchFilterBar 统一件）。
 * 判据（547/553/559/560/561 改用谱系同款范式）：
 *   1) QueryHistoryPanel .qhp-filter：裸 input（.inp 手写皮 + 独立高度/字号内衬）→
 *      SearchFilterBar 第 17 胞；落位/内衬归 .qhp-sfb（组件根，父 scoped 样式照常命中），
 *      inputclass 保留 .qhp-filter 锚（queryHistoryPanel.spec 运行时锚零迁移）；
 *      Esc 清空由组件内建承接（原裸 input 无 Esc 语义 = 增量）。
 *   2) HotkeyPanel .hk-filter：裸 input（.ipt 手写皮）→ 第 18 胞；**Esc 层级契约保形**——
 *      原 @keydown.esc.stop.prevent 的 .stop 不可丢（丢则 Esc 冒泡到 window onKey 与
 *      .hk-mask 元素级 handler，过滤框内按 Esc 会连面板一起关掉）；改用后在组件根补
 *      @keydown.esc.stop（SearchFilterBar 内建只 .prevent 不 .stop，冒泡到达根时拦断）。
 *   3) ColDetailModal .rt-cd-kw：裸 input（自造胶囊皮 + focus 边框）→ 第 19 胞；
 *      topTotal>20 门控与 mono 字面锚随 inputclass 保形（colStatsTopTotal525 /
 *      tableKernelOffBl558b 运行时锚零迁移）；自造 focus 边框由 --ac-line 焦点环承接。
 * 负锁一律剥注释后断言（flattenWave556 口径：历史备案注释里的字面不算数）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
/* 剥 CSS/HTML 注释：负锁防历史备案字面误命中（unifyWave561 同口径） */
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('六百二十一批①：SearchFilterBar 第 17/18/19 胞改用（源码契约）', () => {
  it('QueryHistoryPanel：qhp-filter 改用（落位类 qhp-sfb + input-class 锚 + 裸 input 退役）', () => {
    const s = codeOf('components/QueryHistoryPanel.vue');
    expect(s, '统一件接线（v-model/落位类/input-class 锚/placeholder 逐字）')
      .toContain('<SearchFilterBar v-model="kw" class="qhp-sfb" input-class="qhp-filter" placeholder="过滤：查询文本 / 索引名" />');
    expect(s, '裸 input 退役').not.toMatch(/<input v-model="kw" class="inp qhp-filter"/);
    expect(s, '统一件 import 在场').toMatch(/import SearchFilterBar from '\.\/SearchFilterBar\.vue';/);
    expect(s, '落位与内衬归本类（flex/height/font 对齐 .inp 原值，高度链零变动）')
      .toContain('.qhp-sfb { flex: 1; min-width: 0; height: 26px; font-size: var(--fs-sm); padding: 0 var(--sp-2); }');
  });

  it('HotkeyPanel：hk-filter 改用 + Esc 层级 .stop 保形（面板误关防回归）', () => {
    const s = codeOf('components/HotkeyPanel.vue');
    expect(s, '统一件接线（placeholder 逐字保留 + 根级 Esc .stop 保形）')
      .toMatch(/<SearchFilterBar v-model="hkKw"[\s\S]{0,220}?placeholder="过滤快捷键（描述 \/ 键名，Esc 清空）"[\s\S]{0,140}?@keydown\.esc\.stop \/>/);
    expect(s, '旧裸 input 的元素级 esc 处理退役').not.toMatch(/@keydown\.esc\.stop\.prevent="hkKw = ''"/);
    expect(s, '裸 input 退役').not.toMatch(/<input v-model="hkKw" class="hk-filter ipt"/);
    expect(s, '统一件 import 在场').toMatch(/import SearchFilterBar from '\.\/SearchFilterBar\.vue';/);
    expect(s, '落位与内衬归本类（margin/font 对齐 .ipt 原值）')
      .toContain('.hk-filter { margin: var(--sp-1h) 0 var(--sp-0); font-size: var(--fs-xs); }');
  });

  it('ColDetailModal：rt-cd-kw 改用（topTotal>20 门控 + mono 锚 + 焦点环承接）', () => {
    const s = codeOf('components/ColDetailModal.vue');
    expect(s, '统一件接线（v-if 门控与 mono 字面锚同步更新）')
      .toContain('<SearchFilterBar v-if="stats.topTotal > 20" v-model="kw" class="rt-cd-kw-wrap" input-class="rt-cd-kw mono" placeholder="过滤高频值…" />');
    expect(s, '裸 input 退役').not.toMatch(/<input v-if="stats\.topTotal > 20" v-model="kw" class="rt-cd-kw mono"/);
    expect(s, '统一件 import 在场').toMatch(/import SearchFilterBar from '\.\/SearchFilterBar\.vue';/);
    expect(s, '落位与内衬归本类（width/box-sizing/padding/font 对齐原值）')
      .toContain('.rt-cd-kw-wrap { width: 100%; box-sizing: border-box; padding: var(--sp-1) var(--sp-2); font-size: var(--fs-xs); margin-bottom: var(--sp-1); }');
    expect(s, '焦点环走主题变量（原 .rt-cd-kw:focus 自造边框退役）')
      .toContain('.rt-cd-kw-wrap:focus-within { border-color: var(--ac-line); }');
    expect(s, '自造输入皮（bg0 底/line 边/4px 圆角）退役归组件胶囊壳单源')
      .not.toContain('.rt-cd-kw { width: 100%');
  });
});

/* ── 挂载级零回归：壳结构 + 行为直证 ── */
/* QueryHistoryPanel 依赖 route（过滤词草稿按 route 维度）——裸挂须 mock（queryHistoryPanel.spec 同款） */
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/search' }),
  useRouter: () => ({ push: vi.fn() }),
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

import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import ColDetailModal from '../components/ColDetailModal.vue';

describe('六百二十一批②：挂载级零回归（壳结构 + 过滤行为 + Esc 清词）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

  beforeEach(() => {
    localStorage.clear();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    document.body.innerHTML = '';
  });

  function mount(node: () => any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ setup: () => node });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    return host;
  }

  it('QueryHistoryPanel：胶囊壳单源在场 + .qhp-filter 仍是壳内 input + 过滤/计数/Esc 清词零回归', async () => {
    const items = [
      { id: 'a', mode: 'dsl', query: 'match_all', index: 'idx-a', ts: Date.now() - 1000 },
      { id: 'b', mode: 'sql', query: 'SELECT * FROM t', index: 'idx-b', ts: Date.now() - 2000, took: 150 },
      { id: 'c', mode: 'lucene', query: 'name:foo', index: 'idx-c', ts: Date.now() - 3000 },
    ];
    mount(() => h(QueryHistoryPanel as any, { items, importable: false, clearable: false }));
    await tick();
    const wrap = document.body.querySelector('.qhp-sfb');
    expect(wrap, 'SearchFilterBar 胶囊壳落位类在场').toBeTruthy();
    const inp = document.body.querySelector('.qhp-filter') as HTMLInputElement;
    expect(inp, '.qhp-filter 运行时锚仍在（旧 spec 零迁移）').toBeTruthy();
    expect(inp.tagName, '锚落在真实 input 上').toBe('INPUT');
    expect(wrap!.contains(inp), '锚 input 在胶囊壳内（单源结构）+ 内建 Search 图标在场')
      .toBe(true);
    expect(wrap!.querySelector('svg'), '内建搜索图标').toBeTruthy();
    /* 过滤行为（口径不变） */
    inp.value = 'idx-a';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(document.body.querySelectorAll('.qhp-item').length).toBe(1);
    expect(document.body.querySelector('.qhp-cnt')!.textContent).toBe('1/3 条');
    /* Esc 清词（组件内建承接，增量语义；状态回全集不残留） */
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick();
    expect(document.body.querySelectorAll('.qhp-item').length, 'Esc 清词回全集').toBe(3);
    expect(inp.value, '输入框视觉值与过滤态同步归零').toBe('');
    expect(document.body.querySelector('.qhp-cnt')!.textContent).toBe('3/3 条');
  });

  it('ColDetailModal：.rt-cd-kw 是壳内 input（mono 锚在场）+ topTotal 门控保形', async () => {
    const mkStats = (topTotal: number) => reactive({
      col: 'kw1', type: '', distinct: topTotal, empty: 0, numeric: null, topTotal,
      top: ['v1', 'v2', 'v3', 'v4', 'v5'].map((v, i) => ({ v, n: 10 - i })),
    });
    const props = reactive({ show: true, stats: mkStats(25) as any, labelOf: (v: any) => String(v) });
    mount(() => h(ColDetailModal as any, props));
    await tick();
    const inp = document.body.querySelector('.rt-cd-kw') as HTMLInputElement;
    expect(inp, 'topTotal>20 出 kw 过滤（525 批契约）').toBeTruthy();
    expect(inp.tagName).toBe('INPUT');
    expect(inp.classList.contains('mono'), 'mono 字面锚同步更新').toBe(true);
    expect(inp.closest('.sfb'), '锚 input 在胶囊壳内（单源结构）').toBeTruthy();
    inp.value = 'v3';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect([...document.body.querySelectorAll('.rt-cd-v')].map(e => e.textContent)).toEqual(['v3']);
    /* 门控：≤20 整件不出（.rt-cd-kw 与壳一并缺席） */
    props.stats = mkStats(12) as any;
    await tick();
    expect(document.body.querySelector('.rt-cd-kw'), 'topTotal≤20 不出 kw').toBeNull();
    expect(document.body.querySelector('.rt-cd-kw-wrap'), '壳也一并缺席（v-if 在组件根）').toBeNull();
  });
});
