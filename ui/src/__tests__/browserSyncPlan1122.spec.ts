/* 同步计划（smart_sync savePlan → plan_list → plan_apply）的浏览器端与 MCP 面契约：
 *   ① 计划落盘：预览携 savePlan=true 存入本机台账 xm-plans-v1 并回显 planId；记录与服务端
 *      PlanRecord 字段相同（13 个字段 + 预览快照），不保存凭据；apply=true 携 savePlan、手输连接
 *      携 savePlan 都被明确拒绝；
 *   ② 台账容量：上限 50，超出时删掉保存时间最早的一条；列表按保存时间倒序，行键序同服务端 toSummary；
 *   ③ 漂移门：plan_apply 以计划保存时的摘要为基准（expectPlanDigest 可覆盖），不一致抛 PLAN_DRIFT
 *      且不写目标；一致才执行，并回写 appliedAtMs/appliedCount、回显 planId；
 *   ④ PLAN_NOT_FOUND：文案「同步计划不存在: <id>」与服务端逐字一致；
 *   ⑤ 资源读取：esquerystudio://xmigrate/plan/{id} 返回记录 + 预览快照；低身份不返回源档案 id；
 *   ⑥ REST 桥（/plans、/plans/apply）与 MCP 组调用（写门、MRTR、结构化错误码）；
 *   ⑦ 契约数字与四端逐字：171 action、69 个写工具、组描述、提示词正文、参数说明。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyPlan, listPlans, planSnapshot, smartSync,
  PLANS_CAP, PLANS_KEY, PLAN_NOT_FOUND_PREFIX,
} from '../platform/browserXmigrate';
import {
  handleMcpRequest, setBrowserMcpWriteAllowed,
  MCP_GROUP_ACTIONS, MCP_GROUP_DESCRIPTIONS, MCP_READ_ONLY_ACTIONS, MCP_RESOURCE_TEMPLATES,
  MCP_TOOLS, MCP_TOOL_ANNOTATIONS, MCP_WRITE_TOOLS,
} from '../platform/browserMcp';
import * as browserApi from '../platform/browserApi';
import { __resetBrowserProfilesForTests } from '../platform/browserProfiles';

vi.mock('../platform/browserApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../platform/browserApi')>();
  /* 计划读取是否隐藏源档案 id 取决于页面内身份（/auth/me）。浏览器模式固定回 ADMIN，
     这里按需调低角色，验证低于 REBUILD_OP 时的脱敏。 */
  let role = 'ADMIN';
  const browserFetchWithRole = async (input: any, init?: any) => {
    if (String(input).includes('/auth/me')) {
      return new Response(JSON.stringify({
        username: 'browser', displayName: 'Browser', role, fallback: false, delegated: false, grantedPages: null,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return actual.browserFetch(input, init);
  };
  return { ...actual, browserFetch: browserFetchWithRole, __setPlanRole: (next: string) => { role = next; } };
});

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const java = read('../../../modules/mcp-server/src/main/java/io/github/dengmeiluan/esquerystudio/console/mcp/McpServerCore.java');
const ts = read('../platform/browserMcp.ts');
const local = read('../../../mcp/esquerystudio-local-mcp.mjs');
const docs = read('../../../docs/mcp.md');
const browserApiSrc = read('../platform/browserApi.ts');

const SRC_URL = 'http://src.local:9200';
const HOST_URL = 'http://es.local:9200';
const SRC_SETTINGS: Record<string, string> = {
  'index.number_of_shards': '5',
  'index.number_of_replicas': '1',
  'index.refresh_interval': '1s',
};
const CONN = { scheme: 'http', host: 'src.local', port: 9200, username: 'elastic', password: 'top-secret-pw' };
const REQ = { conn: CONN, srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host' };
const PLAN_SENTENCE = '预览时可携 savePlan=true 保存同步计划（响应回显 planId）；跨会话用 plan_list 查看已存计划，'
  + 'plan_apply {planId} 直接按计划执行——漂移门自动采用保存时的计划摘要，源结构已变化即 409 PLAN_DRIFT 拒绝，重新 smart_sync 预览即可。';
const SUMMARY_KEYS = ['planId', 'srcConnId', 'sourceIndex', 'destConnId', 'destIndex', 'mode', 'autoTune',
  'syncAliases', 'planDigest', 'savedAtMs', 'appliedAtMs', 'appliedCount'];
const RECORD_KEYS = ['planId', 'srcConnId', 'sourceIndex', 'destConnId', 'destIndex', 'mode', 'syncAliases',
  'fallbackAnalyzer', 'autoTune', 'planDigest', 'savedAtMs', 'appliedAtMs', 'appliedCount', 'snapshot'];
const MRTR_META = { 'io.modelcontextprotocol/clientCapabilities': { elicitation: {} } };

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/* 源集群（直连）fetch 桩：smartSync 直调形态，请求里带 conn。 */
function mockSourceFetch(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const p = new URL(String(input)).pathname;
    if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
    if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
    if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 2, number_of_data_nodes: 2 });
    if (p.startsWith('/orders/_settings')) return json({ orders: { settings: { ...SRC_SETTINGS } } });
    if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: { title: { type: 'text' } } } } });
    if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: {} } });
    throw new Error('unexpected source call: ' + p);
  });
}

/* 目标（宿主）通道桩：记录建索引 PUT；rejectPut=true 时目标拒绝建索引。 */
function hostFn(puts?: any[], rejectPut = false) {
  return vi.fn(async (path: string, method = 'GET', body?: string) => {
    const route = path.split('?')[0];
    if (route === '/') return { version: { number: '7.17.10', distribution: 'default' } };
    if (route.startsWith('/_nodes/plugins')) return { nodes: {} };
    if (route.startsWith('/_cluster/health')) return { number_of_nodes: 2, number_of_data_nodes: 2 };
    if (method === 'PUT') {
      puts?.push({ path: route, body: JSON.parse(body || '{}') });
      if (rejectPut) throw new Error('cluster read_only allow_delete=none');
      return { acknowledged: true };
    }
    throw new Error('unexpected host call: ' + path + ' ' + method);
  });
}

