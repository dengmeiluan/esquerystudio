/**
 * 五百四十七批 W6【查询工作台用户真机反馈专修】：DslQueryView 控件搬家+对齐（零高度链增量）。
 * 用户 20260921 真机截图四点：
 * ① 执行行右侧控件族高度参差——排查 543 批 --ctl-h 漏网件：AutoRefreshSelect 统一件自身
 *    .arf-sel 定高 25px（组件黑名单不可改，宿主侧 deep 覆盖合并 26px 同高）；
 * ② 工具行最左的 Profile 开关+自动刷新档位「应该统一放到右边」——迁执行行右组（dq-run-end）
 *    最左端起头，原左段 dq-run-left 容器退役；
 * ③ rt-bar 行中「直方图/无时间字段」checkbox 迁右侧控件族（#bar-extra 段首，与导出/统计同侧）；
 * ④ JSON 视图浮动搜索条遮挡内容且与 rt-bar 割裂——搜索/导航组寄居 rt-bar 工具行
 *    （#bar-prepend 视图段后，仅 JSON 档在场），浮动容器退役。
 * ⑤ 收尾：.card dq-res-body 结果区大卡壳退役（alt-body border-top 分节+圆角同步更新，
 *    rt-bar 顶圆角连体耦合规则退役）+死样式清扫（dq-split/dq-brush-tip/dq-res-meta/hist-*）。
 * 备案：resMeta computed 无模板消费，但 queryWorkbenchW1.spec「P1 命中数常驻」源锚逐字钉死
 * （与 TookBadge import 行同批语义）——保留并备案，删除属锁同步更新职责。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

const prependAt = dq.indexOf('<template #bar-prepend>');
const extraAt = dq.indexOf('<template #bar-extra>');
const rtEndAt = dq.indexOf('</ResultTable>');
const prependSlice = dq.slice(prependAt, extraAt);
const extraSlice = dq.slice(extraAt, rtEndAt);
const runEndAt = dq.indexOf('<div class="dq-run-end">');
const runEndSlice = dq.slice(runEndAt, dq.indexOf('dq-params-tg'));

describe('执行行右组对齐（547 批①）', () => {
  it('543 批 --ctl-h 漏网合并：自动刷新统一件 arf-sel 宿主侧吃满 26px（组件自身 25px 杂档根治）', () => {
    expect(dq).toMatch(/\.dq-run-row :deep\(\.arf-sel\) \{ height: var\(--ctl-h\); \}/);
  });
  it('档钮/应用钮既有 ctl-h 锚不回流（eh-btn + btn.sm 同高族）', () => {
    expect(dq).toMatch(/\.dq-run-row \.dq-eh-btn \{ height: var\(--ctl-h\); \}/);
    expect(dq).toMatch(/\.dq-run-row :deep\(\.btn\.sm\) \{ height: var\(--ctl-h\); \}/);
  });
});

describe('Profile 开关+自动刷新档位迁右（547 批②）', () => {
  it('Profile 开关与「关」档下拉在执行行右组（dq-run-end 内、检索参数钮之前）', () => {
    expect(runEndSlice).toContain('v-model="profileOn"');
    expect(runEndSlice).toContain('v-model:ms="autoRefreshMs"');
    expect(runEndAt).toBeGreaterThan(-1);
  });
  it('原左段容器 dq-run-left 退役（not-contains）', () => {
    expect(dq).not.toContain('<div class="dq-run-left">');
    expect(dq).not.toMatch(/\.dq-run-left \{/);
  });
});

describe('直方图 checkbox 归宿（547 批③→549 批三迁→553 批四迁同步更新）', () => {
  it('553 批：开关迁执行行右组 Profile 旁（用户终审「直方图按钮应该跟 Profile 按钮样式一样，位置一块」；主契约 dqHistHead549.spec）', () => {
    const runRowAt = dq.indexOf('<div class="dq-run-row">');
    const runRow = dq.slice(runRowAt, dq.indexOf('dq-params-standalone'));
    expect(runRow).toContain('v-model="autoHist"');
    expect(runRow).toContain('dq-bar-hist');
    expect(runRow.indexOf('v-model="profileOn"')).toBeLessThan(runRow.indexOf('v-model="autoHist"'));
  });
  it('bar-prepend 左段与 bar-extra 右簇均不再承载直方图开关（两处旧位置退役）', () => {
    expect(prependSlice).not.toContain('autoHist');
    expect(extraSlice).not.toContain('v-model="autoHist"');
  });
});

describe('JSON 搜索/导航组寄居 rt-bar（547 批④）', () => {
  it('搜索JSON 输入+计数+上下导航在工具行 bar-prepend 段内（仅 JSON 档在场）', () => {
    expect(prependSlice).toContain('v-model="jsonKw"');
    expect(prependSlice).toContain('jsonFind.next()');
    expect(prependSlice).toContain('dq-json-mc');
    expect(prependSlice.indexOf('v-if="view === \'json\'"')).toBeGreaterThan(-1);
  });
  it('原浮动容器退役：dq-json-wrap 内不再有浮层搜索条（sticky 形态 retired）', () => {
    const wrapAt = dq.indexOf('dq-json-wrap dq-alt-body');
    /* 五百六十五批同步更新（击穿者：565 件③ alt 体改用 AltHitsViews 统一件）——
       旧直挂 pre（ref="jsonBox"）迁组件 instance ref（preEl expose），锚面等价迁到
       组件开标签；wrapAt..preAt 区间内无浮层搜索条的锁意不变 */
    const preAt = dq.indexOf('<AltHitsViews ref="jsonBox"');
    expect(wrapAt).toBeGreaterThan(-1);
    expect(preAt).toBeGreaterThan(wrapAt);
    expect(dq.slice(wrapAt, preAt)).not.toContain('dq-json-find');
    expect(dq).not.toMatch(/\.dq-json-find \{[^}]*position: sticky/);
  });
});

