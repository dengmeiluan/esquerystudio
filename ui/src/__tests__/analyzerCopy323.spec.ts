/**
 * 三百二十三批：AnalyzerLab lane 结果复制（TSV/JSON）+ fieldRetry 死状态位清理。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/AnalyzerLabView.vue'), 'utf-8');

describe('AnalyzerLab 结果复制（323 批）', () => {
  it('lane 复制两钮+两函数+诚实口径', () => {
    expect(v).toContain('>TSV</button>');
    expect(v).toContain('>JSON</button>');
    expect(v).toMatch(/async function copyLaneTsv\(l: Lane\)/);
    expect(v).toMatch(/async function copyLaneJson\(l: Lane\)/);
    expect(v).toMatch(/已复制 \$\{l\.tokens\.length\} tokens（TSV）/);
  });
  it('fieldRetry 死状态位清零', () => {
    expect(v).not.toMatch(/fieldRetry/);
  });
});