/* REST 桥 / MCP 全链 fetch 桩：源按档案 src-1 直连，目标走当前激活档案 host-1。 */
function stubEs(puts?: any[]): void {
  vi.stubGlobal('fetch', async (input: any, init?: any) => {
    const url = String(input);
    const method = String(init?.method || 'GET').toUpperCase();
    const p = new URL(url).pathname;
    if (url.startsWith(SRC_URL)) {
      if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
      if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
      if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 2, number_of_data_nodes: 2 });
      if (p.startsWith('/orders/_settings')) return json({ orders: { settings: { ...SRC_SETTINGS } } });
      if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: { title: { type: 'text' } } } } });
      if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: {} } });
    }
    if (url.startsWith(HOST_URL)) {
      if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
      if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
      if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 2, number_of_data_nodes: 2 });
      if (method === 'PUT') {
        puts?.push({ path: p, body: JSON.parse(String(init?.body || '{}')) });
        return json({ acknowledged: true });
      }
    }
    throw new Error('unexpected call: ' + method + ' ' + url);
  });
}

function seedProfiles(): void {
  __resetBrowserProfilesForTests();
  localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
    { id: 'src-1', name: 'src', url: SRC_URL },
    { id: 'host-1', name: 'host', url: HOST_URL },
  ]));
  localStorage.setItem('esquerystudio.browser.active', 'host-1');
}

/** 直接写一条台账记录（模拟已保存的计划；digest 为 null 表示没有基准摘要）。 */
function seedPlan(planId: string, savedAtMs = 1_700_000_000_000, over: Record<string, any> = {}): void {
  const rows = JSON.parse(localStorage.getItem(PLANS_KEY) || '[]');
  const record = {
    planId, srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-copy',
    mode: 'create', syncAliases: false, fallbackAnalyzer: null, autoTune: false,
    planDigest: 'digest0123456789', savedAtMs, appliedAtMs: null, appliedCount: 0,
    snapshot: { verdict: 'PLANNED', planDigest: 'digest0123456789', source: { index: 'orders', connection: 'src-1' } },
    ...over,
  };
  localStorage.setItem(PLANS_KEY, JSON.stringify([...rows.filter((r: any) => r.planId !== planId), record]));
}

function storedPlans(): any[] {
  return JSON.parse(localStorage.getItem(PLANS_KEY) || '[]');
}

/* 预览并保存一条计划，返回预览报告（planId / planDigest）。 */
async function savePreview(): Promise<any> {
  mockSourceFetch();
  return smartSync(hostFn(), { ...REQ, savePlan: true });
}

const mcp = (id: number, action: string, args: Record<string, any> = {}, extra: Record<string, any> = {}) => ({
  jsonrpc: '2.0', id, method: 'tools/call', ...extra,
  params: { name: 'es_xmigrate', arguments: { ...args, action } },
});

