/**
 * 五百四十九批：用户真机实报专修（截图 8 张，20260921）——
 * ①「对半默认编辑器高度有问题，拉伸没用，回不去了」——高度链双轨分裂：
 *   .dq-main 高度（34vh/拖柄落盘）与 Monaco 高度档（S/M/L/满=固定 px）是两套独立系统，
 *   dq-main 34vh 高但编辑器只 200px，余下全变空白带；拖柄调 dq-main 时编辑器不动（拉伸没用），
 *   拖完落盘无重置入口（回不去）。根治=高度链合一：Monaco 在 pane 内 flex 填满，
 *   S/M/L/满 档位改为驱动 dq-main 高度档，拖柄=自定义态，点档位钮=重置入口。
 * ②条件树/编辑器独占态：0 宽 pane 还原柄孤立悬在屏幕右缘（异物）——542 批已约定
 *   工具行 seg 常驻还原，柄的还原职责退役，独占态整栏无柄。
 * ③表格无「顶满当前页」快捷入口（RT 内建放大是全局聚焦面，语义不同）——
 *   表格工具行加「顶满」toggle（收起构建区，表格吃满本页 flex）。
 * ④视图 seg 窄容器换行（卡片掉第二行）——DQ scoped seg nowrap。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const wl = readFileSync(join(__dirname, '../components/WorkbenchLayout.vue'), 'utf-8');

describe('高度链合一（549 批，用户实报「拉伸没用/回不去了」）', () => {
  it('Monaco 在编辑器 pane 内 flex 填满（固定高度档退役，dq-editor-full 条件类泛化）', () => {
    expect(dq, 'EDITOR_HEIGHTS 固定档传参退役').not.toContain(':height="EDITOR_HEIGHTS[editorH]"');
    expect(dq, '条件类退役（弹性恒生效）').not.toContain("'dq-editor-full'");
    expect(dq.match(/\.dq-editor \{[^}]*flex-direction: column/), '.dq-editor 恒 flex 列').toBeTruthy();
    expect(
      dq.match(/\.dq-editor :deep\(\.monaco-host\) \{[^}]*flex: 1 1 0;[^}]*height: auto !important/),
      'monaco-host flex 填满 pane（原 full 档范式泛化）',
    ).toBeTruthy();
  });
  it('S/M/L/满 档位驱动 dq-main 高度（DQ_MAIN_H 四档映射在场）', () => {
    expect(dq).toMatch(/DQ_MAIN_H[^=]*= \{/);
    expect(dq).toMatch(/s: '260px'/);
    expect(dq).toMatch(/m: 'max\(360px, 40vh\)'/);
    expect(dq).toMatch(/l: 'max\(480px, 56vh\)'/);
    /* 1038 满=结果优先：构建区收细条，结果区吃满其余（锚随批迁移） */
    expect(dq).toMatch(/full: '160px'/);
  });
  it('dq-main 高度恒由内联 style 承接（CSS 固定 34vh 档退役=空白带根治）', () => {
    expect(dq.match(/\.dq-main \{[^}]*\}/)?.[0], 'CSS 不再定高').not.toMatch(/height:\s*max\(260px,\s*34vh\)/);
    expect(dq).toMatch(/dqMainStyle[^;]*dqMainH\.value > 0[\s\S]*?DQ_MAIN_H\[editorH\.value\]/);
  });
  it('拖柄=自定义态（四档钮全灭），点档位钮=重置回档位高度（「回不去」根治）', () => {
    expect(dq, '档位钮 on 判据含非自定义态').toMatch(/editorH === eh\.k && dqMainH <= 0/);
    /* 1114：档位点击收敛到 onEditorTier（设高度+清自定义+折叠态展开），
       清自定义高度语义由该处理函数承接 */
    expect(dq, '点档位钮清自定义高度').toContain('@click="onEditorTier(eh.k)"');
    expect(dq).toContain('dqMainH.value = 0;');
  });
  it('queryWorkbenchW1 的 34vh 字面锁已同步更新（本 spec 承接高度链契约）', () => {
    /* 原锁 queryWorkbenchW1.spec:101 断言 height: max(260px, 34vh) 在场——随退役改锚 */
    expect(dq).not.toContain('max(260px, 34vh)');
  });
});

describe('独占态柄隐藏（549 批，用户实报「孤立拖柄」）', () => {
  it('WorkbenchLayout：独占态（maximizedId 在场）整栏无柄——还原走工具行 seg（542 约定）', () => {
    expect(wl).toMatch(/:last="stacked \|\| isLastPane\(i\) \|\| maximizedId != null"/);
  });
});

describe('表格顶满当前页快捷（549 批，用户实报「没看到顶满快捷」）', () => {
  it('表格工具行视图段旁有「顶满」toggle（收起构建区，表格吃满本页 flex）', () => {
    const prependAt = dq.indexOf('<template #bar-prepend>');
    const prependEnd = dq.indexOf('</template>', prependAt);
    const slice = dq.slice(prependAt, prependEnd);
    expect(slice).toContain('顶满');
    expect(slice, 'toggle buildCollapsed').toMatch(/buildCollapsed = !buildCollapsed/);
  });
});

describe('视图 seg 不换行（549 批，用户实报「点击时表头布局变形」）', () => {
  it('DQ scoped：结果区 seg 禁换行（卡片掉第二行根治；全局 .seg 不动）', () => {
    expect(dq).toMatch(/\.dq-res-body :deep\(\.seg\) \{[^}]*flex-wrap: nowrap/);
  });
});
