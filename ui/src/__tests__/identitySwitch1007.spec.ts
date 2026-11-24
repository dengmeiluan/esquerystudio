import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1007：账号切换/身份污染的源码锚（文件扫描型护栏）。
   这些是跨文件契约，行为测试难以覆盖换号全过程，用锚防止后续「只清 localStorage」回退。 */
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');
const auth = read('stores/auth.ts');
const app = read('App.vue');
const appStore = read('stores/app.ts');
const api = read('api.ts');
const security = read('views/SecurityView.vue');
const snapshots = read('views/SnapshotsView.vue');
const switcher = read('components/ClusterSwitcher.vue');
const palette = read('components/CmdPalette.vue');
const jobTracker = read('stores/jobTracker.ts');
const liveMonitor = read('stores/liveMonitor.ts');
const adhoc = read('views/AdhocRebuildView.vue');
const xmigrate = read('views/XmigrateView.vue');

describe('1007 账号切换：内存态与磁盘同清', () => {
  it('auth 换人时清理并广播 identity-changed', () => {
    expect(auth).toContain('if (prev !== username)');
    expect(auth).toContain('purgeUserRequestState();');
    expect(auth).toContain("'esquerystudio:identity-changed'");
  });

  it('App 收到事件后重置 app/job/live/queryHistory 并从新身份重拉', () => {
    expect(app).toContain("window.addEventListener('esquerystudio:identity-changed', onIdentityChanged)");
    expect(app).toContain('store.resetIdentityState();');
    expect(app).toContain('jt.resetIdentityState();');
    expect(app).toContain('mon.resetIdentityState();');
    expect(app).toContain('qh.clear();');
  });

  it('目标连接/索引/收藏/通知在内存镜像中同步归零（不只清存储）', () => {
    expect(appStore).toContain('function resetIdentityState()');
    expect(appStore).toContain("target.value = '';");
    expect(appStore).toContain('conns.value = [];');
    expect(appStore).toContain('favorites.value = [];');
    expect(appStore).toContain('notifyLog.value = [];');
  });

  it('作业清单与监控序列也有身份级重置', () => {
    expect(jobTracker).toContain('function resetIdentityState()');
    expect(liveMonitor).toContain('function resetIdentityState()');
  });

  it('作业变更为用户级：adhoc 中止/确认切换、xmigrate 续跑/中止 前端前置', () => {
    expect(adhoc).toContain('const canMutateJob = computed');
    expect(adhoc).toContain('job.value as any)?.ownerUsername');
    expect(adhoc).toContain("v-if=\"canMutateJob && job?.status === 'RUNNING'\"");
    expect(adhoc).toContain('作业由 <b class="mono">{{ jobOwner }}</b> 创建');
    expect(xmigrate).toContain('const owner = job.ownerUsername');
    expect(xmigrate).toContain("if (owner && owner !== (auth.me?.username || '')) return false;");
  });

  it('宿主 token 到达即清内置 token；换发窗口写门 fail-closed', () => {
    expect(api).toContain('if (next && next !== hostToken) clearToken();');
    expect(app).toContain('auth.invalidateIdentity();');
  });

  it('同名降权/撤页：403 与聚焦触发节流重探', () => {
    expect(app).toContain("window.addEventListener('esquerystudio:forbidden', refreshIdentityIfStale)");
    expect(app).toContain("window.addEventListener('focus', onWindowFocusPermRefresh)");
    expect(app).toContain('30_000');
  });
});

describe('1007 页面授权身份与管理员入口同口径', () => {
  it('本地账号管理仅 ADMIN（页面授权身份不再亮出必 400 的表单）', () => {
    expect(security).toContain('if (Array.isArray(auth.grantedPages)) return false;');
    expect(security).toContain('if (auth.me.delegated) return false;');
  });

  it('PROD 徽标不再谎称只读', () => {
    expect(switcher).not.toContain('已封顶只读');
    expect(switcher).toContain('写操作仍按页面授权判定');
  });

  it('CmdPalette raw 维护/管理命令仍按 ADMIN 收口（976/1004 金标准）', () => {
    expect(palette).toContain('const canRawOps = () => auth.canAdminOps();');
    expect(palette).not.toContain('canRawSystem');
  });

  it('Snapshots 的 DevTools 入口使用 sessionStorage 契约（不再是无消费者的 _prefill 查询串）', () => {
    expect(snapshots).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open'");
    expect(snapshots).not.toContain("query: { _prefill:");
  });
});