/* ═══ ① 计划落盘 ═══ */
describe('同步计划：smart_sync savePlan 落盘', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('savePlan=true 预览：存入台账并回显 planId，记录与服务端 PlanRecord 字段相同且不含凭据；不带时不回显', async () => {
    const r = await savePreview();
    expect(r.verdict).toBe('PLANNED');
    expect(r.planId, '计划 id 规则同迁移作业：目标索引_时间戳_16 位随机段').toMatch(/^orders-copy_\d+_[0-9a-f]{16}$/);
    expect(r.warnings).toEqual([]);
    const rows = storedPlans();
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(RECORD_KEYS);
    expect(rows[0]).toMatchObject({
      planId: r.planId, srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-copy',
      mode: 'create', syncAliases: false, fallbackAnalyzer: null, autoTune: false,
      planDigest: r.planDigest, appliedAtMs: null, appliedCount: 0,
    });
    expect(rows[0].snapshot.verdict).toBe('PLANNED');
    expect(rows[0].snapshot.planDigest).toBe(r.planDigest);
    expect(rows[0].snapshot).not.toHaveProperty('planId', '快照是挂 planId 之前的预览报告');
    expect(localStorage.getItem(PLANS_KEY), '计划里只保存档案 id，不保存凭据').not.toContain('top-secret-pw');
    mockSourceFetch();
    const plain = await smartSync(hostFn(), { ...REQ });
    expect(plain).not.toHaveProperty('planId');
    expect(storedPlans()).toHaveLength(1);
  });

  it('参数按请求原值记录：目标索引缺省回退源索引名，回退分析器 / autoTune / 别名随迁原样保存', async () => {
    mockSourceFetch();
    const r = await smartSync(hostFn(), {
      conn: CONN, srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host',
      downgradedAnalyzerFallback: 'ik_max_word', autoTune: true, syncAliases: true, savePlan: true,
    });
    expect(storedPlans()[0]).toMatchObject({
      planId: r.planId, destIndex: 'orders', fallbackAnalyzer: 'ik_max_word', autoTune: true, syncAliases: true,
    });
    expect(r.planId).toMatch(/^orders_\d+_[0-9a-f]{16}$/);
  });

  it('mode=incremental 的预览计划按报告里的 mode 保存', async () => {
    const host = vi.fn(async (path: string, method = 'GET') => {
      const route = path.split('?')[0];
      if (route === '/') return { version: { number: '7.17.10', distribution: 'default' } };
      if (route.startsWith('/_nodes/plugins')) return { nodes: {} };
      if (route.startsWith('/_cluster/health')) return { number_of_nodes: 2, number_of_data_nodes: 2 };
      if (route === '/orders-copy/_settings') return { 'orders-copy': { settings: { 'index.number_of_shards': '2' } } };
      if (route === '/orders-copy/_mapping') return { 'orders-copy': { mappings: { properties: {} } } };
      if (route === '/orders-copy/_alias') return { 'orders-copy': { aliases: {} } };
      throw new Error('unexpected host call: ' + path + ' ' + method);
    });
    mockSourceFetch();
    const r = await smartSync(host, { ...REQ, mode: 'incremental', savePlan: true });
    expect(r.mode).toBe('incremental');
    expect(storedPlans()[0]).toMatchObject({ planId: r.planId, mode: 'incremental', planDigest: r.planDigest });
  });

  it('apply=true 携 savePlan：拒绝文案与服务端逐字一致，不写目标也不写台账', async () => {
    const puts: any[] = [];
    mockSourceFetch();
    await expect(smartSync(hostFn(puts), { ...REQ, apply: true, savePlan: true }))
      .rejects.toMatchObject({ message: 'savePlan 仅预览形态可用', code: 'BAD_REQUEST' });
    expect(puts).toEqual([]);
    expect(localStorage.getItem(PLANS_KEY)).toBeNull();
  });

  it('手输连接（没有源连接档案 id）携 savePlan：拒绝保存，台账不落任何记录', async () => {
    mockSourceFetch();
    await expect(smartSync(hostFn(), { conn: CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host', savePlan: true }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('保存同步计划需要已存的源连接档案') });
    expect(localStorage.getItem(PLANS_KEY)).toBeNull();
  });
});

/* ═══ ② 台账容量与列表 ═══ */
describe('同步计划：台账容量与 plan_list 行形态', () => {
  /* 配额抛写的打桩要落在 localStorage 实例自身（happy-dom 下原型打桩不拦截实例调用），
     并持有引用显式还原（restoreAllMocks 在本环境不还原实例打桩） */
  let quota: { mockRestore: () => void } | null = null;
  const armQuota = () => {
    quota = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
  };
  const disarmQuota = () => { quota?.mockRestore(); quota = null; };
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  afterEach(disarmQuota);

  it('容量上限 50：超出时删掉保存时间最早的一条；列表按保存时间倒序并回显 cappedAt', async () => {
    for (let i = 0; i < 50; i++) seedPlan('seed-' + i, 1_000_000 + i);
    const r = await savePreview();
    const rows = storedPlans();
    expect(rows).toHaveLength(50);
    expect(rows[0].planId).toBe(r.planId);
    expect(rows.some((x) => x.planId === 'seed-0'), '最旧的一条被淘汰').toBe(false);
    expect(rows.some((x) => x.planId === 'seed-1')).toBe(true);
    const list = listPlans();
    expect(list.cappedAt).toBe(50);
    expect(list.plans.map((p: any) => p.planId).slice(0, 3)).toEqual([r.planId, 'seed-49', 'seed-48']);
    expect(list).not.toHaveProperty('warning');
  });

  it('行键序与服务端 PlanRecord.toSummary 相同（12 键，不含回退分析器与快照）', () => {
    seedPlan('p-1');
    seedPlan('p-2', 1_000, { appliedCount: 3, appliedAtMs: 1_700_000_005_000, autoTune: true, syncAliases: true });
    const list = listPlans();
    expect(list.plans).toHaveLength(2);
    for (const row of list.plans) expect(Object.keys(row)).toEqual(SUMMARY_KEYS);
    expect(list.plans[0]).toEqual({
      planId: 'p-1', srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-copy',
      mode: 'create', autoTune: false, syncAliases: false, planDigest: 'digest0123456789',
      savedAtMs: 1_700_000_000_000, appliedAtMs: null, appliedCount: 0,
    });
    expect(list.plans[1]).toMatchObject({ planId: 'p-2', autoTune: true, syncAliases: true, appliedAtMs: 1_700_000_005_000, appliedCount: 3 });
  });

  it('台账内容损坏：空列表 + warning，不把读取失败显示成「没有计划」；从未保存过则不带 warning', () => {
    expect(listPlans()).toEqual({ plans: [], cappedAt: 50 });
    localStorage.setItem(PLANS_KEY, '{not json');
    expect(listPlans()).toEqual({ plans: [], cappedAt: 50, warning: '同步计划台账读取失败，仅返回当前页面内保存的计划' });
    localStorage.setItem(PLANS_KEY, JSON.stringify({ not: 'an array' }));
    expect(listPlans().warning).toContain('同步计划台账读取失败');
  });

  it('存储不可写：计划保留在页面内并附 warning；存储恢复后下一次写入落盘并清掉页面内副本', async () => {
    seedProfiles();
    armQuota();
    const degraded = await savePreview();
    expect(degraded.planId, '写入失败时仍回显 planId').toMatch(/^orders-copy_\d+_[0-9a-f]{16}$/);
    expect(degraded.warnings).toContain('同步计划未能写入本机存储，仅保留在当前页面内（页面刷新后失效）');
    expect(localStorage.getItem(PLANS_KEY)).toBeNull();
    expect(listPlans().plans.map((p: any) => p.planId)).toEqual([degraded.planId]);
    disarmQuota();

    /* 执行记账回写失败：计划已执行，报告里如实说明；页面内副本仍是最新记账 */
    const saved = await savePreview();
    mockSourceFetch();
    armQuota();
    const applied = await applyPlan(hostFn([]), { planId: saved.planId });
    expect(applied.verdict).toBe('APPLIED');
    expect(applied.warnings).toContain('同步计划已执行，但执行次数未能写回本机存储（仅保留在当前页面内）');
    expect(listPlans().plans.find((p: any) => p.planId === saved.planId)).toMatchObject({ appliedCount: 1 });
    disarmQuota();

    /* 存储恢复：再保存一条即整体落盘（含页面内副本），页面内副本清空 */
    const third = await savePreview();
    expect(storedPlans().map((x) => x.planId)).toEqual([third.planId, saved.planId, degraded.planId]);
    expect(storedPlans().find((x) => x.planId === saved.planId).appliedCount).toBe(1);
    localStorage.clear();
    expect(listPlans().plans, '落盘后页面内副本不再残留').toEqual([]);
  });
});

/* ═══ ④ 资源读取与脱敏 ═══ */
describe('同步计划：esquerystudio://xmigrate/plan/{id} 资源快照', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('返回记录 + 保存时的预览快照（另带回退分析器）；计划不存在按服务端文案报错', async () => {
    const saved = await savePreview();
    const view = planSnapshot(saved.planId);
    expect(Object.keys(view)).toEqual([...SUMMARY_KEYS, 'fallbackAnalyzer', 'snapshot']);
    expect(view.planId).toBe(saved.planId);
    expect(view.fallbackAnalyzer).toBeNull();
    expect(view.snapshot).toMatchObject({ verdict: 'PLANNED', planDigest: saved.planDigest });
    expect(view.snapshot.source).toMatchObject({ index: 'orders', connection: 'src-1' });
    expect(() => planSnapshot('nope')).toThrow(expect.objectContaining({ message: PLAN_NOT_FOUND_PREFIX + 'nope', code: 'PLAN_NOT_FOUND' }));
    expect(PLAN_NOT_FOUND_PREFIX).toBe('同步计划不存在: ');
  });

  it('脱敏（身份低于 REBUILD_OP）：列表行与快照视图删去 srcConnId，快照里回显的源连接标识一并删去；台账本身不变', async () => {
    const saved = await savePreview();
    for (const row of listPlans(true).plans) {
      expect('srcConnId' in row).toBe(false);
      expect(Object.keys(row)).toEqual(SUMMARY_KEYS.filter((k) => k !== 'srcConnId'));
    }
    const view = planSnapshot(saved.planId, true);
    expect('srcConnId' in view).toBe(false);
    expect('connection' in view.snapshot.source).toBe(false);
    expect(view.snapshot.source).toMatchObject({ index: 'orders' });
    /* 不脱敏时字段照常返回 */
    expect(listPlans(false).plans[0].srcConnId).toBe('src-1');
    expect(planSnapshot(saved.planId).snapshot.source.connection).toBe('src-1');
    expect(storedPlans()[0].srcConnId).toBe('src-1');
  });
});

/* ═══ ③ 漂移门与执行记账 ═══ */
describe('同步计划：plan_apply 漂移门与执行记账', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    seedProfiles();
  });

  it('按计划保存的参数重跑：漂移校验用保存时的摘要 → APPLIED、回显 planId、目标恰好一次 PUT、记账回写', async () => {
    const saved = await savePreview();
    const puts: any[] = [];
    mockSourceFetch();
    const r = await applyPlan(hostFn(puts), { planId: saved.planId });
    expect(r.verdict).toBe('APPLIED');
    expect(r.applied).toBe(true);
    expect(r.planDigest).toBe(saved.planDigest);
    expect(r.planId).toBe(saved.planId);
    expect(r.destIndex).toBe('orders-copy');
    expect(r).not.toHaveProperty('savePlan');
    expect(puts).toHaveLength(1);
    expect(puts[0].path).toBe('/orders-copy');
    expect(storedPlans()[0]).toMatchObject({ planId: saved.planId, appliedCount: 1, planDigest: saved.planDigest });
    expect(storedPlans()[0].appliedAtMs).toBeGreaterThan(0);
    expect(listPlans().plans[0]).toMatchObject({ planId: saved.planId, appliedCount: 1 });
  });

  it('漂移门：保存的摘要与当前结构不一致 → PLAN_DRIFT（同族文案带双摘要），零写且记账不动', async () => {
    const saved = await savePreview();
    const rows = storedPlans();
    rows[0].planDigest = 'deadbeefdeadbeef';
    localStorage.setItem(PLANS_KEY, JSON.stringify(rows));
    const puts: any[] = [];
    mockSourceFetch();
    await expect(applyPlan(hostFn(puts), { planId: saved.planId })).rejects.toMatchObject({
      code: 'PLAN_DRIFT',
      message: '计划摘要不匹配，拒绝执行：期望 deadbeefdeadbeef，实际 ' + saved.planDigest
        + '（source structure drifted, re-run smart-sync preview）',
    });
    expect(puts).toEqual([]);
    expect(storedPlans()[0]).toMatchObject({ appliedCount: 0, appliedAtMs: null });
  });

  it('expectPlanDigest 覆盖保存的摘要：与当前结构一致即放行', async () => {
    const saved = await savePreview();
    const rows = storedPlans();
    rows[0].planDigest = 'deadbeefdeadbeef';
    localStorage.setItem(PLANS_KEY, JSON.stringify(rows));
    const puts: any[] = [];
    mockSourceFetch();
    const r = await applyPlan(hostFn(puts), { planId: saved.planId, expectPlanDigest: saved.planDigest });
    expect(r.verdict).toBe('APPLIED');
    expect(puts).toHaveLength(1);
  });

  it('计划没有基准摘要：拒绝执行（没有摘要就没有漂移校验）', async () => {
    seedPlan('nodigest', 1_700_000_000_000, { planDigest: null });
    const puts: any[] = [];
    await expect(applyPlan(hostFn(puts), { planId: 'nodigest' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', message: '同步计划缺少计划摘要，无法校验漂移: nodigest' });
    expect(puts).toEqual([]);
  });

  it('计划不存在：PLAN_NOT_FOUND，文案「同步计划不存在: <id>」逐字；缺 planId 报参数错误', async () => {
    const host = hostFn();
    await expect(applyPlan(host, { planId: 'no-such-plan' }))
      .rejects.toMatchObject({ code: 'PLAN_NOT_FOUND', message: '同步计划不存在: no-such-plan' });
    await expect(applyPlan(host, {})).rejects.toThrow('planId 不能为空');
    expect(host).not.toHaveBeenCalled();
  });

  it('执行未落成（verdict FAILED）：不记执行次数，报告仍回显 planId；源档案已删除按 CONN_NOT_FOUND 报错', async () => {
    const saved = await savePreview();
    mockSourceFetch();
    const failed = await applyPlan(hostFn([], true), { planId: saved.planId });
    expect(failed.verdict).toBe('FAILED');
    expect(failed.planId).toBe(saved.planId);
    expect(storedPlans()[0]).toMatchObject({ appliedCount: 0, appliedAtMs: null });

    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([{ id: 'host-1', name: 'host', url: HOST_URL }]));
    await expect(applyPlan(hostFn(), { planId: saved.planId }))
      .rejects.toMatchObject({ code: 'CONN_NOT_FOUND', message: '连接档案不存在: src-1' });
  });
});

