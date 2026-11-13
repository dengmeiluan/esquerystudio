/**
 * 五百二十七批 W-D：双内核契约四件套 + TableShell 壳消费回归锁。
 * 1) rowClass 行级条件色档——返回值追加到数据行 tr class（空格拼接、与既有 sel/焦点类并存、
 *    undefined/null/空串跳过）；
 * 2) exportName/exportCell 导出加工——文件名主段生效、矩阵值加工后导出、显示不受影响、缺省维持现状；
 * 3) QRT 按值语义档——ISO 采样判 date、数值形态判 double、显式 fieldTypes 压住自动档、
 *    混合列（无过半形态）不误判；类型徽标/双层列头仍以显式 fieldTypes 为准（171/233 批口径不动）；
 * 4) QRT #cell-<key> 作用域槽——有槽完全接管该格内容（传 row/value/col），无槽走既有语义渲染。
 * 挂载样板照抄 cmdTableCmds/rtRowExpand（裸 createApp + pinia + api mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api } };
});

import ResultTable from '../components/ResultTable.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(comp: any, props: Record<string, any>, slots?: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props, slots) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

/* happy-dom 无布局引擎（offsetParent 恒 null）——实例级 defineProperty 模拟「可见」（table-cmd 响应门槛） */
function markVisible(rootSel: string) {
  const root = host.querySelector(rootSel) as any;
  Object.defineProperty(root, 'offsetParent', { value: document.body, configurable: true });
}

const fire = (cmd: string) => window.dispatchEvent(new CustomEvent('table-cmd', { detail: { cmd } }));
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
/* 数据行 tr（剔除 rt-expand 展开行） */
const dataRows = () => [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('rt-expand')) as HTMLElement[];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('rowClass 行级条件色档（527 契约）', () => {
  it('QRT rows 型：返回值→tr class 在场（空格拼接拆多类）；undefined→无附加；row 入参=矩阵行', async () => {
    const seen: any[] = [];
    await mountTbl(QueryResultTable, {
      cols: ['n'], rows: [['a'], ['b'], ['c']],
      rowClass: (row: any, i: number) => { seen.push(row); return i === 0 ? 'hot-row' : i === 1 ? 'warm row2' : undefined; },
    });
    const trs = dataRows();
    expect(trs[0].classList.contains('hot-row')).toBe(true);
    expect(trs[1].classList.contains('warm') && trs[1].classList.contains('row2')).toBe(true);
    expect(trs[2].className).toBe(''); /* undefined/空串跳过 */
    expect(seen[0]).toEqual(['a']); /* row=渲染矩阵行 */
  });

  it('QRT：与既有焦点类并存（focus 后 qrt-row-focus + rowClass 同 tr）', async () => {
    await mountTbl(QueryResultTable, {
      cols: ['n'], rows: [['a'], ['b']],
      rowClass: (_r: any, i: number) => (i === 0 ? 'hot-row' : undefined),
    });
    (host.querySelector('.qrt') as HTMLElement).focus();
    (host.querySelector('.qrt') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
    const tr = dataRows()[0];
    expect(tr.classList.contains('qrt-row-focus')).toBe(true);
    expect(tr.classList.contains('hot-row')).toBe(true);
  });

  it('RT hit 型：返回值→tr class 在场；与既有 sel（勾选）类并存', async () => {
    await mountTbl(ResultTable, {
      hits: HITS, total: 2, index: 'rc1',
      rowClass: (h: any, i: number) => (i === 0 ? 'hot-row' : null),
    });
    const trs = dataRows();
    expect(trs[0].classList.contains('hot-row')).toBe(true);
    expect(trs[1].classList.contains('hot-row')).toBe(false); /* null 跳过 */
    (trs[0].querySelector('input[type="checkbox"]') as HTMLElement).click();
    await tick();
    expect(trs[0].classList.contains('sel')).toBe(true);
    expect(trs[0].classList.contains('hot-row')).toBe(true);
  });
});

describe('exportName/exportCell 导出加工（527 契约）', () => {
  it('QRT：exportName 生效 + exportCell 转换导出矩阵 + 显示不受影响', async () => {
    const mod = await import('../utils/format');
    const dl = vi.spyOn(mod, 'downloadText').mockImplementation(() => {});
    await mountTbl(QueryResultTable, {
      hits: HITS, storageKey: 't527a',
      exportName: 'my-dim',
      exportCell: (v: unknown, col: { key: string }) => (col.key === 'age' ? (v as number) * 100 : v),
    });
    markVisible('.qrt');
    fire('export');
    await tick();
    const [name, content] = dl.mock.calls[dl.mock.calls.length - 1] as any[];
    expect(name).toMatch(/^my-dim-\d{8}-\d{6}\.csv$/);
    expect(String(content)).toContain('200'); /* age 2→200（仅导出） */
    expect(String(content)).toContain('300'); /* age 3→300 */
    /* 显示不受影响：表格所见仍为原值 */
    const tds = dataRows()[0].querySelectorAll('td');
    expect(tds[tds.length - 1].textContent?.trim()).toBe('2');
    dl.mockRestore();
  });

  it('QRT：缺省维持 table-export- 现状、导出原值（cmdTableCmds 174 批口径不回退）', async () => {
    const mod = await import('../utils/format');
    const dl = vi.spyOn(mod, 'downloadText').mockImplementation(() => {});
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 't527b' });
    markVisible('.qrt');
    fire('export');
    await tick();
    const [name, content] = dl.mock.calls[dl.mock.calls.length - 1] as any[];
    expect(name).toMatch(/^table-export-\d{8}-\d{6}\.csv$/);
    expect(String(content)).toContain('"a","banana","2"');
    dl.mockRestore();
  });

  it('RT：exportName 生效 + exportCell 转换 CSV 导出 + 显示不受影响', async () => {
    const mod = await import('../utils/format');
    const dl = vi.spyOn(mod, 'downloadText').mockImplementation(() => {});
    await mountTbl(ResultTable, {
      hits: HITS, total: 2, index: 'idx-1',
      exportName: 'audit-dim',
      exportCell: (v: unknown, col: { key: string }) => (col.key === 'age' ? (v as number) * 10 : v),
    });
    (host.querySelector('.rt-exp-btn') as HTMLElement).click();
    await tick();
    const [name, content] = dl.mock.calls[dl.mock.calls.length - 1] as any[];
    expect(name).toMatch(/^audit-dim-page-\d{8}-\d{6}\.csv$/);
    expect(String(content)).toContain('20'); /* age 2→20（仅导出） */
    const tds = dataRows()[0].querySelectorAll('td.rt-cell');
    expect(tds[tds.length - 1].textContent?.trim()).toBe('2'); /* 显示原值 */
    dl.mockRestore();
  });
});

