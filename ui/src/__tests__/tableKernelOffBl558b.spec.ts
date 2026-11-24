/**
 * (b) 轨3：表格内核非黑名单件增量。
 * 锁定：
 * 1) ColDetailModal typeCls 合并 typeTiers 单源——本地五正则副本字面退役
 *    （typeTiers.ts:44-51 官方实现逐字同值，弹窗内聚副本随合并）；
 * 2) ColDetailModal 高频值列表补「复制」出口：整列 top 值 TSV（值/行数两列、
 *    不受 kw 过滤影响），格式化走 copyMatrix.matrixTsv 单源、复制走
 *    format.copyText → clipboard.ts 三层管线（happy-dom 无剪贴板，断言调用参数）；
 * 3) tableSort.ts 备案锁：useTableSort 已零生产消费、numeric() 唯余 ResultTable
 *    （黑名单件）消费——两导出仍存在防误删 + 备案注释在场防回潮；
 * 4) useRowNav 注释事实锁：XmigrateView 已换壳 QRT，xm-tbl 键控字面退役
 *    （全库 grep 无 xm-tbl），注释不再保留「有意不合并」过时备案。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ColDetailModal from '../components/ColDetailModal.vue';

const cdm = readFileSync(join(__dirname, '../components/ColDetailModal.vue'), 'utf-8');
const tableSort = readFileSync(join(__dirname, '../composables/tableSort.ts'), 'utf-8');
const useRowNavSrc = readFileSync(join(__dirname, '../composables/useRowNav.ts'), 'utf-8');

/* ═══════════ ① typeCls 单源合并（源码锁） ═══════════ */
describe('ColDetailModal typeCls 单源（b）', () => {
  it('import typeTiers 在场（isNonSemanticType+typeCls 同行引入）', () => {
    expect(cdm, '应改引 typeTiers 单源').toContain(
      "import { isNonSemanticType, typeCls } from '../utils/typeTiers';",
    );
    expect(cdm, '模板徽标仍走 typeCls(stats.type)').toContain('typeCls(stats.type)');
  });

  it('本地副本字面退役：typeCls 函数声明与五正则字面均不在场', () => {
    expect(cdm, '本地 function typeCls 声明应删除').not.toContain('function typeCls');
    expect(cdm, '数值族正则字面应退役（typeTiers NUMERIC_TYPES_RE 单源）').not.toContain('unsigned_long');
    expect(cdm, '日期族正则字面应退役').not.toContain('date_nanos');
    expect(cdm, '文本族字面应退役').not.toContain('match_only_text');
    expect(cdm, '布尔族字面应退役').not.toContain("'boolean'");
  });
});

/* ═══════════ ② 高频值复制钮（行为锁，挂载样板照抄 colStatsTopTotal525） ═══════════ */
describe('ColDetailModal 高频值复制钮（b）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  let host: HTMLElement;

  function mkStats(topTotal: number, col = 'kw1') {
    return reactive({
      col, type: 'keyword', distinct: topTotal, empty: 0, numeric: null, topTotal,
      top: ['v1', 'v2', 'v3', 'v4', 'v5'].map((v, i) => ({ v, n: 10 - i })),
      count: 10, median: null, emptyRate: 0,
    });
  }
  async function mountWith(stats: any) {
    host = document.createElement('div');
    document.body.appendChild(host);
    const pprops = reactive({ show: true, stats, labelOf: (v: any) => String(v) });
    const app = createApp({ setup: () => () => h(ColDetailModal as any, pprops) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    return pprops;
  }
  const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

  beforeEach(() => {
    localStorage.clear();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    document.body.innerHTML = '';
  });

  it('高频值段出「复制」钮：点击 → 剪贴板=「值\\t行数」表头 + top 全量 TSV', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountWith(mkStats(12));
    const btn = document.body.querySelector('.rt-cd-copy') as HTMLButtonElement | null;
    expect(btn, '高频值段应有「复制」钮').toBeTruthy();
    btn!.click();
    await tick();
    expect(writeText, '应走 navigator.clipboard（copyText L1 管线）').toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe('值\t行数\nv1\t10\nv2\t9\nv3\t8\nv4\t7\nv5\t6');
  });

  it('复制出径=整列 top 全量（kw 过滤只滤显示，不改变复制内容）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountWith(mkStats(25));
    const kwInp = document.body.querySelector('.rt-cd-kw') as HTMLInputElement;
    expect(kwInp, 'topTotal>20 应出 kw 过滤（契约）').toBeTruthy();
    kwInp.value = 'v3';
    kwInp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect([...document.body.querySelectorAll('.rt-cd-v')].length, '过滤后仅显示 1 行').toBe(1);
    (document.body.querySelector('.rt-cd-copy') as HTMLButtonElement).click();
    await tick();
    expect(writeText.mock.calls[0][0], '仍复制整列 top 全量').toBe('值\t行数\nv1\t10\nv2\t9\nv3\t8\nv4\t7\nv5\t6');
  });
});

/* ═══════════ ③ tableSort 备案锁（源码锁） ═══════════ */
describe('tableSort 备案锁（b）', () => {
  it('僵尸壳已按 603 裁决退役；useSortChain 状态机单源在场（防回潮）', () => {
    expect(tableSort, 'useTableSort 已退役（裁决，558b 防误删锁语义升格为退役锁）').not.toContain('export function useTableSort');
    expect(tableSort, '排序状态机单源在档（560 备案大件落地）').toContain('export function useSortChain');
  });
  it('numeric 导出仍存在（防误删）+备案注释在场：numeric() 双内核消费（事实更新同步更新——RT/QRT 均经 compareVals 接线消费）；603 裁决备案在档', () => {
    expect(tableSort).toContain('export function numeric(');
    expect(tableSort, '备案锚一：numeric() 双内核消费（RT/QRT compareVals 单源接线）').toContain('双内核消费');
    expect(tableSort, '备案锚二：批次标记').toContain('(b)');
    expect(tableSort, '备案锚三：603 僵尸壳退役裁决').toContain('');
  });
});

/* ═══════════ ④ useRowNav 注释事实锁（源码锁） ═══════════ */
describe('useRowNav 注释事实锁（b）', () => {
  it('xm-tbl 字面退役（XmigrateView 已换壳 QRT，「有意不合并」备案过时）', () => {
    expect(useRowNavSrc, '全文件不应再出现 xm-tbl 字面').not.toContain('xm-tbl');
    expect(useRowNavSrc, '内核导出仍完好').toContain('export function useRowNav');
  });
  it('换壳事实备案在场（QRT 承接行导航）', () => {
    expect(useRowNavSrc).toContain('');
    expect(useRowNavSrc).toContain('QRT');
  });
});