/* ═══ ⑥ REST 桥 ═══ */
describe('同步计划：REST 桥（/smart-sync savePlan、/plans、/plans/apply）', () => {
  beforeEach(() => { localStorage.clear(); seedProfiles(); vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const post = (path: string, body: any) => browserApi.browserFetch('/internal/es/xmigrate' + path, { method: 'POST', body: JSON.stringify(body) });

  it('smart-sync 透传 savePlan：预览回显 planId；执行形态携带被 400 拒绝', async () => {
    const puts: any[] = [];
    stubEs(puts);
    const resp = await post('/smart-sync', { srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host', savePlan: true });
    expect(resp.status).toBe(200);
    const r = await resp.json();
    expect(r.verdict).toBe('PLANNED');
    expect(r.planId).toMatch(/^orders-copy_\d+_[0-9a-f]{16}$/);
    const rejected = await post('/smart-sync', { srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host', apply: true, savePlan: true });
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).message).toBe('savePlan 仅预览形态可用');
    expect(puts).toEqual([]);
  });

  it('GET /plans：读本机台账（与 MCP plan_list 同形）；POST /plans/apply：404 PLAN_NOT_FOUND / 400 缺参 / 200 执行报告', async () => {
    const puts: any[] = [];
    stubEs(puts);
    const saved = await (await post('/smart-sync', { srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host', savePlan: true })).json();
    const listResp = await browserApi.browserFetch('/internal/es/xmigrate/plans');
    expect(listResp.status).toBe(200);
    expect(await listResp.json()).toMatchObject({ cappedAt: 50, plans: [{ planId: saved.planId, sourceIndex: 'orders' }] });

    const missing = await post('/plans/apply', { planId: 'nope' });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: true, message: '同步计划不存在: nope', code: 'PLAN_NOT_FOUND' });
    const noId = await post('/plans/apply', {});
    expect(noId.status).toBe(400);
    expect((await noId.json()).message).toBe('planId 不能为空');

    const ok = await post('/plans/apply', { planId: saved.planId });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ verdict: 'APPLIED', applied: true, planId: saved.planId });
    expect(puts).toHaveLength(1);
    const again = await (await browserApi.browserFetch('/internal/es/xmigrate/plans')).json();
    expect(again.plans[0]).toMatchObject({ planId: saved.planId, appliedCount: 1 });
  });

  it('destConnId=host 存计划：落库解析为当前目标档案 id，切走连接后按计划执行被「请先切换目标连接」挡住', async () => {
    const puts: any[] = [];
    stubEs(puts);
    /* 激活档案为 host-1：请求按服务端口径传 host，台账按具体档案 id 记录 */
    const saved = await (await post('/smart-sync', { srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host', savePlan: true })).json();
    expect(saved.planId).toMatch(/^orders-copy_\d+_[0-9a-f]{16}$/);
    expect(storedPlans()[0]).toMatchObject({ planId: saved.planId, destConnId: 'host-1' });
    /* 顶栏切走目标（esquerystudio.target 指向 src-1）：计划目标已非当前连接，执行被挡、零写 */
    localStorage.setItem('esquerystudio.target', 'src-1');
    const blocked = await post('/plans/apply', { planId: saved.planId });
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).message).toBe('浏览器模式目标侧只能是当前激活连接（destConnId 传 host 或当前档案 id），实际: host-1；请先在顶栏切换目标连接');
    expect(puts).toEqual([]);
  });

  it('计划的目标连接不是当前目标：400 同款文案拒绝（与 smart-sync 的目标校验一致）；漂移 → 409 PLAN_DRIFT', async () => {
    const puts: any[] = [];
    stubEs(puts);
    seedPlan('other-target', 1_700_000_000_000, { destConnId: 'someone-else' });
    const offTarget = await post('/plans/apply', { planId: 'other-target' });
    expect(offTarget.status).toBe(400);
    expect((await offTarget.json()).message).toBe('浏览器模式目标侧只能是当前激活连接（destConnId 传 host 或当前档案 id），实际: someone-else；请先在顶栏切换目标连接');

    seedPlan('stale', 1_700_000_000_001, { planDigest: 'deadbeefdeadbeef' });
    const drifted = await post('/plans/apply', { planId: 'stale' });
    expect(drifted.status).toBe(409);
    const body = await drifted.json();
    expect(body.code).toBe('PLAN_DRIFT');
    expect(body.message).toContain('计划摘要不匹配，拒绝执行：期望 deadbeefdeadbeef');
    expect(puts).toEqual([]);
  });
});

/* ═══ ⑥ MCP 组调用 ═══ */
describe('同步计划：MCP 组调用（写门 / MRTR / 结构化错误码 / 资源）', () => {
  beforeEach(() => { localStorage.clear(); seedProfiles(); vi.restoreAllMocks(); setBrowserMcpWriteAllowed(false); });
  afterEach(() => { vi.unstubAllGlobals(); setBrowserMcpWriteAllowed(false); });

  it('写门关闭：plan_list 只读可用；plan_apply 是写动作被拦；开启后按计划执行并回显 planId', async () => {
    const puts: any[] = [];
    stubEs(puts);
    /* 预览免写门：先经 smart_sync savePlan 存一条摘要真实的计划 */
    const planId = (await handleMcpRequest(mcp(20, 'smart_sync', { srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-copy', savePlan: true })))
      .result.structuredContent.planId;
    const listed = await handleMcpRequest(mcp(1, 'plan_list'));
    expect(listed.result.isError).toBe(false);
    expect(listed.result.structuredContent).toMatchObject({ cappedAt: 50, plans: [{ planId, srcConnId: 'src-1' }] });
    const gated = await handleMcpRequest(mcp(2, 'plan_apply', { planId }));
    expect(gated.result.isError).toBe(true);
    expect(gated.result.content[0].text).toContain('页面内写工具未启用');
    expect(puts).toEqual([]);

    setBrowserMcpWriteAllowed(true);
    const applied = await handleMcpRequest(mcp(3, 'plan_apply', { planId }));
    expect(applied.result.isError).toBe(false);
    expect(applied.result.structuredContent).toMatchObject({ verdict: 'APPLIED', applied: true, planId });
    expect(puts).toHaveLength(1);
  });

  it('smart_sync 携 savePlan：srcConnId 与 savePlan 透传到桥层，计划按档案 id 保存并回显 planId', async () => {
    stubEs();
    const out = await handleMcpRequest(mcp(4, 'smart_sync', { srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-copy', savePlan: true }));
    expect(out.result.isError).toBe(false);
    const planId = out.result.structuredContent.planId;
    expect(planId).toMatch(/^orders-copy_\d+_[0-9a-f]{16}$/);
    expect(storedPlans()[0]).toMatchObject({ planId, srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host-1' });
    expect(out.result.structuredContent.source.connection, '报告回显源档案 id').toBe('src-1');
    const listed = await handleMcpRequest(mcp(5, 'plan_list'));
    expect(Object.keys(listed.result.structuredContent.plans[0])).toEqual(SUMMARY_KEYS);
  });

  it('结构化错误码：计划不存在 PLAN_NOT_FOUND（文案逐字）、漂移 PLAN_DRIFT、缺 planId BAD_REQUEST、执行形态携 savePlan', async () => {
    stubEs();
    /* plan_apply 是写动作：结构化错误码的判定发生在写门之后 */
    setBrowserMcpWriteAllowed(true);
    const missing = await handleMcpRequest(mcp(6, 'plan_apply', { planId: 'no-such-plan' }));
    expect(missing.result.isError).toBe(true);
    expect(missing.result.content[0].text).toBe('同步计划不存在: no-such-plan');
    expect(missing.result.structuredContent).toEqual({ code: 'PLAN_NOT_FOUND', message: '同步计划不存在: no-such-plan' });

    seedPlan('stale', 1_700_000_000_001, { planDigest: 'deadbeefdeadbeef' });
    const drifted = await handleMcpRequest(mcp(7, 'plan_apply', { planId: 'stale' }));
    expect(drifted.result.isError).toBe(true);
    expect(drifted.result.structuredContent.code).toBe('PLAN_DRIFT');
    expect(drifted.result.structuredContent.message).toContain('计划摘要不匹配，拒绝执行：期望 deadbeefdeadbeef');

    const noArg = await handleMcpRequest(mcp(8, 'plan_apply', {}));
    expect(noArg.result.structuredContent).toMatchObject({ code: 'BAD_REQUEST' });
    expect(noArg.result.content[0].text).toContain('Missing required argument: planId');

    const onApply = await handleMcpRequest(mcp(9, 'smart_sync', { srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', apply: true, savePlan: true }));
    expect(onApply.result.structuredContent).toEqual({ code: 'BAD_REQUEST', message: 'savePlan 仅预览形态可用' });
  });

  it('MRTR：plan_apply 是写动作，声明 elicitation 的客户端先拿 input_required，确认后才执行；plan_list 不进', async () => {
    const puts: any[] = [];
    stubEs(puts);
    const planId = (await handleMcpRequest(mcp(21, 'smart_sync', { srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-copy', savePlan: true })))
      .result.structuredContent.planId;
    const listed = await handleMcpRequest(mcp(10, 'plan_list', {}, { _meta: MRTR_META }));
    expect(listed.result.resultType).not.toBe('input_required');
    const gated = await handleMcpRequest(mcp(11, 'plan_apply', { planId }, { _meta: MRTR_META }));
    expect(gated.result.resultType).toBe('input_required');
    expect(gated.result.inputRequests.confirm.method).toBe('elicitation/create');
    expect(puts).toEqual([]);
    setBrowserMcpWriteAllowed(true);
    const confirmed = await handleMcpRequest(mcp(12, 'plan_apply', {
      planId, inputResponses: { confirm: { action: 'accept', content: { confirm: true } } }, requestState: gated.result.requestState,
    }, { _meta: MRTR_META }));
    expect(confirmed.result.isError).toBe(false);
    expect(confirmed.result.structuredContent).toMatchObject({ verdict: 'APPLIED', planId });
    expect(puts).toHaveLength(1);
    /* 伪造的确认状态仍然被拒；拒绝确认时不执行 */
    const forged = await handleMcpRequest(mcp(22, 'plan_apply', {
      planId, inputResponses: { confirm: { action: 'accept', content: { confirm: true } } }, requestState: 'mrtr-bogus',
    }, { _meta: MRTR_META }));
    expect(forged.error.code).toBe(-32602);
    const again = await handleMcpRequest(mcp(23, 'plan_apply', { planId }, { _meta: MRTR_META }));
    const declined = await handleMcpRequest(mcp(24, 'plan_apply', {
      planId, inputResponses: { confirm: { action: 'decline' } }, requestState: again.result.requestState,
    }, { _meta: MRTR_META }));
    expect(declined.result.structuredContent).toMatchObject({ cancelled: true, tool: 'es_xmigrate_plan_apply' });
    expect(puts).toHaveLength(1);
  });

  it('资源：模板清单含 xmigrate/plan/{id}；读取返回记录 + 预览快照；不存在按 -32602 + 服务端文案', async () => {
    stubEs();
    const templates = await handleMcpRequest({ jsonrpc: '2.0', id: 13, method: 'resources/templates/list' });
    const planTpl = templates.result.resourceTemplates.find((t: any) => t.uriTemplate === 'esquerystudio://xmigrate/plan/{id}');
    expect(planTpl).toMatchObject({ name: '同步计划快照', title: 'Smart sync plan', mimeType: 'application/json' });
    expect(templates.result.resourceTemplates).toHaveLength(13);
    const templateUris = MCP_RESOURCE_TEMPLATES.map(t => t.uriTemplate);
    expect(templateUris).toContain('esquerystudio://xmigrate/plan/{id}');
    expect(templateUris.slice(-2)).toEqual(['esquerystudio://tasks/active', 'esquerystudio://task/{id}']);

    const saved = (await handleMcpRequest(mcp(14, 'smart_sync', { srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-copy', savePlan: true })))
      .result.structuredContent.planId;
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 15, method: 'resources/read', params: { uri: 'esquerystudio://xmigrate/plan/' + saved } });
    const view = JSON.parse(res.result.contents[0].text);
    expect(Object.keys(view)).toEqual([...SUMMARY_KEYS, 'fallbackAnalyzer', 'snapshot']);
    expect(view).toMatchObject({ planId: saved, srcConnId: 'src-1', fallbackAnalyzer: null });
    expect(view.snapshot.verdict).toBe('PLANNED');

    const missing = await handleMcpRequest({ jsonrpc: '2.0', id: 16, method: 'resources/read', params: { uri: 'esquerystudio://xmigrate/plan/nope' } });
    expect(missing.error).toEqual({ code: -32602, message: '同步计划不存在: nope' });
  });

  it('脱敏：身份低于 REBUILD_OP 时 plan_list 行与计划快照都删去 srcConnId；REBUILD_OP 及以上照常返回', async () => {
    stubEs();
    seedPlan('p-redact');
    const setRole = (browserApi as any).__setPlanRole;
    for (const role of ['VIEWER', 'OPERATOR']) {
      setRole(role);
      const listed = await handleMcpRequest(mcp(17, 'plan_list'));
      expect('srcConnId' in listed.result.structuredContent.plans[0], role).toBe(false);
      expect(listed.result.content[0].text).not.toContain('src-1');
      const res = await handleMcpRequest({ jsonrpc: '2.0', id: 18, method: 'resources/read', params: { uri: 'esquerystudio://xmigrate/plan/p-redact' } });
      const view = JSON.parse(res.result.contents[0].text);
      expect('srcConnId' in view).toBe(false);
      expect('connection' in view.snapshot.source).toBe(false);
    }
    setRole('REBUILD_OP');
    const kept = await handleMcpRequest(mcp(19, 'plan_list'));
    expect(kept.result.structuredContent.plans[0].srcConnId).toBe('src-1');
    setRole('ADMIN');
  });
});

/* ═══ ⑦ 契约数字与四端逐字 ═══ */
describe('同步计划：MCP 契约数字与四端逐字', () => {
  const javaLits = (s: string) => [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\n/g, '\n'));
  const tsLits = (s: string) => [...s.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\n/g, '\n'));
  const promptBody = (text: string) => {
    const i = text.indexOf('首选一步式 smart_sync');
    return text.slice(i, text.indexOf('终局验证。', i) + 5);
  };
  const promptTextOf = (source: string, branch: string, unknownTail: string) => {
    const start = source.indexOf(branch);
    return (source === java ? javaLits : tsLits)(source.slice(source.indexOf('text = ', start), source.indexOf(unknownTail, start))).join('');
  };

  it("17 组 / 171 action：es_xmigrate 组 23 个 action；plan_apply 进写清单（69 个），plan_list 只读", () => {
    expect(MCP_TOOLS).toHaveLength(171);
    expect(Object.values(MCP_GROUP_ACTIONS).flatMap((actions) => Object.keys(actions))).toHaveLength(171);
    expect(Object.keys(MCP_GROUP_ACTIONS.es_xmigrate)).toHaveLength(23);
    expect(MCP_GROUP_ACTIONS.es_xmigrate).toMatchObject({ smart_sync: 'es_xmigrate_smart_sync', plan_list: 'es_xmigrate_plan_list', plan_apply: 'es_xmigrate_plan_apply' });
    expect(MCP_WRITE_TOOLS).toHaveLength(69);
    expect(MCP_WRITE_TOOLS).toContain('es_xmigrate_plan_apply');
    expect(MCP_WRITE_TOOLS).not.toContain('es_xmigrate_plan_list');
    expect(MCP_READ_ONLY_ACTIONS.es_xmigrate).toEqual(expect.arrayContaining(['plan_list', 'smart_sync']));
    expect(MCP_READ_ONLY_ACTIONS.es_xmigrate).not.toContain('plan_apply');
    expect(MCP_TOOL_ANNOTATIONS.es_xmigrate).toEqual({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });
    expect(MCP_TOOLS.map(t => t.name)).toEqual(expect.arrayContaining(['es_xmigrate_plan_list', 'es_xmigrate_plan_apply']));
    expect(MCP_TOOLS.find(t => t.name === 'es_xmigrate_plan_apply')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it('tools/list 的 es_xmigrate 组：action 枚举含两个新 action，参数面含 savePlan / planId，描述与服务端同文案', async () => {
    setBrowserMcpWriteAllowed(true);
    try {
      const out = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const group = out.result.tools.find((t: any) => t.name === 'es_xmigrate');
      const props = group.inputSchema.properties;
      expect(group.inputSchema.properties.action.enum.slice(-2)).toEqual(['plan_list', 'plan_apply']);
      expect(group.annotations.readOnlyActions).toContain('plan_list');
      expect(group.annotations.readOnlyActions).not.toContain('plan_apply');
      expect(props.savePlan.type).toBe('boolean');
      expect(props.planId.type).toBe('string');
      const jStart = java.indexOf('if ("es_xmigrate".equals(name)) {\n            actionProperty.put("description"');
      const jAll = javaLits(java.slice(jStart, java.indexOf('properties.put("rps", string("number"', jStart))).join('');
      const tStart = ts.indexOf("properties.action.description = 'Action to execute. One of: '");
      const tAll = tsLits(ts.slice(tStart, ts.indexOf('properties.rps = {', tStart))).join('');
      const actionOf = (s: string) => { const i = s.indexOf('. 新参语义：'); return s.slice(i, s.indexOf('相同）。', i) + 4); };
      expect(actionOf(tAll)).toBe(actionOf(jAll));
      expect(actionOf(tAll)).toContain('smart_sync 预览可携 savePlan=true 把计划落盘并返回 planId；plan_list（只读）列出已存计划，plan_apply 按 planId 执行 已存计划');
      expect(props.savePlan.description).toBe('smart_sync: true 时把本次预览计划落盘并在响应里返回 planId（供 plan_list / plan_apply 复用）；仅预览形态可用（apply=false，缺省），apply=true 时带上报 400');
      expect(props.planId.description).toBe('plan_apply: 已存同步计划 id（smart_sync savePlan=true 返回）；计划不存在报 PLAN_NOT_FOUND');
      expect(props.expectPlanDigest.description).toContain('plan_apply: 可选，缺省用计划保存时的 planDigest 做漂移门');
      expect(jAll).toContain(props.savePlan.description);
      expect(jAll).toContain(props.planId.description);
      expect(jAll).toContain(props.expectPlanDigest.description);
    } finally {
      setBrowserMcpWriteAllowed(false);
    }
  });

  it('组描述与 Java McpController 逐字一致，含同步计划复用一段', () => {
    const m = java.match(/case "es_xmigrate": return "([^"]+)";/);
    expect(m).not.toBeNull();
    expect(MCP_GROUP_DESCRIPTIONS.es_xmigrate).toBe(m![1]);
    for (const token of ['savePlan=true on a preview persists that plan and returns planId', 'saved-plan reuse (plan_list lists saved sync plans newest first',
      'plan_apply re-runs a saved plan by planId behind the same planDigest drift gate as smart_sync apply',
      'a missing planId is PLAN_NOT_FOUND', 'esquerystudio://xmigrate/plan/{id} resource returns the saved plan with its preview snapshot']) {
      expect(MCP_GROUP_DESCRIPTIONS.es_xmigrate).toContain(token);
    }
  });

  it('cross_cloud_structure_sync 提示词正文四端同文案：Java / 浏览器桥 / 本地 Node 逐字相等，文档含同一句', () => {
    const jText = promptTextOf(java, '"cross_cloud_structure_sync".equals(name)', 'Unknown prompt: " + name');
    const tText = promptTextOf(ts, "name === 'cross_cloud_structure_sync')", "Unknown prompt: ' + name");
    const lText = promptTextOf(local, "name === 'cross_cloud_structure_sync')", "Unknown prompt: ' + name");
    const jBody = promptBody(jText);
    expect(jBody).toContain(PLAN_SENTENCE);
    expect(promptBody(tText)).toBe(jBody);
    expect(promptBody(lText)).toBe(jBody);
    expect(docs).toContain(PLAN_SENTENCE);
    /* 新句落在「首选一步式 smart_sync」一段的末尾、进阶分步之前 */
    expect(jBody.indexOf(PLAN_SENTENCE)).toBeGreaterThan(jBody.indexOf('目标索引不存在返回 DEST_NOT_FOUND。'));
    expect(jBody.indexOf(PLAN_SENTENCE)).toBeLessThan(jBody.indexOf('进阶（需要逐步控制或诊断细节时分步执行）'));
  });

  it('MRTR 二次确认清单三端都含 plan_apply；本地 Node 桥与浏览器桥的 REST 端点字面量在场', () => {
    const jMrtr = java.slice(java.indexOf('MRTR_CONFIRM_TOOLS = '), java.indexOf('));', java.indexOf('MRTR_CONFIRM_TOOLS = ')));
    const tMrtr = ts.slice(ts.indexOf('const MCP_MRTR_CONFIRM_TOOLS'), ts.indexOf(']);', ts.indexOf('const MCP_MRTR_CONFIRM_TOOLS')));
    const lMrtr = local.slice(local.indexOf('const MRTR_CONFIRM_TOOLS'), local.indexOf(']);', local.indexOf('const MRTR_CONFIRM_TOOLS')));
    for (const block of [jMrtr, tMrtr, lMrtr]) expect(block).toContain('es_xmigrate_plan_apply');
    expect(browserApiSrc).toContain("path === '/plans'");
    expect(browserApiSrc).toContain("path === '/plans/apply'");
    expect(browserApiSrc).toContain("'PLAN_NOT_FOUND'");
    expect(local).toContain("const PLAN_NOT_FOUND_PREFIX = '同步计划不存在: '");
    expect(local).toContain("join(homedir(), '.esquerystudio', 'local-mcp', 'plans.json')");
    expect(local).toContain("return 'PLAN_NOT_FOUND'");
  });
});
