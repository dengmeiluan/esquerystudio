import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1114：构建区缺省收起时，点高度档不再「无反馈」——档位点击顺带展开构建区；
 默认收起（553 用户裁决）保持不变。 */
const view = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('1114 高度档点击展开构建区', () => {
  it('按钮走统一处理函数（不再内联改高度）', () => {
    expect(view).toContain('@click="onEditorTier(eh.k)"');
    expect(view).not.toContain('@click="editorH = eh.k; dqMainH = 0"');
  });

  it('点击档位：设高度 + 清自定义 + 折叠态时展开；默认收起裁决保留', () => {
    expect(view).toContain('function onEditorTier(k: EditorHKey) {');
    expect(view).toContain('editorH.value = k;');
    expect(view).toContain('dqMainH.value = 0;');
    expect(view).toContain('if (buildCollapsed.value) buildCollapsed.value = false;');
    expect(view).toContain("usePref('query.buildCollapsed', true)");
  });
});
