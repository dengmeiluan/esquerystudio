/**
 * R130 二十八批：QueryResultTable 偏好记忆守卫（useTablePrefs composable）。
 * 锁定：
 * 1) 无 storageKey（SQL 通道 R54 特例）：不渲染偏好工具行；列宽柄可用但仅内存；全列显示、不写 localStorage；
 * 2) 有 storageKey：工具行渲染、默认前 8 列、列计数可见；
 * 3) 行高三档钮写 es_tbl_rowh 全局键、cozy class 切换、重挂载恢复（245 批）；
 * 4) 列宽恢复（es_tbl_w:<dim> 预置 → th style 生效——ResultTable 原实现只写不读的缺口，此处锁恢复）；
 * 5) 拖拽表头右缘写 es_tbl_w:<dim>（mousedown/mousemove/mouseup 模拟）；
 * 6) 维度切换重读该维度记忆（列选互不串扰）；
 * 7) 排序键为列名而非 index（列集合变化不错列）。
 * composable 单测经 dummy 组件 setup 走（watch 需要组件效果环境）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, ref, reactive } from 'vue';
import { createPinia } from 'pinia';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api } };
});

import QueryResultTable from '../components/QueryResultTable.vue';
import { useTablePrefs } from '../composables/useTablePrefs';

/* hit 型样例：10 个 source 字段（超默认 8 列），无 _index/_score */
function makeHits(nFields: number) {
  const src: Record<string, any> = {};
  for (let i = 0; i < nFields; i++) src['f' + i] = i;
  return [{ _id: 'a', _source: { ...src } }];
}

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountComp(comp: any, props: Record<string, any>) {
  let exposed: any = null;
  const app = createApp({ setup: () => () => h(comp as any, { ...props, ref: (el: any) => { exposed = el; } }) });
  /* 三十六批起 QRT 内用 useAppStore（复制反馈 notify）——挂载须装 pinia */
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
  return { exposed: () => exposed };
}
async function mountTbl(props: Record<string, any>) { return mountComp(QueryResultTable, props); }

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('QueryResultTable 无 storageKey（SQL 通道零落盘）', () => {
  it('不渲染偏好工具行；列宽柄可用但只在内存（不写 localStorage）', async () => {
    await mountTbl({ hits: makeHits(10) as any });
    expect(host.querySelector('.qrt-bar')).toBeNull();
    /* 1136：DBX 式列宽拖拽对无 storageKey 宿主开放（内存态，每次挂载自足） */
    expect(host.querySelector('.qrt-rs')).not.toBeNull();
    /* hit 型列 = _id 前缀 + 10 个 source 字段；167 批起最前多一列冻结序号 */
    expect(host.querySelectorAll('th').length).toBe(12);
    /* 无任何偏好落盘 */
    expect(localStorage.getItem('es_tbl_dense:sql')).toBeNull();
    expect([...Array(localStorage.length)].map((_, i) => localStorage.key(i)!).filter(k => k.startsWith('es_tbl_w'))).toEqual([]);
  });
});

