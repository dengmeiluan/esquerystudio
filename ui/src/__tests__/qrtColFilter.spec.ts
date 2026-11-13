/**
 * R130 一百六十九批：QRT 列头筛选漏斗（dbx 每列筛选——去重值勾选过滤）。
 * 锁定：
 * 1) 每个数据列头有筛选漏斗钮（aria 可达）；点击弹出去重值列表（teleport body）；
 * 2) 勾选值过滤行集（纯前端），qrt-bar 出现筛选态提示（已筛选 N 列 · M/K 行），漏斗 .on 高亮；
 * 3) 多列 AND 组合；弹层「清除」恢复全行；
 * 4) 全部值筛掉 → qrt-nomatch 提示行（不空得诡异）；
 * 5) 暗状态守卫：筛选拉隐藏的列选隐藏该列 → 该列筛选自动清（T22 所见即所筛）；
 * 6) 管线次序：过滤后排序在过滤子集内生效；
 * 7) 源码锁：漏斗/弹层关键样式。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const HITS = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
  { _id: 'c', _source: { name: 'cherry', age: 1 } },
] as any;

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

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

const funnelOf = (col: string) =>
  [...host.querySelectorAll('thead th .qrt-funnel')].find(b => b.getAttribute('aria-label') === '筛选 ' + col + ' 列') as HTMLButtonElement;

describe('QRT 列头筛选漏斗（一百六十九批）', () => {
  it('漏斗钮存在；点击弹出去重值列表；勾选过滤+提示+高亮', async () => {
    await mountTbl({ hits: HITS, storageKey: 'cf1' });
    expect(host.querySelectorAll('.qrt-funnel').length).toBe(3); // 数据列 _id/name/age
    funnelOf('name')!.click();
    await tick(4);
    const pop = document.querySelector('.cfp')!;
    expect(pop, '点击漏斗应弹出筛选层').not.toBeNull();
    expect(pop.textContent).toContain('筛选「name」');
    const vals = [...pop.querySelectorAll('.cfp-val')].map(s => s.textContent?.trim());
    expect(vals).toEqual(['banana', 'apple', 'cherry']);
    /* 勾选 banana 与 apple → 只剩 2 行 */
    const boxes = [...pop.querySelectorAll('input[type="checkbox"]') as unknown as HTMLInputElement[]];
    boxes[0].click(); await tick(6);
    boxes[1].click(); await tick(6);
    const rows = [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));
    expect(rows.length).toBe(2);
    expect(host.querySelector('.qrt-bar')!.textContent).toContain('已筛选 1 列 · 2/3 行');
    expect(funnelOf('name')!.classList.contains('on')).toBe(true);
    /* 点遮罩关闭 */
    document.querySelector('.cfp-mask')!.dispatchEvent(new Event('click', { bubbles: true }));
    await tick(2);
    expect(document.querySelector('.cfp')).toBeNull();
  });

  it('多列 AND：name 再加 age 过滤 → 交集 1 行；弹层「清除」恢复', async () => {
    await mountTbl({ hits: HITS, storageKey: 'cf2' });
    funnelOf('name')!.click(); await tick(4);
    let pop = document.querySelector('.cfp')!;
    ([...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[])[0].click(); // banana
    await tick(6);
    funnelOf('age')!.click(); await tick(4);
    pop = document.querySelector('.cfp')!;
    /* age 去重值 [2,3,1]，勾 2 */
    ([...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[])[0].click();
    await tick(6);
    const rows = [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));
    expect(rows.length).toBe(1);
    expect(rows[0].children[2]?.textContent?.trim()).toBe('banana');
    expect(host.querySelector('.qrt-bar')!.textContent).toContain('已筛选 2 列 · 1/3 行');
    /* 弹层「清除」按钮清当前列（age）——name=banana 过滤仍在，保持 1 行 */
    (pop.querySelector('.cfp-clear') as HTMLButtonElement).click();
    await tick(6);
    expect([...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch')).length).toBe(1);
    expect(host.querySelector('.qrt-bar')!.textContent).toContain('已筛选 1 列 · 1/3 行');
  });

  it('筛选残留遇新数据无匹配 → qrt-nomatch 提示行（全勾=全保留不触发）', async () => {
    const pstate = reactive({
      hits: [
        { _id: 'a', _source: { name: 'banana', age: 2 } },
        { _id: 'b', _source: { name: 'apple', age: 3 } },
        { _id: 'c', _source: { name: 'cherry', age: 1 } },
      ] as any,
      storageKey: 'cf3',
    });
    const app = createApp({ setup: () => () => h(QueryResultTable as any, pstate) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    await tick(8);
    funnelOf('name')!.click(); await tick(4);
    const pop = document.querySelector('.cfp')!;
    /* 只勾 banana（全勾=全保留，不触发过滤） */
    ([...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[])[0].click();
    await tick(6);
    expect(host.querySelectorAll('tbody tr').length).toBe(1);
    /* 新数据无 banana → 残留筛选筛掉全部行 → nomatch 提示 */
    pstate.hits = [
      { _id: 'x', _source: { name: 'date', age: 9 } },
      { _id: 'y', _source: { name: 'fig', age: 8 } },
    ] as any;
    await tick(8);
    expect(host.querySelector('.qrt-nomatch')).not.toBeNull();
    expect(host.querySelector('.qrt-nomatch')!.textContent).toContain('筛选条件无匹配行');
  });

  it('暗状态守卫：筛选后列选隐藏该列 → 该列筛选自动清', async () => {
    await mountTbl({ hits: HITS, storageKey: 'cf4' });
    funnelOf('name')!.click(); await tick(4);
    const pop = document.querySelector('.cfp')!;
    ([...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[])[0].click(); // 只留 banana
    await tick(6);
    expect(host.querySelectorAll('tbody tr').length).toBe(1);
    /* 列选隐藏 name → 筛选被清，行集恢复 */
    funnelOf('name')!.closest('th')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick(4);
    const hideBtn = [...document.querySelectorAll('.ccm-it')].find(b => b.textContent?.includes('隐藏此列')) as HTMLButtonElement;
    hideBtn.click();
    await tick(8);
    expect([...host.querySelectorAll('tbody tr')].length).toBe(3);
    expect(host.querySelector('.qrt-filtered')).toBeNull();
  });

  it('管线次序：过滤子集内排序生效', async () => {
    await mountTbl({ hits: HITS, sortable: true, storageKey: 'cf5' });
    funnelOf('name')!.click(); await tick(4);
    const pop = document.querySelector('.cfp')!;
    const boxes = [...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    boxes[0].click(); await tick(4); // banana
    boxes[2].click(); await tick(4); // cherry
    document.querySelector('.cfp-mask')!.dispatchEvent(new Event('click', { bubbles: true }));
    await tick(2);
    /* 对 2 行子集按 age 排序（227 批 M2 起首击升序）：cherry(1) 在前 banana(2) 在后 → ['1','2'] */
    const ageTh = [...host.querySelectorAll('th')].find(t => t.textContent?.includes('age'))!;
    ageTh.click(); await tick(6);
    const ages = [...host.querySelectorAll('tbody tr')].map(tr => tr.children[3]?.textContent?.trim());
    expect(ages).toEqual(['1', '2']);
  });
});

describe('QRT 筛选漏斗源码锁（一百六十九批，五百二十四批壳合并同步更新）', () => {
  const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
  const cfpCss = readFileSync(join(__dirname, '../components/ColFilterPopover.vue'), 'utf-8').split('<style scoped>')[1] ?? '';

  it('漏斗弱灰常驻/激活高亮（QRT 本体）；弹层 fixed+mask 模式（共享件，z 收口 ctx 档）', () => {
    expect(qrt).toMatch(/\.qrt-funnel\.on \{ opacity: 1; color: var\(--info\); \}/);
    expect(cfpCss).toMatch(/\.cfp-mask \{ position: fixed; inset: 0; z-index: var\(--z-ctx\); \}/);
    expect(cfpCss).toMatch(/\.cfp \{\s*z-index: calc\(var\(--z-ctx\) \+ 1\);/);
  });
});
