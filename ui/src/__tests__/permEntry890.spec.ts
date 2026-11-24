/* 八百九十批【权限可观测面接线扩展】看守：开发者工具组三页全量挂「我的权限」入口。
 *
 * 888 批接线了 REST 直连页（RestView）；本批补 Dev Tools 与 Painless 沙盒——
 * 同一 PermModal 组件、同一 store.target 数据源，入口统一挂 PageHeader #actions
 * （DevTools）与 #actions（Painless），钮面文案恒「我的权限」（三页肌肉记忆同位）。
 * 源码锁形态：钮字面+PermModal 接线+permOpen 态三件齐。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('八百九十批：开发者工具组三页权限入口全量接线', () => {
  it('源码锁：RestView 保持 888 接线形态（回归锚）', () => {
    const src = read('../views/RestView.vue');
    expect(src).toContain('我的权限');
    expect(src).toContain('PermModal');
  });

  it('源码锁：DevToolsView 挂「我的权限」入口+PermModal 接线', () => {
    const src = read('../views/DevToolsView.vue');
    expect(src).toContain('我的权限');
    expect(src).toContain('PermModal');
    expect(src).toContain('permOpen');
  });

  it('源码锁：PainlessLabView 挂「我的权限」入口+PermModal 接线', () => {
    const src = read('../views/PainlessLabView.vue');
    expect(src).toContain('我的权限');
    expect(src).toContain('PermModal');
    expect(src).toContain('permOpen');
  });
});
