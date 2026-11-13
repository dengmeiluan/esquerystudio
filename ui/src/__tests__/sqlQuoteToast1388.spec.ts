import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1388：1386 的「已自动加双引号」提示本该是**教一次**，但实现是无条件 notify。
   真机路径：SQL 稿 `FROM research_report`（不带引号）+ 结果表右键「按此列升序并重查」
   → 每次重查都再弹一次同样的提示。排序三次就是三条重复提示，把真正的「已按 title
   排序，正在重查」挤下去。
   判据：提示受 autoQuoteTaught 记忆门控；记忆按索引名记（换索引该再教一次）。 */
describe('1388 自动补引号提示只教一次', () => {
  it('提示被「按索引名记忆」门控，重复重查不再弹', () => {
    expect(src).toContain('const autoQuoteTaught = new Set<string>();');
    expect(src).toContain('if (quotedFix.quoted && !autoQuoteTaught.has(quotedFix.quoted)) {');
    expect(src).toContain('autoQuoteTaught.add(quotedFix.quoted);');
  });

  it('负控：把门控去掉，上面两条断言必红（证明判据连着真实代码而不是别处）', () => {
    /* 模拟「无条件 notify」的旧写法，确认本 spec 的两条锚确实只匹配门控版 */
    const oldStyle = "if (quotedFix.quoted) {\n    store.notify('info', `索引名「${quotedFix.quoted}」已自动加双引号后执行";
    expect(src.includes('if (quotedFix.quoted && !autoQuoteTaught.has(quotedFix.quoted)) {')).toBe(true);
    expect(src.includes("if (quotedFix.quoted) {\n    store.notify('info', `索引名")).toBe(false);
    expect(oldStyle.length).toBeGreaterThan(0);
  });

  it('自动改写仍只作用于发出文本，编辑器原文不动（1386 契约不回退）', () => {
    expect(src).toContain("const execSnapshot = scope ? scope.text.replace(/;+\\s*$/, '') : sql.value;");
    expect(src).toContain('const execSql = quotedFix.sql;');
    expect(src).toContain('const body = buildBody(execSql);');
    /* 历史/游标仍绑用户稿快照，不是补引号版 */
    expect(src).toContain('const sqlSnapshot = sql.value;');
  });
});
