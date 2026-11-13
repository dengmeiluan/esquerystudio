/** API 层：fetch 封装 + 全部后端端点 */
import { parseJsonSafe, writeStoredRaw, removeStoredRaw } from './utils/safeJson';
import { browserFetch, isBrowserMode } from './platform/browserApi';
import { demoFetch, isDemoMode } from './platform/demoApi';

/* 纯前端 / 服务端 / 静态演示三模式：页面与 api 方法不变，只切换最底层 transport。 */
const transportFetch: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  isBrowserMode ? browserFetch(input, init) : isDemoMode ? demoFetch(input, init) : fetch(input, init)) as typeof fetch;
const doFetch: typeof fetch = transportFetch;
/* 宿主可能配了 servlet context-path（如 /quotehub）。
 控制台 2.0 静态入口挂在 {ctx}/esquerystudio/ 下（1.x 为 {ctx}/console/），路由是 hash 模式，
 pathname 不含页内路由，故截取入口目录之前的段即为 context-path（无 ctx 宿主得 ''，行为不变）。
 只认 /console/ 会让 2.0 嵌入宿主时 API 打到域名根：反代回宿主 SPA 的 HTML 被当状态对象，
 Setup 向导误弹（产线实报「进入控制台要求连接控制集群」）。 */
export function deriveContextPath(pathname: string): string {
  const m = pathname.match(/^(.*?)\/(?:console|esquerystudio)\//);
  return m ? m[1] : '';
}
const CTX = deriveContextPath(window.location.pathname);
export const EP = `${CTX}/internal/es/index`;
const XB = `${CTX}/internal/es/xmigrate`;

/* ==================== ：控制台鉴权 token ==================== */
const TOKEN_KEY = 'esquerystudio.auth.token';
export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t: string) => writeStoredRaw(localStorage, TOKEN_KEY, t);
export const clearToken = () => removeStoredRaw(localStorage, TOKEN_KEY);
/** 鉴权头（裸 fetch 场景复用，如 hotThreads） */
const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t ? { 'X-ESQueryStudio-Token': t } : {};
};

/* ==================== ：宿主委托凭证（X-Es-Host-Token） ==================== */
/* iframe 嵌入场景：宿主页面 postMessage 下发宿主凭证，内存态（不落 localStorage，随页面生命周期）。
 带上后每个请求先走宿主委托鉴权（DelegatingConsoleAuthorizer），认出即免内置登录。 */
let hostToken = '';
export const setHostToken = (t: string) => {
  const next = t || '';
  /* 宿主身份到达即覆盖内置会话：内置 token 留在 localStorage 时，宿主一旦撤销/停发凭证，
     旧内置 ADMIN 仍会被回落使用。清掉后只有宿主身份（拒绝即 401），不做静默升级。 */
  if (next && next !== hostToken) clearToken();
  hostToken = next;
};
export const getHostToken = () => hostToken;
const hostHeaders = (): Record<string, string> =>
  hostToken ? { 'X-Es-Host-Token': hostToken } : {};

/* ==================== ：多集群目标（X-Es-Target） ==================== */
/* 后端只对数据面（/cluster/**、/insight、/config-lab/validate）生效；控制面（鉴权/重建/连接管理）恒定宿主，全局带头无害 */
const TARGET_KEY = 'esquerystudio.target';
export const getTarget = () => localStorage.getItem(TARGET_KEY) || '';
export const setTargetId = (id: string) => {
  if (id) writeStoredRaw(localStorage, TARGET_KEY, id);
  else removeStoredRaw(localStorage, TARGET_KEY);
};
const targetHeaders = (): Record<string, string> => {
  const t = getTarget();
  return t ? { 'X-Es-Target': t } : {};
};
/* 身份/连接目录/setup 是宿主管理面：不带 X-Es-Target。换号后 localStorage 按域共享，
   上一账号的目标残留会跟着发出去——零页集身份对该连接不可见，/auth/me 与 /clusters
   会被连接可见性闸打成 CONN_FORBIDDEN（产线实报：「身份未确认」全量菜单假态+目录
   加载失败，要等兜底重置目标才自愈）。管理面与目标无关，数据面请求不受影响。 */
const MANAGEMENT_PLANE_RE = /\/(auth|clusters|setup)(\/|$)/;
/** xmigrate 专用目标覆盖：请求里的源连接与顶栏目标可能不同，空值沿用全局。 */
const xbTargetInit = (target?: string | null) =>
  target && target.trim() ? { headers: { 'X-Es-Target': target.trim() } } : undefined;

/* ==================== ：授权就绪门（iframe 嵌入形态） ====================
 连接模型用户（宿主委托）的页面门按 X-Es-Target 命中 conn:{id}:{page} 键判定——
 开屏竞态（身份 probe / 连接目录 loadConns / autoPickConnTarget 钉选三步未就绪）期间
 发出的裸请求=结构性 PAGE_DENIED（产线审计 81,572 条的两大主源之一：开屏爆发+轮询循环）。
 App.vue 在三步完成后 release 本门；未 release 前的内部请求在此等待（4s 兜底放行，
 宿主异常时最多延迟不满 4s，绝不死等）。豁免=身份/握手/连接目录自身（否则死锁）；
 独立部署（hostToken 空）恒直通零回归。 */
let authSettled: Promise<void> = Promise.resolve();
let authSettledPending = false;
export function setAuthSettled(p: Promise<void>): void {
  authSettledPending = true;
  authSettled = p.finally(() => { authSettledPending = false; });
}
const AUTH_GATE_EXEMPT = ['/auth/me', '/auth/login', '/auth/logout', '/setup/', '/clusters'];
function authGateWait(path: string): Promise<void> | null {
  if (!authSettledPending || !hostToken) return null;
  if (AUTH_GATE_EXEMPT.some(x => path.includes(x))) return null;
  /* 4s 兜底：settleAuthChain 自身也有兜底，这里是双保险（等待方视角永不超 4s） */
  return Promise.race([authSettled, new Promise<void>(r => setTimeout(r, 4000))]);
}

export class ApiError extends Error {
  status: number;
  /* 后端业务错误码透传（CONN_FORBIDDEN/LOCK_CONFLICT/ES_ERROR…）——
 纯增量可选字段，errPre 徽标与调用方特判读它；缺失 undefined，旧调用点零改动 */
  code?: string;
  /* 失败端点透传（如 "GET /internal/es/index/..."）——errPre「失败于 …」行
 消费（errMeta 读它），旧后端缺省 undefined 不显行，与 code 同为纯增量契约 */
  endpoint?: string;
  /* 403 结构化归因（后端 PAGE_DENIED/WRITE_DENIED 报文同名字段）：
 page=缺权限的页面 key、required=所需角色、denied=拒绝类型。
 此前只带一句 message，前端无法回答「缺哪个页/哪个角色/找谁开」。 */
  page?: string;
  required?: string;
  denied?: string;
  constructor(status: number, message: string, code?: string, endpoint?: string,
              page?: string, required?: string, denied?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.endpoint = endpoint;
    this.page = page;
    this.required = required;
    this.denied = denied;
  }
}

/* 请求超时兜底——fetch 原生无超时，网络黑洞（代理挂死/服务假死）会让 await 永等，
 Overview 骨架屏永挂就是这个病。默认 60s 宽松兜底（重建/快照等重操作不误伤）；
 超时抛可读 ApiError(408)，与调用方主动取消（AbortError， 轻提示路径）严格区分 */
const REQUEST_TIMEOUT_MS = 60_000;
const TIMEOUT_REASON = Symbol('esquerystudio.timeout');

/* 慢请求可观测——成功响应耗时超过该阈值经全局事件桥弹 warning。
 失败链路已有 error 通知，不重复打扰；快请求零输出 */
const SLOW_REQUEST_MS = 10_000;

