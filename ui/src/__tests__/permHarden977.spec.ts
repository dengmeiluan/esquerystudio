/**
 * 977 权限校准：跨连接监控数据过滤、连接切换宿主门、raw 系统操作入口、
 * xmigrate dest 目标头。锁住「未授权连接名/指标不外泄、授权者入口不消失」。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('977 权限校准', () => {
  it('Live 大盘聚合行不再按 connId 猜测（后端已行级隔离）', () => {
    const s = read('views/LiveDashboardView.vue');
    expect(s).not.toContain("auth.canSeeConn(r.connId || 'host')");
    expect(s).not.toContain("auth.canSeeConn(a.connId || 'host')");
    expect(s).toContain('let records: MonitorMetricsRecord[] = res?.records || [];');
  });

  it('Overview 监控历史的「全部集群」也过滤未授权连接', () => {
    const s = read('views/OverviewView.vue');
    expect(s).toContain('(res.records || []).filter((r: any) => !r.connId || auth.canSeeConn(r.connId))');
  });

  it('Top 索引按集群实名下推，不再误传 connId', () => {
    expect(read('api.ts')).toContain('q({ connName, limit })');
  });

  it('degrade 深链切目标前再验连接授权', () => {
    const s = read('views/LiveDashboardView.vue');
    const guard = s.indexOf("if (t.connId && !auth.canSeeConn(t.connId))");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(s.indexOf('store.setTarget(t.connId', guard));
  });

  it('纯连接模型下宿主切换项隐藏且执行体兜底', () => {
    const s = read('components/ClusterSwitcher.vue');
    expect(s).toContain('v-if="store.hostVisible && hostAllowed"');
    expect(s).toContain("if (!auth.canSeeConn(id || 'host'))");
    const sql = read('views/SqlConsoleView.vue');
    expect(sql).toContain("store.hostVisible && auth.canSeeConn('host')");
  });

  it('raw 系统运维入口只属于 ADMIN（无鉴权部署除外）；结构化 force-merge 按页写键', () => {
    for (const p of ['components/CmdPalette.vue', 'views/IndexHubView.vue']) {
      expect(read(p), p).toContain('auth.canAdminOps()');
    }
    expect(read('views/BrowserView.vue')).toContain("auth.canEndpoint('ops', 'POST',");
  });

  it('迁移目标索引清单固定带宿主目标头', () => {
    expect(read('api.ts')).toContain("destIndices: () => get('/dest-indices', XB, xbTargetInit('host'))");
  });

  it('DslQuery KeepAlive 离页摘除全局快捷键', () => {
    const s = read('views/DslQueryView.vue');
    expect(s).toContain('onDeactivated(() => {');
    expect(s).toContain("window.removeEventListener('keydown', onGlobalRunKey)");
  });

  it('身份未确认/探测失败时前端写门 fail-closed（不再把 me=null 当无鉴权）', () => {
    const s = read('stores/auth.ts');
    expect(s).toContain('const identityKnown = () => authDisabled.value || me.value != null || !probeStarted.value;');
    expect(s).toContain('if (!identityKnown()) return false;');
    /* 984：404 不再直接当无鉴权——须 setup/status 明确 authEnabled=false。 */
    expect(s).toContain('const s = await api.setup.status();');
    expect(s).toContain('authDisabled.value = s.authEnabled === false;');
    expect(s).toContain('probeRetry = setTimeout(');
  });

  it('DevTools 预填 run:true 在身份确认后只自动执行一次', () => {
    const s = read('views/DevToolsView.vue');
    expect(s).toContain('const pendingPrefillRun = ref(false);');
    expect(s).toContain('if (!pendingPrefillRun.value || !pageActive.value || !auth.probed) return;');
    expect(s).toContain('pendingPrefillRun.value = true;');
    expect(s).not.toContain('身份确认中，请求已填入但未自动执行');
  });

  it('Painless 执行按写档：只读清单移除、共享写映射与后端同源', () => {
    const s = read('stores/auth.ts');
    expect(s).toContain("'/cluster/painless/execute': ['painless-lab']");
    const roLine = s.split('\n').find(l => l.includes('const READONLY_POST_KEYWORDS'));
    expect(roLine || '').not.toContain('/cluster/painless/execute');
  });

  it('GuardedActionButton 缺省权限门为 false（漏传不得默认放行）', () => {
    const s = read('components/GuardedActionButton.vue');
    expect(s).toContain('can: false,');
    expect(s).toContain('if (!props.can) return;');
  });
});