describe('QueryResultTable 记忆三件套', () => {
  it('有 storageKey：工具行渲染，默认前 8 列，列计数可见', async () => {
    await mountTbl({ hits: makeHits(10) as any, storageKey: 'lucene:idx-1' });
    const bar = host.querySelector('.qrt-bar');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('8/11');
    /* 8 数据列 + 冻结序号列（167 批） */
    expect(host.querySelectorAll('th').length).toBe(9);
  });

  it('行高三档（835 批「视图 ⋯」聚合菜单显式直选）：写 es_tbl_rowh（245 批全局键）+cozy class，重挂载恢复', async () => {
    await mountTbl({ hits: makeHits(3) as any, storageKey: 'lucene:idx-1' });
    /* 272 批起首钮是导出；835 批行高合并「视图 ⋯」聚合菜单（显式三选，循环钮退役） */
    ([...host.querySelectorAll('.qrt-bar-r button') as unknown as HTMLButtonElement[]].find(b => b.getAttribute('aria-label') === '视图设置') as HTMLButtonElement).click();
    await nextTick();
    [...host.querySelectorAll('.qrt-menu button') as unknown as HTMLButtonElement[]].find(b => b.textContent!.includes('宽松'))!.click();
    await nextTick();
    expect(localStorage.getItem('es_tbl_rowh')).toBe('cozy');
    expect(host.querySelector('.qrt-tbl')!.classList.contains('cozy')).toBe(true);
    host.innerHTML = '';
    apps.forEach(a => { try { a.unmount(); } catch { /* ignore */ } });
    apps.length = 0;
    await mountTbl({ hits: makeHits(3) as any, storageKey: 'lucene:idx-1' });
    expect(host.querySelector('.qrt-tbl')!.classList.contains('cozy')).toBe(true);
  });

  it('列宽恢复：预置 es_tbl_w:<dim>，重挂载 th style 生效（ResultTable 缺口的修复锁）', async () => {
    localStorage.setItem('es_tbl_w:lucene:idx-1', JSON.stringify({ f0: 234 }));
    await mountTbl({ hits: makeHits(3) as any, storageKey: 'lucene:idx-1' });
    const th = [...host.querySelectorAll('th')].find(t => t.textContent?.trim() === 'f0') as HTMLElement;
    expect(th.style.width).toBe('234px');
  });

  it('列宽批量重置（835 批合并「视图 ⋯」聚合菜单）：点击清全部列宽+LS 归 {}；无拖拽记录时项禁用（七十一批）', async () => {
    localStorage.setItem('es_tbl_w:lucene:idx-1', JSON.stringify({ f0: 234, f1: 300 }));
    await mountTbl({ hits: makeHits(3) as any, storageKey: 'lucene:idx-1' });
    /* 835 批：列宽重置收进「视图 ⋯」菜单——先开菜单再点项 */
    ([...host.querySelectorAll('.qrt-bar-r button') as unknown as HTMLButtonElement[]].find(b => b.getAttribute('aria-label') === '视图设置') as HTMLButtonElement).click();
    await nextTick();
    const btn = host.querySelector('.qrt-menu button[aria-label="重置全部列宽"]') as HTMLButtonElement;
    expect(btn, '菜单内应有重置列宽项').not.toBeNull();
    expect(btn.disabled).toBe(false);
    btn.click();
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    expect(JSON.parse(localStorage.getItem('es_tbl_w:lucene:idx-1') || '{}')).toEqual({});
    const th = [...host.querySelectorAll('th')].find(t => t.textContent?.trim() === 'f0') as HTMLElement;
    expect(th.style.width).toBe('');
    await mountTbl({ hits: makeHits(3) as any, storageKey: 'lucene:idx-1' });
    ([...host.querySelectorAll('.qrt-bar-r button') as unknown as HTMLButtonElement[]].find(b => b.getAttribute('aria-label') === '视图设置') as HTMLButtonElement).click();
    await nextTick();
    expect((host.querySelector('.qrt-menu button[aria-label="重置全部列宽"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('拖拽表头右缘写 es_tbl_w:<dim>（180 起始 + 60 位移 = 240），期间挂 body.col-resizing 光标态、松开摘除（三十五批接线）', async () => {
    await mountTbl({ hits: makeHits(3) as any, storageKey: 'lucene:idx-1' });
    const f0Th = [...host.querySelectorAll('th')].find(t => t.textContent?.trim() === 'f0')!;
    const rs = f0Th.querySelector('.qrt-rs') as HTMLElement;
    rs.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 160 }));
    expect(document.body.classList.contains('col-resizing'), '拖拽中应有全局光标态').toBe(true);
    window.dispatchEvent(new MouseEvent('mouseup'));
    await nextTick();
    expect(document.body.classList.contains('col-resizing'), '松开后应摘除光标态').toBe(false);
    const saved = JSON.parse(localStorage.getItem('es_tbl_w:lucene:idx-1') || '{}');
    expect(saved.f0).toBe(240);
  });

  it('维度切换重读：k1 存的列选不流入 k2（互不串扰）', async () => {
    /* k1 记忆：只留 f0、f1 */
    localStorage.setItem('es_cols:lucene:idx-1', JSON.stringify(['f0', 'f1']));
    const props = { hits: makeHits(10) as any, storageKey: 'lucene:idx-1' };
    await mountTbl(props);
    expect(host.querySelectorAll('th').length).toBe(3);
    /* 卸载后挂 k2：不得读到 k1 的列选，回默认前 8 */
    apps.forEach(a => { try { a.unmount(); } catch { /* ignore */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl({ hits: makeHits(10) as any, storageKey: 'lucene:idx-2' });
    expect(host.querySelectorAll('th').length).toBe(9);
  });
});

describe('QueryResultTable 排序列名键', () => {
  it('点列头排序生效（227 批 M2 起首点升序，与 RT 同向），箭头指对列', async () => {
    await mountTbl({
      hits: [
        { _id: 'a', _source: { name: 'banana', age: 2 } },
        { _id: 'b', _source: { name: 'apple', age: 3 } },
      ] as any,
      sortable: true, storageKey: 'k',
    });
    const ageTh = [...host.querySelectorAll('th')].find(t => t.textContent?.includes('age'))!;
    ageTh.click();
    await nextTick();
    /* 排序键为列名：age 升序 → banana(2) 在 apple(3) 前 */
    const rows = [...host.querySelectorAll('tbody tr')].map(tr => tr.children[3]?.textContent?.trim());
    expect(rows).toEqual(['2', '3']);
    expect(ageTh.querySelector('.qrt-sort-i')?.textContent).toBe('↑');
  });
});

/* ═══ 六十七批：QRT 排序记忆化对齐 ResultTable（二十七批）——
   带 storageKey 按 es_tbl_sort:<dim>:f/:d 同口径持久化；三击取消回原始序；
   storageKey 空（SQL 通道 R54）内存行为不变不落盘。 ═══ */
describe('QRT 排序记忆化（六十七批）', () => {
  const ROWS = [
    { _id: 'a', _source: { name: 'banana', age: 2 } },
    { _id: 'b', _source: { name: 'apple', age: 3 } },
    { _id: 'c', _source: { name: 'cherry', age: 1 } },
  ] as any;
  /* 列序：0=# 序号（167 批）、1=_id 前缀、2=name、3=age */
  const nameCol = () => [...host.querySelectorAll('tbody tr')].map(tr => tr.children[2]?.textContent?.trim());
  const thOf = (t: string) => [...host.querySelectorAll('th')].find(x => x.textContent?.includes(t))!;
  const sortKeysInLS = () => [...Array(localStorage.length)].map((_, i) => localStorage.key(i)!).filter(k => k.startsWith('es_tbl_sort'));

  it('带 storageKey：点击落盘 es_tbl_sort:<dim>:f/:d，重挂载恢复', async () => {
    await mountTbl({ hits: ROWS, sortable: true, storageKey: 'dk' });
    thOf('name').click();
    await nextTick();
    /* 227 批 M2：首击升序（与 RT 同向） */
    expect(localStorage.getItem('es_tbl_sort:dk:f')).toBe('name');
    expect(localStorage.getItem('es_tbl_sort:dk:d')).toBe('asc');
    expect(nameCol()).toEqual(['apple', 'banana', 'cherry']);
    await mountTbl({ hits: ROWS, sortable: true, storageKey: 'dk' });
    expect(nameCol()).toEqual(['apple', 'banana', 'cherry']);
    expect(thOf('name').querySelector('.qrt-sort-i')?.textContent).toBe('↑');
  });

  it('同列三击取消：升→降→取消回原始序（227 批 M2 对齐 RT），取消时移除键；aria-sort 同步（八十一批）', async () => {
    await mountTbl({ hits: ROWS, sortable: true, storageKey: 'dk2' });
    const th = thOf('name');
    th.click(); await nextTick();
    expect(th.getAttribute('aria-sort')).toBe('ascending');
    expect(localStorage.getItem('es_tbl_sort:dk2:d')).toBe('asc');
    expect(nameCol()).toEqual(['apple', 'banana', 'cherry']);
    th.click(); await nextTick();
    expect(th.getAttribute('aria-sort')).toBe('descending');
    expect(nameCol()).toEqual(['cherry', 'banana', 'apple']);
    th.click(); await nextTick();
    expect(th.getAttribute('aria-sort')).toBe(null);
    expect(nameCol()).toEqual(['banana', 'apple', 'cherry']);
    expect(localStorage.getItem('es_tbl_sort:dk2:f')).toBe(null);
    expect(localStorage.getItem('es_tbl_sort:dk2:d')).toBe(null);
  });

  it('无 storageKey（SQL 通道 R54）：排序仅内存，不写任何 es_tbl_sort 键', async () => {
    await mountTbl({ hits: ROWS, sortable: true });
    thOf('name').click();
    await nextTick();
    expect(nameCol()).toEqual(['apple', 'banana', 'cherry']);
    expect(sortKeysInLS()).toEqual([]);
  });

  it('维度切换重读该维度排序记忆（新维度无记忆回原始序）', async () => {
    localStorage.setItem('es_tbl_sort:dx:f', 'name');
    localStorage.setItem('es_tbl_sort:dx:d', 'asc');
    const pstate = reactive({ hits: ROWS, sortable: true, storageKey: 'dx' });
    const app = createApp({ setup: () => () => h(QueryResultTable as any, pstate) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    expect(nameCol()).toEqual(['apple', 'banana', 'cherry']);
    pstate.storageKey = 'dy';
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    expect(nameCol()).toEqual(['banana', 'apple', 'cherry']);
  });
});

/* ═══ 八十批：getCsvBlock 行为验证（76 批只有静态锁，列对齐逻辑无行为断言）——
   hit 型列对齐（列名→列 index 映射）+ 可见列子集 + 排序行序三件事都要对。 ═══ */
describe('QRT getCsvBlock 行为（八十批）', () => {
  it('head=可见列、rows=排序后按可见列对齐；列选隐藏列不出现', async () => {
    /* 预置列选（隐藏 age 列）→ CSV 不应出现 age；LS 在挂载时读，单挂载即可 */
    localStorage.setItem('es_cols:cb', JSON.stringify(['_id', 'name', 'city']));
    const { exposed } = await mountTbl({
      hits: [
        { _id: 'a', _source: { name: 'banana', age: 2, city: 'sh' } },
        { _id: 'b', _source: { name: 'apple', age: 3, city: 'bj' } },
        { _id: 'c', _source: { name: 'cherry', age: 1, city: 'gz' } },
      ] as any,
      sortable: true, storageKey: 'cb',
    });
    const blk = exposed().getCsvBlock();
    expect(blk.head).toEqual(['_id', 'name', 'city']);
    /* 点 name 列头排序（227 批 M2 起首点升序）：行序 apple→banana→cherry，city 值与同列对齐 */
    const nameTh = [...host.querySelectorAll('th')].find(t => t.textContent?.trim().startsWith('name'))!;
    nameTh.click();
    for (let i = 0; i < 3; i++) { await nextTick(); await Promise.resolve(); }
    const blk2 = exposed().getCsvBlock();
    expect(blk2.head).toEqual(['_id', 'name', 'city']);
    expect(blk2.rows.map((r: any[]) => r[1])).toEqual(['apple', 'banana', 'cherry']);
    expect(blk2.rows.map((r: any[]) => r[2])).toEqual(['bj', 'sh', 'gz']);
    expect(blk2.rows.every((r: any[]) => r.length === 3)).toBe(true);
  });
});

/* ═══ 八十八批：排序列被列选隐藏→清空排序（所见即所序，27 批 RT 同款 QRT 补齐） ═══ */
describe('QRT 排序列隐藏自愈（八十八批）', () => {
  it('挂载时持久化排序列不在列选内→立刻清排序+移除 LS 键', async () => {
    localStorage.setItem('es_tbl_sort:hz:f', 'name');
    localStorage.setItem('es_tbl_sort:hz:d', 'desc');
    localStorage.setItem('es_cols:hz', JSON.stringify(['_id', 'age']));
    await mountTbl({
      hits: [
        { _id: 'a', _source: { name: 'banana', age: 2 } },
        { _id: 'b', _source: { name: 'apple', age: 3 } },
      ] as any,
      sortable: true, storageKey: 'hz',
    });
    /* name 已被列选隐藏：排序必须被清（否则按隐藏列暗状态排序） */
    expect(localStorage.getItem('es_tbl_sort:hz:f')).toBe(null);
    expect(localStorage.getItem('es_tbl_sort:hz:d')).toBe(null);
    /* 行序回原始（无排序） */
    /* 五百五十四批同步更新：renderRows 改按 shownCols 投影（数量截齐在隐藏列交错时切错位；
       原 body 全列渲染是错位形态=隐藏列值漂移到右邻表头下），age 显示位 children[3]→[2]，
       锁意图=自愈后行序回原始不破 */
    const rows = [...host.querySelectorAll('tbody tr')].map(tr => tr.children[2]?.textContent?.trim());
    expect(rows).toEqual(['2', '3']);
  });
});

describe('QRT 单元格交互（三十六批对齐 ResultTable）', () => {
  it('空值渲染灰 ∅ 且 title 为空；非空值 title 全文', async () => {
    await mountTbl({
      hits: [{ _id: 'a', _source: { v: 'hello', e: null } }] as any,
      storageKey: 'k',
    });
    const tds = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td');
    const tdV = tds[2] as HTMLElement; // 列序：#（167 批）、_id, v, e
    const tdE = tds[3] as HTMLElement;
    expect(tdV.querySelector('.qrt-null')).toBeNull();
    expect(tdV.getAttribute('title')).toBe('hello');
    expect(tdE.querySelector('.qrt-null')).not.toBeNull();
    expect(tdE.getAttribute('title')).toBe('');
  });

  it('非空单元格可复制（显式路径：右键「复制值」）；单击不再复制', async () => {
    /* 1374：单击自动复制退役——与 RT 同一裁决（原话「单击就复制不对，我本来想复制值进去，
       那不就还要复制一次吗」）。复制能力本身不变，入口改成右键菜单「复制值」。 */
    const mod = await import('../utils/format');
    const spy = vi.spyOn(mod, 'copyText').mockResolvedValue(true);
    await mountTbl({
      hits: [{ _id: 'a', _source: { v: 'hello', e: null } }] as any,
      storageKey: 'k',
    });
    const src = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
    const at = src.indexOf("{ key: 'copy-val'");
    expect(at, '右键菜单必须有「复制值」').toBeGreaterThan(-1);
    /* 该项直接内联调 copyText（不走 copyCell），所以断言「真的写剪贴板」而不是某个函数名 */
    expect(src.slice(at, at + 260), '「复制值」必须真的写剪贴板').toContain('copyText(');
    /* 单击非空格：不得再写剪贴板 */
    const tds = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td');
    (tds[2] as HTMLElement).click();
    await new Promise(r => setTimeout(r, 10));
    expect(spy, '单击不得再写剪贴板').not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('useTablePrefs composable', () => {
  it('toggleCol/showAllCols/showFirstCols 与持久化、列失效自动剔除', async () => {
    let api: any = null;
    const dim = ref<string | null>('k1');
    const cols = ref(['a', 'b', 'c', 'd']);
    const app = createApp({
      setup() {
        api = useTablePrefs(dim, cols);
        return () => h('div');
      },
    });
    app.mount(host);
    apps.push(app);
    await nextTick();
    /* 默认前 8（4 列全显）→ 整组替换（ColPicker emit 路径）→ 持久化（watch pre-flush 异步，须 nextTick） */
    expect(api.visibleCols.value).toEqual(['a', 'b', 'c', 'd']);
    api.visibleCols.value = ['a', 'c', 'd'];
    await nextTick();
    expect(api.visibleCols.value).toEqual(['a', 'c', 'd']);
    expect(JSON.parse(localStorage.getItem('es_cols:k1')!)).toEqual(['a', 'c', 'd']);
    /* 列集合变化：saved 里失效列被剔除、恢复不阻塞（ResultTable 同款 valid 过滤） */
    localStorage.setItem('es_cols:k1', JSON.stringify(['a', 'x', 'd']));
    cols.value = ['a', 'b', 'c', 'd', 'e'];
    await nextTick(); await nextTick();
    expect(api.visibleCols.value).toEqual(['a', 'd']);
    /* 失效列 x 自愈回写——记忆里不留幽灵列（防漂移契约） */
    expect(JSON.parse(localStorage.getItem('es_cols:k1')!)).toEqual(['a', 'd']);
    /* 维度切 null：记忆关闭，不再改写已存记录 */
    dim.value = null;
    await nextTick(); await nextTick();
    expect(JSON.parse(localStorage.getItem('es_cols:k1')!)).toEqual(['a', 'd']);
    /* 重新指回 k1：重读该维度记忆 */
    dim.value = 'k1';
    await nextTick(); await nextTick();
    expect(api.visibleCols.value).toEqual(['a', 'd']);
  });
});

describe('QRT epoch 毫秒人性化（四十二批）', () => {
  it('13 位毫秒显示为日期，title 保留原始值；普通数字不转换', async () => {
    await mountTbl({
      hits: [{ _id: 'a', _source: { ts: 1700000000000, n: 12345 } }] as any,
      storageKey: 'k',
    });
    const tds = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td');
    const tdTs = tds[2] as HTMLElement; // 列序：#（167 批）、_id, ts, n
    const tdN = tds[3] as HTMLElement;
    expect(tdTs.textContent?.trim()).toBe('2023-11-15 06:13:20');
    expect(tdTs.getAttribute('title')).toBe('1700000000000');
    /* 五十四批起 12345 ≥1e4 走千分位 */
    expect(tdN.textContent?.trim()).toBe('12,345');
  });
});

describe('QRT 长值展开（五十一批）', () => {
  const longVal = 'x'.repeat(200);

  it('截断值单击=展开显示全文，再点收起，非截断单击=复制', async () => {
    const mod = await import('../utils/format');
    const spy = vi.spyOn(mod, 'copyText').mockResolvedValue(true);
    await mountTbl({
      hits: [{ _id: 'a', _source: { long: longVal, short: 'abc' } }] as any,
      storageKey: 'k',
    });
    const tds = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td');
    const tdLong = tds[2] as HTMLElement; // 列序：#（167 批）、_id, long, short
    const tdShort = tds[3] as HTMLElement;
    /* 截断态：文本以 … 结尾 */
    expect(tdLong.textContent?.trim().endsWith('…')).toBe(true);
    /* 单击截断值 → 展开全文 */
    tdLong.click();
    await nextTick();
    expect(tdLong.className).toContain('expanded');
    expect(tdLong.textContent?.trim()).toBe(longVal);
    /* 再点收起 */
    tdLong.click();
    await nextTick();
    expect(tdLong.className).not.toContain('expanded');
    /* 非截断值单击：既不展开、也不再复制（1374 单击复制退役） */
    (tdShort as HTMLElement).click();
    await new Promise(r => setTimeout(r, 10));
    expect(spy, '单击不再复制').not.toHaveBeenCalled();
    expect((tds[3] as HTMLElement).className).not.toContain('expanded');
    spy.mockRestore();
  });

  it('排序点击清空展开态（坐标键防错位）', async () => {
    await mountTbl({
      hits: [{ _id: 'a', _source: { long: longVal, age: 1 } }] as any,
      storageKey: 'k', sortable: true,
    });
    const td = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td')[2] as HTMLElement;
    td.click();
    await nextTick();
    expect(td.className).toContain('expanded');
    const th = [...host.querySelectorAll('th')].find(t => t.textContent?.trim().startsWith('age'))!;
    th.click();
    await nextTick();
    const tdAfter = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td')[2] as HTMLElement;
    expect(tdAfter.className).not.toContain('expanded');
  });
});

describe('QRT 大整数千分位（五十四批）', () => {
  it('≥1e4 整数千分位显示（title/复制原始值）；小数字/小数/epoch 不受影响', async () => {
    const mod = await import('../utils/format');
    const spy = vi.spyOn(mod, 'copyText').mockResolvedValue(true);
    await mountTbl({
      hits: [{ _id: 'a', _source: { big: 1234567, small: 42, frac: 1.5, ts: 1700000000000 } }] as any,
      storageKey: 'k',
    });
    const tds = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td');
    const tdBig = tds[2] as HTMLElement;   // 列序：#（167 批）、_id, big, small, frac, ts
    const tdSmall = tds[3] as HTMLElement;
    const tdFrac = tds[4] as HTMLElement;
    const tdTs = tds[5] as HTMLElement;
    expect(tdBig.textContent?.trim()).toBe('1,234,567');
    expect(tdBig.getAttribute('title')).toBe('1234567');
    expect(tdSmall.textContent?.trim()).toBe('42');
    expect(tdFrac.textContent?.trim()).toBe('1.5');
    expect(tdTs.textContent?.trim()).toContain('2023-11-15');
    /* 复制原始值 */
    tdBig.click();
    /* 1374：单击复制退役后，这里只守「展示千分位、title/复制口径是原始值」。
       复制本身走右键「复制值」（copyCell 传 String(原始值)），由 1374 的菜单绑定锁覆盖。 */
    expect(tdBig.getAttribute('title')).toBe('1234567');
    spy.mockRestore();
  });
});

/* ═══ 五十九批：切换记忆维度清空展开态（坐标键跨维度错位防残留） ═══ */
describe('QRT 维度切换清理（五十九批）', () => {
  it('storageKey 变化后展开态清零（不残留到新结果集）', async () => {
    const longVal = 'x'.repeat(200) + '-end';
    const pstate = reactive({
      hits: [{ _id: 'a', _source: { long: longVal } }] as any,
      storageKey: 'k1',
    });
    const app = createApp({ setup: () => () => h(QueryResultTable as any, pstate) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const td = host.querySelector('tbody tr td:nth-child(3)') as HTMLElement;
    expect(td.textContent?.trim().endsWith('…')).toBe(true);
    td.click();
    await nextTick();
    expect(td.classList.contains('expanded')).toBe(true);
    /* 同实例切换维度 → 展开态清零 */
    pstate.storageKey = 'k2';
    await nextTick();
    await nextTick();
    const td2 = host.querySelector('tbody tr td:nth-child(3)') as HTMLElement;
    expect(td2.classList.contains('expanded')).toBe(false);
  });
});
