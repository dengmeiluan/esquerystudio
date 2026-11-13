/**
 * 五百四十一批：QueryTreePane 面板头「折叠全部/展开全部/启用全部/停用全部」四枚举按钮
 * 收敛为两枚状态感知循环钮（用户裁决原话：「折叠/开关按钮在穷举枚举」——平铺枚举退役）。
 * 全源码锚（本仓无 @vue/test-utils，readFileSync 锁 QueryTreePane.vue 形态）：
 * ① 折叠对：两文案必须挂同一状态感知表达式的 v-if/v-else 两分支，不得并列平铺四钮；
 * ② 启停对：同构收敛，状态源=树内叶 disabled 字段推导（leafStats.disabled 必然在场）；
 * ③ 状态感知锚：折叠态不进 queryTree（BoolGroupNode 组内 ref+scoped draft，树数据无字段）
 *    → 本地 ref 记忆上次动作；启停态 → disabled 推导 computed，点击动作随动翻转/写树；
 * ④ 原语义保留：tree.root.type==='bool' 与 !isPlainMatchAll 显隐条件、四条 title 原文。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/builder/QueryTreePane.vue'), 'utf-8');
const tpl = src.slice(0, src.indexOf('<script'));
const script = src.slice(src.indexOf('<script setup'));

const btnLine = (label: string) =>
  tpl.split('\n').find(l => l.includes('<button') && l.includes(label));

describe('五百四十一批：QueryTreePane 四枚举钮收敛为两枚状态感知循环钮', () => {
  it('折叠对：「展开全部」挂 v-if、「折叠全部」挂 v-else（不再并列平铺）', () => {
    const expand = btnLine('展开全部');
    const fold = btnLine('折叠全部');
    expect(expand, '「展开全部」按钮行应在场').toBeTruthy();
    expect(fold, '「折叠全部」按钮行应在场').toBeTruthy();
    expect(expand, '「展开全部」必须挂在 v-if 分支（状态感知）').toMatch(/v-if="anyCollapsed"/);
    expect(fold, '「折叠全部」必须是 v-else 反向分支').toMatch(/v-else/);
  });

  it('启停对：「启用全部」挂 v-if、「停用全部」挂 v-else（状态源=树内 disabled 推导）', () => {
    const enable = btnLine('启用全部');
    const disable = btnLine('停用全部');
    expect(enable, '「启用全部」按钮行应在场').toBeTruthy();
    expect(disable, '「停用全部」按钮行应在场').toBeTruthy();
    expect(enable, '「启用全部」的 v-if 应引用 hasDisabled 感知锚').toMatch(/v-if="hasDisabled"/);
    expect(disable, '「停用全部」必须是 v-else 反向分支').toMatch(/v-else/);
  });

  it('状态感知锚在场：折叠上次动作 ref + 启停 disabled 推导 computed，且点击随动', () => {
    expect(script, '折叠上次动作 ref 在场').toMatch(/const anyCollapsed = ref\(/);
    expect(script, 'broadcastCollapse 应把动作写回感知 ref（下一眼显反向动作）').toMatch(/anyCollapsed\.value = collapsed/);
    expect(script, 'disabled 推导 computed 在场').toMatch(/const hasDisabled = computed\(/);
    expect(script, 'hasDisabled 应从树内 disabled 字段推导（leafStats 递归统计）').toMatch(/leafStats\.value\.disabled/);
  });

  it('原语义保留：显隐条件原样 + 四条 title 原文', () => {
    expect(tpl).toContain('<template v-if="tree.root.type === \'bool\'">');
    expect(tpl).toContain('<template v-if="!isPlainMatchAll">');
    expect(tpl).toContain('title="折叠全部嵌套组"');
    expect(tpl).toContain('title="展开全部嵌套组"');
    expect(tpl).toContain('title="全部条件恢复参与匹配"');
    expect(tpl).toContain('title="全部条件临时停用（不删除，可恢复）"');
  });
});
