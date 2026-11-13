/**
 * 五百四十六批：原始 IO 快查环第二波 —— SqlConsole 特征收紧 + 六视图铺装 + hotThreads 入环。
 *
 *  ① SqlConsole 特征收紧（行为锁）：doRun 每次成功后 fire-and-forget 追发 /cluster/sql/translate，
 *     旧特征 last('/cluster/sql/') 常态误中后发的 translate 记录，用户点「原始 IO」看到的是
 *     translate 而非执行结果——收紧为 all() 新→旧扫第一条「/cluster/sql/ 且非 translate」。
 *     真实 request 内核下执行+translate 都落账，弹窗必须开出执行记录（lenient）。
 *  ② 六视图铺装「原始 IO」钮（545 四页字面锁同形态）：UpdateByQuery（'-by-query' 统一接
 *     update/delete 两通道）/ BulkEditor（/cluster/bulk）/ Rest（/cluster/raw）/
 *     SearchSandbox（/cluster/search-dsl）/ LuceneQuery（/cluster/lucene-search）/
 *     ReindexPreview（/cluster/reindex-preview）；每处判空 rec=null 时 store.notify 引导。
 *  ③ api.hotThreads 裸 fetch 补 recordIo 两点式（响应读出记真实 status；fetch 未及响应记
 *     status=0），既有返回串/ApiError/原样上抛契约逐字不动。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① SqlConsole 特征收紧（行为锁，真实 request 内核） ═══════════ */

import { ApiError, ioRecorder, api } from '../api';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  ioRecorder.clear();
});
afterEach(() => { vi.unstubAllGlobals(); });

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    template: '<div class="monaco-stub" :data-lang="language">{{ modelValue.slice(0, 40) }}</div>',
  },
}));

/* api 仅 mock 挂载噪声面（545 先例同款），sqlLenient/sqlTranslate 全走真实 request 内核——
   执行与 translate 两条记录都真实落账，才锁得住「排除 translate」这个行为本身 */
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import SqlConsoleView from '../views/SqlConsoleView.vue';
import { draftStorageKey } from '../composables/useScopedDraft';

describe('五百四十六批①：SqlConsole 原始 IO 特征收紧（排除 translate）', () => {
  it('执行 SQL（translate 后台追发也落账）→「原始 IO」弹窗必须开执行记录而非 translate', async () => {
    /* URL 分流 stub：lenient 回结果集（结果分节出「原始 IO」钮），translate 回 available:false */
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      const u = String(url);
      const body = u.includes('/cluster/sql/translate')
        ? JSON.stringify({ available: false })
        : JSON.stringify({ columns: [{ name: 'id', type: 'long' }], rows: [[1]] });
      return new Response(body, { status: 200 });
    }));
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT 1');
    document.body.innerHTML = '';
    const { createRouter, createMemoryHistory } = await import('vue-router');
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
    await router.push('/');
    await router.isReady();
    const a = createApp({ render: () => h(SqlConsoleView) });
    a.use(createPinia());
    a.use(router);
    const host = document.createElement('div');
    document.body.appendChild(host);
    a.mount(host);
    for (let i = 0; i < 12; i++) { await nextTick(); await Promise.resolve(); }
    const run = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('执行'));
    expect(run, '「执行」钮在场').toBeTruthy();
    run!.click();
    for (let i = 0; i < 12; i++) { await nextTick(); await Promise.resolve(); }
    await new Promise(r => setTimeout(r, 0));
    /* 前置：translate 记录确实已在环内且新于执行记录（旧特征 last('/cluster/sql/') 误中的正是它） */
    expect(ioRecorder.last('/cluster/sql/translate'), 'translate 必须已落账').toBeTruthy();
    expect(ioRecorder.last('/cluster/sql/query'), '执行记录必须已落账').toBeTruthy();
    /* 1353：宿主两项收进「结果表更多 ⋯」菜单——先展开菜单再取 raw-io（判据意图不变：
       弹窗必须开执行记录而非 translate）。 */
    const more = host.querySelector<HTMLButtonElement>('[data-test="sq-bar-more"]');
    expect(more, '1353 起「原始 IO」住在结果表更多菜单里，必须先有菜单触发器').toBeTruthy();
    more!.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const btn = host.querySelector<HTMLButtonElement>('[data-test="raw-io"]');
    expect(btn, '结果分节「原始 IO」钮必须在场').toBeTruthy();
    btn!.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const urlEl = document.body.querySelector('.rim-url');
    expect(urlEl, 'RawIoModal 已开出').toBeTruthy();
    expect(urlEl!.textContent).toContain('/cluster/sql/query');
    expect(urlEl!.textContent!.toLowerCase()).not.toContain('translate');
    a.unmount();
  });
});

