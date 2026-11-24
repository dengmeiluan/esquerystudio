import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1280 高下 34vh 编辑器把结果表压到最小 96px（宿主 iframe 更矮）。
   编辑器折叠只留卡头工具行，结果区上移；展开走同一行高链恢复，无遗留空档。 */
describe('SQL 编辑器折叠（给结果表让位）', () => {
  it('折叠状态持久化 + 卡头常驻切换钮 + 展开即恢复', () => {
    expect(SQL).toContain("usePref('sql.editorCollapsed', false)");
    expect(SQL).toContain('data-sq-editor-toggle');
    expect(SQL).toContain(':aria-expanded="!editorCollapsed"');
    expect(SQL).toContain("'editor-collapsed': editorCollapsed");
    expect(SQL).toContain(':class="{ collapsed: editorCollapsed }"');
    expect(SQL).toContain('<MonacoEditor v-if="!editorCollapsed"');
    expect(SQL).toContain('watch(editorCollapsed');
    expect(SQL).toContain('.sq-grid.editor-collapsed,');
    expect(SQL).toContain('.sq-grid.editor-collapsed:has(.sq-cost-hint) { grid-template-rows: auto; }');
    expect(SQL).toContain('.sq-editor.collapsed > :deep(.monaco-host)');
    /* 1.0.45：有结果时编辑器收到 22vh，把高度还给结果表，而不是固定整页总长。 */
    expect(SQL).toContain('.sq-grid:has(.sq-sec.wide) { grid-template-rows: minmax(120px, 22vh); }');
  });
});
