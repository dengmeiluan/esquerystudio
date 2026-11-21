/**
 * 五百四十一批：表格工具行合一（Lead 面 TDD 锚）——用户产线截图复报四缺陷的契约锁。
 * ① 视图 seg+分页器寄居 RT 自带工具行（#bar-prepend 槽），dq-res-head 退役；
 *   JSON/Tree/卡片视图下工具行常驻（hideBody），视图切换不再连工具行一起消失。
 * ② 检索参数折叠块与执行行统一容器（dq-run-sec）。
 * ③ 分栏档位钮常显（发现性——hover 才显形用户找不到，「没有快捷左右拉伸」实为不可见）。
 * 配对：IndexHub 接线在 indexHubBarPrepend541.spec（工蚁 B）、条件树四钮收敛在
 * queryTreePaneButtons541.spec（工蚁 A）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const sh = readFileSync(join(__dirname, '../components/SplitHandle.vue'), 'utf-8');

describe('表格工具行合一（541 批 Lead 面）', () => {
  it('RT 内核：bar-prepend 槽在场（bar-left 最前段）', () => {
    const barLeftAt = rt.indexOf('<template #bar-left>');
    const prependAt = rt.indexOf('<slot name="bar-prepend" />');
    expect(barLeftAt).toBeGreaterThan(-1);
    expect(prependAt).toBeGreaterThan(barLeftAt);
    expect(rt.indexOf('<span class="rt-info mono">')).toBeGreaterThan(prependAt);
  });

  it('RT 内核：hideBody prop 缺省 false——表格体与状态栏随隐藏、工具行常驻', () => {
    expect(rt).toContain('hideBody?: boolean');
    expect(rt).toContain('hideBody: false');
    /* 六百零九批同步更新：守卫字面 !hideBody→!bodyHidden（内核 viewSeg 内建档切换共用同一
       隐藏判定=hideBody ∪ 内建非表格档；判别力不变=体区/状态栏两守卫逐字保全） */
    expect(rt).toMatch(/<div v-show="!bodyHidden" ref="wrapEl" class="rt-wrap scroll-y"/);
    expect(rt).toMatch(/<div class="rt-status" v-show="!bodyHidden">/);
  });

  it('DslQueryView：dq-res-head 退役，seg+Pagination 寄居 #bar-prepend', () => {
    expect(dq).not.toContain('class="dq-res-head"');
    expect(dq).toContain('<template #bar-prepend>');
    const rtAt = dq.indexOf('<ResultTable ref="resultTbl"');
    const prependAt = dq.indexOf('<template #bar-prepend>');
    expect(rtAt).toBeGreaterThan(-1);
    expect(prependAt).toBeGreaterThan(rtAt);
    expect(dq).toMatch(/:hide-body="view !== 'table'"/);
    /* seg+分页在 prepend 槽内 */
    const segIn = dq.slice(prependAt).includes('v.t }}');
    expect(segIn).toBe(true);
  });

  it('DslQueryView：JSON/Tree/卡片视图区与工具行视觉连体（dq-alt-body）', () => {
    expect(dq).toContain('dq-json-wrap dq-alt-body');
    expect(dq).toContain('dq-tree-view dq-alt-body');
    expect(dq).toContain('dq-cards scroll-y dq-alt-body');
    /* 547 批同步更新：.card 结果区卡壳退役，alt-body 自成分节——border-top 补回+四角圆角自持
       （原 border-top:0+底圆角是卡壳连体一框耦合形态，随壳退役；rt-bar 顶圆角 deep 规则同批删除）。
       五百五十一批同步更新（击穿者：551 轨2 刀⑦a）：547 独立四边框分节框退役 → border-top 分节
       （dt-hist 534 同语言，dt-hist :951 口径；锁意图=三视图容器与工具行连体，类名锚零触） */
    expect(dq).toMatch(/\.dq-alt-body \{ border-top: 1px solid var\(--line\); margin-top: var\(--sp-2\); padding-top: var\(--sp-1h\); \}/);
  });
});

describe('执行统一容器（541 批）', () => {
  it('执行行与检索参数同处 dq-run-sec 容器（542 二刀同步更新：开关钮在 run-end 执行左侧，展开区独立其下）', () => {
    const secAt = dq.indexOf('<div class="dq-run-sec">');
    const runAt = dq.indexOf('<div class="dq-run-row">');
    const paramsAt = dq.indexOf('dq-params-standalone');
    expect(secAt).toBeGreaterThan(-1);
    expect(runAt).toBeGreaterThan(secAt);
    expect(paramsAt).toBeGreaterThan(runAt);
    /* 展开区在容器内（闭合校验：sec 之后 params 之前无提前闭合）。
       五百六十一批同步更新：.dq-lint-fallback 改用 theme.css .lint-bar 单源（类名锚同步） */
    expect(dq.slice(secAt, paramsAt)).not.toContain('lint-bar lint-bar-warn');
  });
});

describe('分栏档位钮常显（541 批发现性根治）', () => {
  it('sh-max 默认 opacity 非 0（常显半透明），hover/激活全显', () => {
    expect(sh).not.toMatch(/\.sh-max \{[^}]*opacity: 0;/);
    expect(sh).toMatch(/\.sh-max \{[^}]*opacity: 0\.55;/);
    expect(sh).toContain('.sh-max.sh-max-on { opacity: 1; }');
  });
});
