import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../../api';
import { useAuthStore, matchReadonlyKeyword } from '../auth';

/* probe 代际守卫：并发探测乱序完成时只认最新一代。
   防的失败模式——iframe 握手场景无凭证首探的 401 晚于宿主 token 重探的 200 回来，
   旧代 catch 把 me 清回 null，grantedPages 随之退回 null（未启用=全放行），授权静默失守。 */

type Me = { username: string; role: string; fallback: boolean };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let meSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
  meSpy = vi.spyOn(api.auth, 'me');
});

afterEach(() => {
  meSpy.mockRestore();
});

describe('matchReadonlyKeyword 段边界匹配（988：与后端 isReadonlyPost 同源）', () => {
  it('段精确/段前缀/query 串照旧命中', () => {
    expect(matchReadonlyKeyword('/internal/es/index/cluster/query', '/cluster/query')).toBe(true);
    expect(matchReadonlyKeyword('/internal/es/index/cluster/sql', '/cluster/sql')).toBe(true);
    expect(matchReadonlyKeyword('/internal/es/index/cluster/sql/close', '/cluster/sql')).toBe(true);
    expect(matchReadonlyKeyword('/internal/es/index/cluster/pit/open', '/cluster/pit/')).toBe(true);
    expect(matchReadonlyKeyword('/internal/es/index/cluster/count?a=b', '/cluster/count')).toBe(true);
  });
  it('前缀内新写形态不被 includes 静默认成只读', () => {
    expect(matchReadonlyKeyword('/internal/es/index/cluster/counter-reset', '/cluster/count')).toBe(false);
    expect(matchReadonlyKeyword('/internal/es/index/cluster/counterX', '/cluster/count')).toBe(false);
    expect(matchReadonlyKeyword('/internal/es/index/cluster/query-admin', '/cluster/query')).toBe(false);
  });
});

