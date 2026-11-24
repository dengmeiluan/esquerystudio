/**
 * 1132：前端 env 封顶——ADMIN 不再绕过「这个连接是生产库」的限制。
 *
 * 后端 ConsoleAuthInterceptor.envCapViolation 在 ADMIN 豁免之前判一次环境封顶；
 * 前端若仍在 isAdmin() 处直接 return true，PROD 连接下开发者工具/运维入口会全部亮起，
 * 点下去才被 403 —— 违反「可操作性在前端提前暴露」。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../auth';

const PROD_OVERVIEW_ONLY = {
  envPages: { PROD: ['overview'] },
};

function adminOnProd() {
  const a = useAuthStore();
  a.beginProbe();
  a.me = {
    username: 'deng_test_x1', role: 'ADMIN', fallback: false, delegated: false,
    ...PROD_OVERVIEW_ONLY,
  } as any;
  a.setConnEnvs([{ id: 'c1', env: 'PROD' }]);
  return a;
}

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });

describe('1132 前端 env 封顶对 ADMIN 生效', () => {
  it('PROD 连接上 ADMIN 的 raw / devtools 写能力为 false', () => {
    const a = adminOnProd();
    expect(a.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', 'c1')).toBe(false);
    expect(a.canEndpoint('admin', 'POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(false);
  });

  it('PROD 连接上 ADMIN 对模板页外的读写同样被收（search 页）', () => {
    const a = adminOnProd();
    expect(a.canEndpoint('write', 'GET', '/internal/es/index/cluster/sql', 'c1')).toBe(false);
  });

  it('模板内的 overview 页 ADMIN 照常可用（防误拦）', () => {
    const a = adminOnProd();
    expect(a.canEndpoint('write', 'GET', '/internal/es/index/overview', 'c1')).toBe(true);
  });

  it('判不出页归属的基础读不被误拦（索引下拉基线读）', () => {
    const a = adminOnProd();
    expect(a.canEndpoint('write', 'GET', '/internal/es/index/cluster/indices', 'c1')).toBe(true);
  });

  it('宿主目标不受连接 env 模板影响', () => {
    const a = adminOnProd();
    expect(a.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', 'host')).toBe(true);
  });

  it('未配置环境模板时 ADMIN 行为逐字不变', () => {
    const a = useAuthStore();
    a.beginProbe();
    a.me = { username: 'root', role: 'ADMIN', fallback: false, delegated: false } as any;
    a.setConnEnvs([{ id: 'c1', env: 'PROD' }]);
    expect(a.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', 'c1')).toBe(true);
  });
});

/* 补齐：env 封顶不能误伤自举面。这些端点在宿主执行，与连接环境无关；
   封掉任何一个（例如 PROD 视图下的 auth/me）都会让人瞬间失去自助能力。 */
describe('1132 env 封顶不误拦自举与系统管理端点', () => {
  it('PROD 连接下自举端点对 ADMIN 仍可用', () => {
    const a = adminOnProd();
    const cases: Array<[string, string]> = [
      ['GET', '/internal/es/index/auth/me'],
      ['GET', '/internal/es/index/auth/permissions'],
      ['POST', '/internal/es/index/auth/change-password'],
      ['GET', '/internal/es/index/clusters'],
      ['GET', '/internal/es/index/setup/status'],
    ];
    for (const [m, p] of cases) {
      expect(a.canEndpoint('write', m, p, 'c1'), `自举端点被误拦：${m} ${p}`).toBe(true);
    }
  });
});