/* ==================== ：原始 IO 记录环（RawIoModal 数据源，additive） ==================== */
/* request() 成功/失败全留痕：环形 30 条（读出恒新→旧）、响应原文 ~200KB 截断保护。
 纯观测旁路：记录链路全 try/catch，任何异常静默吞掉，绝不影响主流程任何路径；
 request<T> 返回值/超时/错误抛出契约零变更。消费方见 components/RawIoModal.vue
 （IndexHub/SqlConsole/Adhoc/Xmigrate 四页「原始 IO」钮，按路径子串取该页最近一条）。 */
export interface RawIoRec {
  id: number;
  ts: number;
  method: string;
  /** base+path 完整请求 URL（CTX/XB 前缀在内，last(pathSub) 按 includes 过滤） */
  url: string;
  /** 请求体原文（post/put 已序列化字符串；GET/无体=''） */
  requestBody: string;
  /** HTTP 状态；fetch 未及响应（超时/网络黑洞/调用方取消）= 0 */
  status: number;
  /** HTTP ok 且非 200+error 业务信封（与调用方拿到的成败一致） */
  ok: boolean;
  durationMs: number;
  /** 响应原文（超 200KB 截断，truncated 置位） */
  responseRaw: string;
  truncated?: boolean;
  /** 执行链打标（request init ioKind 通道透传，recordIo 第 8 参写入）——
 last(pathSub, kind) 二段过滤收口（SqlConsole 546 find 补丁退役）。打标 opt-in：
 未打标调用点该字段 undefined（零增量），kind 过滤天然跳过 */
  kind?: string;
}
const IO_RING_MAX = 30;
const IO_RAW_MAX = 200 * 1024;
const ioRing: RawIoRec[] = [];
let ioSeq = 0;

function redactIoBody(body: string): string {
  if (!body) return body;
  const scrub = (v: any): any => {
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = /password|passwd|secret|token|salt|authorization|api[_-]?key/i.test(k) ? '***' : scrub(val);
      }
      return out;
    }
    return v;
  };
  try { return JSON.stringify(scrub(JSON.parse(body))); }
  catch { return body; }
}

function recordIo(url: string, method: string, requestBody: string, status: number, ok: boolean, durationMs: number, responseRaw: string, kind?: string): void {
  try {
    const rec: RawIoRec = { id: ++ioSeq, ts: Date.now(), method, url, requestBody: redactIoBody(requestBody), status, ok, durationMs: Math.round(durationMs), responseRaw };
    if (kind) rec.kind = kind;
    if (rec.responseRaw.length > IO_RAW_MAX) { rec.responseRaw = rec.responseRaw.slice(0, IO_RAW_MAX); rec.truncated = true; }
    ioRing.push(rec);
    if (ioRing.length > IO_RING_MAX) ioRing.splice(0, ioRing.length - IO_RING_MAX);
  } catch { /* 观测旁路：记录失败静默，绝不影响主流程 */ }
}

/** 原始 IO 快查（last(路径子串) 取该页最近一条（无参=全局最近）；
 双参 last(pathSub, kind)——kind 在场时二段过滤 r.kind === kind，
 未命中回 null 不回退（不回落未打标档；SqlConsole 执行链 'sql' 收口即此语义）。
 all() 新→旧全量；get(id) 精确取。恒返回拷贝（调用方改动不串环内对象）；
 clear() 供测试/调试清环。读路径同样全 try/catch（异常回 null/[]，不炸消费方）。 */
export const ioRecorder = {
  last(pathSub?: string, kind?: string): RawIoRec | null {
    try {
      for (let i = ioRing.length - 1; i >= 0; i--) {
        const r = ioRing[i]!;
        if (!pathSub || r.url.includes(pathSub)) {
          if (kind != null && r.kind !== kind) continue;
          return { ...r };
        }
      }
      return null;
    } catch { return null; }
  },
  all(): RawIoRec[] {
    try { return ioRing.slice().reverse().map(r => ({ ...r })); }
    catch { return []; }
  },
  get(id: number): RawIoRec | null {
    try { const r = ioRing.find(x => x.id === id); return r ? { ...r } : null; }
    catch { return null; }
  },
  clear(): void {
    try { ioRing.length = 0; } catch { /* noop */ }
  },
};

/** 组合信号：超时 + 调用方取消二合一；return.done 必须在 finally 里调，避免计时器/监听泄漏 */
function timeoutSignal(callerSignal: AbortSignal | null | undefined, ms: number) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(TIMEOUT_REASON), ms);
  const onAbort = () => ctl.abort(callerSignal!.reason);
  if (callerSignal) {
    if (callerSignal.aborted) ctl.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctl.signal,
    isTimeout: () => ctl.signal.aborted && ctl.signal.reason === TIMEOUT_REASON,
    done: () => { clearTimeout(timer); callerSignal?.removeEventListener('abort', onAbort); },
  };
}

/* ==================== ：写请求客户端硬门 ====================
 后端拦截器是安全边界；这里再加一层「未授权请求不发车」——视图漏判/深链/脚本直调
 api.post 时，凭当前身份与目标先判写权，拒绝则抛 403 且不产生任何网络请求。
 守卫由 auth store 注册（main.ts 装配），api 层不反依赖 pinia（避免成环）。 */
export type ApiWriteGuard = (method: string, path: string, targetId: string) => boolean;
let apiWriteGuard: ApiWriteGuard | null = null;
export const setApiWriteGuard = (fn: ApiWriteGuard | null) => { apiWriteGuard = fn; };

