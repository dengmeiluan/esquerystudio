/**
 * 五百四十五批·轨2：原始请求/响应快查 —— ioRecorder 记录环 + RawIoModal + 四页接线。
 *
 *  ① ioRecorder（api.ts additive）：request() 成功/失败全留痕（环形 30 条、响应原文 200KB
 *     截断保护、last(pathSub) 路径子串过滤取最近一条）；记录逻辑全 try/catch，记录失败
 *     不影响主流程；request<T> 既有契约零变更（返回值/超时 408/错误抛出逐字不动）。
 *  ② RawIoModal：请求/响应两分节 Monaco 只读（json/ndjson 语义分档高亮免费获得），
 *     复制请求 JSON / 复制响应 JSON / 复制为 curl 三钮 + 空态 EmptyState。
 *  ③ 四页接线：IndexHub（/cluster/query）· SqlConsole（/cluster/sql/）· Adhoc
 *     （/adhoc-rebuild/）· Xmigrate（/xmigrate/）——SqlConsole 挂载行为锁（mock fetch
 *     走真实 request 内核 → 记录环真实落账 → 点钮开弹窗），其余三页字面锁（happy-dom
 *     挂 Monaco 重，全站字面锁先例）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① ioRecorder：api 层记录环（fetch stub 走真实 request 内核） ═══════════ */

function stubFetchResp(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })));
}

import { post, get, ApiError, ioRecorder } from '../api';

beforeEach(() => {
  localStorage.clear();
  ioRecorder.clear();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('五百四十五批①：ioRecorder 记录环', () => {
  it('成功 POST 全字段留痕：method/url/requestBody/status/ok/responseRaw/durationMs', async () => {
    stubFetchResp({ took: 3, hits: [] });
    const r = await post('/cluster/query?index=i&size=1', { size: 1 });
    expect(r).toEqual({ took: 3, hits: [] }); /* 既有契约：返回解析后对象不变 */
    const rec = ioRecorder.last('/cluster/query');
    expect(rec, '记录必须在场').toBeTruthy();
    expect(rec!.method).toBe('POST');
    expect(rec!.url).toContain('/cluster/query?index=i&size=1');
    expect(rec!.requestBody).toBe('{"size":1}');
    expect(rec!.status).toBe(200);
    expect(rec!.ok).toBe(true);
    expect(rec!.responseRaw).toBe('{"took":3,"hits":[]}');
    expect(rec!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('HTTP 失败也留痕（ok=false）且既有错误抛出契约零变更', async () => {
    stubFetchResp({ message: 'boom' }, 500);
    await expect(post('/adhoc-rebuild/start', { x: 1 })).rejects.toBeInstanceOf(ApiError);
    await expect(post('/adhoc-rebuild/start', { x: 1 })).rejects.toMatchObject({ status: 500 });
    const rec = ioRecorder.last('/adhoc-rebuild/start');
    expect(rec!.ok).toBe(false);
    expect(rec!.status).toBe(500);
    expect(rec!.responseRaw).toBe('{"message":"boom"}');
  });

  it('200 + error 业务信封记 ok=false（业务失败同留痕）', async () => {
    stubFetchResp({ error: true, message: 'ES_ERROR', code: 'ES_ERROR' });
    await expect(post('/cluster/sql', 'SELECT 1')).rejects.toBeInstanceOf(ApiError);
    const rec = ioRecorder.last('/cluster/sql');
    expect(rec!.status).toBe(200);
    expect(rec!.ok).toBe(false);
  });

  it('GET 无体请求：requestBody 空串照常记录', async () => {
    stubFetchResp({ ok: 1 });
    await get('/health');
    const rec = ioRecorder.last('/health');
    expect(rec!.method).toBe('GET');
    expect(rec!.requestBody).toBe('');
    expect(rec!.ok).toBe(true);
  });

  it('环形容量 30 滚动：最旧被挤出、all() 新→旧', async () => {
    stubFetchResp({});
    for (let i = 0; i < 32; i++) await get('/ring/check?n=' + i);
    const all = ioRecorder.all();
    expect(all.length).toBe(30);
    expect(all[0]!.url).toContain('n=31'); /* 最新在前 */
    expect(all[29]!.url).toContain('n=2'); /* 最旧 n=0/n=1 已滚出 */
  });

  it('响应原文超长截断保护（~200KB）：truncated 标记 + 长度封顶', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(300 * 1024) });
    stubFetchResp(big);
    await get('/big/resp');
    const rec = ioRecorder.last('/big/resp');
    expect(rec!.truncated).toBe(true);
    expect(rec!.responseRaw.length).toBeLessThanOrEqual(210 * 1024);
    expect(rec!.responseRaw.length).toBeGreaterThan(100 * 1024); /* 截断而非丢空 */
  });

  it('last(pathSub) 路径子串过滤互不串台；未命中返回 null', async () => {
    stubFetchResp({});
    await get('/cluster/query?index=a');
    await get('/cluster/sql/lenient');
    await get('/adhoc-rebuild/prepare?index=b');
    expect(ioRecorder.last('/cluster/query')!.url).toContain('/cluster/query');
    expect(ioRecorder.last('/cluster/sql/')!.url).toContain('/cluster/sql/lenient');
    expect(ioRecorder.last('/adhoc-rebuild/')!.url).toContain('/adhoc-rebuild/prepare');
    expect(ioRecorder.last('/xmigrate/')).toBeNull();
    expect(ioRecorder.last()!.url).toContain('/adhoc-rebuild/prepare'); /* 无参=全局最近 */
    expect(ioRecorder.get(999999)).toBeNull();
  });

  it('记录逻辑全 try/catch 在场（记录失败绝不影响主流程——源码锁）', () => {
    const src = read('../api.ts');
    expect(src).toMatch(/function recordIo\([\s\S]{0,200}try \{/);
  });

  it('request 既有契约零变更：超时 408 照抛（黑洞 fetch）', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        const e = new Error('aborted'); e.name = 'AbortError';
        if (init.signal!.aborted) { rej(e); return; }
        init.signal!.addEventListener('abort', () => rej(e), { once: true });
      })));
    await expect(post('/slow/req', '{}', undefined, { timeoutMs: 30 })).rejects.toMatchObject({ status: 408 });
    /* 超时请求同样留痕（status=0 未完成），不污染 last 的语义 */
    const rec = ioRecorder.last('/slow/req');
    expect(rec!.ok).toBe(false);
    expect(rec!.status).toBe(0);
  });
});

