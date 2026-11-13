/**
 * 二百二十八批 M3c：table-cmd 广播的 markHandled 协商。
 * 此前 RT/QRT 对不可见实例静默丢弃（offsetParent 守卫），JSON/Tree 视图下按 ⌘K 导出
 * 无任何反馈，用户感知为「命令坏了」。现：可见实例响应前标记 handled，
 * CmdPalette 150ms 后无人认领显式 notify warning。
 * 锁定：可见 RT 响应并标记；不可见 RT 不标记不响应（既有 T30 语义不回归）。
 * 挂载样板照抄 multiSort（裸 createApp + pinia + api mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';
import { useAppStore } from '../stores/app';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana' } },
  { _id: 'b', _source: { name: 'apple' } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(ResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('table-cmd markHandled 协商（228 批 M3c）', () => {
  /* happy-dom 无布局引擎（offsetParent 恒 undefined=不可见）——实例级 defineProperty 模拟可见，
     照抄 cmdTableCmds.spec markVisible 范式 */
  function markVisible(rootSel: string) {
    const root = host.querySelector(rootSel) as any;
    Object.defineProperty(root, 'offsetParent', { value: document.body, configurable: true });
  }

  it('可见实例响应并标记 handled', async () => {
    const dl = vi.spyOn(await import('../utils/format'), 'downloadText').mockImplementation(() => {});
    await mountTbl({ hits: HITS, total: 2, index: 'tc1' });
    markVisible('.rt');
    let handled = false;
    window.dispatchEvent(new CustomEvent('table-cmd', { detail: { cmd: 'export', markHandled: () => { handled = true; } } }));
    expect(handled).toBe(true);
    expect(dl).toHaveBeenCalledTimes(1);
    dl.mockRestore();
  });

  it('不可见实例不标记不响应（CmdPalette 据此 150ms 后显式提示）', async () => {
    const dl = vi.spyOn(await import('../utils/format'), 'downloadText').mockImplementation(() => {});
    await mountTbl({ hits: HITS, total: 2, index: 'tc2' });
    /* 不 markVisible：happy-dom 下 offsetParent 恒 undefined=不可见（KeepAlive 后台页同语义） */
    let handled = false;
    window.dispatchEvent(new CustomEvent('table-cmd', { detail: { cmd: 'export', markHandled: () => { handled = true; } } }));
    expect(handled).toBe(false);
    expect(dl).not.toHaveBeenCalled();
    dl.mockRestore();
  });
});
