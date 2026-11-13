/**
 * 五百六十五批件③：QRT ColFilterPopover 换内建 filterMode chip（563 批余量收口）。
 * 563 已交付：ColFilterPopover 内建组合档 chip（可选 filterMode prop + toggle-filter-mode
 * emit，kernelFilterOrMode563 已锁）；未接线证据：QRT 弹层仍走默认槽手搓钮
 * （<button class="qrt-fmode mono">组合：…</button> 注入 cfp-acts 行）。
 * ：QRT 默认槽手搓钮退役，改 popover 传 :filter-mode="filterModeLive"
 * +@toggle-filter-mode="toggleFilterMode"（内建 chip，cfp-hd 头部渲染）。
 * ⚠filterModeToggle561 行为锚同串（「组合：X」/aria/title 同语汇）——语义等价迁移不删锁：
 * 弹层钮文本与翻转行为不变，561 断言应原样通过（复跑验证）。
 * 锁定：
 * 1) 源码锁：QRT 不再含手搓槽钮字面（aria/title 两个手搓档独有串缺席）；
 * 2) 源码锁：popover 接线 prop/emit 在场；
 * 3) 行为：开弹层出 .cfp-fmode 内建 chip「组合：AND」，点击翻转 OR、提示行钮同步
 *    （561 第二注入位行为锚等价复验）；Esc 关层档位保持；
 * 4) 缺省（未开弹层）零渲染：无 .cfp/.cfp-fmode。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

const FHITS = [
  { _id: '1', _source: { name: 'banana', age: 2 } },
  { _id: '2', _source: { name: 'apple', age: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

const funnelOf = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('thead .qrt-funnel')]
    .find(b => b.getAttribute('aria-label') === label);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.cfp, .cfp-mask').forEach(e => e.remove());
});

describe('五百六十五批件③：QRT ColFilterPopover 内建 filterMode chip', () => {
  it('源码锁：手搓槽钮字面退役 + popover 接线 prop/emit 在场', () => {
    /* 手搓钮独有字面（aria/title 组合文案仅存在于 QRT 槽钮，内建 chip 在 ColFilterPopover.vue） */
    expect(qrt, '手搓槽钮 aria 文案退役').not.toContain('筛选组合档：');
    expect(qrt, '手搓槽钮 title 文案退役').not.toContain('多列筛选组合：');
    /* 563 内建 chip 接线 */
    expect(qrt).toContain(':filter-mode="filterModeLive"');
    expect(qrt).toContain('@toggle-filter-mode="toggleFilterMode"');
  });

  it('行为：内建 chip「组合：AND」点击翻转 OR，提示行同步；Esc 关层档位保持', async () => {
    await mountTbl({ hits: FHITS, storageKey: 'fmc565' });
    /* 先激活一列筛选（提示行 qrt-filtered 仅在有生效筛选时渲染，561 同流程） */
    funnelOf('筛选 name 列')!.click(); await tick(4);
    (document.querySelector('.cfp input[type="checkbox"]') as HTMLInputElement).click();
    await tick(6);
    funnelOf('筛选 age 列')!.click(); await tick(4);
    const chip = document.querySelector('.cfp .cfp-fmode') as HTMLElement;
    expect(chip, '内建 chip 在弹层头部渲染').toBeTruthy();
    expect(chip.textContent?.trim()).toBe('组合：AND');
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(6);
    expect(chip.textContent?.trim(), 'chip 就地翻转 OR').toBe('组合：OR');
    expect((host.querySelector('.qrt-filtered .qrt-fmode') as HTMLElement).textContent?.trim(), '提示行钮同步').toBe('OR');
    (document.querySelector('.cfp-mask') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(4);
    expect(document.querySelector('.cfp'), '弹层已关').toBeNull();
    expect((host.querySelector('.qrt-filtered .qrt-fmode') as HTMLElement).textContent?.trim(), '档位保持').toBe('OR');
  });

  it('缺省（未开弹层）零渲染：无 .cfp/.cfp-fmode', async () => {
    await mountTbl({ hits: FHITS, storageKey: 'fmc565b' });
    expect(document.querySelector('.cfp'), '未开弹层无弹层').toBeNull();
    expect(document.querySelector('.cfp-fmode'), '未开弹层无 chip').toBeNull();
  });
});
