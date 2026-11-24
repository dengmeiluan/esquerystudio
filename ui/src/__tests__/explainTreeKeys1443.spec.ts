/* 1443：评分解释树（排名侦探/打分解剖/沙盒）键盘导航与菜单键。 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import ExplainTree from '../components/ExplainTree.vue';

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const NODE = {
  value: 1,
  description: 'root score',
  details: [
    { value: 0.6, description: 'boost', details: [] },
    { value: 0.4, description: 'idf', details: [] },
  ],
};

afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
});

function mount() {
  const app = createApp({ render: () => h(ExplainTree as any, { node: NODE, total: 1, depth: 0 }) });
  app.mount(host);
  apps.push(app);
}
const rows = () => [...host.querySelectorAll<HTMLElement>('.xt-row')];
const press = (el: HTMLElement, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('1443 解释树键盘', () => {
  it('↑/↓/Home/End 在可见行间移动', async () => {
    mount(); await tick();
    const rs = rows();
    expect(rs.length).toBe(3);
    rs[0].focus();
    press(rs[0], 'ArrowDown'); await tick();
    expect(document.activeElement).toBe(rs[1]);
    press(rs[1], 'End'); await tick();
    expect(document.activeElement).toBe(rs[2]);
    press(rs[2], 'Home'); await tick();
    expect(document.activeElement).toBe(rs[0]);
  });

  it('←/→ 收起/展开，aria-expanded 同步；叶子行不受影响', async () => {
    mount(); await tick();
    const root = rows()[0];
    expect(root.getAttribute('aria-expanded')).toBe('true');
    root.focus();
    press(root, 'ArrowLeft'); await tick();
    expect(rows().length, '← 收起子行').toBe(1);
    expect(root.getAttribute('aria-expanded')).toBe('false');
    press(root, 'ArrowRight'); await tick();
    expect(rows().length, '→ 展开子行').toBe(3);
    expect(root.getAttribute('aria-expanded')).toBe('true');
    const leaf = rows()[1];
    press(leaf, 'ArrowLeft'); await tick();
    expect(rows().length, '叶子行 ← 不改树').toBe(3);
  });

  it('菜单键开当前行菜单', async () => {
    mount(); await tick();
    const row = rows()[1];
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await tick();
    expect(document.querySelector('.ccm'), '菜单键开菜单').toBeTruthy();
    expect(document.querySelector('.ccm-hd')?.textContent || '').toContain('%');
  });
});
