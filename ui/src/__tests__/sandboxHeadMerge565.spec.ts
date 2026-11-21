/**
 * 五百六十五批·W4【轨4 扁平化扫荡】件②：SearchSandbox 结果 pane 双标题行合并
 * （约定②「区块标题语义并入行首横排，二留一」）。
 *
 * 背景：结果区 FocusableSurface（sandbox.result）非 headless——fs-head 工具行
 * （聚焦钮独占一行 + border-bottom 分界）与 card-t「Response」标题行（自带
 * border-bottom）同 pane 堆叠成两行。FocusableSurface headless 档（组件 :45 契约、
 * LiveDashboardView ld.page 先例）：不渲染 fs-head 行，放大/还原钮由调用方放进
 * 既有工具栏。本件改用 headless + 双态聚焦钮并入 card-t 行尾（原始 IO 钮之后），
 * pane 首行唯一 = card-t 标题行；标题行合并减一行高度=允许的结构降层（编辑器/
 * 表格高度链零触），Esc 退出与焦点管理由组件统一承担不变。
 *
 * 兼容备案：sandboxFocus459.spec.ts:14 正则锁 `<FocusableSurface pane-id=
 * "sandbox.result" title="结果区" :enabled=…` 前缀——headless 属性置于 :enabled
 * 之后，前缀逐字保形，旧锁不击穿。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SearchSandboxView.vue'), 'utf-8');
/* 结果 pane 段：#pane-sandbox-result 插槽起点 → WorkbenchLayout 闭合 */
const paneResult = v.slice(v.indexOf('#pane-sandbox-result'), v.indexOf('</WorkbenchLayout>'));

describe('五百六十五批②：结果 pane 双标题行合并（fs-head 移除，card-t 唯一标题行）', () => {
  it('FocusableSurface headless 在场（fs-head 行结构性移除；459 前缀锁保形）', () => {
    expect(v).toMatch(
      /<FocusableSurface pane-id="sandbox\.result" title="结果区" :enabled="focusPaneId === 'sandbox\.result'" headless/,
    );
  });

  it('结果 pane 段只剩一个 card-t 标题行（fs-head 结构语义不再回流）', () => {
    /* 结构断言锚 DOM 类形态（class="fs-head"），注释备案字样不计 */
    expect(paneResult, 'fs-head 结构语义不得回流结果 pane').not.toMatch(/class="fs-head"/);
    const cards = paneResult.match(/class="card-t"/g) ?? [];
    expect(cards.length, '结果 pane 标题行唯一（二留一）').toBe(1);
  });

  it('双态聚焦钮并入 card-t（放大/还原图标切换，Esc 兜底由组件承担）', () => {
    expect(v).toMatch(/:aria-label="fsResOn \? '还原结果区' : '聚焦结果区'"/);
    expect(v).toContain('<Minimize2 v-if="fsResOn" :size="11" /><Maximize2 v-else :size="11" />');
    expect(v, 'fsResOn 双向 computed（get=聚焦判定，set=复用既有 focusPaneId 通道）')
      .toMatch(/const fsResOn = computed\(\{\s*\n\s*get: \(\) => focusPaneId\.value === 'sandbox\.result',/);
  });
});
