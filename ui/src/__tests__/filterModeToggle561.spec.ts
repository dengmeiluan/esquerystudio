/**
 * ：QRT/RT filterMode 组合档切换行为锚（轨5 斥候缺口补齐——组件行为 spec
 * 此前零 fmode 弹层槽切换锚/RT 提示行切换锚/prop 动态跟随锚；534 只锁 QRT 提示行钮
 * 与 OR 播种）。 bar-left 筛选态提示 span 合并 TableFilteredHint 片段组件，行为锁
 * 随组件化复验（DOM 能力等价：类名/文案/渲染条件零变动）。
 * 锁定：
 * 1) RT 提示行切换钮 AND→OR 就地翻转（QRT 534 已锁，RT 半边补齐）+ 行集/计数同步；
 * 2) 双表筛选弹层默认槽「组合：X」第二注入位点击翻转，提示行钮文本同步（561 前无行为锚）；
 * 3) filterMode prop 动态变化跟随播种（useFilterMode watch——本地档翻转后 prop 不回写）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';

const FHITS = [
  { _id: '1', _source: { name: 'banana', age: 2 } },
  { _id: '2', _source: { name: 'apple', age: 3 } },
  { _id: '3', _source: { name: 'cherry', age: 4 } },
] as any;

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
  document.querySelectorAll('.cfp, .cfp-mask').forEach(e => e.remove());
});

const funnelOf = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('thead .qrt-funnel, thead .rt-funnel')]
    .find(b => b.getAttribute('aria-label') === label);
const pickFirstVal = async () => {
  (document.querySelector('.cfp input[type="checkbox"]') as HTMLInputElement).click();
  await tick(6);
};
const pickVal = async (idx: number) => {
  const boxes = [...document.querySelectorAll<HTMLInputElement>('.cfp input[type="checkbox"]')];
  boxes[idx]!.click();
  await tick(6);
};
const qrtRows = () => [...host.querySelectorAll('tbody tr')]
  .filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row') && tr.querySelector('td.qrt-cell'));
const rtRows = () => [...host.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.rt-cell'));

describe('：filterMode 组合档切换行为锚（双表×双注入位）', () => {
  it('RT：提示行切换钮 AND→OR 就地翻转（QRT 534 半边对位补齐），行集/计数同步', async () => {
    await mountTbl(ResultTable, { hits: FHITS, total: 3, index: 'w561fmr' });
    funnelOf('筛选 name 列')!.click(); await tick(4); await pickFirstVal();   /* name=banana */
    funnelOf('筛选 age 列')!.click(); await tick(4); await pickVal(1);        /* age=3（apple） */
    expect(rtRows().length, '缺省 AND：banana∧age=3 无交集').toBe(0);
    const toggle = host.querySelector('.rt-filtered .rt-fmode') as HTMLButtonElement;
    expect(toggle.textContent?.trim()).toBe('AND');
    toggle.click();
    await tick(6);
    expect(toggle.textContent?.trim(), '就地翻转 OR').toBe('OR');
    expect(rtRows().length, 'OR：banana ∪ age=2 并集 2 行').toBe(2);
    expect(host.querySelector('.rt-filtered')!.textContent).toContain('已筛选 2 列 · 2/3 行');
  });

  it('QRT：筛选弹层默认槽「组合：X」点击翻转，提示行钮同步（第二注入位行为锚）', async () => {
    await mountTbl(QueryResultTable, { hits: FHITS, storageKey: 'w561fmq' });
    funnelOf('筛选 name 列')!.click(); await tick(4); await pickFirstVal();
    funnelOf('筛选 age 列')!.click(); await tick(4);
    /* 弹层在场（第二注入位=ColFilterPopover 默认槽），槽钮文本=运行档 */
    const pop = document.querySelector('.cfp')!;
    const popBtn = [...pop.querySelectorAll('button')].find(b => b.textContent?.includes('组合：')) as HTMLButtonElement;
    expect(popBtn.textContent?.trim()).toBe('组合：AND');
    popBtn.click();
    await tick(6);
    expect(popBtn.textContent?.trim(), '弹层槽就地翻转').toBe('组合：OR');
    expect((host.querySelector('.qrt-filtered .qrt-fmode') as HTMLElement).textContent?.trim(), '提示行钮同步同档').toBe('OR');
  });

  it('RT：筛选弹层默认槽同构（RT 半边补齐）；Esc 关层后提示行档保持', async () => {
    await mountTbl(ResultTable, { hits: FHITS, total: 3, index: 'w561fmr2' });
    funnelOf('筛选 name 列')!.click(); await tick(4); await pickFirstVal();
    funnelOf('筛选 age 列')!.click(); await tick(4);
    const popBtn = [...document.querySelector('.cfp')!.querySelectorAll('button')]
      .find(b => b.textContent?.includes('组合：')) as HTMLButtonElement;
    expect(popBtn.textContent?.trim()).toBe('组合：AND');
    popBtn.click();
    await tick(6);
    (document.querySelector('.cfp-mask') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(4);
    expect(host.querySelector('.cfp'), '弹层已关').toBeNull();
    expect((host.querySelector('.rt-filtered .rt-fmode') as HTMLElement).textContent?.trim(), '档位保持 OR').toBe('OR');
  });

  it('双表：filterMode prop 动态变化跟随播种；本地翻转后 prop 不回写（reset 语义）', async () => {
    const qp = reactive({ hits: FHITS, storageKey: 'w561fmp', filterMode: 'AND' as 'AND' | 'OR' });
    await mountTbl(QueryResultTable, qp);
    funnelOf('筛选 name 列')!.click(); await tick(4); await pickFirstVal();
    expect((host.querySelector('.qrt-filtered .qrt-fmode') as HTMLElement).textContent?.trim()).toBe('AND');
    qp.filterMode = 'OR';
    await tick(6);
    expect((host.querySelector('.qrt-filtered .qrt-fmode') as HTMLElement).textContent?.trim(), 'prop 变化跟随播种').toBe('OR');

    const rp = reactive({ hits: FHITS, total: 3, index: 'w561fmp2', filterMode: 'AND' as 'AND' | 'OR' });
    await mountTbl(ResultTable, rp);
    funnelOf('筛选 name 列')!.click(); await tick(4); await pickFirstVal();
    rp.filterMode = 'OR';
    await tick(6);
    expect((host.querySelector('.rt-filtered .rt-fmode') as HTMLElement).textContent?.trim(), 'RT 同构跟随').toBe('OR');
  });
});
