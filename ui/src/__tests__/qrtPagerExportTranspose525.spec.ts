/**
 * 五百二十五批 W1：QRT 内建分页 + 导出五格式 + rows 型转置 + took，与四个宿主接线守卫。
 * 锁定：
 * 1) QRT 内建分页（可选）——page/pageSize/total 三参齐备才渲染分页行（共享 Pagination），
 *    翻页/改页大小只 emit；任一缺省不渲染（SQL 通道零破坏）；
 * 2) LuceneQueryView 接线——表格分页随 QRT 内建，顶部分页器只剩 JSON 视图在用，
 *    聚焦表格工具行分页器退役、聚焦 JSON 分页器保留（302/423 批锚不回退）；
 * 3) QRT 导出五格式对齐 RT——CSV 既有，补 MD/XLSX/PNG（行集列集同 csvBlock 口径）；
 * 4) rows 型转置——列头菜单开关（不依赖 prefsOn：rows 型消费方 SQL 通道无 qrt-bar）+
 *    转置态提示行（行数档位+退出）+ rt-transposed 同款只读镜像；
 * 5) took prop——计数条 TookBadge 对齐 RT；
 * 6) LuceneQueryView 错误面板 errPreHtml（DslQueryView 消费先例同款）；
 * 7) ProfileFlameView 编辑器高度四档 + Ctrl+Enter + hotops 小表接 QRT rows 型；
 * 8) SearchTemplatesView 模板源编辑器 Ctrl+Enter 执行。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toggleViewSwitch } from './helpers/viewSwitch'; /* 1143 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

import QueryResultTable from '../components/QueryResultTable.vue';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const qrtSrc = read('components/QueryResultTable.vue');
const luceneSrc = read('views/LuceneQueryView.vue');
const pfSrc = read('views/ProfileFlameView.vue');
const tplSrc = read('views/SearchTemplatesView.vue');

/* rows 型样例（QRT rows 契约：标量二维矩阵） */
const COLS = ['类型', '耗时(ms)'];
const ROWS: (string | number)[][] = [
  ['query', 12.3],
  ['collect', 4.5],
  ['aggregate', 7.8],
];

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

describe('QRT 内建分页（525 批，可选零破坏）', () => {
  it('三参齐备：分页行渲染 + 翻页/改页大小只 emit', async () => {
    const onPage = vi.fn();
    const onSize = vi.fn();
    await mountTbl({ cols: COLS, rows: ROWS, total: 45, page: 2, pageSize: 20,
      'onUpdate:page': onPage, 'onUpdate:pageSize': onSize });
    const pgr = host.querySelector('.qrt-pgr')!;
    expect(pgr, 'tfoot 后分页行渲染').toBeTruthy();
    /* 共享 Pagination 形态：页码输入框值=当前页 2，总页数 ceil(45/20)=3 */
    expect((pgr.querySelector('.pgn-jump') as HTMLInputElement).value).toBe('2');
    expect(pgr.textContent).toContain('/ 3');
    /* 下一页钮 → emit update:page(3)，不自行切片取数 */
    (pgr.querySelector('[aria-label="下一页"]') as HTMLButtonElement).click();
    for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); }
    expect(onPage).toHaveBeenCalledWith(3);
    /* 五百七十七批同步更新：563/566 批改用后 .pgn-psel=触发钮，点击开 n-popover listbox
       （teleport body）→ 点 50/页 选项 emit——旧 select.value/change 路径已退役 */
    (pgr.querySelector('.pgn-psel') as HTMLButtonElement).click();
    for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); }
    const opt = Array.from(document.body.querySelectorAll('.pgn-psize-opt'))
      .find(b => (b.textContent || '').includes('50'));
    expect(opt, 'listbox 选项 50/页 在场（teleport body）').toBeTruthy();
    (opt as HTMLButtonElement).click();
    for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); }
    expect(onSize).toHaveBeenCalledWith(50);
  });

  it('缺省 page/pageSize：不渲染分页行（既有消费方零破坏；total 单传不触发）', async () => {
    await mountTbl({ cols: COLS, rows: ROWS, total: 45 });
    expect(host.querySelector('.qrt-pgr')).toBeNull();
    await mountTbl({ hits: [{ _id: 'a', _source: { f: 1 } }], total: 1, page: 1, pageSize: 20 });
    /* hit 型同样支持（三参齐备即渲染）——此处锁 rows 型之外的通道不误伤 */
    expect(host.querySelector('.qrt-pgr')).toBeTruthy();
  });
});

