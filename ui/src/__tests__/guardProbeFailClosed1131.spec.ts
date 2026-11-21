import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 1131：DevTools 页级可见性门。
 *
 * 实测缺口：路由守卫在「身份尚未落地」窗口会放行（`pageAllowed` 对 grantedPages=null
 * 且 role=null 返回 true），零授权用户因此在探测完成前能进 /devtools 并**点到工具栏**
 * （导出/导入/变量）。后端仍会拦写请求，但「可操作性必须与授权一致」要求前端也不露。
 *
 * 修法取组件内门而非路由超时跳转：`canReadPage` 依赖 me，身份落地后自动重算——
 * 有权限的人不会被误拦（实测 x1 带 conn:qa:devtools 正常进入、执行钮可用）。
 */
const view = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('DevTools 页级可见性门（1131）', () => {
  it('存在 pageVisible（走 canReadPage 与当前目标）', () => {
    expect(view).toContain('const pageVisible = computed(');
    expect(view).toMatch(/canReadPage\('devtools', store\.target\)/);
  });

  it('无读权时不渲染 dt-page（工具栏整体让位给授权说明）', () => {
    expect(view).toMatch(/<EmptyState v-if="auth\.probed && !pageVisible"/);
    expect(view).toMatch(/<div v-else class="dt-page">/);
  });

  it('授权说明点明缺什么、怎么开通', () => {
    const at = view.indexOf('!pageVisible');
    const seg = view.slice(at, at + 400);
    expect(seg).toContain('暂无「Dev Tools」功能权限');
    expect(seg).toMatch(/管理员|角色权限/);
  });

  it('门用 auth.probed 前置（探测中不闪拒绝页）', () => {
    expect(view).toContain('auth.probed && !pageVisible');
  });
});
