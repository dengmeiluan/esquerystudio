/**
 * 四百六十八批：实用类视图侧冗余定义清零——.sm-txt/.dim 已合并 theme.css（431），
 * Adhoc/Security 视图侧定义残留删除。
 * 五百五十二批同步更新：Adhoc 已填/留空徽标改用 StatusPill，复合选择器 .ar-manual-tag.dim
 * 亦随族退役（原「合法保留」豁免失效，改全形态不再现锁）。
 * 附：430 第二波 spinner 残留复扫为零（430 清理实际已覆盖，先前报告为脚本状态误判）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const ad = readFileSync(join(SRC, 'views/AdhocRebuildView.vue'), 'utf-8');
const sec = readFileSync(join(SRC, 'views/SecurityView.vue'), 'utf-8');
const theme = readFileSync(join(SRC, 'theme.css'), 'utf-8');

describe('实用类冗余清零（468 批）', () => {
  it('theme.css 单一定义在场', () => {
    expect(theme).toMatch(/\.dim \{ color: var\(--tx2\); font-size: var\(--fs-sm\); \}/);
    expect(theme).toMatch(/\.sm-txt \{ font-size: var\(--fs-xs\); font-weight: 400; \}/);
  });

  it('视图侧冗余清零（552 同步更新：改用后复合选择器亦全形态退役）', () => {
    expect(ad).not.toMatch(/\.sm-txt \{/);
    expect(ad).not.toMatch(/(^|[^\w-])\.dim \{/); /* 行首锚定；原复合选择器豁免随改用失效（下方全形态锁承接） */
    expect(ad).not.toContain('ar-manual-tag');
    expect(sec).not.toMatch(/\.sm-txt \{/);
    expect(sec).not.toMatch(/(^|[^\w-])\.dim \{/);
  });
});
