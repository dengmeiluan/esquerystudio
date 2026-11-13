/**
 * 1215：查询构建树条件行的行尾动作簇，「太多功能平铺」的最后一处。
 *
 * 现场（1440×1000 真浏览器实测，截图 `.tmp/browser/clause-1280.png`）：每个条件行行尾
 * **6 枚 22px 灰图标常驻**（⏰ / 参数 / 复制条件 / 复制子树 / 包 bool / 删除），
 * 动作簇 132px；左栏偏窄时占行宽 31%，整行被挤折成 76px（两行），字段与值输入各自只剩半宽。
 *
 * 关键前提：**这些动作在右键菜单里一个不少**（1147 已把 复制条件JSON / DSL 片段 / 子树 /
 * 包成 bool 组 全部分组收进 `CellContextMenu`），所以常驻图标是「第二条重复路径」——
 * 与项目右键约定「同一动作不重复常驻」直接冲突。
 *
 * 改法沿用项目里已有三处同款（ILM 卡片 / 收藏卡 / 快照行删除钮）：
 * 静息只留 2 枚高频（复制条件 / 删除），其余悬停或行内聚焦时浮现；触屏 `hover:none` 常驻。
 * 用 `display:none` 而非 `opacity:0`——后者仍参与 flex 宽度分配（RT 列头 1151 已踩过）。
 *
 * 实测（1280 / 1024 两档）：静息 2 枚 / 44px，悬停 6 枚 / 132px；1440 档因鼠标残留
 * 停在行上而读到 hover 值，属测量环境而非实现问题，已在 CHANGELOG 注明。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/builder/ClauseNode.vue'), 'utf-8');

const LOW = ['标准时间转时间戳', '复制子树（跨查询粘贴用）', '包成 bool 组'];
const HIGH = ['复制条件', '删除'];

describe('1215 条件行行尾动作簇收口', () => {
  it('低频动作用 cn-act-lo 标记（悬停才出）', () => {
    for (const label of LOW) {
      const line = src.split('\n').find(l => l.includes(`aria-label="${label}"`) && l.includes('class='));
      expect(line, `找不到 ${label} 的按钮行`).toBeTruthy();
      expect(line, `${label} 应为 cn-act-lo`).toContain('cn-act-lo');
    }
  });

  it('高频动作常驻（不挂 cn-act-lo）', () => {
    for (const label of HIGH) {
      const line = src.split('\n').find(l => l.includes(`aria-label="${label}"`) && l.includes('class='));
      expect(line).toBeTruthy();
      expect(line, `${label} 应常驻`).not.toContain('cn-act-lo');
    }
  });

  it('「参数」按钮有参数时也要收进悬停区（它同样是低频，且右键一级已有）', () => {
    const line = src.split('\n').find(l => l.includes('aria-label="参数（boost/operator…）"') && l.includes('class='));
    expect(line).toBeTruthy();
    expect(line).toContain('cn-act-lo');
  });

  it('静息隐藏用 display:none（不是 opacity:0——后者仍占 flex 宽）', () => {
    expect(src).toMatch(/\.cn-act-lo \{ display: none; \}/);
    expect(src).toMatch(/\.cn:hover \.cn-act-lo, \.cn:focus-within \.cn-act-lo \{ display: inline-flex; \}/);
    /* 禁止回退成 opacity 方案 */
    expect(src).not.toMatch(/\.cn-act-lo[^}]*opacity:\s*0/);
  });

  it('触屏兜底常驻（无 hover 的设备不能摸不到）', () => {
    expect(src).toMatch(/@media \(hover: none\) \{\s*\n\s*\.cn-act-lo \{ display: inline-flex; \}/);
  });

  it('能力没丢：右键菜单仍覆盖这些动作（1147 的二级组）', () => {
    for (const key of ['copy-subtree', 'wrap', 'copy-json', 'copy-dsl', 'dup']) {
      expect(src).toContain(`key: '${key}'`);
    }
  });
});
