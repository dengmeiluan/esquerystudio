/**
 * 一千三百五十六批：SQL 结果表只有「表格 / JSON」两档视图，而查询工作台（RT）有四档。
 *
 * 用户长期在问「为什么索引/查询工作台/SQL 的表格能力没有完全共享」。
 * 这一批用**渲染出来的视图分段**做对比取证（不是读源码猜）：
 *
 *   DSL 工作台（RT） 1440×900：表格 / JSON / Tree / 卡片      ← 4 档
 *   SQL 控制台（QRT）1440×900：表格 / JSON                    ← 2 档（缺口）
 *
 * 查因：QRT 内核**本来就支持**四档（`.qrt-view-seg` 里四个按钮，数据驱动出档），
 * 只是 Tree / 卡片要求宿主传 `treeData` / `cardHits`——hits 型宿主（DQ/IH）会传，
 * rows 型（SQL）没人传，于是两档按钮永远不出现。能力有、没接通。
 *
 * 修法（不造轮子）：在内核里由 `cols` + `rows` **派生**这两种形态，任何 rows 宿主自动获得：
 *   treeData  = [{ _id: '1', 列名: 值, … }, …]
 *   cardHits  = [{ _id: '1', _source: { 列名: 值, … } }, …]
 * 并同步补 `doc-count` / `doc-ids`——否则导航条读不到条数（实测显示「0 命中」、下拉空着）。
 *
 * 真机验证（同一 SELECT 结果）：
 *   Tree → 文档‹1› 打开文档 `_id: "1"  title: "第一页结果"`
 *   卡片 → 1 张卡（标题 + 值）
 *
 * 本 spec 锁：
 *  ① 渲染出的视图分段含四档（挂载真实组件，不是源码断言）；
 *  ② 点 Tree / 卡片真的切到 alt 体，且内容来自行数据；
 *  ③ 派生形状正确：Tree 的键=列名、卡片是 {_id,_source}；
 *  ④ 宿主传了 treeData/cardHits 时**以宿主为准**（不许被派生覆盖）；
 *  ⑤ 负控：删掉派生 → ① 必须红。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

const COLS = ['title', 'score'];
const ROWS = [['第一页结果', 12], ['第二页结果', 7]];

async function mount(extra: Record<string, any> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(QueryResultTable as any, {
      cols: COLS, rows: ROWS, viewSeg: true, ...extra,
    }),
  });
  app.use(createPinia());
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const segLabels = () => [...host.querySelectorAll('.qrt-view-seg button')].map(b => (b.textContent || '').trim());

afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1356 rows 通道补齐 Tree / 卡片视图', () => {
  it('① 渲染出的视图分段是四档（与 RT 对齐）', async () => {
    await mount();
    expect(segLabels()).toEqual(['表格', 'JSON', 'Tree', '卡片']);
  });

  it('② 点 Tree 切到 alt 体且内容来自行数据', async () => {
    await mount();
    const btn = [...host.querySelectorAll<HTMLButtonElement>('.qrt-view-seg button')]
      .find(b => (b.textContent || '').trim() === 'Tree')!;
    btn.click();
    await tick();
    const alt = host.querySelector('.qrt-alt-body') as HTMLElement | null;
    expect(alt, 'Tree 档必须渲染 alt 体').toBeTruthy();
    const txt = alt!.textContent || '';
    expect(txt, '必须含行值').toContain('第一页结果');
    expect(txt, '必须含列名').toContain('title');
    expect(txt, '必须带 _id').toContain('_id');
  });

  it('② 点卡片切到卡片体，张数=行数', async () => {
    await mount();
    const btn = [...host.querySelectorAll<HTMLButtonElement>('.qrt-view-seg button')]
      .find(b => (b.textContent || '').trim() === '卡片')!;
    btn.click();
    await tick();
    const cards = host.querySelectorAll('.dq-card');
    expect(cards.length, '每行一张卡').toBe(ROWS.length);
    expect(cards[0].textContent || '').toContain('第一页结果');
  });

  it('③ 派生形状：Tree 键=列名（_id 为行号），卡片是 {_id,_source}', async () => {
    await mount();
    const tree = [...host.querySelectorAll<HTMLButtonElement>('.qrt-view-seg button')]
      .find(b => (b.textContent || '').trim() === 'Tree')!;
    tree.click();
    await tick();
    const txt = (host.querySelector('.qrt-alt-body') as HTMLElement).textContent || '';
    /* 行号从 1 起（与表格 # 列一致），列名原样 */
    expect(txt).toMatch(/_id:\s*"1"/);
    expect(txt).toContain('score');
    expect(txt).toContain('12');
  });

  it('④ 宿主传了 treeData/cardHits 时以宿主为准（派生不得覆盖）', async () => {
    await mount({
      treeData: [{ _id: 'HOST-1', 自定义字段: '来自宿主' }],
      cardHits: [{ _id: 'HOST-2', _source: { 自定义字段: '来自宿主卡' } }],
    });
    const tree = [...host.querySelectorAll<HTMLButtonElement>('.qrt-view-seg button')]
      .find(b => (b.textContent || '').trim() === 'Tree')!;
    tree.click();
    await tick();
    const txt = (host.querySelector('.qrt-alt-body') as HTMLElement).textContent || '';
    expect(txt, '必须用宿主数据').toContain('来自宿主');
    expect(txt, '不许掺入派生行').not.toContain('第一页结果');
  });

  it('⑤ 负控：空行集不出 Tree/卡片（派生判据不是恒真）', async () => {
    await mount({ cols: COLS, rows: [] });
    /* 空行集时内核只剩表格档（JSON 也由行数据派生，一并缺席）——负控只锁这两档不得出现，
       避免把「JSON 也缺席」这条既有行为误当成契约。 */
    const labels = segLabels();
    expect(labels, '没有行数据就不该出 Tree').not.toContain('Tree');
    expect(labels, '没有行数据就不该出 卡片').not.toContain('卡片');
    expect(labels[0], '表格档恒在').toBe('表格');
  });
});
