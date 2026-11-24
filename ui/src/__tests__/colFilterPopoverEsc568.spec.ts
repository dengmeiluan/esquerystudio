/**
 * 五百六十八批：ColFilterPopover Esc 收口升 document 捕获级（566 Pagination 约定范式推广；
 * 宪法铁律 D1#5「开弹层→Esc→焦点回触发器」；568 Esc 巡查批头号件，567 真机实锚）。
 *
 * 缺陷两 面（567-C2 ① 之延伸）：
 * 1) 元素级 `@keydown.esc` 双挂（mask+panel tabindex=-1 族）依赖弹层内持焦点——真实路径
 *    漏斗钮点击后焦点留在表头（弹层外），Esc 关不掉；synthetic 场景（探针/自动化）更是
 *    焦点恒在弹层外；
 * 2) .cfp-kw / .cfp-range-in 输入框 `@keydown.stop` 掐断冒泡——焦点在输入框内按 Esc 同样
 *    关不掉（比 567 记录还多一层的加重面）。
 *
 * 约定形态（照 pagerEscClose566 / CellContextMenu 417 范式）：挂载（=开层，消费方条件渲染）
 * 即存触发时焦点（漏斗钮），document 捕获级收 Esc：stopPropagation+close+焦点回触发钮；
 * 卸载兜底摘监听；mask/panel 元素级 @keydown.esc 退役（单源化——capture 先于 target，
 * 元素级在双路径下已不可达，留着即双源）。五通道消费方（QRT/RT/Browser/Plugins/Security）
 * 零改动。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ColFilterPopover from '../components/ColFilterPopover.vue';

vi.mock('vue-router', () => ({ useRouter: () => undefined, useRoute: () => ({ path: '/x', query: {} }) }));

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function tick(n = 6) { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } }

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

/** 挂 CFP：host 内先落一枚「表头漏斗钮」并聚焦（真实路径形态），再挂弹层；close 事件计数外露 */
async function mountCfpWithTrigger() {
  const events: Record<string, number> = { close: 0 };
  /* 触发钮=漏斗钮替身（弹层外、弹层之前存在于 DOM——真实表头同构） */
  const trigger = document.createElement('button');
  trigger.className = 'funnel-btn';
  trigger.textContent = '筛选';
  host.appendChild(trigger);
  trigger.focus();
  expect(document.activeElement, '前置：触发钮持焦点（真实点击漏斗钮的焦点态）').toBe(trigger);

  const cfpHost = document.createElement('div');
  document.body.appendChild(cfpHost);
  const app = createApp({
    setup: () => () => h(ColFilterPopover as any, {
      col: 'name', x: 12, y: 20,
      vals: [{ v: 'banana', n: 2 }, { v: 'apple', n: 1 }],
      total: 3, selected: [], normOf: (v: any) => String(v),
      search: true, kw: '',
      onClose: () => { events.close++; },
    }),
  });
  app.mount(cfpHost);
  apps.push(app);
  await tick(4);
  return { events, trigger, app, unmount: () => { try { app.unmount(); } catch { /* 已卸载 */ } cfpHost.remove(); } };
}

describe('ColFilterPopover Esc 收口升 document 捕获级（五百六十八批；铁律 D1#5）', () => {
  it('① 焦点在弹层外（漏斗钮）按 Esc → close（567 缺陷回归锚：元素级下此路 close=0）', async () => {
    const { events, unmount } = await mountCfpWithTrigger();
    expect(document.querySelector('.cfp'), '弹层已开').toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(2);
    expect(events.close, 'document 捕获级 Esc → close（元素级依赖弹层内焦点，此路原本关不掉）').toBe(1);
    unmount();
  });

  it('② 焦点在 .cfp-kw 输入框内（@keydown.stop 掐冒泡）按 Esc → 仍 close（capture 先于 target 证明）', async () => {
    const { events, unmount } = await mountCfpWithTrigger();
    const kw = document.querySelector('.cfp-kw') as HTMLInputElement;
    expect(kw, '值内搜索输入已渲染').toBeTruthy();
    kw.focus();
    kw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(2);
    expect(events.close, '输入框 stop 掐断的是冒泡路径；capture 级在 document 上先于 target 收到').toBe(1);
    unmount();
  });

  it('③ Esc 关层后焦点回触发钮（触发时焦点存档-还档，五通道消费方零改动）', async () => {
    const { trigger, unmount } = await mountCfpWithTrigger();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(2);
    expect(document.activeElement, '焦点回漏斗钮（肌肉记忆可达，铁律 D1#5 后半句）').toBe(trigger);
    unmount();
  });

  it('④ 非 Esc 键不误关（与 pagerEscClose566 同锚）', async () => {
    const { events, unmount } = await mountCfpWithTrigger();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    await tick(2);
    expect(events.close, 'Enter/普通字符键不得触发关层').toBe(0);
    expect(document.querySelector('.cfp'), '弹层仍在').toBeTruthy();
    unmount();
  });

  it('⑤ 卸载兜底摘监听（关层后 document Esc 不再 emit）+ 源码锁：元素级 @keydown.esc 退役单源化', async () => {
    const { events, unmount } = await mountCfpWithTrigger();
    unmount();
    await tick(2);
    const before = events.close;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(2);
    expect(events.close, '卸载后监听已摘——Esc 不再触发 close').toBe(before);

    const src = readFileSync(join(__dirname, '..', 'components', 'ColFilterPopover.vue'), 'utf-8');
    expect(src, '源码锁：元素级 @keydown.esc 退役（document 捕获级单源，双源即回归）').not.toContain('@keydown.esc');
  });
});
