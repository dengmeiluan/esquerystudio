/**
 * 六百三十批：连接列表「被挤没」修复（用户产线实报）。
 *
 * 688 页签重造后的不变量（原双折叠节已退役，病灶从结构上消失）：
 *  - 列表与表单分属互斥页签，任一时刻只有一个面板在场，不再互相挤压；
 *  - 列表页签保底 min-height（≥3 行卡可见可点），列表自身仍是滚动区；
 *  - 表单页签独占整幅高度并自滚，主按钮 sticky 钉底不滚出视野。
 *
 * 风格：source-lock（naive 弹层挂载易碎不 mount，ClusterSwitcher 既有 spec 全 source-lock）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cs = readFileSync(join(__dirname, '../components/ClusterSwitcher.vue'), 'utf-8');

describe('连接列表整幅高度（688 页签重造·630 病灶不复发）', () => {
  it('列表页签带最小高度保底（不再是可与表单互挤的收缩项）', () => {
    expect(cs).toMatch(/\.cm-pane-list \{[^}]*min-height:\s*2\d\dpx/s);
    expect(cs).not.toContain('listFoldOpen');
  });
  it('列表自身仍是滚动区：overflow-y auto 不回退', () => {
    expect(cs).toMatch(/\.cm-list \{[^}]*overflow-y:\s*auto/s);
  });
});

describe('表单页签独占空间（688）', () => {
  it('表单面板自滚承担高度', () => {
    expect(cs).toMatch(/\.cm-pane-form \{[^}]*overflow-y:\s*auto/s);
  });
  it('列表与表单互斥渲染（v-show 页签，非折叠节；无管理权时回退列表）', () => {
    expect(cs).toContain(`v-show="manageTab === 'list' || !canAdmin"`);
    expect(cs).toMatch(/v-show="manageTab === 'form'"/);
    expect(cs).not.toContain('cm-fold');
  });
});

describe('主按钮不滚出视野（688）', () => {
  it('表单操作行 sticky 钉底（同底色，不新增色值）', () => {
    expect(cs).toMatch(/\.cm-pane-form \.cm-form-ops \{[^}]*position:\s*sticky/s);
    expect(cs).toMatch(/\.cm-pane-form \.cm-form-ops \{[^}]*bottom:\s*0/s);
    expect(cs).toMatch(/\.cm-pane-form \.cm-form-ops \{[^}]*background:\s*var\(--bg2\)/s);
  });
});

describe('625 批既有契约不回退（688 同步更新锁）', () => {
  it('弹窗恒不超屏语义保留', () => {
    expect(cs).toMatch(/width:760px;max-width:94vw;max-height:86vh/);
  });
  it('permGating 页签 wrapper 模板串逐字不变', () => {
    expect(cs).toContain('<div v-if="canAdmin" v-show="manageTab === \'form\'" class="cm-pane cm-pane-form"');
  });
});