describe('结果区卡壳退役（547 批⑤）', () => {
  it('.card dq-res-body 卡壳退役（dq-res-body 布局容器保留）', () => {
    expect(dq).not.toContain('card dq-res-body');
    expect(dq).toContain('class="dq-res-body"');
  });
  it('alt-body 改 border-top 分节（自带完整边框+四角圆角），rt-bar 顶圆角连体耦合规则退役', () => {
    /* 五百五十一批同步更新（击穿者：551 轨2 刀⑦a）：547 四边框独立分节框退役 → border-top 分节
       （dt-hist 534 同语言；锁意图=alt-body 与工具行连体分节，rt-bar deep 规则不回流） */
    expect(dq).toMatch(/\.dq-alt-body \{ border-top: 1px solid var\(--line\); margin-top: var\(--sp-2\); padding-top: var\(--sp-1h\); \}/);
    expect(dq).not.toMatch(/\.dq-alt-body \{ border: 1px solid var\(--line\); border-radius: var\(--r-m\); background: var\(--bg1\); \}/);
    expect(dq).not.toContain('.dq-res-body :deep(.rt-bar)');
  });
});

describe('死样式清扫（547 批⑤收尾）', () => {
  it('零引用死样式退役（模板逐个 grep 零引用后删）', () => {
    expect(dq).not.toMatch(/\.dq-split \{/);
    expect(dq).not.toMatch(/\.dq-split:hover/);
    expect(dq).not.toContain('.dq-brush-tip');
    expect(dq).not.toContain('.dq-res-meta');
    expect(dq).not.toMatch(/\.hist-item \{/);
    expect(dq).not.toMatch(/\.hist-dsl \{/);
    expect(dq).not.toMatch(/\.hist-meta \{/);
    expect(dq).not.toMatch(/\.hist-acts \{/);
  });
  it('resMeta computed 保留（queryWorkbenchW1 源锚钉死，备案项非死代码可删面）', () => {
    expect(dq).toContain('const resMeta = computed');
  });
});
