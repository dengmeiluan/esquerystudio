/**
 * 963 批：跨面权限扫荡（命令面板端点级门禁 / 安全中心执行体守卫 / 连接档案管理域 /
 * 页面复核随目标 / 大屏下钻目标同步 / 禁页回站判定 / 只读 POST 对齐后端）。
 *
 * 背景：conn 模型「勾选即权限」下仍有若干面按全局角色或无条件放行——
 * ① CmdPalette 三条命令（设置下发 / 分词热重载 / ILM 起停）原先无条件或借 canO（create-index 端点），
 *    低权/未勾选用户点了必 403；② SecurityView 用户/重绑执行体只有钮面隐藏，直调路径无闸，
 *    audit-facets 已升 rank3 但低权仍拉；③ ClusterSwitcher 四个档案动作执行体无闸，
 *    Enter 快捷键通道绕过钮面；④ App.vue 复核 watch 不含 target，切目标后不重算页面门；
 *    ⑤ LiveDashboard 下钻裸 setTargetId 只改数据面，SideNav/页面门/router key 停在旧目标；
 *    ⑥ ForbiddenView 回站判定裸 includes('overview') 对 conn:{id}:overview 恒 false。
 *
 * 锁定形态：源码锁为主（跨组件/路由/状态机组合不可稳定行为化），auth 只读 POST 判定补行为锁
 * （pinia 造数，permissionConnWrite563 同范式）。permGating 的既有字面锁共处零扰动。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useAuthStore } from '../stores/auth';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const pal = read('components/CmdPalette.vue');
const sec = read('views/SecurityView.vue');
const cs = read('components/ClusterSwitcher.vue');
const app = read('App.vue');
const live = read('views/LiveDashboardView.vue');
const forbid = read('views/ForbiddenView.vue');
const authSrc = read('stores/auth.ts');
const sideNav = read('components/SideNav.vue');
const routerSrc = read('router.ts');

/* ═══ ① CmdPalette：设置/热重载/ILM 各按自身端点裁决 ═══ */
describe('963 CmdPalette：端点级门禁（设置下发/分词热重载/ILM 起停）', () => {
  it('三条端点门常量在场（ops 档 + 各自真实端点 + store.target）', () => {
    expect(pal).toContain("const canSettings = auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/settings/put', store.target);");
    expect(pal).toContain("const canReload = auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/reload-analyzers', store.target);");
    expect(pal).toContain("const canIlm = auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/ilm/start', store.target)");
    expect(pal).toContain('&& auth.canClusterScope(store.target)'); /* 1007：集群级 rank 硬门前置 */
  });

  it('canW/canO 定义保留；raw 数据面命令按 rest/devtools 写键、reroute 按 ADMIN', () => {
    expect(pal).toContain("const canW = auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/doc', store.target), canO = auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target);");
    expect(pal).toContain("const canRawOps = () => auth.canAdminOps();");
  });

  it('恢复分片分配（settings/put）条件展开：canSettings 缺省即不入列', () => {
    expect(pal).toContain("...(canSettings ? [{ id: 'ops-reroute-retry-r25'");
  });

  it('分词热重载（reload-analyzers）条件展开：canReload 缺省即不入列', () => {
    expect(pal).toContain("...(canReload ? [{ id: 'index-reload-analyzers'");
  });

  it('ILM 起停门从 canO 改 canIlm（create-index 的 canO 不再顺带放行 ILM）', () => {
    expect(pal).toContain("...(canIlm ? [\n      { id: 'dev-ilm-start'");
    expect(pal).not.toContain('...(canO ? [');
  });

  it('runRaw 首行 canRawOps 防御（直调路径也挡 raw 透传）', () => {
    const body = pal.slice(pal.indexOf('const runRaw = async ('), pal.indexOf('const canW'));
    expect(body).toContain('if (!canRawOps()) return;');
  });
});