async function request<T = any>(path: string, init?: RequestInit & { timeoutMs?: number; ioKind?: string }, base: string = EP): Promise<T> {
  /* 授权就绪门——宿主令牌在途且身份/目标未 settle 时先等（豁免端点与独立部署直通，
 token 快照必须在门后取：等待期间握手可能送达新凭证） */
  const gate = authGateWait(path);
  if (gate) await gate;
  const tokenAtRequest = getToken();
  const hostTokenAtRequest = hostToken;
  /* 慢请求计时起点——fetch 全程（含排队/响应体读取） */
  const startedAt = performance.now();
  /* init.headers 必须并入组合头而非整体覆盖——此前 ...init 在 headers 之后展开，
 显式带头的调用（如 sqlProbe 的 X-Es-Target）会把鉴权/Content-Type 全部冲掉导致 401 */
  /* ioKind 同 timeoutMs 形态——内部消费的打标通道（recordIo 第 8 参 →
 RawIoRec.kind），在此解构剥离，不进 fetch init（公开 fetch 语义零增量） */
  const { headers: extraHeaders, signal: callerSignal, timeoutMs, ioKind, ...restInit } = init || {};
  const ts = timeoutSignal(callerSignal, timeoutMs ?? REQUEST_TIMEOUT_MS);
  /* IO 记录前置提取（body 已由 post/put 序列化为字符串；此处只做安全转换，
 双层 try 兜底——提取抛错也只退空串，绝不给主流程新增抛点）。主记录点在响应体读出后、
 fetch 未及响应（超时/网络/取消）的记录点在其 catch。 */
  const ioMethod = (restInit.method || 'GET').toUpperCase();
  let ioBody = '';
  try {
    if (typeof restInit.body === 'string') ioBody = restInit.body;
    else if (restInit.body != null) ioBody = JSON.stringify(restInit.body) ?? String(restInit.body);
  } catch { try { ioBody = String(restInit.body); } catch { ioBody = ''; } }
  let resp: Response;
  const fetchMethod = (restInit.method || 'GET').toUpperCase();
  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json', ...authHeaders(), ...hostHeaders(),
    ...(MANAGEMENT_PLANE_RE.test(path) ? {} : targetHeaders()),
    ...((extraHeaders as Record<string, string>) || {}),
  };
  /* 写门在 fetch 前裁决：无权限时零网络请求（402/403 由后端兜底的安全边界之外，
     再做一层「请求根本没发出去」的确定性保证）。 */
  if (apiWriteGuard && fetchMethod !== 'GET' && fetchMethod !== 'HEAD' && fetchMethod !== 'OPTIONS') {
    const cleanBase = CTX && base.startsWith(CTX) ? base.slice(CTX.length) : base;
    const targetId = mergedHeaders['X-Es-Target'] || getTarget();
    if (!apiWriteGuard(fetchMethod, cleanBase + path, targetId)) {
      const message = '当前身份无权执行该写操作（请求未发出）——请确认当前页面与目标连接的写授权；如需申请，请联系管理员勾选对应页面/连接的写权限';
      /* 与后端 403 走同一条全局通道：客户端拦截同样要能回答「缺什么」。 */
      window.dispatchEvent(new CustomEvent('esquerystudio:forbidden', {
        detail: { path: cleanBase + path, method: fetchMethod, message, denied: 'CLIENT_WRITE_DENIED' },
      }));
      throw new ApiError(403, message, 'CLIENT_WRITE_DENIED');
    }
  }
  try {
    resp = await doFetch(base + path, {
      ...restInit,
      headers: mergedHeaders,
      signal: ts.signal,
    });
  } catch (e: any) {
    /* 未及响应（超时/网络黑洞/调用方取消）也留痕（status=0），观测量，
 不触碰下方既有超时/取消分流 */
    try { recordIo(base + path, ioMethod, ioBody, 0, false, performance.now() - startedAt, String(e?.message || e), ioKind); } catch { /* 观测旁路静默 */ }
    /* 超时和用户取消都以 abort 形态抛出，靠 reason 分流：超时 → 可读错误；取消 → 原样上抛（ 语义不变） */
    if (ts.isTimeout()) throw new ApiError(408, `请求超时（${((timeoutMs ?? REQUEST_TIMEOUT_MS) / 1000).toFixed(0)}s 无响应），请检查网络或服务状态后重试`);
    throw e;
  } finally {
    ts.done();
  }
  const text = await resp.text();
  let data: any = null;
  if (text) {
    /* 精度保真解析——19 位雪花 long（jobId/文档 ID）超 MAX_SAFE_INTEGER，
 原生 JSON.parse 解析瞬间尾数抹零，展示/复制/回写全链路失真 */
    try { data = parseJsonSafe(text); } catch { data = text; }
  }
  /* IO 记录主点——成功/失败全留痕，ok 语义=HTTP ok 且非 200+error 业务信封
 （与调用方拿到的成败一致）。置于业务分流之前：下方 401/409 广播、友好文案与
 ApiError 抛出路径零触碰（记录是旁路，任何异常静默吞掉） */
  /* 修正：costMs 只测一次—— 以 mockImplementationOnce 恰两桩
 performance.now 钉死计时面，记录点多取一拍会偷桩致慢请求广播失明；记录与慢广播共用同一测量 */
  const costMs = performance.now() - startedAt;
  try {
    recordIo(base + path, ioMethod, ioBody, resp.status,
      resp.ok && !(data && typeof data === 'object' && data.error === true),
      costMs, text || '', ioKind);
  } catch { /* 观测旁路静默 */ }
  if (!resp.ok) {
    // 401 且非登录接口本身 → 广播弹登录遮罩（LoginOverlay 监听）；
    // 若期间凭证已换新（内置 token 或宿主 hostToken 有一个变了），说明是旧凭证时代发出的过期请求，
    // 忽略避免把刚认出的身份又顶回遮罩（.2：iframe 握手与首次 probe 存在天然竞态）
    /* 浏览器模式的 /auth/me 是「尚未录入连接」探针：401 交给 BrowserConnect 引导，
       不是控制台登录会话失效。误触 unauthorized 会把 LoginOverlay 一起弹出来，
       首屏变成三层遮罩抢焦点（实测狂闪/不可用）。 */
    const browserSetupProbe = isBrowserMode && path.includes('/auth/me');
    if (resp.status === 401 && !path.includes('/auth/login') && !browserSetupProbe
        && getToken() === tokenAtRequest && hostToken === hostTokenAtRequest) {
      window.dispatchEvent(new CustomEvent('esquerystudio:unauthorized'));
    }
    // 控制台未绑定控制集群 → 广播弹首连向导（SetupWizard 监听）
    if (resp.status === 409 && data && data.code === 'SETUP_REQUIRED') {
      window.dispatchEvent(new CustomEvent('esquerystudio:setup-required'));
    }
    // 集群级权限隔离/档案失效的统一友好文案（后端 code 见 EsTargetInterceptor / MigrateExceptionAdvice）
    let msg = (data && data.message) || text || `HTTP ${resp.status}`;
    if (data && data.code === 'CONN_FORBIDDEN') {
      /* 优先后端精确文案（角色不足 vs 页面授权缺失两种不可见分开说，1.0.53 起后端下发）；
         旧后端无 message 时退回通用文案。 */
      msg = data.message
        || `当前角色无权访问该集群连接${data.required ? `（需 ${data.required} 及以上）` : ''}，请联系管理员调整连接的最低角色或切换其他集群目标`;
    } else if (data && data.code === 'CONN_NOT_FOUND') {
      msg = '目标集群连接不存在或已被删除，请在顶栏切换器重新选择';
    }
    /* code 随错误透传（友好文案特判照旧读 data.code，语义不丢）；
 endpoint 同透传（errPre「失败于 …」行消费，旧后端缺省不显）；
 403 另透传 page/required：全局错误通道与调用方用它回答「缺什么、找谁」。 */
    const denied = resp.status === 403 && data && typeof data === 'object'
      ? {
          page: typeof data.page === 'string' ? data.page : undefined,
          required: typeof data.required === 'string' ? data.required : undefined,
          denied: typeof data.code === 'string' ? data.code : undefined,
        }
      : null;
    const err = new ApiError(resp.status, msg,
      data && typeof data === 'object' ? data.code : undefined,
      data && typeof data === 'object' && typeof data.endpoint === 'string' ? data.endpoint : undefined,
      denied?.page, denied?.required, denied?.denied);
    /* 403 全局广播：各视图不必再各自发明「没权限」的说法。
       轮询型读请求由 app store 的通知去重兜住；写请求被客户端硬门拦下时走同一条通道。 */
    if (resp.status === 403) {
      window.dispatchEvent(new CustomEvent('esquerystudio:forbidden', {
        detail: { path, method: fetchMethod, message: msg, ...(denied || {}) },
      }));
    }
    throw err;
  }
  if (data && typeof data === 'object' && data.error === true) {
    /* 200+error 信封同透传 code（LOCK_CONFLICT/ES_ERROR 多走此形态）； endpoint 同透传 */
    throw new ApiError(resp.status, data.message || '请求失败', data.code,
      typeof data.endpoint === 'string' ? data.endpoint : undefined);
  }
  /* 慢请求可观测——只在成功链路广播，由 app store 监听转发既有 notify
 warning 档（8s 同文去重内建）。事件桥与上方 unauthorized/setup-required 同范式：
 api 层不反依赖 pinia store（会成环），监听侧见 stores/app.ts */
  if (costMs > SLOW_REQUEST_MS) {
    window.dispatchEvent(new CustomEvent('esquerystudio:slow-request', {
      detail: { path, seconds: +(costMs / 1000).toFixed(1) },
    }));
  }
  return data as T;
}

/* init 扩展通道：timeoutMs（ 超时）+ ioKind（打标，request 内部消费不进 fetch init） */
export const get = <T = any>(path: string, base?: string, init?: RequestInit & { timeoutMs?: number; ioKind?: string }) => request<T>(path, init, base);
export const post = <T = any>(path: string, body?: any, base?: string, init?: RequestInit & { timeoutMs?: number; ioKind?: string }) =>
  request<T>(path, { ...(init || {}), method: 'POST', ...(body == null ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }, base);
export const del = <T = any>(path: string, base?: string) => request<T>(path, { method: 'DELETE' }, base);
export const put = <T = any>(path: string, body?: any, base?: string) =>
  request<T>(path, { method: 'PUT', ...(body == null ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }, base);

const q = (params: Record<string, any>) => {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) usp.set(k, String(v)); });
  return usp.toString();
};

