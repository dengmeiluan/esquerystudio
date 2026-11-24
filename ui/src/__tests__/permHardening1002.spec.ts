/**
 * 一千零二批·权限口径加固行为锁（前后端同源锚）。
 *
 * 三条都是「同一能力被两条路径/两套页集切开」的真实形态：
 * 1) 热 Setting 两个入口曾分属 mapping 与 index-settings 页集——持 index-settings 写键的人
 *    在 update-settings 上被 403（有权限的人被拦）；页集对齐后两入口同权。
 * 2) ILM start/stop 是集群级开关，连接模型下页面写键短路角色门——rank2 的 w:lifecycle
 *    持有人能停掉整集群 ILM（越权）。后端补 rank3 硬门，前端 canClusterScope 同源。
 * 3) DevTools/REST 写键实际授予目标连接的数据面全权——前端预暴露与后端 guardRawGuarded
 *    必须同口径（系统管理写一律不亮可执行态）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../stores/auth';

const PATH_UPDATE_SETTINGS = '/internal/es/index/cluster/update-settings';
const PATH_ILM_START = '/internal/es/index/cluster/ilm/start';
const PATH_DEVTOOLS = '/internal/es/index/cluster/devtools/execute';
const PATH_RAW = '/internal/es/index/cluster/raw';

/* 页面目录契约的最小切片（真实由 /auth/me 下发 me.pages）：端点级门靠它做 pageOwnerOf
   最长前缀归属。缺了它 pageOf=null，写端点会走「未登记默认拒绝」——测试必须与生产同形。 */
const PAGES = {
  groups: [{
    id: 'protect', name: '备份与生命周期', sort: 9,
    pages: [
      { key: 'lifecycle', name: '生命周期', route: '/lifecycle',
        apiPrefixes: ['/internal/es/index/cluster/ilm/start', '/internal/es/index/cluster/ilm/stop',
          '/internal/es/index/cluster/ilm/move', '/internal/es/index/cluster/rollover'] },
      { key: 'rest', name: 'REST 直连', route: '/rest',
        apiPrefixes: ['/internal/es/index/cluster/raw'] },
    ],
  }],
};
const mkMe = (role: string, grantedPages: string[]) =>
  ({ username: 'u', role, fallback: false, grantedPages, pages: PAGES });

describe('1002:热 Setting 两入口同页集(不误拦有写键的人)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('持 index-settings 写键可走 update-settings(原被 403)', () => {
    const auth = useAuthStore();
    auth.me = mkMe('VIEWER', ['conn:c1:index-settings', 'conn:c1:w:index-settings']);
    expect(auth.canEndpoint('ops', 'POST', PATH_UPDATE_SETTINGS, 'c1')).toBe(true);
    expect(auth.canEmitWrite('POST', PATH_UPDATE_SETTINGS, 'c1')).toBe(true);
  });

  it('mapping 页写键仍可用(原归属页不回退)', () => {
    const auth = useAuthStore();
    auth.me = mkMe('VIEWER', ['conn:c1:mapping', 'conn:c1:w:mapping']);
    expect(auth.canEndpoint('ops', 'POST', PATH_UPDATE_SETTINGS, 'c1')).toBe(true);
  });

  it('无关页写键不放大到热 Setting(overview 写键不外溢)', () => {
    const auth = useAuthStore();
    auth.me = mkMe('VIEWER', ['conn:c1:overview', 'conn:c1:w:overview']);
    expect(auth.canEndpoint('ops', 'POST', PATH_UPDATE_SETTINGS, 'c1')).toBe(false);
  });

  it('目标隔离:别连接的写键不外溢', () => {
    const auth = useAuthStore();
    auth.me = mkMe('VIEWER', ['conn:c1:index-settings', 'conn:c1:w:index-settings']);
    expect(auth.canEndpoint('ops', 'POST', PATH_UPDATE_SETTINGS, 'c2')).toBe(false);
  });
});

