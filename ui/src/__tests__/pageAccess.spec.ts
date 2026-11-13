/* 2.5.0 菜单 SPI：页面级授权前端判定矩阵——pageAllowed 纯函数（守卫/侧栏/App 复核共用）
   + auth store grantedPages 三态透出（null=未启用 / []=全拒 / 白名单） */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { pageAllowed, pageDeniedRedirect, effectivePagesForTarget, NAV_ITEMS, router } from '../router';
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';

describe('pageAllowed 三态', () => {
  it('null=未启用：全量放行', () => {
    expect(pageAllowed(null, '/overview')).toBe(true);
    expect(pageAllowed(null, '/bulk')).toBe(true);
    /* 无鉴权/探测中 role 缺省：含 REST/DevTools 全量可见（无鉴权部署语义）。 */
    expect(pageAllowed(null, '/rest')).toBe(true);
    expect(pageAllowed(null, '/devtools')).toBe(true);
  });

  it('null=未启用但内置非 ADMIN：REST/DevTools 死页隐藏', () => {
    expect(pageAllowed(null, '/rest', 'host', undefined, 'VIEWER')).toBe(false);
    expect(pageAllowed(null, '/devtools', 'host', undefined, 'OPERATOR')).toBe(false);
    expect(pageAllowed(null, '/overview', 'host', undefined, 'VIEWER')).toBe(true);
    expect(pageAllowed(null, '/rest', 'host', undefined, 'ADMIN')).toBe(true);
  });

  it('空数组=全拒：页面路由全灭；非页面路由（/forbidden/未知路径）不拦', () => {
    expect(pageAllowed([], '/overview')).toBe(false);
    expect(pageAllowed([], '/forbidden')).toBe(true);
    expect(pageAllowed([], '/no-such-path')).toBe(true);
  });

  it('白名单：只放行集合内页面', () => {
    expect(pageAllowed(['overview', 'search'], '/overview')).toBe(true);
    expect(pageAllowed(['overview', 'search'], '/search')).toBe(true);
    expect(pageAllowed(['overview', 'search'], '/bulk')).toBe(false);
  });

  it('每个导航项都有 pageKey（守卫取数前提）', () => {
    for (const n of NAV_ITEMS) expect(n.pageKey).toBeTruthy();
  });
});

describe('auth store grantedPages 三态透出', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });

  it('me=null（未探测）→ null', () => {
    expect(useAuthStore().grantedPages).toBeNull();
  });

  it('grantedPages 数组 → 原样透出', () => {
    const a = useAuthStore();
    a.me = { username: 'u', role: 'VIEWER', fallback: false, delegated: true, grantedPages: ['search'] };
    expect(a.grantedPages).toEqual(['search']);
  });

  it('grantedPages=[] → []（全拒语义不得折叠成 null）', () => {
    const a = useAuthStore();
    a.me = { username: 'u', role: 'VIEWER', fallback: false, delegated: true, grantedPages: [] };
    expect(a.grantedPages).toEqual([]);
  });

  it('grantedPages=null（宿主未下发/内置身份）→ null', () => {
    const a = useAuthStore();
    a.me = { username: 'admin', role: 'ADMIN', fallback: false, grantedPages: null };
    expect(a.grantedPages).toBeNull();
  });
});

/* 守卫装配回归：真实 router 单例（含 beforeEach 守卫）+ pinia，验证导航级拦截与 /forbidden 落地。
   router 是用例间共享的单例——每个用例先 replace 到未知路径（兜底 404，非页面路由守卫不拦）做状态隔离。 */