/* ═══════════ ② RawIoModal：挂载 / 三复制钮 / 空态 / curl 形态 ═══════════ */

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    template: '<div class="monaco-stub" :data-lang="language">{{ modelValue.slice(0, 40) }}</div>',
  },
}));

import RawIoModal from '../components/RawIoModal.vue';
import type { RawIoRec } from '../api';

const REC: RawIoRec = {
  id: 1, ts: 1758000000000, method: 'POST',
  url: '/internal/es/index/cluster/query?index=idx&size=1',
  requestBody: '{"query":{"match_all":{}}}',
  status: 200, ok: true, durationMs: 42,
  responseRaw: '{"took":3,"hits":[]}',
};

let app: ReturnType<typeof createApp> | null = null;

async function mountModal(props: { show?: boolean; rec?: RawIoRec | null } = {}) {
  document.body.innerHTML = '';
  app = createApp({ render: () => h(RawIoModal, { show: props.show ?? false, rec: props.rec ?? null }) });
  app.use(createPinia());
  app.mount(document.createElement('div'));
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

afterEach(() => { app?.unmount(); app = null; document.body.innerHTML = ''; });

describe('五百四十五批②：RawIoModal', () => {
  it('有记录：请求/响应两分节 Monaco（json 语义分档高亮）+ 三复制钮在场', async () => {
    await mountModal({ show: true, rec: REC });
    const stubs = document.body.querySelectorAll<HTMLDivElement>('.monaco-stub');
    expect(stubs.length, '请求+响应两个 Monaco 分节').toBe(2);
    expect(stubs[0]!.dataset.lang).toBe('json');
    expect(stubs[0]!.textContent).toContain('match_all');
    expect(stubs[1]!.textContent).toContain('"took":3');
    for (const label of ['复制请求 JSON', '复制响应 JSON', '复制为 curl']) {
      expect(document.body.querySelector(`[aria-label="${label}"]`), label + ' 钮必须在场').toBeTruthy();
    }
    /* 状态徽标语义分档：HTTP 200 ok=true 走 ok 档 */
    expect(document.body.querySelector('.rim-status.s-ok'), '2xx 走 ok 语义档').toBeTruthy();
    /* Monaco 定高不随内容增长（弹窗内定高先例形态） */
    expect(read('../components/RawIoModal.vue')).toContain('min(38vh,360px)');
  });

  it('复制为 curl：origin + method + content-type 头 + body 单引号转义', async () => {
    const written: string[] = [];
    Object.assign(navigator.clipboard, { writeText: (t: string) => { written.push(t); return Promise.resolve(true); } });
    await mountModal({ show: true, rec: REC });
    (document.body.querySelector('[aria-label="复制为 curl"]') as HTMLButtonElement)!.click();
    await new Promise(r => setTimeout(r, 0));
    expect(written.length).toBe(1);
    expect(written[0]).toMatch(/^curl -XPOST 'http:\/\/localhost:\d+\/internal\/es\/index\/cluster\/query\?index=idx&size=1'/);
    expect(written[0]).toContain("-H 'content-type: application/json'");
    expect(written[0]).toContain("-d '{\"query\":{\"match_all\":{}}}'");
  });

  it('无记录空态：EmptyState 引导文案', async () => {
    await mountModal({ show: true, rec: null });
    expect(document.body.querySelector('.monaco-stub')).toBeNull();
    expect(document.body.textContent).toContain('暂无原始 IO 记录');
  });

  it('ndjson 响应走 ndjson 语言档（多根 NDJSON 不挂 JSON LS 误报红线）', async () => {
    await mountModal({ show: true, rec: { ...REC, responseRaw: '{"a":1}\n{"a":2}' } });
    const stubs = document.body.querySelectorAll<HTMLDivElement>('.monaco-stub');
    expect(stubs[1]!.dataset.lang).toBe('ndjson');
  });
});

/* ═══════════ ③ 四页接线：SqlConsole 行为锁 + 三页字面锁 ═══════════ */

/* RawIoModal 不 mock（真件全链路：真 ModalShell + 空 rec 时真 EmptyState + 有 rec 时两 Monaco 分节）；
   仅 MonacoEditor stub（上方文件级 mock 已覆盖）。 */

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 走真实 request 内核：记录环真实落账（签名对齐原 sqlLenient：body+signal → post 端点回填）。
         550 同步更新：原 sqlLenient 包装对执行链经 ioKind:'sql' 打标（last 双参收口数据面），
         本镜像体同步补打标，否则 kind 过滤下执行记录不可见、行为锁（弹窗开 lenient 记录）失明 */
      sqlLenient: (body: unknown, signal?: unknown) =>
        (actual as unknown as { post: (p: string, b: unknown, base?: string, init?: unknown) => Promise<unknown> })
          .post('/cluster/sql/lenient', body, undefined, { ...(signal ? { signal } : {}), ioKind: 'sql' }),
      sqlTranslate: () => Promise.resolve({ available: false }),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import SqlConsoleView from '../views/SqlConsoleView.vue';
import { draftStorageKey } from '../composables/useScopedDraft';

describe('五百四十五批③：SqlConsole 接线（行为锁）', () => {
  it('执行 SQL → 结果分节「原始 IO」钮 → 弹窗拿到最近一条 /cluster/sql/ 记录', async () => {
    stubFetchResp({ columns: [{ name: 'id', type: 'long' }], rows: [[1]] });
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
    /* 1353：宿主两项收进「结果表更多 ⋯」菜单——按钮仍在，但要先展开菜单才可点。
       这里先断言菜单触发器在场，再点开，再取 raw-io（判据意图不变：用户仍能一步到达）。 */
    const more = host.querySelector<HTMLButtonElement>('[data-test="sq-bar-more"]');
    expect(more, '1353 起「原始 IO」住在结果表更多菜单里，必须先有菜单触发器').toBeTruthy();
    more!.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const btn = host.querySelector<HTMLButtonElement>('[data-test="raw-io"]');
    expect(btn, '结果分节「原始 IO」钮必须在场').toBeTruthy();
    expect(btn!.getAttribute('aria-label'), 'aria-label 必备').toBeTruthy();
    btn!.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    expect(document.body.querySelector('.rim-url'), 'RawIoModal 已开出且展示 URL').toBeTruthy();
    expect(document.body.querySelector('.rim-url')!.textContent).toContain('/cluster/sql/query');
    expect(document.body.querySelectorAll('.rim .monaco-stub').length, '弹窗内请求+响应两 Monaco 分节').toBe(2);
    a.unmount();
  });
});

describe('五百四十五批③：IndexHub / Adhoc / Xmigrate 接线（字面锁）', () => {
  it('IndexHubView：docs/query 两个结果工具行各一钮，特征 /cluster/query', () => {
    const v = read('../views/IndexHubView.vue');
    expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
    expect(v).toMatch(/import \{ api, ioRecorder[^]*?from '\.\.\/api'/);
    /* 1357：两个 tab 的 RT 行内钮退役（与「更多 ⋯」菜单项同一动作，重复平铺违反
       「never duplicate an action」）。本条意图是「docs/query 两条链路都在」，
       随入口迁移到菜单项 key（能力没少，只是收进菜单）。 */
    expect(v).toContain("key: 'ih-raw-io-docs'");
    expect(v).toContain("key: 'ih-raw-io-query'");
    expect(v).toMatch(/ioRecorder\.last\('\/cluster\/query'\)/);
    expect(v.match(/ioRecorder\.last\('\/cluster\/query'\)/)!.length).toBeGreaterThanOrEqual(1);
    expect(v).toContain('<RawIoModal');
  });

  it('AdhocRebuildView：评估（探测）/执行预览两分节各一钮，特征 /adhoc-rebuild/（552 同步更新：审编卡头补钮 + last 扩 /config-lab/ 回退——审编校验走 /config-lab/validate 不在托管特征下）', () => {
    const v = read('../views/AdhocRebuildView.vue');
    expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
    expect(v).toContain('aria-label="查看原始 IO（探测评估）"');
    expect(v).toContain('aria-label="查看原始 IO（托管重建）"');
    expect(v).toContain('aria-label="查看原始 IO（审编校验）"');
    expect(v).toContain("ioRecorder.last('/adhoc-rebuild/')");
    expect(v).toContain("?? ioRecorder.last('/config-lab/')");
    expect(v).toContain('<RawIoModal');
  });

  it('XmigrateView：源配置预览分节一钮，特征 /xmigrate/', () => {
    const v = read('../views/XmigrateView.vue');
    expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
    expect(v).toContain('aria-label="查看原始 IO（迁移接口）"');
    expect(v).toContain("ioRecorder.last('/xmigrate/')");
    expect(v).toContain('<RawIoModal');
  });

  it('SqlConsoleView：结果分节头一钮，特征 last(\'/cluster/sql/\', \'sql\') 双参收口（550 同步更新）', () => {
    const v = read('../views/SqlConsoleView.vue');
    expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
    expect(v).toContain('data-test="raw-io"');
    /* 550 同步更新：原锁钉 546 收紧形态 all().find 排 translate；550 批退役该补丁，
       改 last(pathSub, kind) 双参收口——kind='sql' 由 api 层打在执行链
       （query/lenient/cursor/close），translate 未打标天然排除，语义等价同步更新 */
    expect(v).toContain("ioRecorder.last('/cluster/sql/', 'sql')");
    expect(v).toContain('<RawIoModal');
  });
});
