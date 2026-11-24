/**
 * 1132：能力层收口——委派身份（含委派超管）在 `canEndpoint` 就得不到本地账号写能力。
 *
 * 放在能力层而不是 SecurityView 一处：任何「按能力渲染」的入口都自动同源，
 * 不会再冒出第二个「亮着但点了必 400」的钮（后端 BuiltinConsoleAuthService 同口径）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../auth';

function identity(me: Record<string, unknown>) {
  const a = useAuthStore();
  a.beginProbe();
  a.me = me as any;
  return a;
}

const UPSERT = '/internal/es/index/auth/users/upsert';
const DELETE = '/internal/es/index/auth/users/delete?username=x';
const LIST = '/internal/es/index/auth/users';

describe('1132 委派身份的本地账号能力', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });

  it('委派超管：写能力为 false，读能力保留', () => {
    const a = identity({
      username: 'deng_test_x2', role: 'ADMIN', fallback: false, delegated: true,
      grantedPages: ['conn:host:security', 'conn:host:w:security'],
    });
    expect(a.canEndpoint('admin', 'POST', UPSERT, 'host')).toBe(false);
    expect(a.canEndpoint('admin', 'POST', DELETE, 'host')).toBe(false);
    expect(a.canEndpoint('admin', 'GET', LIST, 'host')).toBe(true);
  });

  it('内置超管：能力不受影响（有权限的人不得被误拦）', () => {
    const a = identity({ username: 'root', role: 'ADMIN', fallback: false, delegated: false });
    expect(a.canEndpoint('admin', 'POST', UPSERT, 'host')).toBe(true);
    expect(a.canEndpoint('admin', 'POST', DELETE, 'host')).toBe(true);
    /* 误拦检查：委派判断只针对账号库，不放大到其它管理域 */
    expect(a.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', 'host')).toBe(true);
  });

  it('委派超管的其它管理域能力不被误伤', () => {
    const a = identity({
      username: 'deng_test_x2', role: 'ADMIN', fallback: false, delegated: true,
      grantedPages: ['conn:host:security', 'conn:host:w:security'],
    });
    expect(a.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', 'host')).toBe(true);
    expect(a.canEndpoint('admin', 'POST', '/internal/es/index/cluster/devtools/execute', 'host')).toBe(true);
  });
});
