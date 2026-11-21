/* QueryResultTable 看守：轻量只读通用结果表的接口锁住，范式同 timeCell.spec——
 * 项目无 @vue/test-utils，用 createApp 手工 mount，判据落在渲染结果上。 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../QueryResultTable.vue';

type QRTProps = InstanceType<typeof QueryResultTable>['$props'];

function render(props: QRTProps): HTMLElement {
  const host = document.createElement('div');
  const app = createApp({ render: () => h(QueryResultTable, props) });
  app.use(createPinia());
  app.mount(host);
  return host;
}

/* 抽某列 body 单元格文本（含 title 全文不在此，只看可见文本） */
function colValues(root: HTMLElement, colIndex: number): string[] {
  return Array.from(root.querySelectorAll('tbody tr')).map(
    tr => (tr.children[colIndex] as HTMLElement).textContent?.trim() ?? ''
  );
}

function headers(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('thead th')).map(th => th.textContent?.trim() ?? '');
}

describe('QueryResultTable · hit 型', () => {
  const hits = [
    { _id: '1', _index: 'idx-a', _score: 1.5, _source: { a: 'x', b: 2 } },
    { _id: '2', _index: 'idx-a', _score: null, _source: { b: 3, c: [1, 2], a: null } },
  ];

  it('列 = _id/_index/_score 固定前缀 + _source 键并集（按首次出现顺序）', () => {
    const root = render({ hits });
    // a 首现于 hit1，b 首现于 hit1，c 首现于 hit2 —— 顺序 a,b,c（167 批起最前多冻结序号列）
    expect(headers(root)).toEqual(['#', '_id', '_index', '_score', 'a', 'b', 'c']);
  });

  it('某 hit 无 _score 时不渲染 _score 列（有则显示）', () => {
    const root = render({ hits: hits.map(h => ({ ...h, _score: null })) });
    expect(headers(root)).toEqual(['#', '_id', '_index', 'a', 'b', 'c']);
  });

  it('空值（null/undefined/缺键）渲染灰 ∅（三十六批与 ResultTable 统一）', () => {
    const root = render({ hits });
    // hit1 的 c 缺键 → null → ∅；hit2 的 a = null → ∅（列序：0=#、1=_id、2=_index、3=_score、4=a、5=b、6=c）
    expect(colValues(root, 4)[1]).toBe('∅');
    expect(colValues(root, 6)[0]).toBe('∅');
  });

  it('对象/数组 JSON.stringify 截断 + title 全文', () => {
    const big = { long: 'x'.repeat(300) };
    const root = render({ hits: [{ _id: '1', _index: 'i', _score: 1, _source: { obj: big } }] });
    // 列序 #/_id/_index/_score/obj，对象落在第 5 格（index 4）
    const cell = root.querySelectorAll('tbody td')[4] as HTMLElement;
    const full = JSON.stringify(big);
    expect(cell.textContent).not.toBe(full);
    expect(cell.textContent).toContain('…');
    expect(cell.getAttribute('title')).toBe(full);
  });

  it('空 hits 显示 emptyText（默认 无数据，266 批统一）', () => {
    expect(render({ hits: [] }).textContent).toContain('无数据');
    expect(render({ hits: [], emptyText: '没查到' }).textContent).toContain('没查到');
  });
});

describe('QueryResultTable · rows 型', () => {
  it('cols 作表头 + rows 直渲（原样，不抽列）', () => {
    const root = render({ cols: ['name', 'age'], rows: [['a', 1], ['b', 2]] });
    /* 528 批徽标按值档扩权：rows 型采样（数值≥50%→double）白得列头类型徽标，textContent 拼出 agedouble（tableKernelContracts527 同款随迁） */
    expect(headers(root)).toEqual(['#', 'name', 'agedouble']);
    expect(colValues(root, 1)).toEqual(['a', 'b']);
    expect(colValues(root, 2)).toEqual(['1', '2']);
  });

  it('空 rows 显示 emptyText', () => {
    expect(render({ cols: ['a'], rows: [] }).textContent).toContain('无数据');
  });

  it('单元格截断 + title 全文（长字符串）', () => {
    const long = 'y'.repeat(300);
    const root = render({ cols: ['v'], rows: [[long]] });
    const cell = root.querySelectorAll('tbody td')[1] as HTMLElement; // [0] 是冻结序号列（167 批）
    expect(cell.textContent).toContain('…');
    expect(cell.getAttribute('title')).toBe(long);
  });
});

describe('QueryResultTable · sortable', () => {
  it('数字列按数值排序（10 不会排在 2 前面）', async () => {
    const root = render({ cols: ['n'], rows: [[2], [10], [1]], sortable: true });
    const th = root.querySelectorAll('thead th')[1] as HTMLElement; // [0] 是冻结序号列（167 批）
    th.click(); await nextTick();  // 首击升序（227 批 M2 与 RT 同向）
    expect(colValues(root, 1)).toEqual(['1', '2', '10']);
    th.click(); await nextTick();  // 再击降序
    expect(colValues(root, 1)).toEqual(['10', '2', '1']);
  });

  it('非数字列按字符串排序（localeCompare 字典序，非数值）', async () => {
    const root = render({ cols: ['s'], rows: [['pear'], ['apple'], ['fig']], sortable: true });
    const th = root.querySelectorAll('thead th')[1] as HTMLElement; // [0] 是冻结序号列（167 批）
    th.click(); await nextTick();  // 首击升序
    expect(colValues(root, 1)).toEqual(['apple', 'fig', 'pear']);
    th.click(); await nextTick();  // 再击降序
    expect(colValues(root, 1)).toEqual(['pear', 'fig', 'apple']);
  });

  it('sortable=false 时表头不可点击排序（保持原行序）', () => {
    const root = render({ cols: ['n'], rows: [[2], [1]], sortable: false });
    expect(root.querySelector('thead th.sortable')).toBeNull();
    expect(colValues(root, 1)).toEqual(['2', '1']);
  });

  it('getSortedRows 暴露当前排序后的原始值（供 CSV 跟随行序）', async () => {
    const host = document.createElement('div');
    const inst: any = {};
    createApp({
      render: () => h(QueryResultTable, { cols: ['n'], rows: [[2], [10], [1]], sortable: true, ref: (r: any) => (inst.value = r) }),
    }).mount(host);
    const th = host.querySelectorAll('thead th')[1] as HTMLElement; // [0] 是冻结序号列（167 批）
    th.click(); await nextTick();
    /* 227 批 M2 起首击升序 */
    expect(inst.value.getSortedRows()).toEqual([[1], [2], [10]]);
  });
});
