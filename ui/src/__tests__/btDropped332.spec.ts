/**
 * 三百三十二批：BoostTuner 掉出清单独立复制（逗号分隔 ID，诚实口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/BoostTunerView.vue'), 'utf-8');

describe('掉出清单复制（332 批）', () => {
  it('按钮+函数', () => {
    expect(v).toMatch(/aria-label="'复制 ' \+ dropped\.length \+ ' 个掉出文档 ID'"/);
    expect(v).toMatch(/async function copyDropped\(\)/);
    expect(v).toMatch(/已复制 \$\{dropped\.value\.length\} 个掉出文档 ID/);
  });
});
