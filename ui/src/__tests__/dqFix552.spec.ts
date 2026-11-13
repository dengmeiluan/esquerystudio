/**
 * 五百五十二批 W1：用户真机实报 DQ 布局七点修复（源码静态锁定，readFileSync 形态同族
 * dqHeightUnify549）。七点：
 * ① 参数面板不铺满/未执行更诡异（总根因）：dq-params-body 误嵌 dq-run-row 内成 flex item
 *    （只占内容宽靠左、右侧留白）——移出 run-row 成 dq-run-sec 直接子级（541 批注释宣称的
 *    结构）+width:100%；
 * ② JSON 顶部被裁/四视图切换跳变：.dq-res-body > :deep(.rt) 死规则（516 批起 RT 根=
 *    FocusableSurface 的 section.fs，选择器永不命中）→改锚 :deep(.fs) 按视图分档
 *    （table 档吃满剩余/alt 档 RT 只剩工具行自然高）；
 * ③ JSON 显示不全另一半：滚动位残留——切视图进 JSON/新查询完成时 scrollTop 归零；
 * ④ JQ+应用+检索参数异样：JQ 组 26px 控制线内 margin-top 下沉修治+input 定宽防挤行+
 *    应用钮 ghost 细边化（与清除钮同档）；
 * ⑤ 表格无法手动调高：run-sec 与结果区之间第二根 SplitHandle（dq.resultH 偏好落盘，
 *    >0 定高/=0 flex 消化零增量）；
 * ⑥ 直方图右缘游离浮块感：无时间字段弱化徽标+节头标题不吃满弹性+行尾弹性占位
 *    （开关跟随标题而非贴死右缘，549「开关=行右端」约定修订备案）；
 * ⑦ 未执行+收起态打开参数更诡异：buildCollapsed 收起联动 paramsOpen 自动收起。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
/* 五百五十八批同步更新：直方图节壳改用 HistogramSection，552 ⑥ 节头形态锁面同步更新组件源 */
const hist = readFileSync(join(__dirname, '../components/HistogramSection.vue'), 'utf-8');

describe('①params-body 移出 run-row（552 批总根因）', () => {
  it('run-row 闭合在 params-body 开标签之前（run-sec 直接子级，非 run-row flex item）', () => {
    const secAt = dq.indexOf('<div class="dq-run-sec">');
    const lockAt = dq.indexOf('btn-run-lock');
    const paramsAt = dq.indexOf('dq-params-standalone');
    expect(secAt).toBeGreaterThan(-1);
    expect(lockAt).toBeGreaterThan(-1);
    expect(paramsAt).toBeGreaterThan(lockAt);
    /* 执行钮（run-row 最后元素）与 params-body 之间恰有 2 个闭合 div：
       run-end 闭合+run-row 闭合=块已出 run-row（嵌套态是 0 个） */
    const between = dq.slice(lockAt, paramsAt);
    expect((between.match(/<\/div>/g) || []).length, 'run-row 已闭合').toBe(2);
    /* 仍在 run-sec 容器内（541 批统一容器契约延续，lint-fallback 在 run-sec 之后）。
       五百六十一批同步更新：.dq-lint-fallback 改用 theme.css .lint-bar/.lint-bar-warn 单源（类名锚同步） */
    expect(paramsAt).toBeGreaterThan(secAt);
    expect(paramsAt).toBeLessThan(dq.indexOf('lint-bar lint-bar-warn'));
  });
  it('dq-params-body 定宽铺满（width:100% 在场）', () => {
    expect(dq.match(/\.dq-params-body \{[^}]*\}/)?.[0]).toMatch(/width: 100%/);
  });
});

describe('②:deep(.fs) 分档命中（552 批，JSON 顶裁/切视图跳变根治）', () => {
  it('死规则 :deep(.rt) 退役（516 批起 RT 根是 section.fs，选择器永不命中）', () => {
    expect(dq, ':deep(.rt) 直接子选择器死规则退役').not.toMatch(/:deep\(\.rt\)/);
  });
  it('新锚 :deep(.fs) 在场且按视图分档（table 吃满/alt 自然高）', () => {
    expect(dq).toMatch(/\.dq-res-body > :deep\(\.fs\) \{ flex: 1 1 0; min-height: 0; \}/);
    expect(dq).toMatch(/\.dq-res-body\.alt-view > :deep\(\.fs\) \{ flex: 0 0 auto; height: auto; \}/);
  });
  it('alt-view 分档动态类绑在 dq-res-body 上（view !== \'table\'，非 :has()）', () => {
    expect(dq).toMatch(/class="dq-res-body" :class="\{ 'alt-view': view !== 'table' \}"/);
  });
  it('死掉的 fs-active 后代选择器处置（:2214 无锁面退役；:2204 dslFocus435 锁面保形备案）', () => {
    expect(dq, 'json/tree 解封顶死规则退役').not.toMatch(/\.fs-active \.dq-json-wrap/);
    /* dslFocus435.spec:30 字面锁死（非所有权），保留并备案 */
    expect(dq).toMatch(/\.fs-active \.dq-res-body \{ height: 100%; overflow: auto; \}/);
  });
});

