/**
 * 1204：SQL / Lucene 结果表的右键缺「复制为查询」。
 *
 * 索引工作区（RT）早就有「复制为 term/match/exists 查询」（dbx 的复制 extractor 对位），
 * 但同菜单的 QRT（SQL 结果表、Lucene 命中表都在用）只有「复制值」——同一张表在两个入口
 * 能力不一样。本批用共用内核 `dslFromCell` 补齐，不另造生成逻辑。
 *
 * 只对**合法列名**开放：SQL 结果列常是表达式别名（COUNT(*) / DATE_TRUNC(...)），
 * 拿它拼 {term:{"COUNT(*)":v}} 会生成 ES 不认的字段。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import QueryResultTable from '../components/QueryResultTable.vue';
import { buildDsl, buildExistsDsl } from '../utils/dslFromCell';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function mount(cols: string[], rows: any[][], types?: Record<string, string>) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/'); await router.isReady();
  host = document.createElement('div'); document.body.appendChild(host);
  const app = createApp({
    render: () => h(QueryResultTable as any, { cols, rows, sortable: true, fieldTypes: types, tableBar: true }),
  });
  apps.push(app); app.use(createPinia()); app.use(router); app.mount(host);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
  return host;
}

afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

/* 直接验内核口径（QRT 与 RT 用的是同一份 dslFromCell） */
describe('1204 DSL 生成口径（共用内核）', () => {
  it('普通字段单值 → term；text 字段 → match；_id → ids', () => {
    expect(buildDsl('status', ['ACTIVE'])).toEqual({ term: { status: 'ACTIVE' } });
    expect(buildDsl('title', ['年度报告'], 'text')).toEqual({ match: { title: '年度报告' } });
    expect(buildDsl('_id', ['abc'])).toEqual({ ids: { values: ['abc'] } });
  });

  it('空值不生成查询；exists 对 _id 不适用', () => {
    expect(buildDsl('status', [''])).toBeNull();
    expect(buildDsl('status', [null])).toBeNull();
    expect(buildExistsDsl('_id')).toBeNull();
    expect(buildExistsDsl('status')).toEqual({ exists: { field: 'status' } });
  });
});

describe('1204 QRT 右键真的出这两项', () => {
  it('合法列名：右键出现「复制为 … 查询」与「exists」', async () => {
    await mount(['status'], [['ACTIVE']], { status: 'keyword' });
    const cell = host.querySelector('.qrt-cell');
    expect(cell, '单元格必须在场').toBeTruthy();
    cell!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 120 }));
    await new Promise(r => setTimeout(r, 60));
    const labels = [...document.querySelectorAll('.ccm-it')].map(e => (e.textContent || '').trim());
    expect(labels.join('|'), '必须有复制为查询').toMatch(/复制为 term 查询/);
    expect(labels.join('|'), '必须有 exists').toMatch(/exists 查询/);
  });

  it('表达式别名列（COUNT(*)）：不出现这两项（会拼出非法字段）', async () => {
    await mount(['COUNT(*)'], [[3]]);
    const cell = host.querySelector('.qrt-cell');
    cell!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 120 }));
    await new Promise(r => setTimeout(r, 60));
    const labels = [...document.querySelectorAll('.ccm-it')].map(e => (e.textContent || '').trim()).join('|');
    expect(labels).not.toMatch(/复制为 .* 查询 DSL/);
    expect(labels).not.toMatch(/exists 查询/);
  });
});

/* 1204 行为面：点下去真的把正确 DSL 写进剪贴板（不是只有菜单项在）。 */
describe('1204 点「复制为查询」后的实际内容', () => {
  it('status=ACTIVE 点复制 → 剪贴板是 {"term":{"status":"ACTIVE"}}', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    await mount(['status'], [['ACTIVE']], { status: 'keyword' });
    const cell = host.querySelector('.qrt-cell')!;
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 120 }));
    await new Promise(r => setTimeout(r, 60));
    const item = [...document.querySelectorAll('.ccm-it')].find(e => /复制为 .* 查询/.test(e.textContent || ''));
    expect(item, '菜单项必须在').toBeTruthy();
    (item as HTMLElement).click();
    await new Promise(r => setTimeout(r, 80));
    expect(write).toHaveBeenCalled();
    const payload = JSON.parse(String((write.mock.calls[0] as any)[0]));
    expect(payload).toEqual({ term: { status: 'ACTIVE' } });
  });
});
