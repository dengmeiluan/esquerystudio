/* 1087：MiniTable 补表头富单元格能力，DocDiffModal 差异表收编（1085 批豁免退役）。
 * 1085 批登记豁免时 MiniTable 的 th 仅渲染纯文本 label，DocDiffModal 的富表头
 * （th-tag 胶囊 + th-id 短 id + v-tip 悬浮全文、基准/目标列随篇数动态）改用必丢。
 * 本批给 MiniTable 补 head-cell-<key> 具名槽——纯增量：插槽 > label 文本，
 * 无插槽时回落纯文本 label，既有宿主 th 壳（对齐类/width 样式）零漂移。
 * 覆盖四层：槽渲染与优先级、槽参数 { column, key }、无槽路径 label 零漂移、
 * DocDiffModal 富表头在新形态下存活（挂载级 + 悬浮通道源码锚）。 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

import MiniTable, { type MiniTableColumn } from '../components/MiniTable.vue';
import DocDiffModal from '../components/DocDiffModal.vue';
import type { SearchHit } from '../types';

const COLS: MiniTableColumn[] = [
  { key: 'key', label: '设置键', mono: true },
  { key: 'rule', label: '规则' },
  { key: 'count', label: '数量', align: 'right', width: '80px' },
];
const ROWS = [{ key: 'index.apack.mode', rule: 'apack-private', count: 3 }];

/* MiniTable 直挂样板（miniTable.spec 同款） */
function renderMini(slots: Record<string, (s: any) => unknown> = {}): HTMLElement {
  const host = document.createElement('div');
  createApp({ render: () => h(MiniTable, { columns: COLS, rows: ROWS }, slots) }).mount(host);
  return host.firstElementChild as HTMLElement;
}