/* ═══════════ ② 六视图铺装（545 字面锁同形态） ═══════════ */

describe('五百四十六批②：六视图「原始 IO」钮铺装（字面锁）', () => {
  const CASES: Array<{ f: string; label: string; feat: string }> = [
    { f: 'UpdateByQueryView.vue', label: '查看原始 IO（批量写执行）', feat: "ioRecorder.last('-by-query')" },
    { f: 'BulkEditorView.vue', label: '查看原始 IO（Bulk 执行）', feat: "ioRecorder.last('/cluster/bulk')" },
    { f: 'RestView.vue', label: '查看原始 IO（REST 直连）', feat: "ioRecorder.last('/cluster/raw')" },
    { f: 'SearchSandboxView.vue', label: '查看原始 IO（搜索沙盒）', feat: "ioRecorder.last('/cluster/search-dsl')" },
    { f: 'LuceneQueryView.vue', label: '查看原始 IO（Lucene 检索）', feat: "ioRecorder.last('/cluster/lucene-search')" },
    { f: 'ReindexPreviewView.vue', label: '查看原始 IO（Reindex 预估）', feat: "ioRecorder.last('/cluster/reindex-preview')" },
  ];
  for (const c of CASES) {
    it(`${c.f}：钮 / 特征 ${c.feat} / 弹窗挂载 / 判空 notify`, () => {
      const v = read('../views/' + c.f);
      expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
      expect(v).toContain('data-test="raw-io"');
      expect(v).toContain(`aria-label="${c.label}"`);
      expect(v).toContain(c.feat);
      expect(v).toContain('<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />');
      /* 判空：rec=null 时 notify 引导（不开空弹窗），文案六页同口径 */
      expect(v).toContain("store.notify('info', '暂无原始 IO 记录");
    });
  }
});

/* ═══════════ ③ hotThreads 裸 fetch 补 recordIo 两点式（行为锁） ═══════════ */

describe('五百四十六批③：api.hotThreads 入记录环（行为锁）', () => {
  it('成功：GET 全字段留痕，返回原文契约不变', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('"hot threads raw text"', { status: 200 })));
    const out = await api.hotThreads();
    expect(out).toBe('"hot threads raw text"'); /* 既有契约：返回原文串不动 */
    const rec = ioRecorder.last('/cluster/hot-threads');
    expect(rec, 'hotThreads 必须留痕').toBeTruthy();
    expect(rec!.method).toBe('GET');
    expect(rec!.url).toContain('/cluster/hot-threads?');
    expect(rec!.requestBody).toBe('');
    expect(rec!.status).toBe(200);
    expect(rec!.ok).toBe(true);
    expect(rec!.responseRaw).toBe('"hot threads raw text"');
    expect(rec!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('HTTP 失败：真实 status 留痕（ok=false），ApiError 抛出契约不变', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
    await expect(api.hotThreads()).rejects.toBeInstanceOf(ApiError);
    await expect(api.hotThreads()).rejects.toMatchObject({ status: 503 });
    const rec = ioRecorder.last('/cluster/hot-threads');
    expect(rec!.status).toBe(503);
    expect(rec!.ok).toBe(false);
    expect(rec!.responseRaw).toBe('boom');
  });

  it('未及响应（网络黑洞）：status=0 留痕，原样上抛不吞错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network dead'); }));
    await expect(api.hotThreads()).rejects.toThrow('network dead');
    const rec = ioRecorder.last('/cluster/hot-threads');
    expect(rec!.status).toBe(0);
    expect(rec!.ok).toBe(false);
  });
});