describe('QRT 导出五格式（525 批对齐 RT）', () => {
  it('MD/XLSX/PNG 三档实现与工具行钮在场（CSV 既有不动）', () => {
    expect(qrtSrc).toMatch(/function exportMd\(\)/);
    expect(qrtSrc).toMatch(/function exportXlsx\(\)/);
    expect(qrtSrc).toMatch(/async function exportPng\(\)/);
    expect(qrtSrc).toMatch(/import \{ buildXlsx \} from '\.\.\/utils\/xlsxMini';/);
    expect(qrtSrc).toMatch(/import \{ snapshotTableToPng \} from '\.\.\/utils\/tableSnapshot';/);
    expect(qrtSrc).toMatch(/:aria-label="'导出当前视图 Markdown'"/);
    expect(qrtSrc).toMatch(/:aria-label="'导出当前视图 XLSX'"/);
    expect(qrtSrc).toMatch(/:aria-label="'导出表格快照 PNG'"/);
    /* 五百六十批锚同步更新：JSON 第五导出钮（PNG 与行高之间插位不破 291 钮序；矩阵 json 口径） */
    expect(qrtSrc).toMatch(/:aria-label="'导出当前视图 JSON'"/);
    expect(qrtSrc).toMatch(/function exportJson\(\)/);
  });
});

describe('QRT rows 型转置（525 批，RT 231 批同款能力）', () => {
  it('列头菜单开关（不依赖 prefsOn）+ 转置态提示行 + 只读镜像渲染', async () => {
    await mountTbl({ cols: COLS, rows: ROWS });
    /* 1143：转置是表格级视图开关，入口已归位工具行「视图 ⋯」/无工具行的「视图」钮 */
    expect(await toggleViewSwitch('转置视图'), '视图菜单出转置开关').toBe(true);
    /* 主表切转置只读镜像：列名做首列，前 N 行（默认档 5 ≥ 3 行全出）做横向列 */
    expect(host.querySelector('.qrt-transposed')).toBeTruthy();
    expect(host.querySelector('.qrt-tr-bar')!.textContent).toContain('转置视图');
    expect(host.querySelector('.qrt-transposed')!.textContent).toContain('耗时(ms)');
    expect(host.querySelector('.qrt-transposed')!.textContent).toContain('12.3');
    /* 提示行退出钮可退出 */
    (host.querySelector('.qrt-tr-off') as HTMLButtonElement).click();
    for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); }
    expect(host.querySelector('.qrt-transposed')).toBeNull();
  });

  it('hit 型不出转置开关（转置语义只属 rows 型）', () => {
    /* 1143：入口从列头菜单归位工具行「视图 ⋯」/无工具行的「视图」钮——
       转置项仍是两条渲染通道各一处，且都挂 !isHits 门（hit 型不出）。 */
    const gates = qrtSrc.match(/v-if="!isHits"\s+class="qrt-mi"\s+role="menuitemcheckbox"\s+:aria-checked="transposeOn"/g) ?? [];
    expect(gates.length, '视图菜单（工具行 + 无工具行出口）各一处转置开关，均 !isHits 门控').toBe(2);
    expect(qrtSrc).not.toMatch(/key: 'toggle-transpose'/);
  });
});

