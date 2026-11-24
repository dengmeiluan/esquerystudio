import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1136：DBX 式结果优先——DSL 预览自动生成但默认折叠，结果网格吃满；
 * 手动「转 DSL」才展开；折叠态保留「到 DSL 页/复制」等动作。 */
describe('1136 DSL 预览默认折叠（结果优先）', () => {
  it('折叠态默认 + 手动 translate 展开 + 关闭复位', () => {
    expect(view).toContain('const previewOpen = ref(false);');
    expect(view).toContain('previewOpen.value = true;');
    expect(view).toContain('previewOpen = false');
  });

  it('折叠态不占行：展开入口在 SQL 工具行；展开后头部给高/到 DSL/复制/关闭', () => {
    expect(view).toContain('data-test="sql-preview-toggle"');
    expect(view).toContain(':aria-expanded="previewOpen"');
    expect(view).toContain('aria-controls="sq-dsl-preview"');
    expect(view).toContain('v-if="dslPreview && previewOpen" class="sq-sec wide"');
    expect(view).toContain('<pre id="sq-dsl-preview"');
    expect(view).toContain("{{ previewOpen ? '收起预览' : 'DSL 预览' }}");
    /* 高度档随整段只在展开时渲染（1439：折叠态不再有标题条） */
    expect(view).toContain('data-sq-code-h');
  });
});
