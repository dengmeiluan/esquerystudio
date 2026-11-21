/**
 * 五百二十五批：CurrentIdxChip 只读「当前索引」chip（follow 档视图页内 IndexPicker 退役配套件）。
 *
 * 契约（任务一）：
 * ① 无 props 自读 store；pickedIdx 为空整件不渲染（根 v-if）；
 * ② 有选中：根 .cic + :title=索引名，内容 = 健康色点 + 索引名 + docs·size 小字（pickedInfo 可得才显）；
 * ③ 「清除」钮 store.pick('')（title 注明「清除后跟随顶栏」）；
 * ④ 「复制深链」钮走全站 copyText 契约，写入文案含 ?idx=（hash 路由形态）。
 *
 * 设施：vue-router 轻 mock（chip 只用 useRouter）；copyText 换 mock 其余导出保真
 * （fmtNum/fmtSize 走真实实现，meta 断言不依赖具体千分位口径，只认段存在）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  copyText: vi.fn<(url: string) => Promise<boolean>>(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: mocks.copyText as any };
});

import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import { useAppStore } from '../stores/app';

async function settle(n = 8) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountChip() {
  const app = createApp({ render: () => h(CurrentIdxChip as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  const store = useAppStore();
  await settle();
  return { host, store };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  mocks.push.mockReset();
  mocks.copyText.mockReset().mockResolvedValue(true);
});

afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('CurrentIdxChip（五百二十五批）', () => {
  it('pickedIdx 为空整件不渲染；选中有点名渲染：根 .cic + title=索引名 + 健康色点', async () => {
    const { host, store } = await mountChip();
    expect(host.querySelector('.cic'), '未选索引不渲染').toBeNull();
    store.indices.push({ index: 'orders-2024', health: 'green', 'docs.count': 1234, 'store.size': '5 MB' } as any);
    store.pick('orders-2024');
    await settle();
    const root = host.querySelector<HTMLElement>('.cic');
    expect(root, '选后渲染').toBeTruthy();
    expect(root!.title).toBe('orders-2024');
    expect(root!.querySelector('.cic-nm')!.textContent).toBe('orders-2024');
    expect(root!.querySelector('.cic-dot.h-green'), 'green 走健康色点').toBeTruthy();
    /* docs·size 小字：pickedInfo 可得才显（真实 fmtNum/fmtSize 出口，只认段存在） */
    const meta = root!.querySelector('.cic-meta')!.textContent || '';
    expect(meta).toContain('docs');
    expect(meta).toContain('MB');
  });

  it('清除钮 store.pick(\'\')：pickedIdx 回空 + es_picked 落盘清空，title 注明「清除后跟随顶栏」', async () => {
    const { host, store } = await mountChip();
    store.pick('orders-2024');
    await settle();
    const clearBtn = [...host.querySelectorAll<HTMLButtonElement>('.cic-btn')]
      .find(b => (b.title || '').includes('清除后跟随顶栏'));
    expect(clearBtn, '清除钮必须在场且 title 注明跟随顶栏').toBeTruthy();
    clearBtn!.click();
    await settle();
    expect(store.pickedIdx).toBe('');
    expect(localStorage.getItem('es_picked')).toBe('');
    expect(host.querySelector('.cic'), '清空后整件移除').toBeNull();
  });

  it('复制深链钮：copyText 收到含 ?idx= 的 URL（hash 路由形态），成功走 notify success', async () => {
    const { host, store } = await mountChip();
    store.pick('orders-2024');
    await settle();
    const copyBtn = [...host.querySelectorAll<HTMLButtonElement>('.cic-btn')]
      .find(b => b.title.includes('复制深链'));
    copyBtn!.click();
    await settle();
    expect(mocks.copyText).toHaveBeenCalledTimes(1);
    const url = mocks.copyText.mock.calls[0][0] as string;
    expect(url).toContain('?idx=orders-2024');
    expect(url.startsWith(location.origin + location.pathname)).toBe(true);
    expect(store.notifyQueue[0]?.kind).toBe('success');
  });

  it('右键菜单：复制索引名/去索引工作区/清除索引（只读与本地动作）', async () => {
    const { host, store } = await mountChip();
    store.pick('orders-2024');
    await settle();
    const root = host.querySelector<HTMLElement>('.cic')!;
    const openMenu = async () => {
      root.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }));
      await settle();
      const menu = document.body.querySelector<HTMLElement>('.ccm');
      expect(menu, '右键菜单').toBeTruthy();
      return menu!;
    };
    let menu = await openMenu();
    expect(menu.textContent).toContain('当前索引 · orders-2024');
    expect(menu.textContent, '菜单标题带当前读写档').toMatch(/当前索引 · orders-2024 · (可写|只读)/);
    for (const label of ['复制索引名', '复制深链', '复制查询权限摘要', '去索引工作区', '清除当前索引']) {
      expect(menu.textContent, `菜单项 ${label}`).toContain(label);
    }
    (menu.querySelector('[data-key="copy-name"]') as HTMLElement).click();
    await settle();
    expect(mocks.copyText).toHaveBeenLastCalledWith('orders-2024');

    menu = await openMenu();
    (menu.querySelector('[data-key="copy-access"]') as HTMLElement).click();
    await settle();
    const calls = mocks.copyText.mock.calls;
    const summary = calls[calls.length - 1][0] as string;
    expect(summary, '权限摘要带目标/env/角色/读写').toContain('target=host');
    expect(summary).toContain('env=');
    expect(summary).toContain('role=');
    expect(summary).toContain('read=');
    expect(summary).toContain('write=');
    expect(summary, '索引上下文并入摘要').toContain('index=orders-2024');

    menu = await openMenu();
    (menu.querySelector('[data-key="goto-indices"]') as HTMLElement).click();
    await settle();
    expect(mocks.push).toHaveBeenCalledWith('/indices');

    menu = await openMenu();
    (menu.querySelector('[data-key="clear"]') as HTMLElement).click();
    await settle();
    expect(store.pickedIdx).toBe('');
    expect(host.querySelector('.cic'), '清除后 chip 移除').toBeNull();
  });

  it('菜单键 / Shift+F10：chip 内按钮聚焦时开同一菜单（键盘入口契约）', async () => {
    const { host, store } = await mountChip();
    store.pick('orders-2024');
    await settle();
    const btn = host.querySelector<HTMLElement>('.cic-btn')!;
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    await settle();
    let menu = document.body.querySelector<HTMLElement>('.ccm');
    expect(menu, 'ContextMenu 键必须打开 chip 菜单').toBeTruthy();
    expect(menu!.textContent).toContain('当前索引 · orders-2024');
    menu!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await settle();
    menu = document.body.querySelector<HTMLElement>('.ccm');
    expect(menu, 'Shift+F10 必须同效').toBeTruthy();
  });
});
