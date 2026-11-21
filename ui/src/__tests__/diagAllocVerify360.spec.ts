/**
 * 三百六十批：Diag explain 复制收尾验证——343 批复制钮在位+六字段组装齐全（工单直达完整性）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('Diag explain 复制收尾（360 批）', () => {
  it('复制钮绑定+六字段组装+诚实口径', () => {
    expect(v).toMatch(/@click="copyAllocMd" title="复制分片诊断 Markdown"/);
    expect(v).toContain('## Shard 分配诊断');
    expect(v).toContain('- current_state: ${a.current_state || \'-\'}');
    expect(v).toContain('allocate_explanation');
    expect(v).toMatch(/ok \? '分片诊断 Markdown 已复制' : '复制失败'/);
  });
});
