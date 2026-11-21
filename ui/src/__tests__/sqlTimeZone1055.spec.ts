/* 1055：SQL time_zone——首查/translate 写入 body，cursor 续页原样沿用（ES 续页只认 time_zone）。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';

const sqlLenient = vi.fn();
const sqlCursor = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      sqlLenient: (...a: any[]) => sqlLenient(...a),
      sqlCursor: (...a: any[]) => sqlCursor(...a),
      sqlClose: vi.fn(() => Promise.resolve({})),
      sqlTranslate: vi.fn(() => Promise.resolve({ size: 100, query: { match_all: {} } })),
      resolveSchema: vi.fn(() => Promise.resolve({ warnings: [] })),
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import SqlConsoleView from '../views/SqlConsoleView.vue';

const apps: ReturnType<typeof createApp>[] = [];
const settle = async (n = 24) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountView() {
  const app = createApp({ render: () => h(SqlConsoleView) });
  apps.push(app);
  app.use(createPinia());
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/'); await router.isReady(); app.use(router);
  const host = document.createElement('div'); document.body.appendChild(host); app.mount(host); await settle();
  return host;
}
const btn = (host: ParentNode, text: string) => {
  const b = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(x => x.textContent?.includes(text));
  expect(b, `「${text}」按钮必须在场`).toBeTruthy();
  return b!;
};
const tzSelect = (host: ParentNode) => host.querySelector('.sq-tz-i')!;
const tzLabel = (host: ParentNode) => {
  const el = tzSelect(host)?.querySelector('.n-base-selection-input, .n-base-selection-label');
  return el?.textContent?.trim() ?? '';
};
/* W3c 随迁：原生 select 升档 NSelect——选项序 ['', Asia/Shanghai, Asia/Hong_Kong,
 Asia/Tokyo, Europe/London, America/New_York]；测试环境浮层不渲染、键盘态机可用，
 以 ArrowDown×N + Enter 选第 N 项（探针实证，happy-dom 下 naive 菜单 DOM 不挂出） */
const TZ_ORDER = ['', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Europe/London', 'America/New_York'];
async function setTz(host: ParentNode, v: string) {
  const idx = TZ_ORDER.indexOf(v);
  expect(idx, `时区档 ${v} 必须在档位表内`).toBeGreaterThan(-1);
  const trig = tzSelect(host).querySelector('.n-base-selection') as HTMLElement;
  expect(trig, 'time_zone 选择器必须在场').toBeTruthy();
  for (let k = 0; k <= idx; k++) {
    trig.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
  }
  trig.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle(4);
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear(); localStorage.setItem('esquerystudio.pref.sql.lenient', 'true'); sessionStorage.clear();
  sqlLenient.mockReset(); sqlCursor.mockReset();
  sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT * FROM "i" LIMIT 5');
});
afterEach(() => { apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } }); apps.length = 0; });

describe('1055 SQL time_zone', () => {
  it('选 Asia/Shanghai → 请求体带 time_zone', async () => {
    sqlLenient.mockResolvedValue({ columns: [], rows: [] });
    const host = await mountView();
    await setTz(host, 'Asia/Shanghai');
    btn(host, '执行').click(); await settle();
    expect(sqlLenient).toHaveBeenCalled();
    const body = JSON.parse(sqlLenient.mock.calls[0][0]);
    expect(body.time_zone).toBe('Asia/Shanghai');
    expect(body.query).toContain('SELECT');
  });

  it('默认 UTC → 不伪造 time_zone 键', async () => {
    sqlLenient.mockResolvedValue({ columns: [], rows: [] });
    const host = await mountView();
    /* W3c 随迁：默认档显示「UTC（集群默认）」（原 select value='' 的档位语义） */
    expect(tzLabel(host)).toBe('UTC（集群默认）');
    btn(host, '执行').click(); await settle();
    const body = JSON.parse(sqlLenient.mock.calls[0][0]);
    expect('time_zone' in body).toBe(false);
  });

  it('cursor 续页沿用同一 time_zone', async () => {
    sqlLenient.mockResolvedValue({ columns: [{ name: 'n', type: 'long' }], rows: [[1]], cursor: 'c1' });
    sqlCursor.mockResolvedValue({ rows: [[2]], cursor: null });
    const host = await mountView();
    await setTz(host, 'Asia/Shanghai');
    btn(host, '执行').click(); await settle();
    btn(host, '下一页').click(); await settle();
    expect(sqlCursor).toHaveBeenCalledWith('c1', 'Asia/Shanghai', undefined);
  });
});
