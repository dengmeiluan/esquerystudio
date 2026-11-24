/* MiniTable 语义小表统一件看守。范式同 emptyState.spec（createApp 手工 mount）。
 * 核心契约：声明式列渲染、按列插槽接管单元格、对齐/等宽档、空态走 EmptyState、
 * 斑马默认开（.tbl.zebra 全局样式吃得到）。 */
import { describe, it, expect } from 'vitest';
import { createApp, h } from 'vue';
import MiniTable, { type MiniTableColumn } from '../MiniTable.vue';

type MiniTableProps = InstanceType<typeof MiniTable>['$props'];

const COLS: MiniTableColumn[] = [
  { key: 'key', label: '设置键', mono: true },
  { key: 'rule', label: '规则' },
  { key: 'count', label: '数量', align: 'right', width: '80px' },
];

const ROWS = [
  { key: 'index.apack.mode', rule: 'apack-private', count: 3 },
  { key: 'index.store.type', rule: 'store-type-vendor', count: 1 },
];

function render(props: MiniTableProps, slots: Record<string, (s: any) => unknown> = {}): HTMLElement {
  const host = document.createElement('div');
  createApp({ render: () => h(MiniTable, props, slots) }).mount(host);
  return host.firstElementChild as HTMLElement;
}

describe('MiniTable', () => {
  it('表头按列声明渲染', () => {
    const root = render({ columns: COLS, rows: ROWS });
    const th = [...root.querySelectorAll('th')].map(t => t.textContent);
    expect(th).toEqual(['设置键', '规则', '数量']);
  });

  it('行数据默认渲染为文本，null/undefined 落占位符', () => {
    const root = render({ columns: COLS, rows: [{ key: 'index.ttl', rule: null, count: 2 }] });
    const td = [...root.querySelectorAll('tbody tr td')].map(t => t.textContent);
    expect(td[0]).toBe('index.ttl');
    expect(td[1]).toBe('—');
    expect(td[2]).toBe('2');
  });

  it('按列插槽接管单元格（富内容如 StatusPill）', () => {
    const root = render({ columns: COLS, rows: ROWS }, {
      'cell-rule': (s: { row: { rule: string } }) => h('b', { class: 'pill' }, s.row.rule),
    });
    const cell = root.querySelector('tbody tr td .pill');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('apack-private');
  });

  it('右对齐列落 mt-num 且表头同步右对齐', () => {
    const root = render({ columns: COLS, rows: ROWS });
    expect(root.querySelector('tbody td.mt-num')).not.toBeNull();
    expect(root.querySelectorAll('th')[2].classList.contains('mt-th-r')).toBe(true);
  });

  it('mono 列落 mt-mono', () => {
    expect(render({ columns: COLS, rows: ROWS }).querySelector('tbody td.mt-mono')).not.toBeNull();
  });

  it('空行走 EmptyState 统一空态，tbody 无行', () => {
    const root = render({ columns: COLS, rows: [], emptyText: '没有需要剔除的设置' });
    expect(root.querySelector('tbody tr')).toBeNull();
    expect(root.querySelector('.empty-state')!.textContent).toContain('没有需要剔除的设置');
  });

  it('斑马默认关（迁移收编点视觉零漂移），zebra=true 显式开启', () => {
    expect(render({ columns: COLS, rows: ROWS }).querySelector('table.zebra')).toBeNull();
    expect(render({ columns: COLS, rows: ROWS, zebra: true }).querySelector('table.tbl.zebra')).not.toBeNull();
  });

  it('caption 可选渲染', () => {
    expect(render({ columns: COLS, rows: ROWS, caption: '计划剔除清单' }).querySelector('.mt-cap')!.textContent).toContain('计划剔除清单');
    expect(render({ columns: COLS, rows: ROWS }).querySelector('.mt-cap')).toBeNull();
  });

  it('宿主皮肤类 tableClass 落到 table（迁移期选择器零漂移）', () => {
    expect(render({ columns: COLS, rows: ROWS, tableClass: 'xm-plan-tbl' }).querySelector('table.xm-plan-tbl')).not.toBeNull();
  });

  it('行键字段重复时不丢行（每行仍渲染）', () => {
    const root = render({
      columns: COLS,
      rows: [
        { key: 'index.hidden', rule: 'version-floor', count: 1 },
        { key: 'index.hidden', rule: 'version-floor', count: 1 },
      ],
      rowKey: 'rule',
    });
    expect(root.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('#rows 行自治槽：宿主自带整段行内容（含行事件/行类），声明式循环与统一空态让位', () => {
    const root = render({ columns: COLS, rows: [] }, {
      rows: () => h('tr', { class: 'host-row' }, [h('td', { colspan: 3 }, '自治行')]),
    });
    expect(root.querySelector('tbody tr.host-row')).not.toBeNull();
    expect(root.querySelector('tbody tr.host-row')!.textContent).toContain('自治行');
    /* rows 槽在场时不出统一空态（行自治=空态判断归宿主） */
    expect(root.querySelector('.empty-state')).toBeNull();
  });

  it('#tfoot 聚合行槽：tfoot 元素由组件渲染，内容经槽注入且沉底', () => {
    const root = render({ columns: COLS, rows: ROWS }, {
      tfoot: () => h('tr', { class: 'agg-row' }, [h('td', { colspan: '3' }, 'Σ 3')]),
    });
    const foot = root.querySelector('tfoot');
    expect(foot).not.toBeNull();
    expect(foot!.querySelector('tr.agg-row')!.textContent).toContain('Σ 3');
    expect(root.querySelector('table')!.lastElementChild!.tagName).toBe('TFOOT');
  });
});
