/**
 * 1380：全站统一 Settings 呈现组件的行右键。
 *
 * 缺口（普查实锤）：SettingsGrid 是 MappingView / IndexHub / 各处 settings 的共享呈现件，
 * 此前每行只有「点值复制 key: value」一条路。排查时真正要的是
 * 「把这条 setting 拼进 PUT /_settings 的片段」「只要值」「复制成 term 查询去核对」——
 * 都只能手打。
 *
 * 修法：行级右键，一级 ≤2 直达 + 1 个分组（与表格右键同约定）。
 *
 * 负控（每条都能红）：
 *  ① 右键某行 → 菜单出现，一级正好 2 个直达 + 1 个分组父项；
 *  ② 点「复制 PUT 设置片段」→ 剪贴板内容必须是 `{"<去掉 index. 前缀的键>": "<值>"}`，
 *     不是把整行拼错；负控：断言不存在 `index.` 裸前缀漏进 JSON 键；
 *  ③ 分组「更多…」里必须有三项（键名/值/term），且 term 片段键是**完整键**（含 index.）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import SettingsGrid from '../components/SettingsGrid.vue';

const ROWS = [
  { k: 'index.refresh_interval', v: '30s' },
  { k: 'index.number_of_replicas', v: '1' },
];

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
const tick = async (n = 10) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

let copied = '';
beforeEach(() => {
  copied = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (s: string) => { copied = s; }) },
  });
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

async function mount() {
  const app = createApp({ setup: () => () => h(SettingsGrid as any, { rows: ROWS }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}
function rowEl(kw: string): HTMLElement {
  const el = [...host.querySelectorAll<HTMLElement>('.sg-row')].find(r => (r.textContent || '').includes(kw));
  expect(el, `找不到行 ${kw}`).toBeTruthy();
  return el!;
}
function menuRoot(): HTMLElement | null { return document.querySelector('.ccm-mask > .ccm'); }
function topItems(): HTMLButtonElement[] {
  const root = menuRoot();
  return root ? [...root.children].filter(e => e.matches('button.ccm-it')) as HTMLButtonElement[] : [];
}
function clickIt(labelRe: RegExp) {
  const el = [...document.querySelectorAll<HTMLButtonElement>('.ccm-mask .ccm-it')]
    .find(b => labelRe.test(b.textContent || ''));
  expect(el, `菜单里找不到 ${labelRe}`).toBeTruthy();
  el!.click();
}

describe('1380 SettingsGrid 行右键', () => {
  it('① 右键行出菜单：一级 2 直达 + 1 分组', async () => {
    await mount();
    rowEl('refresh_interval').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    await tick();
    const items = topItems();
    expect(items.length, '一级项数').toBe(3);
    expect(items.filter(i => i.classList.contains('ccm-parent')).length, '分组父项').toBe(1);
    expect(items.map(i => (i.textContent || '').trim())).toEqual(
      expect.arrayContaining([expect.stringContaining('复制键值'), expect.stringContaining('复制 PUT 设置片段')]),
    );
  });

  it('② 复制 PUT 片段：键去掉 index. 前缀，值原样', async () => {
    await mount();
    rowEl('refresh_interval').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    await tick();
    clickIt(/复制 PUT 设置片段/);
    await tick();
    expect(copied, 'PUT 片段内容').toBe('{\n  "refresh_interval": "30s"\n}');
    /* 负控：JSON 键里不能带 index. 前缀（ES 的 settings 接口是相对 index 的） */
    expect(JSON.parse(copied), '键必须已剥前缀').toEqual({ refresh_interval: '30s' });
  });

  it('③ 分组「更多…」含键名/值/term，且 term 用完整键', async () => {
    await mount();
    rowEl('refresh_interval').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    await tick();
    const parent = [...document.querySelectorAll<HTMLElement>('.ccm-mask .ccm-it.ccm-parent')]
      .find(e => /更多/.test(e.textContent || ''));
    expect(parent).toBeTruthy();
    parent!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await tick();
    const sub = [...document.querySelectorAll<HTMLButtonElement>('.ccm-sub .ccm-it')].map(e => (e.textContent || '').trim());
    expect(sub.length, '二级项').toBe(3);
    expect(sub.join('|')).toMatch(/键名/);
    expect(sub.join('|')).toMatch(/只复制值/);
    expect(sub.join('|')).toMatch(/term/);
    clickIt(/term/);
    await tick();
    expect(JSON.parse(copied), 'term 用完整键').toEqual({ term: { 'index.refresh_interval': '30s' } });
  });
});