describe('③JSON 滚动位归零（552 批，显示不全另一半）', () => {
  it('切视图/新查询完成时 scrollTop 归零 watch 在场（jsonKw 保留则不重置）', () => {
    expect(dq).toMatch(/watch\(\[view, resp\]/);
    expect(dq).toMatch(/view\.value === 'json'[^]*?scrollTop = 0/);
    expect(dq).toMatch(/!jsonKw\.value\.trim\(\)[^]*?scrollTop = 0/);
  });
});

describe('④执行行右簇 JQ 形态统一（552 批）', () => {
  it('JQ 组 26px 控制线下沉修治（run-row 上下文 margin-top 归零；534 裸排锁面保形备案）', () => {
    expect(dq).toMatch(/\.dq-run-row \.dq-jq \{ margin-top: 0; \}/);
  });
  it('JQ input 定宽防超长 placeholder 挤行（min(320px,30vw)+禁收缩）', () => {
    expect(dq).toMatch(/\.dq-jq input \{ width: min\(320px, 30vw\); flex-shrink: 0; \}/);
  });
  it('应用钮升描边实底次级钮+icon（553 批同步更新修订：用户终审 ghost 形制「太廉价」——与「执行」主钮主次层级；清除钮仍 ghost 次次级）', () => {
    expect(dq).toContain('class="btn sm" @click="applyJq"');
    expect(dq, '旧 ghost 应用钮退役').not.toContain('class="btn sm ghost" @click="applyJq"');
  });
});

describe('⑤结果区高度拖柄（552 批，表格手动调高）', () => {
  it('第二根 SplitHandle 在场（axis=horizontal，v-show=resp，dq-height-handle 沿用）', () => {
    expect((dq.match(/<SplitHandle/g) || []).length, '双柄在场').toBe(2);
    /* 五百六十一批同步更新：.dq-lint-fallback 改用 .lint-bar 单源（位置锚类名同步） */
    const secCloseAt = dq.indexOf('lint-bar lint-bar-warn');
    const resultAt = dq.indexOf('class="dq-result"');
    const secondAt = dq.indexOf('<SplitHandle', dq.indexOf('<SplitHandle') + 1);
    expect(secondAt).toBeGreaterThan(-1);
    expect(secondAt, '第二柄在 run-sec 之后').toBeGreaterThan(secCloseAt);
    expect(secondAt, '第二柄在结果区之前').toBeLessThan(resultAt);
  });
  it('dq.resultH 偏好落盘+定高内联 style（>0 flex:0 0 auto；=0 零增量）', () => {
    expect(dq).toMatch(/usePref<number>\('dq\.resultH', 0\)/);
    expect(dq).toMatch(/function onResultResize/);
    expect(dq).toMatch(/:style="resultStyle"/);
    expect(dq).toMatch(/resultStyle[^;]*'0 0 auto'/);
  });
});

describe('⑥直方图观感（552 批，右缘游离浮块感修治；558 批同步更新：节壳改用 HistogramSection，节头形态锁同步更新组件源）', () => {
  it('无时间字段弱化徽标样式在场（全仓原无此类 CSS；开关在执行行，锁面留 DQ）', () => {
    expect(dq).toMatch(/\.dq-hist-none \{[^}]*font-size: var\(--fs-xs\)[^}]*\}/);
    expect(dq.match(/\.dq-hist-none \{[^}]*\}/)?.[0]).toMatch(/color: var\(--tx2\)/);
    expect(dq.match(/\.dq-hist-none \{[^}]*\}/)?.[0]).toMatch(/padding: 0 var\(--sp-1\)/);
  });
  it('节头标题不吃满弹性（flex:0 1 auto+min-width:0）+meta 省略号防撑行（558 同步更新组件源）', () => {
    expect(hist).toMatch(/\.dq-hist-head \.dq-sec-tg \{ flex: 0 1 auto; width: auto; min-width: 0; \}/);
    expect(hist).toMatch(/\.dq-hist-head \.dq-sec-meta \{[^}]*text-overflow: ellipsis/);
  });
  it('行尾弹性占位让开关组跟随标题（<div style="flex:1"></div> 在组件 hist-head 切片内；558 同步更新组件源）', () => {
    const headAt = hist.indexOf('class="dq-hist-head"');
    const bodyAt = hist.indexOf('dq-hist-body', headAt);
    expect(hist.slice(headAt, bodyAt)).toContain('<div style="flex:1"></div>');
  });
});

describe('⑦buildCollapsed 联动（552 批，收起态参数残留修治）', () => {
  it('构建区收起时 paramsOpen 自动收起（展开侧不自动展开）', () => {
    expect(dq).toMatch(/watch\(buildCollapsed, \(collapsed\) => \{\s*if \(collapsed\) paramsOpen\.value = false;/);
  });
});