describe('QRT 按值语义档（527 契约：rows 型 fieldTypes 缺列采样推断）', () => {
  const COLS = ['d', 'n', 'mix'];
  const ROWS = [
    ['2024-01-02T03:04:05Z', '1', 'x'],
    ['2024-02-03T05:06:07Z', '2,300', '1'],
    [null, '3', 'zz'],
  ];

  it('ISO 采样判 date（显示本地化）、数值形态判 double（num-col）、混合列不误判', async () => {
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS });
    const tds = dataRows()[0].querySelectorAll('td'); /* [0]=#、1=d、2=n、3=mix */
    expect(tds[2].classList.contains('num-col')).toBe(true); /* '1' 数值形态 → double */
    expect(tds[1].classList.contains('num-col')).toBe(false); /* date 列不误判 double */
    expect(tds[3].classList.contains('num-col')).toBe(false); /* 无过半形态 → 不判 */
    /* date 语义档驱动显示本地化（ISO 的 T 形态 → 本地 'YYYY-MM-DD HH:mm:ss'） */
    expect(tds[1].textContent?.trim()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    /* title 恒 raw（铁律不涉） */
    expect(tds[1].getAttribute('title')).toBe('2024-01-02T03:04:05Z');
    /* 类型徽标/双层列头：五百二十八批 Lead 裁决扩权（解除 171 批「无映射整体单层」承诺）
       ——rows 型按值采样档也出徽标，headers 随徽标文本拼接（原 76 批精确断言随扩权同步更新） */
    const headers = [...host.querySelectorAll('thead th')].map(th => th.textContent?.trim());
    expect(headers).toEqual(['#', 'ddate', 'ndouble', 'mix']);
  });

  it('显式 fieldTypes 压住自动档（数值列标 keyword → 不出 num-col、不本地化）', async () => {
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, fieldTypes: { n: 'keyword', d: 'keyword' } });
    const tds = dataRows()[0].querySelectorAll('td');
    expect(tds[2].classList.contains('num-col')).toBe(false);
    /* 显式非 date 类型 → ISO 串保持原样 */
    expect(tds[1].textContent?.trim()).toBe('2024-01-02T03:04:05Z');
  });
});

describe('QRT #cell-<key> 作用域槽（527 契约：机制落地）', () => {
  it('有槽：完全接管该格内容（收到 row/value/col）；无槽列走既有语义渲染（null→∅）', async () => {
    await mountTbl(QueryResultTable, { cols: ['n', 'm'], rows: [[5, null]] }, {
      'cell-n': (p: any) => h('b', { class: 'slot-out' }, `S:${p.value}:${p.col}:${p.row[0]}`),
    });
    const tds = dataRows()[0].querySelectorAll('td');
    expect(tds[1].querySelector('.slot-out')?.textContent).toBe('S:5:n:5');
    expect(tds[2].textContent?.trim()).toBe('∅'); /* 无槽 → 既有渲染 */
  });

  it('无槽：整表走既有语义渲染（与基线逐字节同形）', async () => {
    await mountTbl(QueryResultTable, { cols: ['n'], rows: [[5]] });
    const tds = dataRows()[0].querySelectorAll('td');
    expect(tds[1].querySelector('.slot-out')).toBeNull();
    expect(tds[1].textContent?.trim()).toBe('5');
  });
});