describe('守卫装配（真实 router + pinia）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await router.replace('/__page-access-reset__');
  });

  // timeout 20s：全量并发时懒加载 view 的动态 import 要排 vite-node transform 队列，
  // 默认 5s 会误判超时（单跑 2s 即过）——断言语义不变，只是容忍基建排队
  it('白名单不含目标页：push /bulk 落在 /forbidden 且 query 带 page/name', { timeout: 45000 }, async () => {
    const a = useAuthStore();
    a.me = { username: 'u', role: 'VIEWER', fallback: false, delegated: true, grantedPages: ['overview'] };
    await router.push('/bulk');
    const item = NAV_ITEMS.find(n => n.path === '/bulk')!;
    const r = router.currentRoute.value;
    expect(r.path).toBe('/forbidden');
    expect(r.query.page).toBe(item.pageKey);
    expect(r.query.name).toBe(item.name);
  });

  it('/forbidden 自身导航不被拦：grantedPages=[] 时 push 正常落地', async () => {
    const a = useAuthStore();
    a.me = { username: 'u', role: 'VIEWER', fallback: false, delegated: true, grantedPages: [] };
    await router.push('/forbidden');
    expect(router.currentRoute.value.path).toBe('/forbidden');
  });

  it('pageDeniedRedirect：放行返回 null，拒绝返回带 query 的跳转对象', () => {
    const item = NAV_ITEMS.find(n => n.path === '/bulk')!;
    expect(pageDeniedRedirect(null, '/bulk')).toBeNull();
    expect(pageDeniedRedirect([item.pageKey], '/bulk')).toBeNull();
    expect(pageDeniedRedirect([], '/forbidden')).toBeNull(); // 非页面路由放行
    expect(pageDeniedRedirect([], '/bulk')).toEqual({
      path: '/forbidden',
      query: { page: item.pageKey, name: item.name },
    });
  });
});

/* 五百一十五批：连接模型键（conn:{connId}:{pageKey} / conn:{connId}:w:{pageKey}）按目标收缩——
   与后端 EnvPagesResolver.effectivePages 同构；缺省 targetId=host 语义下静态键行为与既有用例逐字节一致 */
describe('连接模型 effectivePagesForTarget / pageAllowed', () => {
  it('null=未启用原样透出', () => {
    expect(effectivePagesForTarget(null, 'c1')).toBeNull();
  });

  it('conn 键只对目标连接生效；host 下仅静态键可见', () => {
    const gp = ['conn:c1:overview', 'conn:c1:search', 'conn:c2:search', 'favorites'];
    expect([...effectivePagesForTarget(gp, 'c1')!].sort()).toEqual(['favorites', 'overview', 'search']);
    expect([...effectivePagesForTarget(gp, 'c2')!].sort()).toEqual(['favorites', 'search']);
    expect([...effectivePagesForTarget(gp, '')!]).toEqual(['favorites']);
    expect([...effectivePagesForTarget(gp, undefined)!]).toEqual(['favorites']);
  });

  it('写键 conn:{id}:w:{page} 的页面同可见（页面入口可露，写门在后端+capability 层另判）', () => {
    const gp = ['conn:c1:w:mapping'];
    expect(effectivePagesForTarget(gp, 'c1')!.has('mapping')).toBe(true);
    expect(effectivePagesForTarget(gp, 'c2')!.has('mapping')).toBe(false);
  });

  it('pageAllowed 第三参：conn 模型 host 拒/目标连接放行；缺省参不破静态键旧行为', () => {
    const gp = ['conn:c1:overview'];
    expect(pageAllowed(gp, '/overview', 'c1')).toBe(true);
    expect(pageAllowed(gp, '/overview', 'c2')).toBe(false);
    expect(pageAllowed(gp, '/overview', '')).toBe(false);
    // 缺省 targetId（既有调用面）：静态键模型行为不变
    expect(pageAllowed(['overview'], '/overview')).toBe(true);
    expect(pageAllowed(['conn:c1:overview'], '/overview')).toBe(false);
  });

  it('静态 rest/devtools 页授权不再给非 ADMIN 露死入口（连接键仍可见）', () => {
    expect(pageAllowed(['rest'], '/rest', 'c1')).toBe(false);
    expect(pageAllowed(['devtools'], '/devtools', 'c1')).toBe(false);
    expect(pageAllowed(['conn:c1:rest'], '/rest', 'c1')).toBe(true);
    expect(pageAllowed(['conn:c1:devtools'], '/devtools', 'c1')).toBe(true);
  });

  it('pageDeniedRedirect 带 targetId 透传', () => {
    const gp = ['conn:c1:overview'];
    expect(pageDeniedRedirect(gp, '/overview', 'c1')).toBeNull();
    const item = NAV_ITEMS.find(n => n.path === '/overview')!;
    expect(pageDeniedRedirect(gp, '/overview', '')).toEqual({
      path: '/forbidden',
      query: { page: item.pageKey, name: item.name },
    });
  });
});