/* DocDiffModal 挂载样板（docDiffSavedSearch242 同款：真模态 teleport 到 body，document 级查询） */
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
async function flush() { for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); } }
async function mountDdm(hits: SearchHit[], baseIdx = 0) {
  /* 同用例内换基准重挂：先卸上一挂载（真模态 teleport 到 body，卸载才移除），避免表头双份 */
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  const app = createApp({ setup: () => () => h(DocDiffModal as any, { show: true, hits, baseIdx }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await flush();
}
beforeEach(() => {
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('1087 MiniTable 表头富单元格槽（head-cell-<key>）', () => {
  it('无插槽时表头回落纯文本 label：文本零漂移 + th 壳（对齐类/width）零漂移', () => {
    const root = renderMini();
    const ths = [...root.querySelectorAll('thead th')] as HTMLElement[];
    expect(ths.map(t => t.textContent)).toEqual(['设置键', '规则', '数量']);
    /* 纯文本路径无包裹元素（既有宿主 DOM 形态逐字保留） */
    expect(ths[0].querySelectorAll('*').length).toBe(0);
    /* th 壳属性不因槽化重构漂移：右对齐类与列宽样式仍在 th 上 */
    expect(ths[2].classList.contains('mt-th-r')).toBe(true);
    expect(ths[2].style.width).toBe('80px');
  });

  it('插槽优先于 label：#head-cell-rule 接管的列渲染富内容，label 文本不出场', () => {
    const root = renderMini({ 'head-cell-rule': () => h('span', { class: 'th-tag' }, '规则胶囊') });
    const ths = [...root.querySelectorAll('thead th')];
    expect(ths[1].querySelector('.th-tag')!.textContent).toBe('规则胶囊');
    /* 槽接管列的完整文本=槽内容（label「规则」不渲染），未接管列照旧 */
    expect(ths[1].textContent).toBe('规则胶囊');
    expect(ths[0].textContent).toBe('设置键');
    expect(ths[2].textContent).toBe('数量');
  });

  it('槽参数透传 { column, key }：列对象与列 key 均就位', () => {
    let seen: { column: MiniTableColumn; key: string } | null = null;
    renderMini({ 'head-cell-count': s => { seen = s; return 'C'; } });
    expect(seen!.key).toBe('count');
    expect(seen!.column.key).toBe('count');
    expect(seen!.column.label).toBe('数量');
    expect(seen!.column.align).toBe('right');
  });

  it('富内容只接管 th 内容不接管 th 壳：槽化列的对齐类/width 样式仍在', () => {
    const root = renderMini({ 'head-cell-count': () => h('b', null, 'C') });
    const th = root.querySelectorAll('thead th')[2] as HTMLElement;
    expect(th.querySelector('b')!.textContent).toBe('C');
    expect(th.classList.contains('mt-th-r')).toBe(true);
    expect(th.style.width).toBe('80px');
  });
});

describe('1087 DocDiffModal 差异表收编：表头富结构在新形态下存活', () => {
  const LONG_A = 'a'.repeat(20);
  const LONG_B = 'b'.repeat(20);
  const LONG_C = 'c'.repeat(20);

  it('两篇：字段列走列声明 label；基准列胶囊+短 id；目标列动态序号胶囊（挂载级）', async () => {
    await mountDdm([
      { _id: LONG_A, _source: { t: 'x' } },
      { _id: LONG_B, _source: { t: 'y' } },
    ] as unknown as SearchHit[]);
    expect(document.querySelector('table.ddm-tbl'), '宿主皮肤类经 tableClass 落 table').not.toBeNull();
    const ths = [...document.querySelectorAll('.ddm-tbl thead th')];
    expect(ths.length, '字段+基准+1 目标=3 列').toBe(3);
    expect(ths[0].textContent, '字段列走列声明纯文本 label').toBe('字段');
    /* 基准列：胶囊「基准」+ 短 id（14 字截断） */
    expect(ths[1].querySelector('.th-tag.base')!.textContent).toBe('基准');
    expect(ths[1].querySelector('.th-id.mono')!.textContent).toBe('a'.repeat(14) + '…');
    /* 目标列：动态位次胶囊 #2（第 2 篇）+ 短 id */
    expect(ths[2].querySelector('.th-tag')!.textContent).toBe('#2');
    expect(ths[2].querySelector('.th-id.mono')!.textContent).toBe('b'.repeat(14) + '…');
    /* 行级语义随 #rows 收编不丢：值冲突行状态类在场（全量行为锁归 docDiffSavedSearch242） */
    expect(document.querySelectorAll('.ddm-tbl tbody tr.k-changed').length).toBeGreaterThan(0);
  });

  it('三篇：目标列随篇数动态到 2 列（#2/#3），换基准后位次重排', async () => {
    await mountDdm([
      { _id: LONG_A, _source: { t: 'x' } },
      { _id: LONG_B, _source: { t: 'y' } },
      { _id: LONG_C, _source: { t: 'z' } },
    ] as unknown as SearchHit[]);
    const tags = [...document.querySelectorAll('.ddm-tbl thead th .th-tag')].map(t => t.textContent);
    expect(tags, '基准胶囊 + 两个目标胶囊').toEqual(['基准', '#2', '#3']);
    const ids = [...document.querySelectorAll('.ddm-tbl thead th .th-id')].map(t => t.textContent);
    expect(ids).toEqual(['a'.repeat(14) + '…', 'b'.repeat(14) + '…', 'c'.repeat(14) + '…']);
    /* 换基准（第 2 篇为基准）：胶囊仍指原文档位次 #1/#3，短 id 随之换血 */
    await mountDdm([
      { _id: LONG_A, _source: { t: 'x' } },
      { _id: LONG_B, _source: { t: 'y' } },
      { _id: LONG_C, _source: { t: 'z' } },
    ] as unknown as SearchHit[], 1);
    const tags2 = [...document.querySelectorAll('.ddm-tbl thead th .th-tag')].map(t => t.textContent);
    expect(tags2).toEqual(['基准', '#1', '#3']);
    const ids2 = [...document.querySelectorAll('.ddm-tbl thead th .th-id')].map(t => t.textContent);
    expect(ids2).toEqual(['b'.repeat(14) + '…', 'a'.repeat(14) + '…', 'c'.repeat(14) + '…']);
  });

  it('悬浮全文通道与收编形态（源码锚）：v-tip 逐字保留、裸 table 清零', () => {
    const src = readFileSync(join(__dirname, '../components/DocDiffModal.vue'), 'utf-8');
    /* 表头短 id 的悬浮全文：短 id 丢不了全 id 的信息（1085 豁免的核心理由，改用后逐字保留） */
    expect(src).toContain('v-tip="hits[baseIdx]?._id"');
    expect(src).toContain('v-tip="h?._id"');
    /* 收编形态：MiniTable 统一件承载，模板区无裸 table */
    expect(src).toMatch(/<MiniTable table-class="ddm-tbl" :columns="cols">/);
    expect(src).not.toContain('<table');
  });
});
