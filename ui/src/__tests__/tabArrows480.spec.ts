/**
 * 四百八十批：DevTools tab 聚焦后 ←/→ 切换标签（QueryHub onModesKeydown 同款
 * roving 模式）；重命名输入中豁免（←/→ 是光标移动语义优先）。
 * Ctrl+Tab 为浏览器保留键不可用，故采用元素内 roving 方案。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('tab ←/→ 切换（480 批）', () => {
  it('dt-tabs 容器键盘监听+重命名豁免+roving 移动', () => {
    expect(v).toContain('<div class="dt-tabs" role="tablist" aria-label="REST 请求标签" @keydown="onTabsKeydown">'); /* 484 ARIA tabs */
    const body = v.slice(v.indexOf('function onTabsKeydown('), v.indexOf('function onTabsKeydown(') + 700);
    expect(body).toContain("if (renamingIdx.value !== null) return;");
    expect(body).toContain("(i - 1 + btns.length) % btns.length");
    expect(body).toContain("btns[next]?.focus();");
    expect(body).toContain("active.value = next;");
  });
});
