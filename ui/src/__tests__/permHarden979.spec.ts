/**
 * 979 权限收口：API 层写请求零发出 + 混合静态/连接授权 + 命令面板/DevTools 入口校准。
 * 后端仍是最终边界；本组锁「未授权在客户端就发不出写请求」的确定性。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { post, setApiWriteGuard } from '../api';

const apiSrc = readFileSync(join(__dirname, '../api.ts'), 'utf-8');
const authSrc = readFileSync(join(__dirname, '../stores/auth.ts'), 'utf-8');
const pal = readFileSync(join(__dirname, '../components/CmdPalette.vue'), 'utf-8');
const devtools = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

const PAGES = {
  groups: [{
    id: 'g', name: 'g', sort: 0, pages: [
      { key: 'rest', name: 'REST', route: '/rest', apiPrefixes: ['/internal/es/index/cluster/raw'] },
      { key: 'devtools', name: 'DevTools', route: '/devtools', apiPrefixes: [] },
      { key: 'adhoc-rebuild', name: '托管重建', route: '/adhoc-rebuild', apiPrefixes: ['/internal/es/index/adhoc-rebuild'] },
      { key: 'config-validator', name: '配置校验器', route: '/config-validator', apiPrefixes: ['/internal/es/index/config-lab/validate', '/internal/es/index/cluster/create-index'] },
    ],
  }],
};

function login(role: string, grantedPages: string[] | null, delegated = true) {
  const auth = useAuthStore();
  auth.me = {
    username: 'u1', role, fallback: false, delegated, grantedPages,
    pages: PAGES as any,
  };
  return auth;
}

describe('API 层写门：无权限请求零发出', () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  afterEach(() => { setApiWriteGuard(null); vi.restoreAllMocks(); });

  it('写门拒绝时 fetch 根本不发生', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setApiWriteGuard(() => false);
    await expect(post('/cluster/doc', '{}')).rejects.toMatchObject({ code: 'CLIENT_WRITE_DENIED' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('写门放行时正常发出请求', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    setApiWriteGuard(() => true);
    const out = await post('/cluster/doc', '{}');
    expect(out).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('request() 在 fetch 前调用写门，拒绝时抛 CLIENT_WRITE_DENIED', () => {
    expect(apiSrc).toContain('export const setApiWriteGuard');
    expect(apiSrc).toContain('if (!apiWriteGuard(fetchMethod, cleanBase + path, targetId))');
    expect(apiSrc).toContain("'CLIENT_WRITE_DENIED'");
    const guardAt = apiSrc.indexOf('apiWriteGuard(fetchMethod');
    const fetchAt = apiSrc.indexOf('await doFetch(base + path');
    expect(guardAt).toBeGreaterThan(0);
    expect(guardAt).toBeLessThan(fetchAt);
  });

  it('无任何页面授权的身份不能发出写请求', () => {
    const auth = login('VIEWER', []);
    expect(auth.canEmitWrite('POST', '/internal/es/index/cluster/doc', 'c1')).toBe(false);
    expect(auth.canEmitWrite('DELETE', '/internal/es/index/cluster/delete-index?index=a', 'c1')).toBe(false);
    expect(auth.canEmitWrite('GET', '/internal/es/index/cluster/doc', 'c1')).toBe(true);
  });

  it('自助写（登录/退出/改密）不被客户端写门误拦', () => {
    const auth = login('VIEWER', []);
    expect(auth.canEmitWrite('POST', '/internal/es/index/auth/login', '')).toBe(true);
    expect(auth.canEmitWrite('POST', '/internal/es/index/auth/change-password', '')).toBe(true);
    expect(auth.canEmitWrite('POST', '/internal/es/index/auth/logout', '')).toBe(true);
  });

  it('DevTools/REST：连接写键放行，只读键放行到后端裁决，无键与跨连接一律拒绝', () => {
    const connWrite = login('VIEWER', ['conn:c1:w:devtools']);
    expect(connWrite.canEmitWrite('POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(true);

    /* 1133：读键（conn:{id}:{page}，不带 w:）不再被客户端整段拦死——
       外层恒 POST，内层真实方法由后端裁决；客户端只在读写都不行时拦。
       「只读身份连 GET 都发不出」正是本轮修复的缺陷。 */
    const connRead = login('VIEWER', ['conn:c1:devtools']);
    expect(connRead.canEmitWrite('POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(true);
    expect(connRead.canExecutePassthrough('GET', '/_cluster/health',
      '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(true);
    /* 但内层写仍被客户端判死（后端同口径再拦一次） */
    expect(connRead.canExecutePassthrough('PUT', '/new-index',
      '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(false);

    const rawConn = login('VIEWER', ['conn:c1:w:rest']);
    expect(rawConn.canEmitWrite('POST', '/internal/es/index/cluster/raw', 'c1')).toBe(true);
    const rawOtherConn = login('VIEWER', ['conn:c1:w:rest']);
    expect(rawOtherConn.canEmitWrite('POST', '/internal/es/index/cluster/raw', 'c2')).toBe(false);

    /* 静态模型（无 w: 变体）保持既有 admin 档语义——有权限的人不被误拦，无 admin 者不亮入口 */
    const staticDevtools = login('OPERATOR', ['devtools']);
    expect(staticDevtools.canEmitWrite('POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(false);
    const admin = login('ADMIN', []);
    expect(admin.canEmitWrite('POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(true);
  });

  it('普通写按归属页/角色档：OPERATOR 无 ops 档不得删数据，rank3 有页可写', () => {
    const operator = login('OPERATOR', ['indices']);
    expect(operator.canEmitWrite('POST', '/internal/es/index/cluster/delete-by-id', 'c1')).toBe(false);
    expect(operator.canEmitWrite('POST', '/internal/es/index/cluster/doc/update', 'c1')).toBe(true);

    const rank3 = login('REBUILD_OP', ['indices']);
    expect(rank3.canEmitWrite('POST', '/internal/es/index/cluster/delete-by-id', 'c1')).toBe(true);
  });

  it('混合静态页 + conn 读键：静态写权不被吞掉（与后端同序）', () => {
    const mixed = login('REBUILD_OP', ['config-validator', 'conn:c1:overview']);
    expect(mixed.canEmitWrite('POST', '/internal/es/index/cluster/create-index', 'c1')).toBe(true);
    const connOnly = login('REBUILD_OP', ['conn:c1:overview']);
    expect(connOnly.canEmitWrite('POST', '/internal/es/index/cluster/create-index', 'c1')).toBe(false);
  });

  it('托管重建向导：adhoc 写键可调 config-lab/validate（不误拦）', () => {
    const adhocStatic = login('REBUILD_OP', ['adhoc-rebuild']);
    expect(adhocStatic.canEmitWrite('POST', '/internal/es/index/config-lab/validate', 'c1')).toBe(true);
    const adhocConn = login('VIEWER', ['conn:c1:w:adhoc-rebuild']);
    expect(adhocConn.canEmitWrite('POST', '/internal/es/index/config-lab/validate', 'c1')).toBe(true);
    const none = login('REBUILD_OP', ['conn:c1:overview']);
    expect(none.canEmitWrite('POST', '/internal/es/index/config-lab/validate', 'c1')).toBe(false);
  });
});

describe('菜单/按钮校准', () => {
  it('命令面板导航全部走页面门 go()，只剩 go 内部一次 router.push', () => {
    /* 探测在途不出导航项（auth.probed 前置，1015 批防未授权清单闪现） */
    expect(pal).toContain('const canGo = (path: string) => auth.probed');
    expect(pal).toContain('pageAllowed(auth.grantedPages, path, store.target, auth.envAllows, auth.me?.role)');
    expect(pal).toContain('if (typeof path === \'string\' && !canGo(path))');
    expect((pal.match(/router\.push\(/g) || []).length).toBe(1);
  });

  it('DevTools 重试/空态快捷入口在无写权时不渲染', () => {
    expect(devtools).toContain('<button v-if="canAdmin" class="btn sm" :disabled="cur.busy" @click="run">');
    expect(devtools).toContain('<template v-if="canAdmin">');
    expect(devtools).toContain('无 DevTools/REST 写权时 run() 必然拒绝');
  });

  it('DevTools 非 ADMIN 系统管理写不显示可执行态', () => {
    expect(devtools).toContain('nonAdminDataPlaneWriteAllowed');
    /* 1133：可执行性按**内层方法**分档（读键可执行只读请求），写档仍用于数据面收口 */
    expect(devtools).toContain('const currentSendable = computed(() => !!cur.value');
    expect(devtools).toContain('canExecInner(cur.value.method, cur.value.path)');
    /* 1004：门必须带 body——根级检索的 PIT 豁免要读 pit.id，否则 PIT 搜索被误禁 */
    expect(devtools).toContain('if (!requestInScope(cur.value?.method || \'GET\', cur.value?.path || \'/\', cur.value?.body))');
    expect(devtools).toContain('if (!requestInScope(t.method, t.path, t.body))');
  });

  it('安全中心全量审计需 rank3 + security 页读键', () => {
    expect(authSrc).toContain("const canAuditAll = (targetId?: string | null) => me.value != null");
    expect(authSrc).toContain("&& canViewAllAudit(me.value.role) && canReadPage('security', targetId);");
  });
});