describe('QRT took prop（525 批对齐 RT 计数条）', () => {
  it('计数条内嵌 TookBadge（prefsOn 通道）', async () => {
    await mountTbl({ cols: COLS, rows: ROWS, total: 3, storageKey: 't525:x', took: 42 });
    expect(host.querySelector('.qrt-bar .took-badge')!).toBeTruthy();
    /* 缺省 took：不渲染徽标 */
    await mountTbl({ cols: COLS, rows: ROWS, total: 3, storageKey: 't525:y' });
    expect(host.querySelector('.qrt-bar .took-badge')).toBeNull();
  });
});

describe('宿主接线（525 批）', () => {
  it('LuceneQueryView：表格分页随 QRT 内建（事件回宿主远端分页），顶部分页器只剩 JSON 视图', () => {
    /* 1400：属性串拆两段锁——中段新增 selectable/row-drawer 等无关属性不应打断分页契约锁；
       分页契约本身（props+双向事件）仍逐字连续，删任一项都会红。 */
    expect(luceneSrc).toMatch(/:hits="hits" :total="total" :total-gte="totalGte" :loading="busy" sortable/);
    expect(luceneSrc).toMatch(/:took="took" :page="page" :page-size="size" :pager-disabled="busy" @update:page="goPage" @update:page-size="setSize"/);
    expect(luceneSrc).toMatch(/<Pagination v-if="viewMode === 'json'" :page="page"/);
    /* 五百六十一批同步更新：聚焦表格工具行整块退役（seg/JSONL 寄居 QRT bar-prepend、CSV 走
       内建导出钮、内建分页行既有）——工具可达语义由 QRT 工具行常驻承接（聚焦面内 rt-bar/qrt-bar
       不隐），“表格档专属 focus-tools”字面退役为负锚 */
    expect(luceneSrc, '聚焦表格工具行已退役（功能全进 QRT 常驻工具行）')
      .not.toContain(`focusPaneId === 'lucene.table'" class="lc-hd-r focus-tools"`);
    expect(luceneSrc).toMatch(/<Pagination :page="page" :total-pages="totalPages" :page-size="size" :disabled="busy"/);
  });

  it('LuceneQueryView：错误面板 pre 换 errPreHtml v-html（DslQueryView 同款）', () => {
    expect(luceneSrc).toMatch(/<pre class="lc-err-pre" v-html="errPreHtml\(runErr, errMeta\(runErrRaw\)\)"><\/pre>/);
    expect(luceneSrc).toMatch(/import \{ errPreHtml, errMeta \} from '\.\.\/utils\/errPre';/);
    expect(luceneSrc).not.toMatch(/\{\{ runErr \}\}<\/pre>/);
  });

  it('ProfileFlameView：编辑器高度四档 + 满档弹性 + Ctrl+Enter + hotops 小表接 QRT', () => {
    expect(pfSrc).toMatch(/usePref<EditorHKey>\('pf\.editorH', 's'\)/);
    expect(pfSrc).toMatch(/class="pf-eh"/);
    expect(pfSrc).toMatch(/'pf-h-full': editorH === 'full'/);
    /* 551 同步更新：lint 划线接线补 ref="pfJaRef"（RankDebug rdJaRef 同款，vue 属性序 ref 在 v-model 前）——整条 tag 形态断言意图不变 */
    expect(pfSrc).toMatch(/<JsonArea ref="pfJaRef" v-model="dsl" :dsl-assist="dslAssist" :rows="PF_ROWS\[editorH\]" :fill="editorH === 'full'" class="pf-body-ja" @submit="run" \/>/);
    expect(pfSrc).toMatch(/:cols="hotCols" :rows="hotRows"/);
    expect(pfSrc).not.toMatch(/class="pf-tbl"/);
  });

  it('SearchTemplatesView：模板源编辑器 Ctrl+Enter 执行（@execute 通道）', () => {
    /* 五百三十五批锚同步更新：行首前插 ref="stMeRef"（lint 划线 setMarkers 消费），@execute 通道语义不变 */
    expect(tplSrc).toMatch(/<MonacoEditor ref="stMeRef" v-model="source" :height="EDITOR_HEIGHTS\[editorH\]" :dsl-assist="dslAssist" @execute="run" \/>/);
  });
});