describe('auth.probe 代际守卫', () => {
  it('旧代 401 晚于新代 200 回来：已认出身份不被清回 null', async () => {
    const slow = deferred<Me>(); // 旧代（先发、慢回）
    const fast = deferred<Me>(); // 新代（后发、先回）
    meSpy.mockImplementationOnce(() => slow.promise as any)
         .mockImplementationOnce(() => fast.promise as any);
    const auth = useAuthStore();
    const p1 = auth.probe();
    const p2 = auth.probe();

    fast.resolve({ username: 'frank', role: 'ADMIN', fallback: false });
    await p2;
    expect(auth.me?.username).toBe('frank');

    slow.reject(new Error('401'));
    await p1;
    expect(auth.me?.username).toBe('frank'); // 旧代结果被丢弃，身份保留
    expect(auth.probed).toBe(true);
  });

  it('旧代 200 晚于新代 200 回来：最新一代身份获胜（运行期换发场景）', async () => {
    const slow = deferred<Me>();
    const fast = deferred<Me>();
    meSpy.mockImplementationOnce(() => slow.promise as any)
         .mockImplementationOnce(() => fast.promise as any);
    const auth = useAuthStore();
    const p1 = auth.probe();
    const p2 = auth.probe();

    fast.resolve({ username: 'new-token-user', role: 'OPERATOR', fallback: false });
    await p2;
    slow.resolve({ username: 'stale-user', role: 'VIEWER', fallback: true });
    await p1;
    expect(auth.me?.username).toBe('new-token-user');
  });

  it('单代正常路径：401 清身份且 probed 落位', async () => {
    meSpy.mockRejectedValue(new Error('401'));
    const auth = useAuthStore();
    await auth.probe();
    expect(auth.me).toBeNull();
    expect(auth.probed).toBe(true);
  });

  it('认出身份即收遮罩（重探自愈语义不变）', async () => {
    meSpy.mockResolvedValue({ username: 'a', role: 'VIEWER', fallback: false } as any);
    const auth = useAuthStore();
    auth.showLogin = true;
    await auth.probe();
    expect(auth.me?.username).toBe('a');
    expect(auth.showLogin).toBe(false);
  });

  /* 批次 983：宿主运行期换发 token 时，旧 grantedPages 不得继续给写门放行。 */
  it('invalidateIdentity 立即关闭旧授权的写门', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'writer', role: 'OPERATOR', fallback: false, delegated: true,
      grantedPages: ['conn:c1:w:devtools'],
    } as any;
    expect(auth.canEmitWrite('POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(true);
    auth.invalidateIdentity();
    expect(auth.me).toBeNull();
    expect(auth.canEmitWrite('POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(false);
  });

  it('MCP key 自助管理只需 DevTools 读授权，不被普通写门拦截', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'zhangfeixiang', role: 'VIEWER', fallback: false, delegated: true,
      grantedPages: ['conn:c1:devtools'],
    } as any;
    expect(auth.canEmitWrite('POST', '/internal/es/index/mcp/keys', 'c1')).toBe(true);
    expect(auth.canEmitWrite('PUT', '/internal/es/index/mcp/keys/k1', 'c1')).toBe(true);
    auth.me = {
      username: 'no-devtools', role: 'VIEWER', fallback: false, delegated: true,
      grantedPages: ['conn:c1:search'],
    } as any;
    expect(auth.canEmitWrite('POST', '/internal/es/index/mcp/keys', 'c1')).toBe(false);
  });

  it('requireLogin 撤掉旧身份，遮罩背后不能再发写', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'writer', role: 'OPERATOR', fallback: false, delegated: true,
      grantedPages: ['conn:c1:w:devtools'],
    } as any;
    auth.requireLogin();
    expect(auth.me).toBeNull();
    expect(auth.canEmitWrite('POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(false);
  });

  /* 批次 983：同一标签页换人登录时，上一用户的请求草稿/历史不得被新用户看到。 */
  /* 批次 984：host-scope 审计在连接目标下仍可见（后端 pageScope 同口径，行级只给 host 事件）。 */
  it('host security 键在连接目标下仍可读审计页与端点', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'auditor', role: 'AUDIT_OP', fallback: false, delegated: true,
      grantedPages: ['conn:host:security'],
      pages: { groups: [{ pages: [
        { key: 'overview', apiPrefixes: ['/internal/es/index/overview'] },
        { key: 'security', apiPrefixes: [
          '/internal/es/index/auth/users',
          '/internal/es/index/auth/ops-audit',
          '/internal/es/index/auth/audit-facets',
        ] },
      ] }] },
    } as any;
    expect(auth.canReadPage('security', 'c1')).toBe(true);
    expect(auth.canEndpoint('ops', 'GET', '/internal/es/index/auth/ops-audit', 'c1')).toBe(true);
    expect(auth.canReadPage('overview', 'c1')).toBe(false);
    expect(auth.canEndpoint('ops', 'GET', '/internal/es/index/overview', 'c1')).toBe(false);
  });

  /* 批次 984：/auth/me 404 必须由 setup/status 明确确认，代理/版本错配 404 不得放开写门。 */
  it('me 404 但 setup 报告 authEnabled=true 时写门保持关闭', async () => {
    meSpy.mockRejectedValue({ status: 404 });
    const setupSpy = vi.spyOn(api.setup, 'status').mockResolvedValue({ authEnabled: true } as any);
    const auth = useAuthStore();
    await auth.probe();
    expect(auth.authDisabled).toBe(false);
    expect(auth.canEmitWrite('POST', '/internal/es/index/cluster/bulk', 'c1')).toBe(false);
    setupSpy.mockRestore();
  });

  it('me 404 且 setup 报告 authEnabled=false 才视为无鉴权部署', async () => {
    meSpy.mockRejectedValue({ status: 404 });
    const setupSpy = vi.spyOn(api.setup, 'status').mockResolvedValue({ authEnabled: false } as any);
    const auth = useAuthStore();
    await auth.probe();
    expect(auth.authDisabled).toBe(true);
    expect(auth.canEmitWrite('POST', '/internal/es/index/cluster/bulk', 'c1')).toBe(true);
    setupSpy.mockRestore();
  });

  it('自定义授权器部署：401 时识别无内置登录，避免本地表单死路', async () => {
    meSpy.mockRejectedValue({ status: 401 });
    const setupSpy = vi.spyOn(api.setup, 'status').mockResolvedValue(
      { authEnabled: true, builtinLogin: false } as any);
    const auth = useAuthStore();
    await auth.probe();
    expect(auth.authDisabled).toBe(false);
    expect(auth.builtinLogin).toBe(false);
    expect(auth.canEmitWrite('POST', '/internal/es/index/cluster/bulk', 'c1')).toBe(false);
    setupSpy.mockRestore();
  });

  it('不同用户登录清除上一用户的请求草稿与历史', async () => {
    localStorage.setItem('esquerystudio.last-user', 'alice');
    localStorage.setItem('es_rest_hist', '[]');
    sessionStorage.setItem('es_devtools_draft:host', '{"path":"/_cluster/settings"}');
    const loginSpy = vi.spyOn(api.auth, 'login').mockResolvedValue(
      { token: 't', username: 'bob', role: 'VIEWER', fallback: false } as any);
    meSpy.mockResolvedValue({ username: 'bob', role: 'VIEWER', fallback: false } as any);
    const auth = useAuthStore();
    await auth.login('bob', 'pw');
    expect(localStorage.getItem('es_rest_hist')).toBeNull();
    expect(sessionStorage.getItem('es_devtools_draft:host')).toBeNull();
    loginSpy.mockRestore();
  });

  it('同一用户重新登录保留草稿', async () => {
    localStorage.setItem('esquerystudio.last-user', 'alice');
    sessionStorage.setItem('es_devtools_draft:host', '{"a":1}');
    const loginSpy = vi.spyOn(api.auth, 'login').mockResolvedValue(
      { token: 't', username: 'alice', role: 'VIEWER', fallback: false } as any);
    meSpy.mockResolvedValue({ username: 'alice', role: 'VIEWER', fallback: false } as any);
    const auth = useAuthStore();
    await auth.login('alice', 'pw');
    expect(sessionStorage.getItem('es_devtools_draft:host')).toBe('{"a":1}');
    loginSpy.mockRestore();
  });

  /* 批次 985：env 页面模板（/auth/me.envPages）必须同时收缩读、写与端点门，
     否则“看到按钮/菜单但一点就 403”；ADMIN 与未配置模板的连接不受影响。 */
  it('env 模板收缩连接页读写：未开放页面读/写/端点全拒', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'u', role: 'OPERATOR', fallback: false, delegated: true,
      grantedPages: ['conn:c1:w:aliases', 'conn:c1:w:search'],
      envPages: { PROD: ['search'] },
      pages: { groups: [{ pages: [
        { key: 'aliases', apiPrefixes: ['/internal/es/index/cluster/alias-actions'] },
        { key: 'search', apiPrefixes: ['/internal/es/index/cluster/search-raw'] },
      ] }] },
    } as any;
    auth.setConnEnvs([{ id: 'c1', env: 'prod' }]);
    expect(auth.canReadPage('aliases', 'c1')).toBe(false);
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/alias-actions', 'c1')).toBe(false);
    expect(auth.canReadPage('search', 'c1')).toBe(true);
    /* 共享文档写端点按 search/indices/doc-diff 任一页环境开放即放行。 */
    expect(auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/doc', 'c1')).toBe(true);
  });

  it('env 模板不影响其它环境连接；未配置 env 的连接照常', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'u', role: 'OPERATOR', fallback: false, delegated: true,
      grantedPages: ['conn:c1:search', 'conn:c2:search', 'conn:c3:search'],
      envPages: { PROD: ['overview'], QA: [] },
    } as any;
    auth.setConnEnvs([{ id: 'c1', env: 'PROD' }, { id: 'c2', env: 'QA' }, { id: 'c3', env: 'DEV' }]);
    expect(auth.canReadPage('search', 'c1')).toBe(false);
    expect(auth.canReadPage('search', 'c2')).toBe(false); // 显式空模板=全拒
    expect(auth.canReadPage('search', 'c3')).toBe(true);  // 该环境未配置=不收缩
  });

  it('env 模板不拖累 ADMIN', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'root', role: 'ADMIN', fallback: false, delegated: true,
      grantedPages: ['conn:c1:search'], envPages: { PROD: [] },
    } as any;
    auth.setConnEnvs([{ id: 'c1', env: 'PROD' }]);
    expect(auth.canReadPage('search', 'c1')).toBe(true);
    expect(auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/bulk', 'c1')).toBe(true);
  });

  it('env 排除目标 security 时 host security 入口仍可读', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'auditor', role: 'AUDIT_OP', fallback: false, delegated: true,
      grantedPages: ['conn:c1:security', 'conn:host:security'],
      envPages: { PROD: ['overview'] },
    } as any;
    auth.setConnEnvs([{ id: 'c1', env: 'PROD' }]);
    expect(auth.canReadPage('security', 'c1')).toBe(true);
  });

  it('静态 security 页同样按宿主 scope 回退（后端 pageScope 同口径）', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'auditor', role: 'AUDIT_OP', fallback: false, delegated: true,
      grantedPages: ['security', 'conn:c1:search'],
      envPages: { PROD: ['search'] },
    } as any;
    auth.setConnEnvs([{ id: 'c1', env: 'PROD' }]);
    expect(auth.canReadPage('security', 'c1')).toBe(true);
  });

  it('文档写只认 search/indices/doc-diff 写键，不被 aliases 写键放大', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'u', role: 'OPERATOR', fallback: false, delegated: true,
      grantedPages: ['conn:c1:w:aliases'],
    } as any;
    expect(auth.canWriteOn('c1')).toBe(false);
    auth.me = {
      username: 'u', role: 'OPERATOR', fallback: false, delegated: true,
      grantedPages: ['conn:c1:w:search'],
    } as any;
    expect(auth.canWriteOn('c1')).toBe(true);
  });

  it('静态读端点归属页同样受 env 收缩', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    auth.me = {
      username: 'u', role: 'VIEWER', fallback: false, delegated: true,
      grantedPages: ['search'],
      envPages: { PROD: ['overview'] },
      pages: { groups: [{ pages: [
        { key: 'search', apiPrefixes: ['/internal/es/index/cluster/search-raw'] },
      ] }] },
    } as any;
    auth.setConnEnvs([{ id: 'c1', env: 'PROD' }]);
    expect(auth.canEndpoint('write', 'GET', '/internal/es/index/cluster/search-raw', 'c1')).toBe(false);
  });
});
