/**
 * 布局「假遮挡/折叠」守卫——用户产线实报三连：
 * ①DevTools 进来永久「执行中」（busy 被持久化，恢复后计时器归零、执行钮 disabled 死锁）；
 * ②可调工作台右侧大片空白（两 sized pane 尺寸和 < 容器宽，最后一个 pane 不吸收剩余，
 *   聚焦钮悬浮在空白边——DevTools/分词验证等八视图同源）；
 * ③pane 标题（请求体/响应/分词结果）被压成 ~49px 窄条逐字换行成意外竖堆。
 * Monaco 在 happy-dom 必炸，沿用 源码静态锁手法。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rd = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const devtools = rd('views/DevToolsView.vue');
const wl = rd('components/WorkbenchLayout.vue');
const rp = rd('components/ResizablePane.vue');
const analyze = rd('views/AnalyzeView.vue');

describe('busy 不持久化（，DevTools 永久执行中死锁根治）', () => {
  it('persist 落盘前强制 busy:false', () => {
    /* v3.0.1 可重入性:tabs+active 合并单草稿对象(300ms 防抖+pagehide 冲刷),busy 剥离契约不变。
       同步更新（击穿者：565 件⑤——剥离面扩 segRuns/segView 段锚，与 result 同保密级） */
    expect(devtools).toMatch(/JSON\.stringify\(\{\s*active: active\.value,\s*tabs: tabs\.value\.map\(t => \(\{ \.\.\.t, result: null, resultFull: null, busy: false, segRuns: \[\], segView: -1 \}\)\)/);
  });
  it('恢复侧 busy 兜底复位（存量脏数据自愈）', () => {
    /* v3.0.1:errBrief 随 busy 一并入恢复侧复位(语义不变,新增字段) */
    expect(devtools).toMatch(/tabs\.value = raw\.tabs\.map\(\(t: any\) => \(\{ \.\.\.t, busy: false, errBrief: null \}\)\)/);
  });
});

describe('最后一个 sized pane 吸收剩余空间（右侧空白根治）', () => {
  it('isFill 驱动 wl-fill-pane，且后随 flex pane 时不得 fill（502 修正：查询工作台 tree 被误拉 894px 挤爆 flex 工作台；582 同步更新 538 isPaneHidden 语义超集）', () => {
    expect(wl).toMatch(/'wl-fill-pane': isFill\(spec, i\)/);
    /* 同步更新： isFill 升级——collapsedIds 单一判据换 isPaneHidden
       （折叠||独占隐藏语义超集），后随 flex 让位条件加 !isPaneHidden（被独占隐藏的 flex
       不再吸收剩余空间）。语义与旧锁同向且更强，函数体字面同步更新。 */
    expect(wl).toMatch(/function isFill\(spec: WorkbenchPaneSpec, index: number\) \{\s*if \(stacked\.value \|\| isFlex\(spec\) \|\| isPaneHidden\(spec\)\) return false;\s*const rest = props\.panes\.slice\(index \+ 1\);\s*\/\* [\s\S]*? \*\/\s*if \(rest\.some\(p => isFlex\(p\) && !isPaneHidden\(p\)\)\) return false;\s*return rest\.every\(p => isPaneHidden\(p\)\);\s*\}/);
  });
  it('fill 规则保留 width 作 basis（flex:1 1 auto，拖拽语义不变）', () => {
    expect(wl).toMatch(/\.wl-fill-pane \{ flex: 1 1 auto !important; \}/);
  });
});

describe('vertical 轴 pane 标题竖排设计化（意外窄条换行根治）→ 554 同步更新：竖排轨死码退役', () => {
  it('竖排轨 CSS 退役（消费端全量 title:\'\' 后死码，清退；横排 .rp-title 基础档与头分支保留）', () => {
    expect(rp).not.toMatch(/\.axis-vertical > \.rp-title/);
    expect(rp, '竖排 writing-mode 随轨退役').not.toContain('writing-mode');
  });
});

describe('分词验证头部防溢出 + 路径 hint 修正', () => {
  it('index 空显示全局 /_analyze（不再拼接出 /_analyze/_analyze）', () => {
    expect(analyze).toContain("POST {{ index ? '/' + index + '/_analyze' : '/_analyze' }}");
    expect(analyze).not.toContain("POST /{{ index || '_analyze' }}/_analyze");
  });
  it('窄 pane 头部可换行 + hint 收缩省略（运行钮不再被右缘裁切）', () => {
    expect(analyze).toMatch(/\.av-left \.card-t \{ flex-wrap: wrap; row-gap: (?:4px|var\(--sp-1\)); \}/);
    expect(analyze).toMatch(/\.av-left \.av-body-hint \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
  });
});

describe('聚焦面内嵌限高解除（，404 同款收口）', () => {
  it('SearchSandbox 聚焦态解除 ss-err-pre / ss-hit-src pre 限高', () => {
    const sb = rd('views/SearchSandboxView.vue');
    expect(sb).toMatch(/\.fs-active \.ss-err-pre, \.fs-active \.ss-hit-src pre \{ max-height: none; flex: 1 1 auto; \}/);
  });
  it('查询工作台执行行窄栏可换行、开关标签不逐字断（直方图竖排堆叠根治）', () => {
    const dq = rd('views/DslQueryView.vue');
    expect(dq).toMatch(/\.dq-run-row \{ flex-wrap: wrap; row-gap: (?:8px|var\(--sp-2\)); \}/);
    expect(dq).toMatch(/\.dq-run-row \.dq-sw, \.dq-run-row \.dq-ar, \.dq-run-row > \.btn \{ white-space: nowrap; flex-shrink: 0; \}/);
  });
});

describe('折叠面板塌缩到标题轨（，孤钮空壳根治）', () => {
  it('collapsed 时 paneStyle 塌缩为 34px 标题轨（不再留空壳面板+孤钮）', () => {
    expect(rp).toMatch(/if \(props\.collapsed\) \{\s*return props\.axis === 'vertical'\s*\? \{ width: '34px', minWidth: '34px', maxWidth: '34px' \}\s*: \{ height: '34px', minHeight: '34px', maxHeight: '34px' \};/);
  });
});