describe('1002:集群级 ILM 开关的 rank 门(连接模型不短路)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('rank2 + w:lifecycle:端点写门本身开,但集群级动作门关闭(后端 403 同源)', () => {
    const auth = useAuthStore();
    auth.me = mkMe('OPERATOR', ['conn:c1:lifecycle', 'conn:c1:w:lifecycle']);
    expect(auth.canEndpoint('ops', 'POST', PATH_ILM_START, 'c1')).toBe(true);
    expect(auth.canClusterScope('c1')).toBe(false);
  });

  it('rank3 专项可用(不被 rank 硬门误拦)', () => {
    for (const role of ['REBUILD_OP', 'CLUSTER_OP', 'AUDIT_OP']) {
      const auth = useAuthStore();
      auth.me = mkMe(role, ['conn:c1:lifecycle', 'conn:c1:w:lifecycle']);
      expect(auth.canClusterScope('c1')).toBe(true);
    }
  });

  it('ADMIN 恒可用;静态页模型由端点角色档裁决(此处恒真)', () => {
    const admin = useAuthStore();
    admin.me = mkMe('ADMIN', ['conn:c1:w:overview']);
    expect(admin.canClusterScope()).toBe(true);

    const stat = useAuthStore();
    stat.me = mkMe('OPERATOR', ['lifecycle']);
    expect(stat.canClusterScope()).toBe(true);
    /* 静态模型下 rank2 仍被端点的 ops 角色档挡住(与后端 CLUSTER 关键词同源) */
    expect(stat.canEndpoint('ops', 'POST', PATH_ILM_START, 'c1')).toBe(false);
  });

  it('集群设置写键是可选的第二通道(rank2 也能做集群级动作,不误拦)', () => {
    const auth = useAuthStore();
    auth.me = mkMe('OPERATOR', ['conn:c1:lifecycle', 'conn:c1:w:lifecycle',
      'conn:c1:cluster-settings', 'conn:c1:w:cluster-settings']);
    expect(auth.canClusterScope('c1')).toBe(true);
    /* 目标隔离：别连接的 cluster-settings 写键不放行 */
    expect(auth.canClusterScope('c2')).toBe(false);
    /* host 归一化：不传目标按宿主连接裁决 */
    expect(auth.canClusterScope(undefined)).toBe(false);
  });

  it('身份未定 fail-closed(探测中不亮可执行态)', () => {
    const auth = useAuthStore();
    auth.beginProbe();
    expect(auth.canClusterScope()).toBe(false);
  });
});

describe('1002:DevTools 写键 = 数据面全权(前端预暴露与后端守卫同口径)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('w:devtools / w:rest 均可执行;无关写键不可', () => {
    const dev = useAuthStore();
    dev.me = mkMe('VIEWER', ['conn:c1:devtools', 'conn:c1:w:devtools']);
    expect(dev.canEndpoint('admin', 'POST', PATH_DEVTOOLS, 'c1')).toBe(true);

    const rest = useAuthStore();
    rest.me = mkMe('VIEWER', ['conn:c1:rest', 'conn:c1:w:rest']);
    expect(rest.canEndpoint('admin', 'POST', PATH_DEVTOOLS, 'c1')).toBe(true);

    const other = useAuthStore();
    other.me = mkMe('VIEWER', ['conn:c1:bulk', 'conn:c1:w:bulk']);
    expect(other.canEndpoint('admin', 'POST', PATH_DEVTOOLS, 'c1')).toBe(false);
    expect(other.canEmitWrite('POST', PATH_DEVTOOLS, 'c1')).toBe(false);
  });

  it('REST 直连仍只认 rest 页写键(devtools 写键不放大到 raw)', () => {
    const auth = useAuthStore();
    auth.me = mkMe('VIEWER', ['conn:c1:devtools', 'conn:c1:w:devtools']);
    expect(auth.canEndpoint('admin', 'POST', PATH_RAW, 'c1')).toBe(false);
  });
});
