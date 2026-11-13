/**
 * 四百四十批：DevTools Tab 双击重命名——多标签高频用户区分现场（如「大查询」「回放」）。
 * 双击标题→内联输入（自动聚焦）→Enter/失焦提交（自定义名执行不再被 path 派生覆盖，
 * named 标志随 persist 落盘）、Esc 取消；单击切换与中键关闭（439）不受影响。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('Tab 双击重命名（440 批）', () => {
  it('重命名交互链：dblclick→内联输入→Enter/blur 提交→Esc 取消', () => {
    expect(v).toMatch(/@dblclick\.self="startRename\(i\)"/);
    expect(v).toMatch(/<input v-if="renamingIdx === i" v-model="renameVal" class="dt-tab-ren mono"/);
    expect(v).toMatch(/@keydown\.enter\.prevent="commitRename\(i\)" @keydown\.esc\.prevent="renamingIdx = null"/);
    expect(v).toMatch(/@blur="commitRename\(i\)"/);
    expect(v).toMatch(/function startRename\(i: number\)/);
    expect(v).toMatch(/function commitRename\(i: number\)/);
  });

  it('自定义名执行不覆盖（named 标志随 persist 落盘）', () => {
    expect(v).toMatch(/if \(seg && !t\.named\) t\.title = seg;/);
    expect(v).toMatch(/named\?: boolean;/);
    expect(v).toContain('tabs.value[i].named = true; persist();');
  });

  it('输入自动聚焦（vFocus 指令）', () => {
    expect(v).toContain('v-focus');
    expect(v).toContain("mounted: (el: HTMLElement) => el.focus()");
  });
});
