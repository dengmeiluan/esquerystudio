/* 1443：共享菜单的一级/二级补 Home/End（ARIA menu 惯例），与 ↑/↓ 同一焦点闭环。 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import CellContextMenu from '../components/CellContextMenu.vue';

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const ITEMS = [
  { key: 'a', label: '动作 A', run: () => {} },
  { key: 'b', label: '动作 B', run: () => {} },
  { key: 'g', label: '更多…', children: [
    { key: 'c1', label: '子动作 1', run: () => {} },
    { key: 'c2', label: '子动作 2', run: () => {} },
    { key: 'c3', label: '子动作 3', run: () => {} },
  ] },
];

function mount() {
  const app = createApp({ setup: () => () => h(CellContextMenu as any, { x: 20, y: 20, items: ITEMS }) });
  app.mount(host);
  apps.push(app);
}
const press = (el: HTMLElement, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
});

describe('1443 菜单 Home/End', () => {
  it('一级：End 跳末项、Home 回首项', async () => {
    mount(); await tick();
    const btns = [...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')] as HTMLElement[];
    expect(btns.length).toBe(3);
    btns[1].focus();
    press(btns[1], 'End'); await tick();
    expect(document.activeElement, 'End → 末项').toBe(btns[2]);
    press(btns[2], 'Home'); await tick();
    expect(document.activeElement, 'Home → 首项').toBe(btns[0]);
  });

  it('一级 ↓ 只在可见一级项间循环，不落进隐藏二级', async () => {
    mount(); await tick();
    const btns = [...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')] as HTMLElement[];
    btns[0].focus();
    press(btns[0], 'ArrowDown'); await tick();
    expect(document.activeElement, 'A → B').toBe(btns[1]);
    press(btns[1], 'ArrowDown'); await tick();
    expect(document.activeElement, 'B → 分组父项').toBe(btns[2]);
    press(btns[2], 'ArrowDown'); await tick();
    expect(document.activeElement, '末项 ↓ 回卷到首项（不进入隐藏子项）').toBe(btns[0]);
  });

  it('二级：End 跳末项、Home 回首项，且不会把焦点抢回一级', async () => {
    mount(); await tick();
    const parent = document.querySelector('.ccm-it[data-key="g"]') as HTMLElement;
    parent.click(); await tick();
    const kids = [...document.querySelectorAll('.ccm-sub .ccm-it')] as HTMLElement[];
    expect(kids.length).toBe(3);
    press(kids[0], 'End'); await tick();
    expect(document.activeElement, '二级 End → 末项').toBe(kids[2]);
    expect(document.activeElement?.closest('.ccm-sub'), '焦点仍在二级').toBeTruthy();
    press(kids[2], 'Home'); await tick();
    expect(document.activeElement, '二级 Home → 首项').toBe(kids[0]);
  });
});
