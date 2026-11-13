/**
 * R130 三十七批：DslQueryView 结果视图选择记忆守卫（源码静态锁定）。
 * 行为：view（table/json/tree/cards）改经 useScopedDraft('result-view', {route:'query'}) 持久化，
 * 用户偏好视图跨会话保持（默认 'table' 不落盘）。
 * 不挂组件的原因：视图切换按钮组依赖查询结果（resp）渲染，且 Monaco 在 happy-dom 下
 * 初始化即抛错——静态锁定接线是最稳的回归门，行为由 useScopedDraft 自身 spec 兜底。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('DslQueryView 结果视图记忆（三十七批）', () => {
  it('view 状态经 useScopedDraft(result-view) 接线，route 维度', () => {
    expect(src).toContain("useScopedDraft('result-view', { route: 'query' }, 'table')");
  });

  it('内存 ref 版声明已移除（防止回退为不记忆）', () => {
    expect(src).not.toContain("const view = ref<'table' | 'json' | 'tree' | 'cards'>");
  });

  it('四个视图键位仍齐全（防止草稿化时丢视图）', () => {
    for (const k of ["'table'", "'json'", "'tree'", "'cards'"]) {
      expect(src).toContain(k);
    }
  });
});