/* ═══ ② SecurityView：执行体守卫 + facets 按全量审计档 ═══ */
describe('963 SecurityView：用户/重绑执行体守卫与 facets 档位', () => {
  it('doUpsert/doDelete 首行 canWriteUsers 守卫（委派非 ADMIN 不得写全局账号）', () => {
    /* 守卫生效即可：源码此处先 notify（说明「缺什么」）再 return，不静默吞点击 */
    expect(sec).toMatch(/async function doUpsert\(\) \{[\s\S]{0,400}?if \(!canWriteUsers\.value\) \{[\s\S]{0,200}?return; \}/);
    expect(sec).toMatch(/async function doDelete\(username: string\) \{[\s\S]{0,400}?if \(!canWriteUsers\.value\) \{[\s\S]{0,200}?return; \}/);
    expect(sec).toContain("if (auth.authDisabled || !auth.probeStarted) return true;");
    expect(sec).toContain("return Array.isArray(gp) && gp.some(g => g.startsWith('conn:'))");
    expect(sec).toContain("auth.canEndpoint('admin', 'GET', '/internal/es/index/auth/users', store.target)");
    expect(sec).toContain('if (Array.isArray(auth.grantedPages)) return false;'); /* 1007：页面授权身份仅 ADMIN 可管本地账号 */
    /* 委派判断必须先于 isAdmin()：产线 deng_test_x2 = role=ADMIN + delegated=true，
       旧顺序在 isAdmin() 处放行，页面亮出必被后端 400 拒绝的死表单。 */
    expect(sec).toMatch(/if \(auth\.me\.delegated\) return false;\s*\n\s*if \(auth\.isAdmin\(\)\) return true;/);
    expect(sec).not.toMatch(/if \(auth\.isAdmin\(\)\) return true;\s*\n\s*if \(auth\.me\.delegated\) return false;/);
    expect(authSrc).toMatch(/clean\.includes\('\/auth\/users'\) && me\.value\?\.delegated\) return false;[\s\S]{0,400}?if \(clean\.includes\('\/auth\/users'\) && !isAdmin\(\)/);
    expect(sec).toMatch(/async function loadUsers\(\) \{\n\s*if \(!canReadUsers\.value\) return;/);
  });

  it('doRebind 首行 canRebind 守卫（先于 rbBusy 闸）', () => {
    expect(sec).toMatch(/async function doRebind\(\) \{\n\s*if \(!canRebind\.value\) return;/);
  });

  it('loadFacets 首行 canAuditAll 门：低权置空不拉 rank3 端点', () => {
    expect(sec).toMatch(/async function loadFacets\(\) \{\n\s*if \(!canAuditAll\.value\) \{ facets\.value = null; return; \}/);
    expect(sec).toContain('facets.value = await api.auth.auditFacets();');
  });

  it('onMounted 按档位条件拉 facets；档位变化 watch 同步补拉/清空', () => {
    expect(sec).toContain('onMounted(() => { loadUsers(); loadAudit(); loadSetup(); if (canAuditAll.value) loadFacets(); });');
    expect(sec).toContain('if (v) { loadFacets(); return; }');
    expect(sec).toContain('auditRows.value = [];');
    expect(sec).toContain('void loadAudit();');
  });
});

/* ═══ ③ ClusterSwitcher：档案四动作执行体守卫 + Enter 通道同门 ═══ */
describe('963 ClusterSwitcher：连接档案管理域守卫', () => {
  it('testExisting/testForm/saveConn/delConn 首行 canAdmin 守卫', () => {
    expect(cs).toMatch(/async function testExisting\(id: string\) \{\n\s*if \(!canAdmin\.value\) return;/);
    expect(cs).toMatch(/async function testForm\(\) \{\n\s*if \(!canAdmin\.value\) return;/);
    expect(cs).toMatch(/async function saveConn\(\) \{\n\s*if \(!canAdmin\.value\) return;/);
    expect(cs).toMatch(/async function delConn\(c: any\) \{\n\s*if \(!canAdmin\.value\) return;/);
  });

  it('useModalEnter 的 can 条件并入 canAdmin（Enter 保存与钮面同门）', () => {
    expect(cs).toContain('useModalEnter(manageOpen, saveConn, () => canAdmin.value && !!form.value.name && !!form.value.url && !saving.value);');
  });
});

/* ═══ ④ App.vue：页面授权复核随 target 重跑 ═══ */
describe('963 App.vue：页面复核 watch 源加入 store.target', () => {
  it('watch 源（grantedPages/连接目录/envPages/target）且按当前 target+env 判页', () => {
    expect(app).toContain('() => auth.grantedPages,');
    expect(app).toContain('() => store.conns.length,');
    expect(app).toContain("() => store.conns.map(c => c.env || '').join('|'),");
    expect(app).toContain('() => auth.me?.envPages,');
    expect(app).toContain('() => store.target,');
    expect(app).toContain('const r = pageDeniedRedirect(gp, router.currentRoute.value.path, store.target,');
    expect(app).toContain('auth.envAllows, auth.me?.role);');
  });

  it('autoPickConnTarget 逻辑保留（连接模型自动落首个授权连接）', () => {
    expect(app).toContain('autoPickConnTarget(gp);');
  });
});

/* ═══ ⑤ LiveDashboardView：下钻换目标走 store.setTarget ═══ */
describe('963 LiveDashboardView：Top 索引下钻目标同步', () => {
  it('gotoBrowser 用 store.setTarget（名称缺省回落 id），不再裸 setTargetId', () => {
    expect(live).toContain('store.setTarget(t.connId, t.clusterName ?? t.cluster ?? t.connId)');
    expect(live).not.toContain('setTargetId(t.connId)');
    expect(live).not.toContain("import { setTargetId } from '../api';");
  });

  it('深链跳转保持（idx query 由 BrowserView useIdxState 消费回填选中）', () => {
    expect(live).toContain("router.push({ path: '/browser', query: { idx: t.index } })");
  });
});

/* ═══ ⑥ ForbiddenView：回站判定复用 pageAllowed（兼容 conn 键） ═══ */
describe('963 ForbiddenView：回到概览判定', () => {
  it('showHome 走 pageAllowed(grantedPages, /overview, store.target)', () => {
    expect(forbid).toContain("import { pageAllowed } from '../router';");
    expect(forbid).toContain("const showHome = computed(() => auth.isAdmin() || pageAllowed(auth.grantedPages, '/overview', store.target, auth.envAllows, auth.me?.role));");
    expect(forbid).not.toContain("auth.grantedPages.includes('overview')");
  });
});

/* ═══ ⑦ auth store：只读 POST 判定对齐后端三条尾缀 + 关键词表 ═══ */
describe('963 auth.canEndpoint：只读 POST 对齐后端 isReadonlyPost', () => {
  it('关键词表：/cluster/sql 去尾斜杠 + insight/settings-impact 入册', () => {
    expect(authSrc).toContain("'/cluster/sql'");
    expect(authSrc).not.toContain("'/cluster/sql/'");
    expect(authSrc).toContain("'/insight/settings-impact'");
  });

  it('三条精确尾缀（index/query、index/system-query、probe）视为只读', () => {
    expect(authSrc).toContain("!cleanPath.endsWith('/index/query') && !cleanPath.endsWith('/index/system-query') && !cleanPath.endsWith('/probe')");
  });

  const pages = {
    groups: [{ id: 'g', name: 'g', sort: 1, pages: [{ key: 'live', name: '大屏', route: '/live', apiPrefixes: ['/internal/es/index/cluster/delete-index'] }] }],
  };
  beforeEach(() => setActivePinia(createPinia()));

  it('行为：conn 模型无任何写键，裸 /cluster/sql 与 settings-impact 仍按只读放行', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:live', 'conn:c1:search', 'conn:c1:index-settings'], pages };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/sql', 'c1')).toBe(true);
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/insight/settings-impact', 'c1')).toBe(true);
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:live'], pages };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/insight/settings-impact', 'c1')).toBe(false);
  });

  it('行为：尾缀端点（index/query、system-query、probe）只读放行；真正的写端点仍被连接写键拦', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:live', 'conn:c1:search', 'conn:c1:index-settings'], pages };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/query/index/query', 'c1')).toBe(true);
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/query/index/system-query', 'c1')).toBe(true);
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/clusters/c1/probe', 'c1')).toBe(true);
    /* 对照：未命中页且无任意写键的写端点不放行（门未整体放开） */
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/snapshot/delete', 'c1')).toBe(false);
  });
});

describe('可选加固：命令面板目录/连接元数据 + 宿主消息来源', () => {
  it('CmdPalette 导航按 pageAllowed 过滤、集群切换按 canSeeConn 过滤', () => {
    expect(pal).toContain("import { pageAllowed } from '../router';");
    expect(pal).toContain('NAV_ITEMS.filter(n => ui.pageEnabled(n.pageKey) && (auth.isAdmin()');
    expect(pal).toContain('|| pageAllowed(auth.grantedPages, n.path, store.target, auth.envAllows, auth.me?.role))).map(n => ({');
    expect(pal).toContain('for (const c of store.conns.filter(c => auth.canSeeConn(c.id)))');
  });
  it('超管全局可见：SideNav/路由守卫/App 复核/Forbidden 均对 ADMIN 短路', () => {
    expect(sideNav).toContain('const admin = auth.isAdmin();');
    expect(sideNav).toContain('if (admin) return true;');
    /* 985：host-bound/env 模板/security/xmigrate 作用域统一收敛到 pageAllowed 真源。 */
    expect(sideNav).toContain('return pageAllowed(gp, i.path, store.target, auth.envAllows, auth.me?.role);');
    expect(routerSrc).toContain('if (auth.isAdmin()) return true;');
    expect(app).toContain('if (auth.isAdmin()) return; /* 超管全局可见：不自动切目标、不做页面拒绝跳转 */');
    expect(forbid).toContain("auth.isAdmin() || pageAllowed(auth.grantedPages, '/overview', store.target, auth.envAllows, auth.me?.role)");
  });
  it('App 只接受父窗口 postMessage（第三方窗口不得替换 hostToken）', () => {
    expect(app).toContain('if (window.parent && e.source !== window.parent) return;');
  });
  it('App 拒收非同源 postMessage（宿主与控制台同源部署，origin 必须等于自身）', () => {
    expect(app).toContain('if (e.origin !== window.location.origin) return;');
  });
  it('auth store 暴露 canSeeConn 且 ADMIN 走全局短路', () => {
    expect(authSrc).toContain('const canSeeConn = (connId: string): boolean =>');
    /* ADMIN 全局短路仍在（canEndpoint / canPage 各一处），但已收紧为「环境封顶先于 ADMIN 豁免」：
       旧锚「超管全局端点权：与后端 ADMIN 页面门豁免镜像」已随该收紧移除，改为断言现行两层语义。
       canEndpoint 的 ADMIN 分支里有 host-bound 早退与判页注释，`const tid` 不在紧跟下一行，
       故用定长跨行窗口而不是紧邻匹配（1165：锚太紧会在合法排版变化下假红）。 */
    expect(authSrc).toContain('环境封顶先于 ADMIN 豁免');
    expect(authSrc).toMatch(/if \(isAdmin\(\)\) \{[\s\S]{0,700}?const tid = /);
    expect(authSrc).toContain('if (isAdmin()) return true; /* 超管全局页面权：页面白名单/连接键不拖累 */');
  });
});