/* ==================== ：连接档案类型（与后端 EsConnStore.masked / ConnHealthProber 对齐） ==================== */
/* 连接中心自动同步批:一轮同步报告(GET /clusters/sync、POST /clusters/sync/run,均 ADMIN) */
interface ClusterSyncReport {
  finishedAt: number; durationMs: number; trigger: string; contributorBroken: boolean;
  contributedTotal: number; created: number; updated: number; unchanged: number;
  duplicatesMerged: number; skippedConflicts: number; skipped: number;
  markedStale: number; restored: number; errors: number; notes: string[];
}
export interface ConnHealth {
  status: 'GREEN' | 'RED' | 'UNKNOWN';
  latencyMs: number | null;
  lastProbeAt: number | null;
  error: string | null;
  /** 探活顺带识别的服务端版本（如 7.10.1） */
  version?: string | null;
}
/* 监控快照落库批④:多集群监控历史读侧(服务端定时任务=唯一写入方,此处只读;键与后端落档一一对应) */
export interface MonitorRow {
  timestamp: number; connId?: string; connName?: string; env?: string;
  status?: string; latencyMs?: number; esVersion?: string; error?: string;
}
/* 集群监控历史趋势读侧(GET /monitor-metrics,scope=cluster;服务端每分钟采样,环形保留,只读)。
 * qps/indexRate 首轮未算出时缺省——前端按「非 number 剔点」消费,不当作 0 */
export interface MonitorMetricsRecord {
  timestamp: number; connId?: string; connName?: string; env?: string; scope?: string; nodeName?: string;
  status?: string; qps?: number; indexRate?: number; heapUsedPct?: number; cpuPct?: number; diskUsedPct?: number;
  nodes?: number; indices?: number; shards?: number; unassigned?: number;
  /** 主分片数（health.active_primary_shards）/失联节点数（期望−实到，>0 触发 WARN 告警事件） */
  primaryShards?: number; nodesMissing?: number;
  /** 对标阿里云线程池 Rows 写入侧+被标记删除文档（节点采样测点，force_merge 需求判定信号） */
  tpWriteActive?: number; tpWriteQueue?: number; docsDeleted?: number;
  /** IOUtil%（io_time 差分钳 0~100）+Young/Old GC 每次平均耗时 ms（Δtime÷Δcount） */
  ioUtilPct?: number; gcYoungTimeMs?: number; gcOldTimeMs?: number;
  /** 堆字节量 MB（锯齿形态，对标阿里云节点 JVM Old 区使用） */
  heapUsedMb?: number;
  /** fielddata 内存 MB（查询抖动经典根因观测） */
  fielddataMb?: number;
  /** 线程池每轮拒绝增量（write=bulk 写入队列，search=搜索队列；差分/分钟，首轮/回退省略） */
  writeRejected?: number; searchRejected?: number;
  /** 断链 RED doc 专属：拉取失败的根因消息（截断 500），色带 title/tooltip 消费 */
  error?: string;
  /** R8 GC 差分：young/old 两代每分钟 GC 次数（node doc 专属；首轮/回退缺省——前端按「非 number 剔点」消费） */
  gcYoungPerMin?: number; gcOldPerMin?: number;
  /** R9 慢查询代理指标：Δ耗时÷Δ次数（ms/次，一位小数；Δ计数≤0/缺基线缺省——前端按「非 number 剔点」消费） */
  searchLatencyMs?: number; indexingLatencyMs?: number;
  /** 探活摘要：RED 采样行的时延（多数缺省） */
  latencyMs?: number;
  /** 节点深耕：Load_1m（即时值）/磁盘带宽（KiB/s，差分）/磁盘 IOPS（次/秒，差分）——node doc 专属 */
  load1m?: number; diskReadKbS?: number; diskWriteKbS?: number; diskReadIops?: number; diskWriteIops?: number;
  /** 节点深耕：查询线程池 active/queue（即时值，node doc 专属） */
  tpSearchActive?: number; tpSearchQueue?: number;
  /** 内部传输吞吐：transport rx/tx 差分（KiB/s，node doc 专属——节点间通信量非 HTTP 流量） */
  netRxKbS?: number; netTxKbS?: number;
  /** 快照状态：SLM 累计执行/失败数 + 新增失败（首轮/回退省略，0 照落；集群 doc 专属） */
  snapshotFailed?: number; snapshotsTotal?: number; snapshotFailedDelta?: number;
  /** 集群可搜索文档总数（_cluster/stats docs.count，cluster doc 专属） */
  docsTotal?: number;
  /** Force Merge 线程池：运行/排队即时值 + 每轮拒绝增量（node doc 专属；rejected 首轮/回退省略） */
  tpForceMergeActive?: number; tpForceMergeQueue?: number; tpForceMergeRejected?: number;
  /** OS 侧内存使用率%（os.mem.used_percent，区别于 JVM heap；node doc 专属） */
  osMemUsedPct?: number;
  /** 节点剩余可用存储 MB（fs.total.available_in_bytes 换算；node doc 专属） */
  fsAvailMb?: number;
  /** ES 业务进程 CPU%（process.cpu.percent，区别于 OS 总 CPU；node doc 专属） */
  esCpuPct?: number;
}
/* R7 服务端告警读侧（GET /monitor-alerts，timestamp 降序；recovered:true=恢复事件——
 * 活跃集由 utils/monitorSeries 的 activeAlerts 单源推导，此处只描述单条形态） */
export interface MonitorAlertDoc {
  timestamp: number; connId?: string; connName?: string; env?: string;
  level: 'WARN' | 'CRIT' | 'INFO'; metric: string;
  value?: number; threshold?: number; message?: string; recovered?: boolean;
}
export interface ClusterConnView {
  id: string; name: string; scheme: string; host: string; port: number;
  username?: string; hasPassword: boolean;
  minRole?: string; connectTimeoutMs?: number | null; socketTimeoutMs?: number | null;
  health?: ConnHealth;
  /** 档案里持久化的服务端版本（探活/测试连接回写） */
  esVersion?: string | null;
  /** 环境标识 PROD/STAGING/QA/DEV（纯展示），切换器/顶栏着色警示数据源 */
  env?: string | null;
  /** 连接中心自动同步:STALE=源已失联(连接中心已无此连接,保留展示人工确认后删) */
  syncState?: string | null;
  /** 认证形态:BASIC=账密(默认)/API_KEY=password 位承载 ApiKey 秘钥(连接中心自动同步批) */
  authType?: string | null;
  createdAt?: number; updatedAt?: number;
}

/* ═══ 集群/索引 ═══ */
/* date 形态采样响应。
 forms 与 samples 是<b>两棵分开的树</b>：forms 值域恒为 number，
 故 Object.values(forms[f]).reduce((a,b)=>a+b,0) 天然正确——
 样例在结构上不可能混进计数（后端 DateFormTally 保证）。 */
interface DateFormsResp {
  index: string;
  physicalIndex: string;
  sampled: number;
  total: number;
  /** 取样口径，展示时必须一并给出（如 'random_score'） */
  sampling: string;
  dateFields: string[];
  forms: Record<string, Record<string, number>>;
  /** 仅 other / ambiguous_small 两桶，且仅在非空时出现 */
  samples: Record<string, Record<string, string[]>>;
}

/* 快照状态摘要响应形状（/cluster/snapshot/status?summary=true 分支，
 Java 侧同步交付）——进行中快照的行内进度单点：总 pct + 分片统计 + 每索引 stage 计数 */
