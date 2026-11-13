/**
 * 1443：菜单键打开菜单后，浏览器会向聚焦的首项补发原生 contextmenu。
 * 遮罩原本对任意冒泡的 contextmenu 直接 close → 菜单刚开就自关（真机 ContextMenu 键复现）。
 * 判据：只有落在遮罩自身的 contextmenu 关闭；菜单/二级内的 contextmenu 不关闭。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import CellContextMenu from '../components/CellContextMenu.vue';

const src = readFileSync(join(__dirname, '../components/CellContextMenu.vue'), 'utf-8');
const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const ITEMS = [
  { key: 'a', label: '复制名称', run: () => {} },
  { key: 'g', label: '更多…', children: [{ key: 'g1', label: '子动作', run: () => {} }] },
];

function mount(items: any[]) {
  const closes: string[] = [];
  const app = createApp({ setup: () => () => h(CellContextMenu as any, { x: 20, y: 20, items, onClose: () => closes.push('close') }) });
  app.mount(host);
  apps.push(app);
  return closes;
}

afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
});

describe('1443 遮罩 contextmenu 只认自身（菜单键自关回归）', () => {
  it('源码锁：遮罩用 .self，菜单内的 contextmenu 冒泡不再关闭菜单', () => {
    expect(src).toContain('@contextmenu.prevent.self="emit(\'close\')"');
  });

  it('菜单项/二级上的 contextmenu 不关闭菜单（浏览器补发事件）', async () => {
    const closes = mount(ITEMS);
    await tick();
    const item = document.querySelector('.ccm-mask > .ccm > .ccm-it[data-key="a"]') as HTMLElement;
    expect(item).toBeTruthy();
    item.focus();
    item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    expect(closes, '菜单项上的 contextmenu 不得关单').toEqual([]);

    const parent = document.querySelector('.ccm-it[data-key="g"]') as HTMLElement;
    parent.dispatchEvent(new MouseEvent('mouseenter'));
    await tick();
    const sub = document.querySelector('.ccm-sub .ccm-it') as HTMLElement;
    expect(sub, '二级已打开').toBeTruthy();
    sub.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    expect(closes, '二级内的 contextmenu 不得关单').toEqual([]);
  });

  it('遮罩自身的 contextmenu 仍然关闭（判据不是恒真）', async () => {
    const closes = mount(ITEMS);
    await tick();
    const mask = document.querySelector('.ccm-mask') as HTMLElement;
    mask.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    expect(closes).toEqual(['close']);
  });
});