/* 守卫 × 连接模型：守卫按 useAppStore().target 收缩——目标为授权连接放行，回落 host 拦截 */
describe('守卫装配（连接模型）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await router.replace('/__page-access-reset__');
  });

  it('目标=授权连接：/overview 可达；目标=host：落 /forbidden', { timeout: 45000 }, async () => {
    const a = useAuthStore();
    a.me = { username: 'u', role: 'VIEWER', fallback: false, delegated: true, grantedPages: ['conn:c1:overview'] };
    const app = useAppStore();
    app.target = 'c1';
    await router.push('/overview');
    expect(router.currentRoute.value.path).toBe('/overview');
    app.target = '';
    await router.push('/bulk'); // 先去别的页面触发守卫
    expect(router.currentRoute.value.path).toBe('/forbidden');
  });
});

/* 环境页面模板（/auth/me.envPages）：前端菜单/守卫必须与后端 EnvPagesResolver 同口径收缩，
   否则会出现「菜单可见、点了 403」的假入口。 */
describe('pageAllowed × env 模板', () => {
  it('env 未开放页面：即使连接页键在场也不可见', () => {
    const env = (page: string, target?: string | null) => target === 'c1' ? page !== 'bulk' : true;
    expect(pageAllowed(['conn:c1:bulk'], '/bulk', 'c1', env)).toBe(false);
    expect(pageAllowed(['conn:c1:search'], '/search', 'c1', env)).toBe(true);
  });

  it('DevTools 由 w:rest 打开时按 rest 页收缩', () => {
    const noRest = (page: string) => page !== 'rest';
    expect(pageAllowed(['conn:c1:w:rest'], '/devtools', 'c1')).toBe(true);
    expect(pageAllowed(['conn:c1:w:rest'], '/devtools', 'c1', noRest)).toBe(false);
  });

  it('host security 在连接目标下仍可见（宿主无 env 模板）', () => {
    const denyAll = () => false;
    expect(pageAllowed(['conn:host:security'], '/security', 'c1', denyAll)).toBe(true);
    expect(pageAllowed(['security'], '/security', 'c1', denyAll)).toBe(true); // 静态键同样回退宿主
    expect(pageAllowed(['conn:c1:security'], '/security', 'c1', denyAll)).toBe(false);
  });

  it('源连接 xmigrate 授权不因顶栏目标为 host 而隐藏', () => {
    const env = (page: string, target?: string | null) => !(target === 'src' && page === 'xmigrate');
    expect(pageAllowed(['conn:src:w:xmigrate'], '/xmigrate', 'host')).toBe(true);
    expect(pageAllowed(['conn:src:w:xmigrate'], '/xmigrate', 'host', env)).toBe(false);
  });
});

describe('守卫装配 × env 模板', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await router.replace('/__page-access-reset__');
  });

  it('身份 envPages 收缩菜单：PROD 连接只开放 search 时 /bulk 落 forbidden', { timeout: 45000 }, async () => {
    const a = useAuthStore();
    a.beginProbe();
    a.me = {
      username: 'u', role: 'OPERATOR', fallback: false, delegated: true,
      grantedPages: ['conn:c1:bulk', 'conn:c1:search'],
      envPages: { PROD: ['search'] },
    } as any;
    a.setConnEnvs([{ id: 'c1', env: 'prod' }]);
    const app = useAppStore();
    app.target = 'c1';
    await router.push('/search');
    expect(router.currentRoute.value.path).toBe('/search');
    await router.push('/bulk');
    expect(router.currentRoute.value.path).toBe('/forbidden');
  });
});
