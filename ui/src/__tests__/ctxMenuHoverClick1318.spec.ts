/**
 * 一千三百一十八批：二级菜单「悬停后就点不开了」。
 *
 * 真机复现（1440×1000，真实鼠标事件序列 mouseMoved → mousePressed）：
 *   ① 鼠标移到「更多…」            → sub display: block   ✅ mouseenter 打开了
 *   ② 在同一位置按下鼠标（点击）    → sub display: none    ❌ 用户眼里「我点了它，它却收了」
 *
 * 根因：`toggleSub` 看到 `sub.key === it.key` 就 closeSub()。而鼠标用户的自然动线
 * **必然**是「先悬停到位，再点击」——mouseenter 已经把它打开了，点击又同键 toggle 回去。
 * 这不是可选风格问题：全站所有二级菜单（表格单元格 / 列头 / 条件行 / 卡片 / 打分树）
 * 都走这一个组件，等于「菜单能悬停展开、一点就没了」。
 *
 * 本 spec 用真实事件序列锁行为（不是只读源码）：
 *  - mouseenter 后点击父项，二级必须仍然可见
 *  - 从没悬停过、直接点击父项，二级必须打开（键盘/点击路径不回归）
 *  - 悬停到另一个父项，二级切到新的那个（切组仍工作）
 * 负控：把 toggleSub 改回 `if (same) closeSub()` —— 第一条必须红。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import CellContextMenu from '../components/CellContextMenu.vue';
import { openSubCount } from './helpers/ctxMenu';

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

function mount(items: any[]) {
  const app = createApp({ setup: () => () => h(CellContextMenu as any, { x: 20, y: 20, items }) });
  app.mount(host);
  apps.push(app);
}
const parent = (key: string) => document.querySelector(`.ccm-mask > .ccm > .ccm-it[data-key="${key}"]`) as HTMLElement;
const visibleSubs = () => [...document.querySelectorAll('.ccm-sub')].filter((e: any) => e.style.display !== 'none');

afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
});

const ITEMS = [
  { key: 'g1', label: '分组一…', children: [{ key: 'g1a', label: '动作 A', run: () => {} }] },
  { key: 'g2', label: '分组二…', children: [{ key: 'g2a', label: '动作 B', run: () => {} }] },
];

describe('1318 二级菜单：悬停之后再点击不能把它关掉', () => {
  it('mouseenter 打开 → 点击同一父项，二级仍然可见（核心回归）', async () => {
    mount(ITEMS);
    await tick();
    const p = parent('g1');
    expect(openSubCount()).toBe(0);
    p.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await tick();
    expect(openSubCount(), '悬停应打开二级').toBe(1);
    p.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(openSubCount(), '悬停后点击同一父项，二级不得被 toggle 关掉').toBe(1);
    expect(visibleSubs().length, '面板必须仍然可见').toBe(1);
  });

  it('不先悬停、直接点击父项 → 二级打开（键盘/鼠标点击路径不回归）', async () => {
    mount(ITEMS);
    await tick();
    parent('g1').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(openSubCount()).toBe(1);
  });

  it('悬停到另一个父项 → 二级切到新的那个（切组仍工作）', async () => {
    mount(ITEMS);
    await tick();
    parent('g1').dispatchEvent(new MouseEvent('mouseenter'));
    await tick();
    parent('g2').dispatchEvent(new MouseEvent('mouseenter'));
    await tick();
    const vis = visibleSubs();
    expect(vis.length, '同一时刻只应有一个二级可见').toBe(1);
    expect(vis[0].textContent, '可见的应是分组二的二级').toContain('动作 B');
  });
});
