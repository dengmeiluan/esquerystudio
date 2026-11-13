/**
 * 一千三百五十五批：DSL 工作台「默认可视表格特别窄，下面还有那么多空间」。
 *
 * 用户的同一条抱怨在 DSL 工作台是**另一个根因**（SQL 页那次是 max-height 只封顶不收底，
 * 见 1354）。真机取证（DSL 工作台，加一条条件 → 执行，1 行结果，mock 后端）：
 *
 *   `.rt` 高 383px，内部只有三块：rt-bar 41 + rt-wrap-shell 72 + rt-status 31 = 144px，
 *   **剩下 239px 全空着**。表体 383px 被压进 72px 的滚动区，一屏只看得到 2 行。
 *   修复后同一次执行：`.rt-wrap` 72 → 304px（4.2 倍），三块合计吃满 `.rt`。
 *
 * 根因是 `.rt-wrap-shell` 写 `flex: 0 1 auto`：列向 flex 容器里它只按内容高站住、
 * 永不伸展。改成 `flex: 1 1 auto` + `min-height: 0`（min-height 是 flex 子项允许
 * 收缩到内容以下的必要条件）。
 *
 * 本 spec 锁：
 *  ① shell 必须可伸展（flex-grow 非 0）且带 min-height:0；
 *  ② 负控：改回 `0 1 auto` → ① 必须红；
 *  ③ 表体 `.rt-wrap` 自身仍是滚动区（伸展不能把滚动条弄丢）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

function ruleBody(sel: string): string {
  const i = RT.indexOf(sel + ' {');
  expect(i, `必须有 ${sel} 规则`).toBeGreaterThan(-1);
  const end = RT.indexOf('}', i);
  return RT.slice(i, end);
}

describe('1355 DSL 结果表吃满结果区', () => {
  it('① .rt-wrap-shell 撑满结果区 + 240px 地板（1365 统一定稿）', () => {
    const body = ruleBody('.rt-wrap-shell');
    /* 1365：回到 flex-grow:1（1359b 之后底纹已填补空区，562 的「死白」前提不再成立；
       flex-grow:0 实测让 .rt 剩 96px 无子元素占用）。240px 地板保留（极小窗口可读行数）。 */
    expect(body, '必须撑满结果区（flex-grow:1）').toMatch(/flex:\s*1 1 auto/);
    expect(body, '必须有 240px 地板（0 会让 1 行结果只剩 72px）').toContain('min-height: 240px');
    expect(body, 'shell 本身是定位壳，必须是 flex 容器').toContain('display: flex');
  });

  it('③ .rt-wrap 仍是滚动区（伸展不许丢滚动条）', () => {
    const body = ruleBody('.rt-wrap');
    expect(body).toContain('overflow: auto');
    expect(body, 'wrap 要吃满 shell').toMatch(/flex:\s*1/);
    expect(body).toContain('min-width: 0');
  });

  it('② 负控：flex-grow 归零 → ① 的伸展判据必须红', () => {
    const stripped = RT.replace('flex: 1 1 auto; min-height: 240px; display: flex; }', 'flex: 0 1 auto; min-height: 240px; display: flex; }');
    expect(stripped, '负控必须真的改掉规则').not.toBe(RT);
    const i = stripped.indexOf('.rt-wrap-shell {');
    const body = stripped.slice(i, stripped.indexOf('}', i));
    expect(body, '不许贴合内容').not.toMatch(/flex:\s*1 1 auto/);
  });
});
