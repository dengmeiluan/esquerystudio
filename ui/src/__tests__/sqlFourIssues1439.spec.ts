/**
 * 1439：SQL 工作台用户实报四问中可回归的三件（性能/开关/索引共用同一内核）。
 *
 *  ① 表头横在中间：页面滚动后 SQL 卡头被 sticky 模式条切半——根因是「填满」高度
 *     只算到视口底，没扣表体下方的状态栏/排序注/页底留白，页面恒被顶出几十像素。
 *  ② 格式点击效果与查询树/索引工作区不一致：QRT 的 semOn（bytes/percent/duration）
 *     不受「语义格式化」开关约束，关掉后仍显示 93.2% / 500000.0s。
 *  ③ 查询的不是顶栏这个索引：只给一行提示不切换——成功回包后顶栏跟随 FROM。
 *  ④ 巨卡：SQL 每敲一键父级重渲染，200×23 的结果表跟着整棵重渲染（实测 70ms/键）。
 *
 * 行为锁挂真实组件；源码锁只用于「接线位置」这类 happy-dom 量不到的面。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const SQL = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;
let emitted: unknown[] = [];

async function mountQrt(extra: Record<string, any> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(QueryResultTable as any, {
      cols: ['title', 'score'], rows: [['第一页结果', 12], ['第二页结果', 7]],
      viewSeg: true, onOpenDoc: (d: unknown) => emitted.push(d), ...extra,
    }),
  });
  app.use(createPinia());
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const seg = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.qrt-view-seg button')]
  .find(b => (b.textContent || '').trim() === label)!;
const cell = (col: string) => [...host.querySelectorAll<HTMLElement>('td.qrt-cell')]
  .find(td => td.dataset.col === col);

beforeEach(() => { localStorage.clear(); emitted = []; });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('① 填满高度扣掉表体下方占位（卡头不再被 sticky 模式条切半）', () => {
  it('源码锁：按 .page 视口算，扣表体下方占位，滚动位置用内容坐标抵消', () => {
    expect(SQL).toContain("el.closest('.page')");
    expect(SQL).toContain('pager.scrollTop');
    /* 下方占位只扣表体后的真实节点（状态栏/图表/页内衬）；不再用页面 scrollHeight——
       页面 min-height 的空白会被算成内容，形成「表越窄→可用高度越小」反馈环。 */
    expect(SQL).toMatch(/el\.getBoundingClientRect\(\)\.bottom - \(rect\.top \+ rect\.height\)/);
    expect(SQL).toContain('el.nextElementSibling');
    expect(SQL).not.toMatch(/pager\.scrollHeight - \(topInPage \+ rect\.height\)/);
    expect(SQL).toMatch(/pager\.clientHeight - topInPage - below - padBottom - 8/);
    expect(SQL).toContain('const RESULT_MIN_FILL = 96;');
  });
});

describe('② 「语义格式化」开关对 semOn 也生效（与查询树/索引工作区一致）', () => {
  it('默认开：percent 标注显示 42%', async () => {
    await mountQrt({ cols: ['p'], rows: [[0.42]], fieldTypes: { p: 'percent' }, semOn: true });
    expect(cell('p')!.textContent?.trim()).toBe('42%');
  });

  it('关掉后回落原始值 0.42，且不再挂语义分档色', async () => {
    localStorage.setItem('esquerystudio.pref.es_tbl_sem', 'false');
    await mountQrt({ cols: ['p'], rows: [[0.42]], fieldTypes: { p: 'percent' }, semOn: true });
    const td = cell('p')!;
    expect(td.textContent?.trim(), '关开关后不能再显示 42%').toBe('0.42');
    expect(td.className, '分档色类一并熄灭').not.toMatch(/qrt-sem-/);
    expect(td.getAttribute('title'), 'title 恒 raw').toBe('0.42');
  });

  it('源码锁：两层格式化都先看 semPref', () => {
    expect(QRT).toContain('if (props.semOn && semPref.value && !isNonSemanticType(effType(col)))');
    expect(QRT).toContain('if (!props.semOn || !semPref.value || cell === null');
  });
});

describe('③ 成功回包后顶栏索引跟随 SQL FROM', () => {
  it('源码锁：只在成功路径、单索引、在已知清单内、稿子未改时切换', () => {
    expect(SQL).toContain('const executedIdx = indexFromSql(execSql, sqlIndexPool.value);');
    expect(SQL).toMatch(/if \(!inputChanged && executedIdx && executedIdx !== store\.pickedIdx\s*\n\s*&& sqlIndexPool\.value\.includes\(executedIdx\)\)/);
    expect(SQL).toContain('store.pick(executedIdx);');
    expect(SQL, '提示要说明顶栏跟随了 FROM').toContain('顶栏索引已跟随 SQL FROM 切到');
  });
});

describe('④ 输入不再整表重渲染（200×23 卡顿）', () => {
  it('源码锁：结果表按结果侧依赖 v-memo，打字不触发子树更新', () => {
    expect(SQL).toContain('v-memo="[runSeq, rows, colNames, busy, cursor, barMoreOpen, resultH, fillHeight, timeZone, resultStale, effectiveSqlIndex]"');
  });

  it('源码锁：表体 paint containment，编辑器重绘不带着 4.6k 单元格一起刷', () => {
    expect(QRT).toContain('contain: paint;');
  });

  it('源码锁：视图按钮只问「有没有数据」，不为了出按钮提前拼 200×23 的 JSON 高亮', () => {
    expect(QRT).toContain('v-if="altJsonAvailable"');
    expect(QRT).not.toContain('v-if="effJsonHtml != null"');
    expect(QRT).toMatch(/const altJsonAvailable = computed\(\(\) => props\.jsonHtml != null \|\| rowsDerivable\.value\)/);
  });
});

describe('⑤ alt 视图「打开文档」在 rows 通道有落点（不再点了没反应）', () => {
  it('JSON 档点「打开文档」开行详情侧拉，且显示的是原始行数据', async () => {
    await mountQrt({ rowDrawer: true });
    seg('JSON').click();
    await tick();
    const open = [...host.querySelectorAll<HTMLButtonElement>('.ah-nav-open')]
      .find(b => (b.textContent || '').includes('打开文档'))!;
    expect(open, '文档导航必须给出打开入口').toBeTruthy();
    open.click();
    await tick(12);
    const body = document.querySelector('.qrt-rdw-body') as HTMLElement | null;
    expect(body, 'rowDrawer 通道应打开行详情').toBeTruthy();
    expect(body!.textContent).toContain('第一页结果');
    expect(body!.textContent).toContain('title');
  });

  it('宿主自带 hits 时仍是宿主数据（不劫持为行详情）', async () => {
    await mountQrt({
      hits: [{ _id: 'host-1', _score: 1, _index: 'x', _source: { title: '宿主文档' } }],
      rowDrawer: true,
    });
    const tree = seg('Tree');
    expect(tree, '宿主 hits 通道仍由宿主提供四档').toBeTruthy();
    tree.click();
    await tick();
    const open = [...host.querySelectorAll<HTMLButtonElement>('.ah-nav-open')]
      .find(b => (b.textContent || '').includes('打开文档'))!;
    open.click();
    await tick();
    expect(emitted.length, '派生判据不得吞掉宿主 open-doc 意图').toBe(1);
    expect((emitted[0] as any)?._id).toBe('host-1');
    expect(document.querySelector('.qrt-rdw-body'), '宿主通道不弹行详情').toBeNull();
  });
});