interface SnapshotStageCounts {
  INIT: number; STARTED: number; START: number; FINALIZE: number; DONE: number; FAILURE: number;
}
interface SnapshotIndexProgress {
  index: string;
  shardsTotal: number;
  shardsDone: number;
  shardsFailed: number;
  stageCounts: SnapshotStageCounts;
}
export interface SnapshotStatusSummary {
  repository: string;
  snapshot: string;
  state: string;
  startTimeMillis: number;
  shardsStats: { total: number; done: number; failed: number };
  pct: number;
  indices: SnapshotIndexProgress[];
}

export const api = {
  clusterHealth: () => get('/cluster/health'),
  /** 启动期 Mapping 对账报告(client 模式 runner 执行后的最近一轮逐索引结果) */
  mappingReconcileReport: () => get<any>('/mapping-reconcile/report'),
  clusterIndices: () => get('/cluster/indices'),
  clusterInspect: (index: string, sampleSize = 5) => get(`/cluster/inspect?${q({ index, sampleSize })}`),
  /* date 字段实际存储形态采样。响应带 sampling 说明取样口径（random_score），
 展示时必须连同 sampled/sampling 一起给，否则读者会把有限样本当成全量结论。
 forms 值域是 number，samples 是分开的另一棵树——求和时不会把样例数组加进计数 */
  dateForms: (index: string, size = 50) => get<DateFormsResp>(`/cluster/date-forms?${q({ index, size })}`),
  /* settings 含集群默认值（include_defaults 只读透传，VIEWER 可用） */
  indexSettingsDefaults: (index: string) => get<{ status: number; body: string }>(`/cluster/index-settings-defaults?${q({ index })}`),
  overview: () => get('/overview'),
  health: () => get('/health'),
  keys: () => get('/keys'),

  /* MCP API key 管理（服务端模式；浏览器模式没有可被外部连接的 /mcp，见 BROWSER_SERVER_ONLY_ENDPOINTS） */
  mcpKeys: {
    list: () => get<any>('/mcp/keys'),
    ownerScope: (owner: string) => get<any>(`/mcp/keys/owner-scope?owner=${encodeURIComponent(owner)}`),
    create: (body: { name: string; owner?: string; role?: string; allowedTools?: string[];
      connections?: string[]; permissions?: string[]; connectionPermissions?: Record<string, string[]>;
      requestsPerMinute?: number; dailyQuota?: number; monthlyQuota?: number; expiresInDays?: number }) =>
      post<any>('/mcp/keys', body),
    update: (id: string, body: { name: string; allowedTools: string[]; connections: string[];
      permissions: string[]; connectionPermissions?: Record<string, string[]>;
      requestsPerMinute: number; dailyQuota: number; monthlyQuota: number; expiresInDays: number }) =>
      put<any>(`/mcp/keys/${encodeURIComponent(id)}`, body),
    revoke: (id: string) => post<any>(`/mcp/keys/${encodeURIComponent(id)}/revoke`),
    rotate: (id: string) => post<any>(`/mcp/keys/${encodeURIComponent(id)}/rotate`),
    secret: (id: string) => get<any>(`/mcp/keys/${encodeURIComponent(id)}/secret`),
    calls: (keyId?: string, limit = 500) => get<any>(`/mcp/keys/calls?limit=${limit}`
      + (keyId ? `&keyId=${encodeURIComponent(keyId)}` : '')),
  },

  /* 多集群连接管理（永远作用于宿主，列表脱敏无密码）
 档案增 minRole（最低可见角色）/独立超时；health 为最近探活结果；probe 手动即时探活 */
  clustersList: () => get<ClusterConnView[]>('/clusters'),
  clustersSave: (c: { id?: string; name: string; url: string; username?: string; password?: string;
    minRole?: string; connectTimeoutMs?: number | null; socketTimeoutMs?: number | null; env?: string;
    authType?: string }) => post('/clusters/save', c),
  clustersDelete: (id: string) => post(`/clusters/delete?${q({ id })}`),
  clustersTest: (c: { id?: string; url?: string; username?: string; password?: string;
    authType?: string }) => post('/clusters/test', c),
  clustersProbe: (id: string) => post<ConnHealth>(`/clusters/${encodeURIComponent(id)}/probe`),
  /* 连接中心自动同步:状态报告 / 手动触发一轮(均 ADMIN;引擎未装配时 GET 回空) */
  clustersSyncStatus: () => get<ClusterSyncReport | null>('/clusters/sync'),
  clustersSyncRun: () => post<ClusterSyncReport>('/clusters/sync/run'),

  /* R7 服务端告警（GET /monitor-alerts，VIEWER 只读；timestamp 降序，recovered:true=恢复事件） */
  /* 最新 Top 索引快照（对标阿里云 Index 索引行）：{index,qps,idxRate,storeMb}×≤8 */
  /* 后端 top-indexes 按集群实名过滤（connName），不是连接 ID——传错参数会退化成全集群 */
  monitorTopIndexes: (connName?: string, limit?: number) => get<{ records: any[] }>(`/monitor-metrics/top-indexes?${q({ connName, limit })}`),
  monitorAlerts: (size = 50, fromMs?: number, toMs?: number) => get<{ records: MonitorAlertDoc[] }>(`/monitor-alerts?${q({ size, fromMs, toMs })}`),

  /* 集群监控历史趋势(GET /monitor-metrics,VIEWER 只读;scope=cluster 多集群叠加;
 ? 分隔符显式——q() 不带前导 ?,缺失曾致 404 monitor-historyfromMs=...)
 interval 可选降采样档(如 '5m'):带上=ES date_histogram 降采样桶(timestamp 升序/桶距恒定/
 断档时段为空值字段——前端剔点+断档断线消费),缺省=原始逐点记录(现状行为不变) */
  monitorMetrics: (p: { connId?: string; connName?: string; scope?: string; fromMs?: number; toMs?: number;
    size?: number; from?: number; interval?: string; agg?: string }) => get<{ records: MonitorMetricsRecord[] }>(`/monitor-metrics?${q(p)}`),

  /* R6 环形治理用量(只读):审计+监控两族 store.size 合计/分族/上限——30GB 口径看得见 */
  ringUsage: () => get<{ auditPrefix: string; monitorPrefix: string; auditBytes: number;
    monitorBytes: number; totalBytes: number; capBytes: number }>('/ring-usage'),

  /* 监控快照落库批④:多集群监控历史(GET /monitor-history,VIEWER 只读;overview 页 apiPrefixes) */
  monitorHistory: (p: { connId?: string; status?: string; fromMs?: number; toMs?: number;
    size?: number; from?: number }) => get<{ records: MonitorRow[] }>(`/monitor-history?${q(p)}`),

  /* 查询（可选 AbortSignal——长查询可取消，不再只能干等） */
  clusterQuery: (index: string, dsl: string, size = 20, signal?: AbortSignal, req?: Record<string, string>) => post(`/cluster/query?${q({ index, size, ...(req || {}) })}`, dsl, undefined, signal ? { signal } : undefined),
  profile: (index: string, dsl: string, signal?: AbortSignal, req?: Record<string, string>) => post(`/cluster/profile?${q({ index, ...(req || {}) })}`, dsl, undefined, signal ? { signal } : undefined),
  count: (index: string, dsl: string) => post(`/cluster/count?${q({ index })}`, dsl),
  raw: (method: string, path: string, body?: string, signal?: AbortSignal) => post('/cluster/raw', { method, path, body: body || '' }, undefined, signal ? { signal } : undefined),
  /* DevTools 独立执行端点（devtools 页写键或 rest 写键；执行内核/守卫与 raw 同源） */
  devtoolsExecute: (method: string, path: string, body?: string, signal?: AbortSignal) => post('/cluster/devtools/execute', { method, path, body: body || '' }, undefined, signal ? { signal } : undefined),
  sql: (sql: string, signal?: AbortSignal) => post('/cluster/sql', sql, undefined, signal ? { signal } : undefined),

  /* 文档操作 */
  deleteById: (index: string, id: string) => post(`/cluster/delete-by-id?${q({ index, id })}`),
  updateDocument: (index: string, id: string, doc: string) => post(`/cluster/update-document?${q({ index, id })}`, doc),
  updatePartial: (index: string, id: string, partial: string) => post(`/cluster/update-partial?${q({ index, id })}`, partial),

  /* 索引管理 */
  putMapping: (index: string, mapping: string) => post(`/cluster/put-mapping?${q({ index })}`, mapping),
  updateSettings: (index: string, settings: string) => post(`/cluster/update-settings?${q({ index })}`, settings),
  createIndex: (index: string, settings?: string, mapping?: string) => post(`/cluster/create-index?${q({ index })}`, { settings, mapping }),
  deleteIndex: (index: string) => post(`/cluster/delete-index?${q({ index })}`),
  forceMerge: (indexKey: string, maxSegments = 1) => post(`/force-merge?${q({ indexKey, maxSegments })}`),
  /* 任意集群索引/别名的 force_merge（受管索引仍走上面的 forceMerge）。重操作，调用点须二次确认。 */
  clusterForceMerge: (index: string, maxSegments = 1) => post(`/cluster/force-merge?${q({ index, maxSegments })}`),
  updateReplicas: (indexKey: string, count: number) => post(`/replicas?${q({ indexKey, count })}`),

  /* 重建作业（-13：SPI 驱动的编排端点整条退役，仅存只读状态与手工触发） */
  status: (indexKey: string) => get(`/status?${q({ indexKey })}`),
  rebuildEmpty: (indexKey: string, triggerReload = false) => post(`/rebuild-empty?${q({ indexKey, triggerReload })}`),
  progress: (taskId: string) => get(`/progress?${q({ taskId })}`),

  /* 系统索引 */
  systemInspect: (which: string) => get(`/system-inspect?${q({ which })}`),
  systemQuery: (which: string, dsl: string, size = 20) => post(`/system-query?${q({ which, size })}`, dsl),

  /* 集群运维观测（tasks / allocation / hot threads / pending / nodes stats / analyze / aliases）*/
  clusterTasks: (actions?: string, detailed = true) => get(`/cluster/tasks?${q({ actions, detailed })}`),
  cancelTask: (taskId: string) => post(`/cluster/tasks/cancel?${q({ taskId })}`),
  allocationExplain: (body?: any) => post('/cluster/allocation-explain', body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))),
  /* 裸 fetch 补 recordIo 两点式（545 记录环覆盖 request() 全量端点后，
 hotThreads 是最后漏网）——响应读出后记真实 status（成功/HTTP 失败同点）；
 fetch 未及响应（网络黑洞/中断）在拒绝分支记 status=0。then(onOk,onFail) 双参形态保证
 onOk 内抛出的 ApiError 不进 onFail（不重复记账）；返回原文串/ApiError/原样上抛契约逐字不动 */
  hotThreads: (threads = 3, interval = '500ms', type = 'cpu', nodeId?: string) => {
    const url = `${EP}/cluster/hot-threads?${q({ threads, interval, type, nodeId })}`;
    const startedAt = performance.now();
    const send: typeof fetch = transportFetch;
    return send(url, { headers: { ...authHeaders(), ...hostHeaders(), ...targetHeaders() } }).then(async r => {
      const txt = await r.text();
      try { recordIo(url, 'GET', '', r.status, r.ok, performance.now() - startedAt, txt); } catch { /* 观测旁路静默 */ }
      if (!r.ok) throw new ApiError(r.status, txt || `HTTP ${r.status}`);
      return txt;
    }, (e: any) => {
      try { recordIo(url, 'GET', '', 0, false, performance.now() - startedAt, String(e?.message || e)); } catch { /* 观测旁路静默 */ }
      throw e;
    });
  },
  pendingTasks: () => get('/cluster/pending-tasks'),
  nodesStats: () => get<any[]>('/cluster/nodes-stats'),
  analyze: (index: string | undefined, body: any) =>
    post(`/cluster/analyze?${q({ index })}`, typeof body === 'string' ? body : JSON.stringify(body)),
  aliases: () => get<any[]>('/cluster/aliases'),

  /* 平台/分布式能力（templates / snapshot / shards distribution） */
  templates: () => get<{ index_templates: any[]; component_templates: any[]; legacy?: boolean }>('/cluster/templates'),
  putTemplate: (name: string, kind: 'index' | 'component', body: string) =>
    post(`/cluster/templates/put?${q({ name, kind })}`, body),
  deleteTemplate: (name: string, kind: 'index' | 'component') =>
    post(`/cluster/templates/delete?${q({ name, kind })}`),
  snapshotRepos: () => get<any[]>('/cluster/snapshot/repos'),
  snapshotList: (repo: string) => get<any[]>(`/cluster/snapshot/list?${q({ repo })}`),
  snapshotCreate: (repo: string, name: string, body?: string) =>
    post(`/cluster/snapshot/create?${q({ repo, name })}`, body),
  snapshotRestore: (repo: string, name: string, body?: string) =>
    post(`/cluster/snapshot/restore?${q({ repo, name })}`, body),
  snapshotDelete: (repo: string, name: string) =>
    del(`/cluster/snapshot/delete?${q({ repo, name })}`),
  shards: (index?: string) => get<any[]>(`/cluster/shards?${q({ index })}`),

  /* 深度产品化 - 搜索沙盒 / 热更新 setting / reroute / ILM */
  searchDsl: (index: string | undefined, body: string, opts: { explain?: boolean; profile?: boolean } = {}, signal?: AbortSignal) =>
    post(`/cluster/search-dsl?${q({ index, explain: opts.explain, profile: opts.profile })}`, body, undefined, signal ? { signal } : undefined),
  indexSettings: (index: string) => get<any>(`/cluster/index-settings?${q({ index })}`),
  updateIndexSettings: (index: string, body: string) =>
    post(`/cluster/index-settings/update?${q({ index })}`, body),
  reroute: (body: string, opts: { dryRun?: boolean; explain?: boolean; retryFailed?: boolean } = {}) =>
    post(`/cluster/reroute?${q({ dryRun: opts.dryRun, explain: opts.explain ?? true, retryFailed: opts.retryFailed })}`, body),
  /* 诊断页专用：固定 retry_failed=true，不接受任意 reroute commands。 */
  rerouteRetryFailed: () => post('/cluster/reroute/retry-failed', undefined),
  ilmPolicies: () => get<any[]>('/cluster/ilm/policies'),
  ilmPolicyPut: (name: string, body: string) => put(`/cluster/ilm/policy?${q({ name })}`, body),
  ilmPolicyDelete: (name: string) => del(`/cluster/ilm/policy?${q({ name })}`),
  ilmExplain: (index: string) => get<any>(`/cluster/ilm/explain?${q({ index })}`),

  /* 集群设置 / 任务详情 / Snapshot Status / Reindex Preview */
  clusterSettings: () => get<any>('/cluster/settings'),
  putClusterSettings: (body: string) => post('/cluster/settings/put', body),
  snapshotStatus: (repo?: string, name?: string) => get<any>(`/cluster/snapshot/status?${q({ repo, name })}`),
  /* 同端点 summary=true 分支（SnapshotStatusSummary 契约见上）——
 快照列表对 IN_PROGRESS 行的行内进度数据源；既有 snapshotStatus 行为不动 */
  snapshotStatusSummary: (repo: string, name: string) =>
    get<SnapshotStatusSummary>(`/cluster/snapshot/status?${q({ repo, name, summary: true })}`),
  taskDetail: (taskId: string) => get<any>(`/cluster/task-detail?${q({ taskId })}`),
  reindexPreview: (source: string, query?: string, signal?: AbortSignal) => post<any>(`/cluster/reindex-preview?${q({ source })}`, query, undefined, signal ? { signal } : undefined),

  /* 一键体检 */
  healthReport: () => get<any>('/cluster/health-report'),

  /* 分布式运维 - SLM / Watcher / Remote Clusters */
  slmPolicies: () => get<any>('/cluster/slm/policies'),
  slmExecute: (policyId: string) => post<any>(`/cluster/slm/execute?${q({ policyId })}`, undefined),
  slmStatus: () => get<any>('/cluster/slm/status'),
  watcherList: () => get<any>('/cluster/watcher'),
  remoteClusters: () => get<any>('/cluster/remote-clusters'),

  /* ➕：高级 Reindex — 自定义目标集群 / 自由 body / 全参数开放 */
  reindexAdvanced: (body: string, opts: {
    slices?: string; refresh?: string; waitForCompletion?: string;
    requestsPerSecond?: string; scroll?: string; timeout?: string; waitForActiveShards?: string;
  } = {}) => post<any>(`/cluster/reindex-advanced?${q(opts as any)}`, body),

  /* 分布式自定义 - 批量编辑 / SQL / 文档直编 */
  updateByQuery: (index: string, body: string, opts: {
    conflicts?: string; slices?: string; refresh?: string; waitForCompletion?: string;
    requestsPerSecond?: string; scroll?: string; timeout?: string; waitForActiveShards?: string; maxDocs?: string;
  } = {}) => post<any>(`/cluster/update-by-query?${q({ index, ...opts } as any)}`, body),
  deleteByQuery: (index: string, body: string, opts: {
    conflicts?: string; slices?: string; refresh?: string; waitForCompletion?: string;
    requestsPerSecond?: string; scroll?: string; timeout?: string; maxDocs?: string;
  } = {}) => post<any>(`/cluster/delete-by-query?${q({ index, ...opts } as any)}`, body),
  bulk: (ndjson: string, opts: {
    index?: string; refresh?: string; pipeline?: string; timeout?: string; waitForActiveShards?: string;
  } = {}) => post<any>(`/cluster/bulk?${q(opts as any)}`, ndjson),
  /* 'sql' 打标（ioKind 通道）——SqlConsole 执行链（query/lenient/cursor/close）
 落账 kind='sql'，供宿主 ioRecorder.last('/cluster/sql/', 'sql') 双参收口（SqlConsole 546
 all().find 补丁退役）；translate 未打标=天然排除（546 排 translate 语义等价）。其余调用点
 本次只开通道不打标（clusterQuery 等，避免面铺开，消费侧按需补）。 */
  sqlJson: (body: string, signal?: AbortSignal) => post<any>('/cluster/sql/query', body, undefined, { ...(signal ? { signal } : undefined), ioKind: 'sql' }),
  sqlTranslate: (body: string) => post<any>('/cluster/sql/translate', body),
  sqlCursor: (cursor: string, timeZone?: string, columnar?: boolean) => post<any>(`/cluster/sql/cursor?${q({ cursor, timeZone, columnar })}`, undefined, undefined, { ioKind: 'sql' }),
  sqlClose: (cursor: string) => post<any>(`/cluster/sql/close?${q({ cursor })}`, undefined, undefined, { ioKind: 'sql' }),
  getDoc: (index: string, id: string) => get<any>(`/cluster/doc?${q({ index, id })}`),
  putDoc: (index: string, id: string, body: string, refresh?: string) =>
    post<any>(`/cluster/doc?${q({ index, id, refresh })}`, body),
  updateDoc: (index: string, id: string, body: string, refresh?: string) =>
    post<any>(`/cluster/doc/update?${q({ index, id, refresh })}`, body),

  /* 深度产品化 —— painless / scripts / rollover / ILM ops / nodes stats brief */
  painlessExecute: (body: string) => post<any>('/cluster/painless/execute', body),
  listStoredScripts: () => get<any>('/cluster/scripts'),
  putStoredScript: (id: string, body: string) => post<any>(`/cluster/scripts/put?${q({ id })}`, body),
  deleteStoredScript: (id: string) => post<any>(`/cluster/scripts/delete?${q({ id })}`),
  rolloverAlias: (alias: string, body?: string, dryRun = false) =>
    post<any>(`/cluster/rollover?${q({ alias, dryRun })}`, body),
  ilmMove: (index: string, body: string) => post<any>(`/cluster/ilm/move?${q({ index })}`, body),
  ilmStart: () => post<any>('/cluster/ilm/start', undefined),
  ilmStop: () => post<any>('/cluster/ilm/stop', undefined),
  ilmStatus: () => get<any>('/cluster/ilm/status'),
  nodesStatsBrief: () => get<any[]>('/cluster/nodes-stats-brief'),

  /* 查询能力全通道 Query Bridge —— SQL 宽容 / Lucene / PIT / schema 探测 */
  sqlLenient: (body: string, signal?: AbortSignal) => post<any>('/cluster/sql/lenient', body, undefined, { ...(signal ? { signal } : undefined), ioKind: 'sql' }),
  /* SQL 能力探测（显式指定 target 头，不跟随全局切换器）——降级面板「找可用集群」用 */
  sqlProbe: (targetId: string) => request<any>('/cluster/sql/lenient', {
    method: 'POST', body: JSON.stringify({ query: 'SELECT 1', fetch_size: 1 }),
    headers: targetId ? { 'X-Es-Target': targetId } : { 'X-Es-Target': 'host' },
  }),
  luceneSearch: (index: string, qs: string, size = 100, from = 0, sortField?: string, sortOrder?: string, signal?: AbortSignal) =>
    get<any>(`/cluster/lucene-search?${q({ index, q: qs, size, from, sortField, sortOrder })}`, undefined, signal ? { signal } : undefined),
  pitOpen: (index: string, keepAlive = '5m') =>
    post<any>(`/cluster/pit/open?${q({ index, keepAlive })}`, undefined),
  pitSearch: (body: string) => post<any>('/cluster/pit/search', body),
  pitClose: (pitId: string) => post<any>(`/cluster/pit/close?${q({ pitId })}`, undefined),
  resolveSchema: (index: string) => get<any>(`/cluster/resolve-schema?${q({ index })}`),

  /* 索引运维中枢 —— mapping / analysis / synonyms / plugins */
  mappingDetail:      (index: string) => get<any>(`/cluster/mapping-detail?${q({ index })}`),
  mappingPut:         (index: string, body: string) => post<any>(`/cluster/mapping-put?${q({ index })}`, body),
  analysisSettings:   (index: string) => get<any>(`/cluster/analysis-settings?${q({ index })}`),
  analysisUpdate:     (index: string, body: string) => post<any>(`/cluster/analysis-update?${q({ index })}`, body),
  analyzeText:        (index: string | undefined, body: string) => post<any>(`/cluster/analyze?${q({ index })}`, body),
  reloadAnalyzers:    (index: string) => post<any>(`/cluster/reload-analyzers?${q({ index })}`, undefined),
  pluginsMatrix:      () => get<any>('/cluster/plugins'),
  synonymsUpsert:     (index: string, filter: string, expand: boolean, entries: string[]) =>
                        post<any>(`/cluster/synonyms-upsert?${q({ index, filter, expand })}`, JSON.stringify(entries)),

  /* 相关性打分实验室 —— explain / validate / termvectors / search 透传 */
  searchRaw:          (index: string, body: string) => post<any>(`/cluster/search-raw?${q({ index })}`, body),
  explainDoc:         (index: string, id: string, body: string) => post<any>(`/cluster/explain-doc?${q({ index, id })}`, body),
  validateQuery:      (index: string, body: string) => post<any>(`/cluster/validate-query?${q({ index })}`, body),
  termVectors:        (index: string, id: string, fields?: string) => get<any>(`/cluster/term-vectors?${q({ index, id, fields })}`),

