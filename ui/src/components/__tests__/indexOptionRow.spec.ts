/* W3：IndexOptionRow 双行条目契约。组件内 useAppStore()，测试挂真 pinia + spyOn notify。 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h } from 'vue';
import { createPinia, setActivePinia, type Pinia } from 'pinia';

vi.mock('../../utils/format', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../utils/format')>();
  return { ...mod, copyText: vi.fn(async () => true) };
});

import { copyText } from '../../utils/format';
import { useAppStore } from '../../stores/app';
import IndexOptionRow from '../IndexOptionRow.vue';

const mockCopy = vi.mocked(copyText);
const tick = () => new Promise(r => setTimeout(r));
let pinia: Pinia;

function mount(props: Record<string, any>, onSelectAlias?: (a: string) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(IndexOptionRow, { ...props, onSelectAlias } as any) });
  app.use(pinia);
  app.mount(host);
  return { host, app };
}

beforeEach(() => {
  document.body.innerHTML = '';
  pinia = createPinia();
  setActivePinia(pinia);
  mockCopy.mockClear();
});

describe('IndexOptionRow', () => {
  it('索引条目：health 点 + 名称 + meta', () => {
    const { host } = mount({ name: 'logs-1', health: 'green', meta: '100 docs · 1.2mb' });
    expect(host.querySelector('.ior-dot.h-green')).toBeTruthy();
    expect(host.querySelector('.ior-name')?.textContent).toBe('logs-1');
    expect(host.querySelector('.ior-meta')?.textContent).toBe('100 docs · 1.2mb');
    expect(host.querySelector('.ior-tag')).toBeFalsy();
  });

  it('别名条目：别名 tag 取代 health 点', () => {
    const { host } = mount({ kind: 'alias', name: 'logs', meta: '→ logs-1' });
    expect(host.querySelector('.ior-tag')?.textContent).toBe('别名');
    expect(host.querySelector('.ior-dot')).toBeFalsy();
  });

  it('长名不再 JS 硬截断：textContent 持全名，CSS ellipsis + title 全文兜底（v3.0.1）', () => {
    const name = 'my-very-long-index-name-for-prod-2026.08.07-000123';
    const { host } = mount({ name });
    const el = host.querySelector('.ior-name') as HTMLElement;
    expect(el.textContent).toBe(name);
    expect(el.getAttribute('title')).toBe(name);
  });

  it('复制钮：以全名（非省略串）调 copyText 并 notify', async () => {
    const store = useAppStore();
    const spy = vi.spyOn(store, 'notify');
    const name = 'my-very-long-index-name-for-prod-2026.08.07-000123';
    const { host } = mount({ name });
    (host.querySelector('.ior-copy') as HTMLElement).click();
    await tick();
    expect(mockCopy).toHaveBeenCalledWith(name);
    expect(spy).toHaveBeenCalled();
  });

  it('别名 chips：渲染 + 点击 emit select-alias，且不冒泡（不触发行选中）', async () => {
    const got: string[] = [];
    const { host } = mount({ name: 'logs-1', aliases: ['logs', 'logs-ro'] }, a => got.push(a));
    let bubbled = false;
    host.addEventListener('click', () => { bubbled = true; });
    const chips = host.querySelectorAll('.ior-chip');
    expect(chips.length).toBe(2);
    (chips[0] as HTMLElement).click();
    await tick();
    expect(got).toEqual(['logs']);
    expect(bubbled).toBe(false);
  });

  it('hl 关键词命中段渲染 <mark>', () => {
    const { host } = mount({ name: 'logs-2026.08', hl: '2026' });
    expect(host.querySelector('.ior-name mark')?.textContent).toBe('2026');
  });
});
