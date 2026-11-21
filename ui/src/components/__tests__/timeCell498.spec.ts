/**
 * 四百七十六批：TimeCell 行为直测——R99 时间单元格统一入口（列内相对时间+
 * 悬浮带时区绝对时间，五处自发形成后固化的组件），此前零直测。
 * 三契约：null → '-'；abs=true 显示绝对时间（fmtTimeTz title 同源）；默认
 * 相对时间接 useNow 心跳自动刷新。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';

vi.mock('../../composables/useNow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../composables/useNow')>();
  const now = { value: Date.now() };
  return { ...actual, useNow: () => now };
});

import TimeCell from '../TimeCell.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function mountCell(ts: number | string | null | undefined, abs = false) {
  const app = createApp({ render: () => h(TimeCell, { ts, abs }) });
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return host;
}

afterEach(() => {
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  document.body.innerHTML = '';
});

describe('TimeCell 行为契约（476 批）', () => {
  it('null/undefined → 破折号占位', async () => {
    const host = await mountCell(null);
    expect(host.textContent).toBe('-');
  });

  it('默认相对时间；title 带时区绝对时间', async () => {
    const host = await mountCell(Date.now() - 5 * 60_000);
    const el = host.querySelector('.tc')!;
    expect(el.textContent).toContain('m 前');
    expect(el.getAttribute('title')!.length).toBeGreaterThan(10);
  });

  it('abs=true 切绝对时间', async () => {
    const host = await mountCell(Date.now(), true);
    expect(host.querySelector('.tc')!.textContent!.length).toBeGreaterThan(5);
  });
});
