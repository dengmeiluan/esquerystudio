/**
 * 四百七十批：交互规范 Checklist 文档固化——ui/INTERACTION.md 八节
 * （列表行/排序表头/弹层/执行反馈/过滤输入/样式/持久化/导出），供人/AI
 * 开发新视图时逐项核对；各节均映射到既有守卫 spec。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../../../ui/INTERACTION.md'), 'utf-8');

describe('交互规范文档（470 批）', () => {
  it('八节清单齐备', () => {
    for (const section of ['列表行', '排序表头', '弹层', '执行反馈', '过滤', '样式', '持久化', '导出']) {
      expect(s, section).toContain(section);
    }
  });

  it('关键范式关键词在场', () => {
    expect(s).toContain('btn-run-lock');
    expect(s).toContain('csvText');
    expect(s).toContain('useScopedDraft');
    expect(s).toContain('exportStamp()');
    expect(s).toContain('tabindex="0"');
  });
});
