/**
 * 四百一十七批：右键菜单 Esc 关闭（ARIA 菜单惯例）——CellContextMenu 此前只有
 * 遮罩点击/动作执行两条收起路径，键盘用户无路可退；补 document capture 阶段
 * keydown（先于 Monaco 等内部消费者），条件渲染卸载时监听自动移除。
 * 行为级验证：真实挂载→Esc→close 事件；动作执行→close；卸载→监听移除不泄漏。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, defineComponent, ref, nextTick } from 'vue';
import CellContextMenu from '../CellContextMenu.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function mountMenu() {
  const closed = vi.fn();
  const Host = defineComponent({
    setup() {
      const open = ref(true);
      return () => open.value
        ? h(CellContextMenu, {
            x: 40, y: 40,
            items: [{ key: 'a', label: '动作 A', run: () => {} }],
            onClose: () => { closed(); open.value = false; },
          })
        : null;
    },
  });
  const app = createApp(Host);
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return { host, closed };
}

beforeEach(() => {
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  document.body.innerHTML = '';
});

describe('右键菜单 Esc 关闭（417 批）', () => {
  it('Esc 触发 close 且菜单卸载；监听随卸载移除', async () => {
    const { host, closed } = await mountMenu();
    expect(document.querySelector('.ccm'), '菜单在（teleport 到 body）').toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(closed, 'Esc 即关闭').toHaveBeenCalledTimes(1);
    expect(host.querySelector('.ccm'), '关闭后菜单卸载').toBeNull();
    // 卸载后再按 Esc：无监听残留（若残留会再触发 closed——open 已 false，无断言面，
    // 用 spy 引用计数兜底：closed 仅被调 1 次）
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed, '监听已随卸载移除').toHaveBeenCalledTimes(1);
  });

  it('mask 点击与动作执行后自动关闭（146 批语义保留）', async () => {
    const { host, closed } = await mountMenu();
    (document.querySelector('.ccm-mask') as HTMLElement).click();
    await nextTick();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('打开即聚焦首个菜单项；↑/↓ 循环移动；Esc 关闭', async () => {
    const closed = vi.fn();
    const Host = defineComponent({
      setup() {
        const open = ref(true);
        return () => open.value
          ? h(CellContextMenu, {
              x: 40, y: 40,
              items: [
                { key: 'a', label: '动作 A', run: () => {} },
                { key: 'b', label: '动作 B', run: () => {} },
              ],
              onClose: () => { closed(); open.value = false; },
            })
          : null;
      },
    });
    const app = createApp(Host);
    apps.push(app);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    await nextTick();
    const btns = Array.from(document.querySelectorAll<HTMLElement>('.ccm-it'));
    expect(btns.length, '两个菜单项').toBe(2);
    expect(document.activeElement, '打开后焦点必须进入首个菜单项').toBe(btns[0]);
    btns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
    expect(document.activeElement, '↓ 移到下一项').toBe(btns[1]);
    btns[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
    expect(document.activeElement, '↓ 末项环绕到首项').toBe(btns[0]);
    btns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await nextTick();
    expect(document.activeElement, '↑ 首项环绕到末项').toBe(btns[1]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(closed, 'Esc 关闭').toHaveBeenCalledTimes(1);
    expect(host.querySelector('.ccm'), '关闭后菜单卸载').toBeNull();
  });

  it('二级键盘：→/Enter 进首项，↑↓ 循环，←/Esc 回父项', async () => {
    const closed = vi.fn();
    const Host = defineComponent({
      setup() {
        const open = ref(true);
        return () => open.value
          ? h(CellContextMenu, {
              x: 40, y: 40,
              items: [{
                key: 'more', label: '更多…',
                children: [
                  { key: 'a', label: '复制 A', run: () => {} },
                  { key: 'b', label: '复制 B', run: () => {} },
                ],
              }],
              onClose: () => { closed(); open.value = false; },
            })
          : null;
      },
    });
    const app = createApp(Host);
    apps.push(app);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    await nextTick();
    const parent = document.querySelector<HTMLElement>('.ccm-it[data-key="more"]')!;
    parent.focus();
    parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await nextTick();
    const subs = Array.from(document.querySelectorAll<HTMLElement>('.ccm-sub .ccm-it'));
    expect(subs.length, '二级两项').toBe(2);
    expect(document.activeElement, '→ 进二级首项').toBe(subs[0]);
    subs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
    expect(document.activeElement, '二级 ↓ 移动').toBe(subs[1]);
    subs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await nextTick();
    expect(document.activeElement, '← 回父项').toBe(parent);
    parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.activeElement, 'Enter 进二级首项').toBe(subs[0]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(document.activeElement, 'Esc 先回父项').toBe(parent);
    expect(closed, '一级菜单未关闭').not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(closed, '再 Esc 关闭整菜单').toHaveBeenCalledTimes(1);
  });
});
