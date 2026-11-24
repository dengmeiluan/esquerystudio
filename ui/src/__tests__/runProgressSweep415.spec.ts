/**
 * 四百一十五批：执行进度条全站推广——ind-bar 局部执行反馈此前只有 DslQuery/DevTools，
 * Lucene/PIT/Sandbox/Rest/IndexHub 五个 run 类视图只有按钮文字反馈。
 * 全站统一：页根 relative 锚 + 顶部 2px ind-bar，busy 态点亮。
 * ⚠脚本坑二证：replace 目标串不存在时静默跳过（relative 锚漏写未报错）——
 * 批量改后必须 grep 复核实际产出，不能只看脚本 ok。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CASES: [string, string, string][] = [
  ['LuceneQueryView.vue', 'busy', '.lc-page'],
  ['PitScrollView.vue', 'busy', '.pt-page'],
  ['SearchSandboxView.vue', 'running', '.ss'],
  ['RestView.vue', 'sending', '.rt'],
  ['IndexHubView.vue', 'docsLoading || qryLoading', '.ih-page'],
];

describe('执行进度条全站推广（415 批）', () => {
  for (const [f, busy, rootCls] of CASES) {
    it(`${f}：ind-bar 接线+relative 锚`, () => {
      const v = readFileSync(join(__dirname, '../views', f), 'utf-8');
      expect(v, `${f} 进度条`).toContain(`<div class="pg-progress ind-bar" :class="{ on: ${busy} }"></div>`);
      const rootRule = v.match(new RegExp(`${rootCls.replace(/\./g, '\\.')} \\{[^}]*\\}`))?.[0] ?? '';
      expect(rootRule, `${f} 页根 relative 锚`).toContain('position: relative');
      /* 430 批：样式合并 theme.css，视图内只保留接线 */
      expect(v, `${f} 定位规则已合并`).not.toContain('.pg-progress { position: absolute');
    });
  }

  it('既有双锚仍在（DslQuery/DevTools）', () => {
    expect(readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8')).toContain('<div class="dq-progress ind-bar"');
    expect(readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8')).toContain('dt-progress ind-bar');
  });
});
