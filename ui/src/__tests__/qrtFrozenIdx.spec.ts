/**
 * R130 一百六十七批：QRT 冻结序号列守卫（对齐 RT 131 批 dbx 冻结窗格）。
 * 锁定：
 * 1) 行为锁——表头首列='#'（qrt-idx），数据列头依次跟随 shownCols；
 *    每行 td 数 = 数据列数 + 1（结构锁：fit-col 按 children[ci+1] 取格的根因锚点）；
 *    序号 = 当前行序（ri+1），排序重排后序号跟随新行序；
 * 2) rows 型（SQL 通道）同样带序号列；
 * 3) 源码锁——sticky+min-width 铁律（RT 150 批：left 常量必须配 min-width，
 *    否则 auto 布局压缩列宽致冻结层遮挡首列字符）、右分隔线 box-shadow、
 *    hover/焦点行三态背景。sticky 冻结视觉 happy-dom 无法验证，源码锁兜底防退化。
 * 挂载样板同 queryTablePrefs（pinia + 宏任务排空）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const ROWS = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
  { _id: 'c', _source: { name: 'cherry', age: 1 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('QRT 冻结序号列（一百六十七批）', () => {
  it('表头首列=#（qrt-idx），数据列头依次跟随 shownCols', async () => {
    await mountTbl({ hits: ROWS, storageKey: 'fi1' });
    const heads = [...host.querySelectorAll('thead th')].map(th => (th.textContent ?? '').trim());
    expect(heads[0]).toBe('#');
    expect(heads[0] && host.querySelectorAll('thead th')[0].classList.contains('qrt-idx')).toBe(true);
    expect(heads.slice(1)).toEqual(['_id', 'name', 'age']);
  });

  it('每行 td 数 = 数据列数 + 1；首格序号且之后各格与数据列对齐（fit-col 索引根因锚点）', async () => {
    await mountTbl({ hits: ROWS, storageKey: 'fi2' });
    const tr = host.querySelector('tbody tr')!;
    const tds = [...tr.querySelectorAll('td')];
    expect(tds.length).toBe(4); // # + _id/name/age
    expect(tds[0].classList.contains('qrt-idx')).toBe(true);
    expect(tds[0].textContent?.trim()).toBe('1');
    expect(tds[1].getAttribute('title')).toBe('a');          // _id
    expect(tds[2].getAttribute('title')).toBe('banana');     // name
    expect(tds[3].getAttribute('title')).toBe('2');          // age
  });

  it('序号跟随排序后的行序（升序重排后仍为 1,2,3）', async () => {
    await mountTbl({ hits: ROWS, sortable: true, storageKey: 'fi3' });
    const nameTh = [...host.querySelectorAll('th')].find(t => t.textContent?.includes('name'))!;
    nameTh.click();
    await nextTick();
    const idxs = [...host.querySelectorAll('tbody tr')].map(tr => tr.querySelector('td.qrt-idx')?.textContent?.trim());
    expect(idxs).toEqual(['1', '2', '3']);
    /* 227 批 M2 起首击升序：apple → banana → cherry */
    const names = [...host.querySelectorAll('tbody tr')].map(tr => tr.children[2]?.textContent?.trim());
    expect(names).toEqual(['apple', 'banana', 'cherry']);
  });

  it('rows 型（SQL 通道）同样带序号列', async () => {
    await mountTbl({ cols: ['c1', 'c2'], rows: [['x1', 'y1'], ['x2', 'y2']] });
    const heads = [...host.querySelectorAll('thead th')].map(th => (th.textContent ?? '').trim());
    expect(heads).toEqual(['#', 'c1', 'c2']);
    const first = host.querySelector('tbody tr')!.querySelector('td.qrt-idx');
    expect(first?.textContent?.trim()).toBe('1');
  });
});

describe('QRT 冻结序号列源码锁（一百六十七批，sticky 视觉无法行为验证）', () => {
  const css = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8')
    .split('<style scoped>')[1] ?? '';

  it('sticky left 常量配 min-width 锁死（RT 150 批铁律）', () => {
    expect(css).toMatch(/\.qrt-tbl th\.qrt-idx, \.qrt-tbl td\.qrt-idx \{[^}]*position: sticky; left: 0; width: 52px; min-width: 52px;/);
  });

  it('右分隔线 box-shadow + 表头双轴 z-index 压过普通 sticky 表头', () => {
    expect(css).toMatch(/box-shadow: inset -1px 0 0 var\(--line\)/);
    expect(css).toMatch(/\.qrt-tbl th\.qrt-idx \{ z-index: 4; \}/);
  });

  it('序号列三态背景（默认灰底/hover/焦点行）', () => {
    expect(css).toMatch(/\.qrt-tbl td\.qrt-idx \{ background: var\(--bg2\); \}/);
    expect(css).toMatch(/\.qrt-tbl tbody tr:hover td\.qrt-idx \{ background: var\(--bg-hover, var\(--bg2\)\); \}/);
    expect(css).toMatch(/\.qrt-tbl tbody tr\.qrt-row-focus > td\.qrt-idx \{ background: var\(--ac-soft\); \}/);
  });
});
