/**
 * 一千四百批：QRT 行多选「选了能干什么」动作面内核化 + Lucene 结果表接线。
 *
 * 背景（用户反复问「三个表格能力没完全共享」）：
 *  - RT（查询/索引工作台）勾选行后表格正下方有动作栏（复制 _id / JSON / CSV / 删除）；
 *  - QRT（SQL / Lucene）只有勾选框 + 右键菜单里的复制项，静息态没有任何可见出口，
 *    SQL 宿主此前各自手搓「复制选中」按钮，Lucene 干脆没开 selectable/row-drawer。
 *
 * 本批把动作面收进内核底部状态栏（单源），宿主只开开关：
 *  ① QRT selectable=true 勾选一行 → 状态栏出现「已选 1 行」+ 复制 TSV/JSON + 清除；
 *  ② 点「复制 TSV」→ 剪贴板首行是列名（贴进表格软件第一行就是字段名）；
 *  ③ 负控：selectable=false → 没有勾选列、也没有动作条（零增量契约）；
 *  ④ Lucene 宿主确实接线了 selectable + row-drawer；负控：去掉任一 → 红。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const HITS = [
  { _id: 'd1', _score: 1.2, _source: { title: 'alpha', n: 1 } },
  { _id: 'd2', _score: 0.8, _source: { title: 'beta', n: 2 } },
];
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
let written = '';

function mountQrt(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
}

beforeEach(() => {
  localStorage.clear();
  host.innerHTML = '';
  written = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (t: string) => { written = t; }) },
  });
});
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0;
});

describe('1400 QRT 行选中动作条', () => {
  it('① 勾选后状态栏出现动作条（已选 N 行 + 复制 TSV/JSON + 清除）', async () => {
    mountQrt({ hits: HITS, total: 2, selectable: true, storageKey: 'k1400a' });
    await tick();
    const chks = host.querySelectorAll<HTMLInputElement>('tbody .qrt-sel-col input');
    expect(chks.length, 'selectable 必须出勾选列').toBe(2);
    expect(host.querySelector('[data-test="qrt-copy-sel-tsv"]'), '未选中时零占位').toBeNull();

    chks[0].click();
    await tick();
    expect(host.textContent, '状态栏要报选中数').toContain('已选 1 行');
    expect(host.querySelector('[data-test="qrt-copy-sel-tsv"]')).toBeTruthy();
    expect(host.querySelector('[data-test="qrt-copy-sel-json"]')).toBeTruthy();
    expect(host.querySelector('[data-test="qrt-clear-sel"]')).toBeTruthy();

    (host.querySelector('[data-test="qrt-clear-sel"]') as HTMLButtonElement).click();
    await tick();
    expect(host.querySelector('[data-test="qrt-copy-sel-tsv"]'), '清除后动作条收起').toBeNull();
  });

  it('② 复制 TSV 首行是列名，行数=选中数', async () => {
    mountQrt({ hits: HITS, total: 2, selectable: true, storageKey: 'k1400b' });
    await tick();
    const chks = host.querySelectorAll<HTMLInputElement>('tbody .qrt-sel-col input');
    chks[0].click();
    chks[1].click();
    await tick();
    (host.querySelector('[data-test="qrt-copy-sel-tsv"]') as HTMLButtonElement).click();
    await tick();
    const lines = written.split('\n');
    expect(lines.length, '表头+2 行').toBe(3);
    expect(lines[0], '首行是列名').toContain('\t');
    expect(lines[0]).toMatch(/title/);
    expect(lines[1] + lines[2]).toContain('alpha');
    expect(lines[1] + lines[2]).toContain('beta');
  });

  it('③ 负控：selectable=false → 无勾选列、无动作条', async () => {
    mountQrt({ hits: HITS, total: 2, storageKey: 'k1400c' });
    await tick();
    expect(host.querySelectorAll('tbody .qrt-sel-col input').length).toBe(0);
    expect(host.querySelector('[data-test="qrt-copy-sel-tsv"]')).toBeNull();
    expect(host.textContent).not.toContain('已选');
  });

  it('⑤ 反选：当前视图里已选取消、未选选上（RT invertSel 同口径）', async () => {
    mountQrt({ hits: HITS, total: 2, selectable: true, storageKey: 'k1400d' });
    await tick();
    const chks = host.querySelectorAll<HTMLInputElement>('tbody .qrt-sel-col input');
    chks[0].click();
    await tick();
    expect(host.textContent).toContain('已选 1 行');
    (host.querySelector('[data-test="qrt-invert-sel"]') as HTMLButtonElement).click();
    await tick();
    expect(host.textContent, '反选后仍是 1 行（另一行）').toContain('已选 1 行');
    const boxes = [...host.querySelectorAll<HTMLInputElement>('tbody .qrt-sel-col input')].map(i => i.checked);
    expect(boxes, '第 1 行取消、第 2 行选上').toEqual([false, true]);
    /* 负控：反选实现若只是清空，boxes 会变成 [false,false]——上面的 toEqual 会红 */
  });

  it('⑥ 全选口径说清「已加载」——总数大于已加载时不得声称全选全部（1406）', async () => {
    /* 全部加载：正常说法 */
    mountQrt({ hits: HITS, total: 2, selectable: true, storageKey: 'k1400e' });
    await tick();
    expect((host.querySelector('thead .qrt-sel-col input') as HTMLInputElement).getAttribute('title')).toContain('当前视图全部行');
    apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } }); apps.length = 0; host.innerHTML = '';

    /* 只加载 2 行但共 500 条（游标/远端分页）：必须标注“仅已加载” */
    mountQrt({ hits: HITS, total: 500, selectable: true, storageKey: 'k1400f' });
    await tick();
    const t = (host.querySelector('thead .qrt-sel-col input') as HTMLInputElement).getAttribute('title')!;
    expect(t, '必须说清只选已加载').toContain('仅当前已加载的 2 行');
    expect(t).toContain('共 500 条');
    expect(t, '不能再说“全部行”').not.toContain('当前视图全部行');
  });

  it('⑦ more-rows（游标未取完、total 缺失）同样按「仅已加载」说话；SQL 宿主接线', async () => {
    mountQrt({ hits: HITS, total: 2, moreRows: true, selectable: true, storageKey: 'k1400g' });
    await tick();
    const t = (host.querySelector('thead .qrt-sel-col input') as HTMLInputElement).getAttribute('title')!;
    expect(t, '不知道总数时不能说“共 N 条”').not.toContain('共 2 条');
    expect(t).toContain('结果未取完');
    expect(t).toContain('仅当前已加载的 2 行');
    /* 宿主接线：SQL 游标在途时必须声明 */
    const SQL = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
    expect(SQL).toContain(':more-rows="!!cursor"');
    /* 负控：去掉该接线条 → 本断言红 */
    expect(SQL.replace(':more-rows="!!cursor"', '')).not.toContain(':more-rows="!!cursor"');
  });
});

describe('1400 Lucene 宿主接线', () => {
  const LUCENE = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');
  it('④ 结果表开启 selectable 与 row-drawer', () => {
    const tag = LUCENE.match(/<QueryResultTable[\s\S]*?>/)?.[0] ?? '';
    expect(tag, '必须找到结果表标签').toContain(':hits="hits"');
    expect(tag, '多选通道').toMatch(/\sselectable[\s>]/);
    expect(tag, '行详情侧拉').toMatch(/\srow-drawer[\s>]/);
    /* 负控：词元去掉后必须判不合格（防「随便 contains 一个词就绿」） */
    const broken = tag.replace(/\sselectable[\s>]/, ' ').replace(/\srow-drawer[\s>]/, ' ');
    expect(broken).not.toMatch(/\sselectable[\s>]/);
    expect(broken).not.toMatch(/\srow-drawer[\s>]/);
  });
});
