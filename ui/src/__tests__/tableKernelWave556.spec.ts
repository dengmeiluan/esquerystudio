/**
 * 五百五十六批轨3：数据表格内核残面清零（552 合并两步走·对称件收尾）。
 * 锁定：
 * ① QRT 单元格右键菜单补「筛选此列」直达（RT 格右键 230 批同款第四入口；两表列头菜单
 *    均已有，唯 QRT 格右键缺——审计3 能力差集内核内闭环件）；筛选内存态不依赖 prefsOn
 *    （与 QRT 列头菜单 filter-col 同口径），弹层落点=菜单坐标；
 * ② QRT 单元格右键菜单补「全列适应内容」（RT 格右键 254 批对位项；prefsOn 门控与既有
 *    fit-col 同口径——无记忆模式 setWidth 无处落=空操作假菜单项不出）；
 * ③ RT 格右键对称件对照锚（筛选此列/全列适应内容在场——防单侧回退漂移）；
 * ④ useColFilters filterMode OR 档跨三档（等值∪区间∪包含）运行时锚——534 锁等值 OR、
 *    552 锁 contains∪eq 的 OR，区间档进 OR 并集此前无锚（审计2 组合语义补锚）。
 * 挂载样板照抄 tableKernelWave552（裸 createApp + pinia harness）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';
import { findMenuItem } from './helpers/ctxMenu'; /* 1142：二级菜单取项 */
import ResultTable from '../components/ResultTable.vue';
import { useColFilters } from '../composables/useColFilters';

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

/* composable 行为 harness（552 同款：setup 内挂，结果镜像到 outer） */
function runSetup(fn: () => void) {
  const app = createApp({ setup() { fn(); return () => h('div'); } });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
}

function lastUnmount() {
  const a = apps.pop();
  try { a?.unmount(); } catch { /* 已卸载 */ }
  host.innerHTML = '';
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.cfp, .cfp-mask, .ccm-mask').forEach(e => e.remove());
});

/* 单元格右键开菜单（td 上 @contextmenu；bubbles 照抄 552 happy-dom 纪律） */
async function openCellMenu(sel: string) {
  const cell = host.querySelector(sel) as HTMLElement;
  expect(cell, '数据格在场').toBeTruthy();
  cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 24 }));
  await tick(4);
}
const menuButtons = () => [...document.querySelectorAll('.ccm-mask .ccm-it')] as HTMLButtonElement[];
/* 1142：动作项住分组二级——menuIt 按需展开分组（helper 统一口径） */
const menuIt = (txt: string) => findMenuItem(txt) as Promise<HTMLButtonElement | null>;

