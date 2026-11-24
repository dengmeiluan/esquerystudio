import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';

/* 1137：无 storageKey（SQL 等）也支持列隐藏/恢复——内存态不落盘，
 * 隐藏后必须有可见恢复入口（否则宽表里藏错列成了死胡同）。 */
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
const tick = async (n = 10) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
function mount() {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, { cols: ['name', 'age'], rows: [['a', 1], ['b', 2]], total: 2 }) });
  app.use(createPinia()); app.mount(host); apps.push(app);
}
const headerTexts = () => [...host.querySelectorAll('thead th')].map(th => (th.textContent ?? '').trim());
const menuBtn = (label: string) => [...document.querySelectorAll('.ccm-mask .ccm-it')]
  .find(b => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0; host.innerHTML = '';
  document.querySelectorAll('.ccm-mask').forEach(e => e.remove());
  localStorage.clear();
});

describe('1137 无 storageKey 列管理（内存态）', () => {
  it('列头菜单可隐藏列 → 出现恢复条 → 恢复全部列；全程不落盘', async () => {
    mount();
    await tick();
    expect(headerTexts()).toEqual(['#', 'name', 'agedouble']);
    const th = host.querySelector('th[data-col="name"]')!;
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    await tick(4);
    const hide = menuBtn('隐藏此列');
    expect(hide, '无 storageKey 也应提供内存态隐藏').toBeTruthy();
    hide!.click();
    await tick();
    expect(headerTexts()).toEqual(['#', 'agedouble']);
    const hint = host.querySelector('[data-test="qrt-col-hint"]') as HTMLElement;
    expect(hint, '隐藏后必须有恢复入口').toBeTruthy();
    expect(hint.textContent).toContain('已隐藏 1 列');
    hint.querySelector('button')!.click();
    await tick();
    expect(headerTexts()).toEqual(['#', 'name', 'agedouble']);
    expect(host.querySelector('[data-test="qrt-col-hint"]')).toBeNull();
    expect([...Array(localStorage.length)].map((_, i) => localStorage.key(i)!).filter(k => k.startsWith('es_cols'))).toEqual([]);
  });
});