/* 搜索模板中心 + 别名管控台 —— render/search template · _aliases 原子操作 */
  renderTemplate:     (body: string) => post<any>('/cluster/render-template', body),
  searchTemplate:     (index: string, body: string) => post<any>(`/cluster/search-template?${q({ index })}`, body),
  aliasActions:       (body: string) => post<any>('/cluster/alias-actions', body),

  /* 控制台鉴权 —— 登录/自助/用户管理/操作审计 */
  auth: {
    login: (username: string, password: string) => post<any>('/auth/login', { username, password }),
    /* 登出让服务端吊销当前令牌（尽力而为：调用方吞错，不阻塞本地登出） */
    logout: () => post<any>('/auth/logout'),
    me: () => get<any>('/auth/me'),
    /* 我的权限面：当前身份 × 目标连接的逐页读/写判定 + raw 档 + 共享写档（后端判定与拦截器同源） */
    permissions: (target?: string) => get<any>(`/auth/permissions?${q({ target })}`),
    changePassword: (oldPassword: string, newPassword: string) =>
      post<any>('/auth/change-password', { oldPassword, newPassword }),
    users: () => get<any[]>('/auth/users'),
    upsertUser: (username: string, password: string | undefined, role: string) =>
      post<any>('/auth/users/upsert', { username, password, role }),
    deleteUser: (username: string) => post<any>(`/auth/users/delete?${q({ username })}`),
    /* since=毫秒 epoch 时间范围下推（服务端 range 过滤,可查全量历史）。
 R9 全栈优化轮：connName 集群筛选下推（后端 16 参端点；缺省省略不过滤）。
 uriPrefix 前缀下推补通（ 前端输入挂了但通道缺失的死输入接活） */
    opsAudit: (username?: string, action?: string, size = 100, from = 0, since?: number, connName?: string, uriPrefix?: string, minCostMs?: number, fromMs?: number, toMs?: number) =>
      get<any>(`/auth/ops-audit?${q({ username, action, size, from, since, connName, uriPrefix, minCostMs, fromMs, toMs })}`),
    /* 自助流水——username 服务端强制=当前身份（VIEWER+），非审计角色看「我做了什么」 */
    /* 集群维度下推（观察口径按集群）——自助面也可按集群过滤 */
    opsAuditMine: (action?: string, size = 50, from = 0, since?: number, connName?: string) =>
      get<any>(`/auth/ops-audit/mine?${q({ action, size, from, since, connName })}`),
    /* 值建议：审计索引 terms agg（动作/集群真实出现值+计数，失败回空=回落硬编码词表）。
 users 维度（ by_user 聚合）；：uris 维度（by_uri 真实 Top URI，供前缀筛选兜建议） */
    auditFacets: () => get<{ actions: { key: string; count?: number }[]; conns: { key: string; count?: number }[]; users: { key: string; count?: number }[]; uris: { key: string; count?: number }[] }>('/auth/audit-facets'),
  },

  /* 控制集群首连向导 —— status 免鉴权，test/apply 仅未绑定开放，rebind 走 ADMIN 高危 */
  setup: {
    status: () => get<{ bound: boolean; mode: string; endpoint: string | null; appName: string; hostVisible: boolean; authEnabled?: boolean; builtinLogin?: boolean; setupTokenRequired?: boolean }>('/setup/status'),
    /* 可选首连令牌：配置 esquerystudio.elasticsearch.console.setup-token 后未绑定窗口必须携带（防匿名绑定）。 */
    test: (c: { url: string; username?: string; password?: string; authType?: 'BASIC' | 'API_KEY' }, setupToken?: string) =>
      post<any>('/setup/test', c, undefined, setupToken ? { headers: { 'X-Setup-Token': setupToken } } : undefined),
    apply: (c: { url: string; username?: string; password?: string }, setupToken?: string) =>
      post<any>('/setup/apply', c, undefined, setupToken ? { headers: { 'X-Setup-Token': setupToken } } : undefined),
    rebind: (c: { url: string; username?: string; password?: string }, setupToken?: string) =>
      post<any>('/setup/rebind', c, undefined, setupToken ? { headers: { 'X-Setup-Token': setupToken } } : undefined),
  },

  /* Adhoc 托管重建（无 provider，作用于任意逻辑索引名） */
  adhoc: {
    prepare: (index: string) => get<any>(`/adhoc-rebuild/prepare?${q({ index })}`),
    start: (req: any) => post<any>('/adhoc-rebuild/start', req),
    status: (jobId: string) => get<any>(`/adhoc-rebuild/status?${q({ jobId })}`),
    abort: (jobId: string) => post<any>(`/adhoc-rebuild/abort?${q({ jobId })}`),
    /* 人工放行切换门（仅对 pauseBeforeSwitch=true 的作业有效，见 InternalAdhocRebuildController:63） */
    confirmSwitch: (jobId: string) => post<any>(`/adhoc-rebuild/confirm-switch?${q({ jobId })}`),
    jobs: () => get<any[]>('/adhoc-rebuild/jobs'),
  },

  /* 配置实验室 —— settings/mapping 三层校验（L1 Lint / L2 Dry-run / L3 Advisor）+ 配置漂移检测 */
  configLab: {
    validate: (settings: string | undefined, mapping: string | undefined, dryRun: boolean) =>
      post<any>('/config-lab/validate', { settings, mapping, dryRun }),
    driftKeys: () => get<any[]>('/config-lab/drift/keys'),
    drift: (indexKey: string) => get<any>(`/config-lab/drift?${q({ indexKey })}`),
    resetBaseline: (indexKey: string) => post<any>(`/config-lab/drift-reset?${q({ indexKey })}`),
  },

  /* 现场内嵌智能 + 护栏动作协议（estimate→dry-run→confirmToken→execute→回执） */
  insight: {
    settingsImpact: (index: string, changes: Record<string, any>) =>
      post<any>('/insight/settings-impact', { index, changes }),
    estimate: (actionId: string, params: any) =>
      post<any>(`/insight/actions/${actionId}/estimate`, params),
    dryRun: (actionId: string, params: any) =>
      post<any>(`/insight/actions/${actionId}/dry-run`, params),
    execute: (actionId: string, params: any, confirmToken: string) =>
      post<any>(`/insight/actions/${actionId}/execute`, { params, confirmToken }),
  },

  /* 跨集群迁移（XB 前缀）——对齐 CrossClusterMigrateController
 connId/srcConnId 引用已存连接档案（服务端取密，明文不经前端；角色低于档案 minRole 回 403） */
  xb: {
    /* 迁移端点按源连接判定页面写键：显式携带 X-Es-Target=源连接档案，
       不能沿用顶栏目标（源≠顶栏时会被页面门误拒）。 */
    jobs: (limit = 20, target?: string) => get(`/jobs?${q({ limit })}`, XB, xbTargetInit(target)),
    /* 目标索引补全专用：迁移写入端（宿主）索引清单——恒宿主控制面，别用跟随 X-Es-Target 的 clusterIndices */
    destIndices: () => get('/dest-indices', XB, xbTargetInit('host')),
    progress: (jobId: string, target?: string) => get(`/progress?${q({ jobId })}`, XB, xbTargetInit(target)),
    start: (req: any, target?: string) => post('/start', req, XB, xbTargetInit(target)),
    preflight: (req: any, target?: string) => post('/preflight', req, XB, xbTargetInit(target)),
    connectCheck: (conn: any, connId?: string) =>
      post(connId ? `/connect-check?${q({ connId })}` : '/connect-check', conn ?? {}, XB, xbTargetInit(connId)),
    resolvePreview: (conn: any) => post('/resolve-preview', conn, XB),
    fetchConfig: (conn: any, sourceIndex: string, connId?: string) =>
      post(`/fetch-config?${q({ sourceIndex, connId })}`, conn ?? {}, XB, xbTargetInit(connId)),
    resume: (jobId: string, conn: any, connId?: string) =>
      post(`/resume?${q({ jobId, connId })}`, conn ?? {}, XB, xbTargetInit(connId)),
    abort: (jobId: string, target?: string) => post(`/abort?${q({ jobId })}`, undefined, XB, xbTargetInit(target)),
  },
};