/* ═══════════ 一、QRT 格右键缺口语径补齐（①②） ═══════════ */
describe('五百五十六批 A：QRT 单元格菜单补「筛选此列」+「全列适应内容」（RT 对称件）', () => {
  it('① QRT：格右键「筛选此列」在场，点击按菜单落点开筛选弹层（内存态不依赖 prefsOn）', async () => {
    await mountTbl(QueryResultTable, {
      cols: ['name', 'n'], rows: [['banana', 1], ['apple', 2]] as any, storageKey: 'w556q1',
    });
    await openCellMenu('tbody tr td.qrt-cell');
    const it1 = await menuIt('筛选此列');
    expect(it1, 'QRT 格右键有「筛选此列」项（RT 230 批对称件）').toBeTruthy();
    it1!.click();
    await tick(6);
    const pop = document.querySelector('.cfp') as HTMLElement;
    expect(pop, '弹层按菜单落点打开').toBeTruthy();
    expect(host.querySelector('.qrt-bar')!.textContent || '', '未设任何档=零过滤零增量').not.toContain('已筛选');
  });

  it('① QRT：无 storageKey（prefsOn=false）「筛选此列」仍可达（筛选内存态，与列头 filter-col 同口径）', async () => {
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[1]] as any });
    await openCellMenu('tbody tr td.qrt-cell');
    expect(await menuIt('筛选此列'), '无记忆通道筛选直达仍在（内存态）').toBeTruthy();
  });

  it('② QRT：格右键「全列适应内容」prefsOn 门控（storageKey 在场出、不在场不出）', async () => {
    await mountTbl(QueryResultTable, { cols: ['v', 'w'], rows: [[1, 'x']] as any, storageKey: 'w556q2' });
    await openCellMenu('tbody tr td.qrt-cell');
    expect(await menuIt('此列适应内容'), '前置：fit-col 既有项在场').toBeTruthy();
    expect(await menuIt('全列适应内容'), '格右键补 fit-all（RT 254 批对位项）').toBeTruthy();
    /* happy-dom 无布局（scrollWidth=0）→ fitAll 安全 no-op，点击不炸不写宽 */
    const fitAllIt = (await menuIt('全列适应内容'))!;
    expect(() => fitAllIt.click(), '点击安全（max=0 no-op 契约）').not.toThrow();
    await tick(4);
    expect(localStorage.getItem('es_tbl_w:w556q2'), '无测量宽不落盘（no-op 不造假宽）').toBeNull();
    lastUnmount();
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[1]] as any });
    await openCellMenu('tbody tr td.qrt-cell');
    expect(await menuIt('全列适应内容'), '无 storageKey 不出空操作假菜单项（tableRangeAggCopy 同口径）').toBeNull();
  });
});

/* ═══════════ 二、RT 对照锚 + OR 跨三档组合语义锚（③④） ═══════════ */
describe('五百五十六批 B：RT 对照锚 + filterMode OR 跨三档补锚', () => {
  it('③ RT：格右键「筛选此列」/「全列适应内容」对照锚（对称件基准侧防回退）', async () => {
    const HITS = [
      { _id: 'a', _source: { name: 'banana' } }, { _id: 'b', _source: { name: 'apple' } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w556r3' });
    await openCellMenu('tbody tr td.rt-cell');
    expect(await menuIt('筛选此列'), 'RT 格右键筛选直达在场（基准侧）').toBeTruthy();
    expect(await menuIt('全列适应内容'), 'RT 格右键 fit-all 在场（254 批件）').toBeTruthy();
  });

  it('④ useColFilters：OR 档=等值∪区间∪包含三档并集（区间进 OR 首锚；AND 交叉回归）', () => {
    const ROWS = [
      { id: 1, name: 'banana', n: 5 },
      { id: 2, name: 'apple', n: 50 },
      { id: 3, name: 'cherry', n: 7 },
      { id: 4, name: 'date', n: 60 },
    ];
    let f: any;
    runSetup(() => {
      f = useColFilters({
        rows: () => ROWS,
        getVal: (row: any, col: string) => row[col],
        labelOf: (v: any) => String(v),
      });
    });
    /* 三档各设一列：name 包含 an、n 区间 [50,∞)、（等值档由 toggle 勾 cherry） */
    f.setContainsFilter('name', 'an');
    f.setRangeFilter('n', 'min', '50');
    f.toggleFilterVal('name', 'cherry');
    /* AND：三档交叉=空集（banana 命中 contains 不命中区间；apple 命中区间不命中 contains/等值） */
    expect(f.filterRows(ROWS).map((r: any) => r.id), 'AND 三档交叉').toEqual([]);
    /* OR：任一档命中即保留——contains 列(1,3) ∪ 区间列(2,4) 并集 */
    expect(f.filterRows(ROWS, 'OR').map((r: any) => r.id), 'OR 跨三档并集（区间档进 OR 首锚）').toEqual([1, 2, 3, 4]);
    /* 收窄对照：仅区间档生效时 OR=区间列命中集 */
    f.clearFilter('name');
    expect(f.filterRows(ROWS, 'OR').map((r: any) => r.id), '仅区间生效 OR=区间命中集').toEqual([2, 4]);
  });
});
