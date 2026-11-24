/* 980 权限校准：host-bound 端点按宿主授权、REST 写键可达 DevTools 页面。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { pageAllowed } from '../router';
import { useAuthStore } from '../stores/auth';
import pagesContract from '@contract';

function login(grantedPages: string[]) {
  const a = useAuthStore();
  const pages = {
    groups: (pagesContract as any).groups.map((g: any) => ({
      ...g,
      pages: (pagesContract as any).pages.filter((p: any) => p.group === g.id),
    })),
  };
  a.me = {
    username: 'u', role: 'VIEWER', fallback: false, delegated: true, grantedPages,
    pages,
  };
  return a;
}

describe('host-bound 页面与端点按宿主授权', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });

  it('system 页只认 host 连接键，不再出现 conn:c1:system 的死页面', () => {
    expect(pageAllowed(['conn:host:system'], '/system', 'c1')).toBe(true);
    expect(pageAllowed(['conn:c1:system'], '/system', 'c1')).toBe(false);

    const onHost = login(['conn:host:system']);
    expect(onHost.canReadPage('system', 'c1')).toBe(true);
    expect(onHost.canEmitWrite('POST', '/internal/es/index/system-query', 'c1')).toBe(true);

    setActivePinia(createPinia());
    const onRemote = login(['conn:c1:system']);
    expect(onRemote.canReadPage('system', 'c1')).toBe(false);
    expect(onRemote.canEmitWrite('POST', '/internal/es/index/system-query', 'c1')).toBe(false);
  });

  it('config-drift 同样恒定宿主，连接键不能伪装成可访问', () => {
    expect(pageAllowed(['conn:host:config-drift'], '/config-drift', 'c1')).toBe(true);
    expect(pageAllowed(['conn:c1:config-drift'], '/config-drift', 'c1')).toBe(false);
  });

  it('REST 写键可进入 DevTools 页面（与后端 devtools/execute 共享写映射同口径）', () => {
    expect(pageAllowed(['conn:c1:w:rest'], '/devtools', 'c1')).toBe(true);
    expect(pageAllowed(['conn:c1:w:rest'], '/devtools', 'c2')).toBe(false);
    expect(pageAllowed(['conn:c1:devtools'], '/devtools', 'c1')).toBe(true);
    expect(pageAllowed(['conn:c1:w:devtools'], '/rest', 'c1')).toBe(false);

    const restWriter = login(['conn:c1:w:rest']);
    expect(restWriter.canReadPage('devtools', 'c1')).toBe(true);
    expect(restWriter.canEmitWrite('POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(true);
    expect(restWriter.canEmitWrite('POST', '/internal/es/index/cluster/raw', 'c1')).toBe(true);
    expect(restWriter.canEmitWrite('POST', '/internal/es/index/cluster/raw', 'c2')).toBe(false);
  });

  it('委派非 ADMIN 的宿主 security 写键也不能发出本地账号写请求', () => {
    const delegated = login(['conn:host:w:security']);
    expect(delegated.canEmitWrite('POST', '/internal/es/index/auth/users/upsert', 'host')).toBe(false);
    expect(delegated.canEmitWrite('POST', '/internal/es/index/auth/users/delete?username=x', 'host')).toBe(false);
    expect(delegated.canEmitWrite('GET', '/internal/es/index/auth/users', 'host')).toBe(true);
  });

  /* 产线 deng_test_x2 = role=ADMIN + delegated=true：旧实现先判 isAdmin() 放行，
     请求会发车但被 BuiltinConsoleAuthService.forbidDelegatedLocalUserWrite 400 拒绝。 */
  it('委派 ADMIN 也不得发出本地账号写请求，但其它 ADMIN 域写不被误拦', () => {
    const delegatedAdmin = login(['conn:host:w:security']);
    delegatedAdmin.me = { ...delegatedAdmin.me!, role: 'ADMIN' };

    expect(delegatedAdmin.canEmitWrite('POST', '/internal/es/index/auth/users/upsert', 'host')).toBe(false);
    expect(delegatedAdmin.canEmitWrite('POST', '/internal/es/index/auth/users/delete?username=x', 'host')).toBe(false);
    expect(delegatedAdmin.canEmitWrite('GET', '/internal/es/index/auth/users', 'host')).toBe(true);

    /* 误拦检查：委派超管的常规管理域写必须照常放行 */
    expect(delegatedAdmin.canEmitWrite('POST', '/internal/es/index/cluster/raw', 'host')).toBe(true);
    expect(delegatedAdmin.canEmitWrite('POST', '/internal/es/index/cluster/settings/put', 'host')).toBe(true);
  });

  it('概览读取按宿主键裁决，不 misroute 到目标连接', () => {
    const remoteOnly = login(['conn:c1:overview']);
    expect(remoteOnly.canEndpoint('write', 'GET', '/internal/es/index/overview', 'c1')).toBe(false);
    setActivePinia(createPinia());
    const hostOverview = login(['conn:host:overview']);
    expect(hostOverview.canEndpoint('write', 'GET', '/internal/es/index/overview', 'c1')).toBe(true);
  });
});
