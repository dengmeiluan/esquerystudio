import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1125：DSL 预览绑定生成时的 SQL 快照——改稿后旧翻译不可复制/跳转，
 避免带着旧 FROM/旧索引跳到 DSL 页（诚实口径与结果过期同一规则）。 */
const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

describe('1125 SQL → DSL 预览过期', () => {
  it('预览快照与 stale 计算', () => {
    expect(view).toContain("const dslPreviewSql = ref('');");
    expect(view).toContain('const dslPreviewStale = computed(() => !!dslPreview.value && sql.value !== dslPreviewSql.value);');
    expect(view).toContain('dslPreviewSql.value = sqlSnapshot;');
    expect(view).toContain('const sqlAt = sql.value;');
    expect(view).toContain('dslPreviewSql.value = sqlAt;');
  });

  it('过期时标题黄标、正文降透明、跳转与复制禁用', () => {
    expect(view).toContain('data-test="sql-preview-stale"');
    expect(view).toContain('预览来自上一版 SQL');
    expect(view).toContain(':disabled="!dslPreview || dslPreviewStale"');
    expect(view).toContain(':disabled="dslPreviewStale"');
    expect(view).toContain("'sq-prev-dim': dslPreviewStale");
  });
});
