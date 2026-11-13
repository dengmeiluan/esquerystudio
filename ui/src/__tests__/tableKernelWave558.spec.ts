/**
 *  轨3 表格内核两件。
 * 锁定：
 * 1) emptyPctOf 单源下沉——useColStats 新增出口（emptyRate×100 后 Math.round 取整 %，
 *    与 双内核 tfoot「· 空值率 N%」内联实现逐字语义等值），QRT/RT aggEmptyPct
 *    双份退役换调用（口径单源化）；538 源码锁（numericOfCount 装配 return 行 / count 档）
 *    零触碰——只动 aggEmptyPct 档，append 锁同步更新确认；
 * 2) RT 列头右键菜单补「复制整表 JSON」（ QRT 单侧漂移的对称件）——照 QRT 同款
 *    形态：行集=sortedHits（与区域复制/导出行序同源）、列=visibleCols 所见即所复、
 *    值=raw（getSourceVal，JSON 档不做显示加工），走既有 copyMatrix json 管道
 *    （缺省 jsonRow 按 cols 构造、缺值补 null、2 空格缩进）；零新键零持久化。
 * 挂载样板照抄 tableKernelWave538/557（裸 createApp + pinia；ccm 菜单 teleport 到 body 查 document）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import { useColStats } from '../composables/useColStats';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const ucs = readFileSync(join(__dirname, '../composables/useColStats.ts'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
  document.querySelectorAll('.ccm-mask').forEach(e => e.remove());
});

const thOf = (root: HTMLElement, col: string) =>
  [...root.querySelectorAll('thead th')].find(t => (t as HTMLElement).dataset.col === col) as HTMLElement;

const menuButtons = () => [...document.querySelectorAll('.ccm-mask .ccm-it')] as HTMLButtonElement[];

/* RT 列头键盘菜单路径（naive 下拉虚拟列表不可靠，键盘打开为既有 spec 验证过的稳妥形态） */
async function openColMenuRt(root: HTMLElement, col: string) {
  thOf(root, col).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ContextMenu' }));
  await tick(4);
}

/* ═══════════ 一、emptyPctOf 单源下沉（件1） ═══════════ */
describe(' T1：useColStats.emptyPctOf（emptyRate×100 后 Math.round 取整 %）', () => {
  const base = {
    rows: () => [] as any[],
    getVal: (r: any, c: string) => r[c],
    labelOf: (v: any) => String(v),
  };

  it('整数舍入口径：1/3→33、2/3→67（与  tfoot「空值率 33%」同源 Math.round）', () => {
    const rows3 = [{ v: 1 }, { v: null }, { v: 3 }];
    const s1 = useColStats({ ...base, rows: () => rows3 }).emptyPctOf('v');
    expect(s1, 'emptyRate=1/3 → Math.round(33.33…)=33').toBe(33);
    const rows3b = [{ v: null }, { v: null }, { v: 3 }];
    expect(useColStats({ ...base, rows: () => rows3b }).emptyPctOf('v'), '2/3 → Math.round(66.67)=67').toBe(67);
  });

  it('边界：全空列→100、零行→0、半值 12.5→13（JS Math.round 半值向上）', () => {
    expect(useColStats({ ...base, rows: () => [{ v: null }, { v: '' }] }).emptyPctOf('v')).toBe(100);
    expect(useColStats(base).emptyPctOf('v'), '零行 emptyRate=0 → 0').toBe(0);
    const rows8 = [{ v: null }, ...Array.from({ length: 7 }, () => ({ v: 1 }))];
    expect(useColStats({ ...base, rows: () => rows8 }).emptyPctOf('v'), '1/8=12.5 半值向上').toBe(13);
  });

  it('源码锚：双内核 aggEmptyPct 退役换调用 emptyPctOf；内联实现移除；538 锁同步更新确认', () => {
    expect(ucs).toContain('function emptyPctOf');
    for (const [name, src] of [['QRT', qrt], ['RT', rt]] as const) {
      expect(src, `${name} aggEmptyPct 换调用单源出口`).toContain('out[c] = colStats.emptyPctOf(c);');
      expect(src, `${name} 内联 Math.round 实现已退役`).not.toContain('Math.round((colStats.statsOf(c).emptyRate ?? 0) * 100)');
      /* 源码锁逐字在场（tableKernelWave538:85）——零触碰的同步更新确认 */
      expect(src, `${name} numericOfCount 装配 return 行 538 锁不动`).toContain('return s.numeric ? { ...s.numeric, count: s.count } : null;');
    }
  });

  it('QRT 行为回归：aggOn 开启后 tfoot 空值率档数值不变（1/3 → 33%）', async () => {
    localStorage.setItem('es_tbl_agg:w558q1', '1');
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[50], [null], [80]] as any, storageKey: 'w558q1' });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row');
    expect(tfoot, '落盘播种直接出 tfoot').toBeTruthy();
    expect(tfoot!.textContent).toContain(' · 空值率 33%');
  });

  it('RT 行为回归：同构同步（1/3 → 33%）', async () => {
    localStorage.setItem('es_tbl_agg:w558r1', '1');
    const HITS = [
      { _id: 'a', _source: { v: 50 } },
      { _id: 'b', _source: { v: null } },
      { _id: 'c', _source: { v: 80 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w558r1' });
    const tfoot = host.querySelector('tfoot tr.rt-agg-row');
    expect(tfoot, '落盘播种直接出 tfoot').toBeTruthy();
    expect(tfoot!.textContent).toContain(' · 空值率 33%');
  });
});

/* ═══════════ 二、RT 复制整表 JSON（件2：557 单侧漂移对称件） ═══════════ */
describe(' T2：RT 列头菜单「复制整表 JSON」', () => {
  it('列头菜单出项 → 剪贴板=visibleCols 全行 JSON 数组（raw 值、2 空格缩进）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    const HITS = [
      { _id: 'a', _source: { name: 'banana', age: 2 } },
      { _id: 'b', _source: { name: 'apple', age: 3 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w558c1' });
    await openColMenuRt(host, 'name');
    const item = menuButtons().find(b => b.textContent?.includes('复制整表 JSON'));
    expect(item, 'RT 列头菜单含「复制整表 JSON」项（与 QRT 对称）').toBeTruthy();
    item!.click();
    await tick(6);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0], '整表 JSON=visibleCols 键 + raw 值（matrixJson 2 空格缩进）')
      .toBe(JSON.stringify([{ name: 'banana', age: 2 }, { name: 'apple', age: 3 }], null, 2));
  });

  it('隐藏一列后复制收窄（列源=visibleCols 所见即所复）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    localStorage.setItem('es_cols:w558c2', JSON.stringify(['age']));
    const HITS = [
      { _id: 'a', _source: { name: 'banana', age: 2 } },
      { _id: 'b', _source: { name: 'apple', age: 3 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w558c2' });
    await openColMenuRt(host, 'age');
    menuButtons().find(b => b.textContent?.includes('复制整表 JSON'))!.click();
    await tick(6);
    expect(writeText.mock.calls[0][0]).toBe(JSON.stringify([{ age: 2 }, { age: 3 }], null, 2));
  });
});
