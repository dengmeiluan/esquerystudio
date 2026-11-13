/**
 * 五百二十八批 W-A：TableShell 第二刀——composables 层归一回归网（行为零变化）。
 * 锁定：
 * 1) 双内核同源：QRT/RT 源码均 import useRenderMore/useAggRow/typeTiers（接线行在内核保位）；
 * 2) useRenderMore 行为抽样：截断 2000/renderMore 续渲/行集变化自动回首批/哨兵 IO 根；
 * 3) useAggRow 行为抽样：无维度内存态 toggle、es_tbl_agg 落盘、aggFoot 按参数列集出 Σ；
 * 4) typeTiers 纯函数：typeCls 五类语义色 + NUMERIC_TYPES_RE 数值族；
 * 5) RT 空态骨架链参数化：缺省=既有现状（5 行 26px/60vh/无数据），传参生效=调用方可调。
 * 挂载样板照抄 tableKernelContracts527（裸 createApp + pinia + api mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api } };
});

import ResultTable from '../components/ResultTable.vue';
import { useRenderMore, MAX_RENDER } from '../composables/useRenderMore';
import { useAggRow } from '../composables/useAggRow';
import { typeCls, NUMERIC_TYPES_RE } from '../utils/typeTiers';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const qrt = read('../components/QueryResultTable.vue');
const rt = read('../components/ResultTable.vue');
const rm = read('../composables/useRenderMore.ts');
const ag = read('../composables/useAggRow.ts');
const tt = read('../utils/typeTiers.ts');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

/* composable 行为 harness（无模板：createApp setup 内挂 composable，结果镜像到 outer） */
function runSetup(fn: () => void) {
  const app = createApp({ setup() { fn(); return () => h('div'); } });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('双内核同源（528 第二刀抽取）', () => {
  it('QRT/RT 源码均 import useRenderMore/useAggRow/typeTiers 且接线在内核保位', () => {
    for (const [src, rows] of [[qrt, 'sortedRows'], [rt, 'sortedHits']] as const) {
      expect(src).toContain("from '../composables/useRenderMore'");
      expect(src).toContain("from '../composables/useAggRow'");
      expect(src).toContain("from '../utils/typeTiers'");
      expect(src).toMatch(new RegExp(`useRenderMore\\(\\(\\) => ${rows}\\.value, \\(\\) => rootEl\\.value\\);`));
      expect(src).toMatch(/useAggRow\(/);
    }
    /* 聚合列集参数化：QRT shownCols vs RT visibleCols（唯一差 → renderCols 参数） */
    expect(qrt).toMatch(/useAggRow\(\s*dimension,\s*\(\) => shownCols\.value,/);
    expect(rt).toMatch(/useAggRow\(\s*dimension,\s*\(\) => visibleCols\.value,/);
  });

  it('531 批同步更新：内核三件（quickFilter/selectable/exportRowFilter）双内核同源可选声明', () => {
    for (const src of [qrt, rt]) {
      expect(src).toMatch(/quickFilter\?: string;/);
      expect(src).toMatch(/selectable\?: boolean;/);
      expect(src).toMatch(/exportRowFilter\?: \(row: unknown\) => boolean;/);
    }
    /* QRT 独有第五件（531 批新增）：rowDrawer 同为可选声明（形态对齐，缺省关） */
    expect(qrt).toMatch(/rowDrawer\?: boolean;/);
  });

  it('三新件本体契约：MAX_RENDER=2000/rootMargin 80px/es_tbl_agg 键/typeCls 五类同值', () => {
    expect(MAX_RENDER).toBe(2000);
    expect(rm).toMatch(/export const MAX_RENDER = 2000;/);
    expect(rm).toMatch(/\{ root: root\(\), rootMargin: '80px' \}/);
    expect(ag).toContain("localStorage.getItem('es_tbl_agg:' + d) === '1'");
    expect(tt).toContain('export function typeCls(t?: string): string');
    expect(NUMERIC_TYPES_RE.test('long') && NUMERIC_TYPES_RE.test('scaled_float') && !NUMERIC_TYPES_RE.test('keyword')).toBe(true);
  });
});

describe('useRenderMore 行为抽样（528 抽取零变化）', () => {
  it('截断 2000 → renderMore 续渲 → 行集变化自动回首批；truncated 联动', async () => {
    let out: any = null;
    let data = ref(Array.from({ length: 2500 }, (_, i) => i));
    runSetup(() => {
      out = useRenderMore(() => data.value, () => null);
    });
    await nextTick();
    expect(out.rows.value.length).toBe(2000);
    expect(out.truncated.value).toBe(true);
    out.renderMore();
    expect(out.rows.value.length).toBe(2500);
    expect(out.truncated.value).toBe(false);
    /* 行集变化（新查询/换页）自动回到首批 2000 行 */
    data.value = Array.from({ length: 2200 }, (_, i) => i);
    await nextTick();
    expect(out.rows.value.length).toBe(2000);
    expect(out.truncated.value).toBe(true);
  });

  it('哨兵 ref 可绑定（模板 ref 契约：解构 ref 由内核模板 ref="truncSentinel" 消费）', async () => {
    let out: any = null;
    runSetup(() => {
      out = useRenderMore(() => [1, 2, 3], () => null);
    });
    await nextTick();
    expect(out.truncSentinel.value).toBeNull(); /* 未挂哨兵行时 null（与内核空闲态一致） */
  });
});

describe('useAggRow 行为抽样（528 抽取零变化）', () => {
  it('无维度：内存态 toggle；有维度：es_tbl_agg 落盘且 aggFoot 按参数列集出数值', async () => {
    let a: any = null, b: any = null, b2: any = null;
    const dim = ref<string | null>(null);
    const num = (c: string) => (c === 'n' ? { sum: 3, avg: 1.5, min: 1, max: 2 } : undefined);
    runSetup(() => {
      a = useAggRow(dim, () => ['n', 's'], num);
      b = useAggRow(ref('diag:demo'), () => ['n'], num);
    });
    await nextTick();
    /* 无维度内存态：默认关，toggle 只改内存不落盘 */
    expect(a.aggOn.value).toBe(false);
    expect(a.aggFoot.value).toBeNull();
    a.toggleAggRow();
    expect(a.aggOn.value).toBe(true);
    expect(a.aggFoot.value).toEqual({ n: { sum: 3, avg: 1.5, min: 1, max: 2 } }); /* s 列非数值自动出局 */
    expect(localStorage.getItem('es_tbl_agg:null')).toBeNull();
    /* 有维度：toggle 落盘 '1'；重开 composable 按落盘恢复（重挂载恢复语义） */
    b.toggleAggRow();
    expect(localStorage.getItem('es_tbl_agg:diag:demo')).toBe('1');
    runSetup(() => { b2 = useAggRow(ref('diag:demo'), () => ['n'], num); });
    await nextTick();
    expect(b2.aggOn.value).toBe(true);
  });
});

describe('typeTiers 纯函数（233 批五类口径平移）', () => {
  it('typeCls 五类语义色与 NUMERIC_TYPES_RE 同族（QRT/RT 同源同值）', () => {
    expect(typeCls('long')).toBe('rt-ty-num');
    expect(typeCls('date_nanos')).toBe('rt-ty-date');
    expect(typeCls('boolean')).toBe('rt-ty-bool');
    expect(typeCls('match_only_text')).toBe('rt-ty-text');
    expect(typeCls('keyword')).toBe('rt-ty-kw');
    expect(typeCls(undefined)).toBe('');
  });
});

describe('RT 空态骨架链参数化（268 批现状为缺省，528 参数化）', () => {
  it('loading 态：缺省=既有现状（5 行 26px 骨架）；传参生效（2 行 40px）', async () => {
    await mountTbl(ResultTable, { hits: [], total: 0, index: 'w528a', loading: true });
    const sks = [...host.querySelectorAll('.rt-loading .sk')] as HTMLElement[];
    expect(sks.length).toBe(5); /* 缺省 skeletonRows=5（268 批现状） */
    expect(sks[0].style.height).toBe('26px'); /* 缺省 skeletonH='26px' */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    host.innerHTML = '';

    await mountTbl(ResultTable, { hits: [], total: 0, index: 'w528b', loading: true, skeletonRows: 2, skeletonH: '40px' });
    const sks2 = [...host.querySelectorAll('.rt-loading .sk')] as HTMLElement[];
    expect(sks2.length).toBe(2);
    expect(sks2[0].style.height).toBe('40px');
  });

  it('空态：文案缺省=无数据+既有 hint（copywritingGuard294 口径）；传参生效', async () => {
    await mountTbl(ResultTable, { hits: [], total: 0, index: 'w528c' });
    expect(host.querySelector('.empty-state .es-text')?.textContent).toContain('无数据');
    expect(host.querySelector('.empty-state .es-hint')?.textContent).toContain('调整查询条件或切换索引后重查');
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    host.innerHTML = '';

    await mountTbl(ResultTable, { hits: [], total: 0, index: 'w528d', emptyText: '没有节点', emptyHint: '换条件' });
    expect(host.querySelector('.empty-state .es-text')?.textContent).toContain('没有节点');
    expect(host.querySelector('.empty-state .es-hint')?.textContent).toContain('换条件');
  });
});
