/**
 * 五百九十八批：安全中心机制重构——页面授权解析纯函数。
 * 用户裁决「按连接菜单勾选来」后，delegated 用户安全中心不再展示角色概念，
 * 改为展示「宿主菜单勾了什么」。本模块把 grantedPages（conn:{cid}:{page} /
 * conn:{cid}:w:{page} 键族）解析为按连接分组的授权摘要。
 */
import { describe, it, expect } from 'vitest';
import { summarizeGrants, type GrantSummary } from '../../utils/pageGrants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('summarizeGrants：连接模型解析', () => {
  it('按连接分组：读键=可见、写键=可写，写键不重复计可见页', () => {
    const s: GrantSummary = summarizeGrants([
      'conn:c1:indices', 'conn:c1:w:indices', 'conn:c1:snapshots',
      'conn:c2:docs',
    ]);
    expect(s.connModel).toBe(true);
    expect(s.conns).toHaveLength(2);
    const c1 = s.conns.find(c => c.connId === 'c1')!;
    expect(c1.visible).toEqual(['indices', 'snapshots']);
    expect(c1.writable).toEqual(['indices']);
    const c2 = s.conns.find(c => c.connId === 'c2')!;
    expect(c2.visible).toEqual(['docs']);
    expect(c2.writable).toEqual([]);
  });

  it('w: 前缀键只贡献可写不贡献可见页名（w:indices 的页名是 indices）', () => {
    const s = summarizeGrants(['conn:c1:w:rest']);
    expect(s.conns[0].visible).toEqual(['rest']);
    expect(s.conns[0].writable).toEqual(['rest']);
  });

  it('totals 汇总：可见页数含去重', () => {
    const s = summarizeGrants(['conn:c1:docs', 'conn:c1:w:docs', 'conn:c1:docs']);
    expect(s.totals).toEqual({ visible: 1, writable: 1 });
  });

  it('totals：可写按页面 key 去重，不会出现「可写 > 可见」', () => {
    const s = summarizeGrants(['conn:c1:w:docs', 'conn:c2:w:docs', 'conn:c2:indices']);
    expect(s.totals).toEqual({ visible: 2, writable: 1 });
  });

  it('混合授权：static 全局页不丢，且计入可见总数', () => {
    const s = summarizeGrants(['overview', 'conn:c1:w:docs']);
    expect(s.connModel).toBe(true);
    expect(s.staticKeys).toEqual(['overview']);
    expect(s.conns[0].writable).toEqual(['docs']);
    expect(s.totals).toEqual({ visible: 2, writable: 1 });
  });
});

describe('summarizeGrants：静态键与空值', () => {
  it('静态键（无 conn: 前缀）→ 非连接模型，staticKeys 原样返回', () => {
    const s = summarizeGrants(['overview', 'indices']);
    expect(s.connModel).toBe(false);
    expect(s.conns).toEqual([]);
    expect(s.staticKeys).toEqual(['overview', 'indices']);
  });
  it('null（SPI 未启用）→ 非连接模型', () => {
    const s = summarizeGrants(null as unknown as string[] | null);
    expect(s.connModel).toBe(false);
    expect(s.staticKeys).toBeNull();
  });
  it('空数组 → 非连接模型（镜像后端 inConnModel：无 conn: 前缀键不视为连接模型，走角色门）', () => {
    const s = summarizeGrants([]);
    expect(s.connModel).toBe(false);
    expect(s.conns).toEqual([]);
    expect(s.staticKeys).toEqual([]);
  });
});

describe('五百九十八批：SecurityView 结构锁（delegated 下角色概念退场）', () => {
  const src = readFileSync(join(__dirname, '../../views/SecurityView.vue'), 'utf-8');
  it('我的账号区：角色徽标/角色说明仅内置登录显示（v-if="!auth.me.delegated" 分支化）', () => {
    expect(src).toContain('<div v-if="!auth.me.delegated" class="me-row">');
    expect(src).toContain('<span>角色</span>');
    expect(src).toContain('<div v-if="!auth.me.delegated" class="me-row"><span>说明</span>');
  });
  it('delegated 显示授权来源+页面授权摘要（可见/可写计数）', () => {
    expect(src).toContain('<b>宿主连接菜单</b>');
    expect(src).toContain('grantSummary.totals.visible');
    expect(src).toContain('grantSummary.totals.writable');
    expect(src, '混合授权的全局静态页不能丢').toContain('grantSummary.staticKeys?.length');
  });
  it('页面授权总览区按连接分组+页名解析（connName/pageName 助手在场）', () => {
    expect(src).toContain('页面授权（宿主菜单勾选）');
    expect(src).toContain('connName(g.connId)');
    expect(src).toContain('pageName(p)');
  });
  it('六百零四批：grantedPages=null（宿主未启用页面级授权）按角色档回落展示，不再一律「未下发」误导', () => {
    expect(src).toContain("v-if=\"auth.me.role === 'ADMIN'\"");
    expect(src).toContain('管理员 · 全部页面 · 可读可写');
    expect(src).toContain('宿主未启用页面级授权，按角色档');
  });
  it('六百零五批：全键连接收敛为一行摘要（53 页逐页枚举对全权者零信息量）', () => {
    expect(src).toContain('const isFullGrant = (g: { visible: string[]; writable: string[] }): boolean =>');
    expect(src).toContain('全部页面 · 可读可写');
    expect(src).toContain('pageCatalogTotal.value > 0 && g.visible.length >= pageCatalogTotal.value');
  });
  it('六百零五批补强②：全部连接均全键时聚合为一行汇总（消除 10 行重复）', () => {
    expect(src).toContain('const allConnsFullGrant = computed(() =>');
    expect(src).toContain('个连接 · 每连接全部 {{ pageCatalogTotal }} 页 · 可读可写');
    expect(src).toContain('（宿主超管隐式全权）');
  });
  it('六百零五批补强：逐连接 details 折叠（默认收起一行摘要，展开看逐页胶囊）', () => {
    expect(src).toContain('.us-card { grid-column: 1 / -1; }');
    expect(src).toContain('<details>');
    expect(src).toContain('class="pg-conn-sum"');
    /* 六百四十六批随迁（击穿者：642 批 G30——页面授权 chip 共用全局 .chip.static 非交互基座，
       .pg-chip 自绘基座退役；可写修饰 .pg-w 品牌色保留）：字面随迁，胶囊语义零回退 */
    expect(src).toContain('class="chip static"');
    expect(src).toContain("{ 'pg-w': g.writable.includes(p) }");
    expect(src).toContain('点击连接行展开逐页明细');
  });
  it('用户管理区定位为内置账号（独立部署）；页面授权身份只读，ADMIN 授予仅超管', () => {
    expect(src).toContain('用户管理（内置账号 · 独立部署登录用）');
    expect(src).toContain("const canManageUsers = computed(() => auth.canEndpoint('admin', 'POST', '/internal/es/index/auth/users/upsert', store.target));");
    expect(src).toContain("const canAssignAdmin = computed(() => auth.can('admin') && !auth.me?.delegated);");
    expect(src).toContain('if (Array.isArray(auth.grantedPages)) return false;'); /* 1007：页面授权身份不得管理全局账号 */
    expect(src).toContain('<option v-if="canAssignAdmin" value="ADMIN">');
  });
});
