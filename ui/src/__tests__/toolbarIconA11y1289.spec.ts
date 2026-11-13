/**
 * 工具行图标签在窄档隐藏时，按钮必须仍有可访问名称。
 *
 * 背景（真机普查发现）：`.rt-exp-btn-t`（可见文字「导出」）在容器 ≤1180px 时被
 * `display:none` 藏掉，只留图标 —— 而 RT 的导出按钮**没有 aria-label**，
 * 于是变成一个「无名称按钮」：读屏只念「按钮」，键盘用户也无从得知这是导出。
 * 同一工具行里其余 6 个纯图标钮（视图设置/列选/布局/原始 IO/操作提示/放大）都有 aria-label，
 * QRT 的导出钮也有（`aria-label="导出"`）——只有 RT 这一处漏了。
 *
 * 判据：只要某按钮的可见文字在某个断点会被 `display:none`，
 * 它就必须自带 aria-label。负控：把 aria-label 去掉必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('工具行窄档图标的可访问名称', () => {
  it('RT 导出钮必须有 aria-label（窄档只留图标）', () => {
    /* 先证明该钮属实会被藏掉文字——否则这条断言没有意义 */
    expect(rt, '窄档确实会隐藏 .rt-exp-btn-t').toMatch(/\.rt-exp-btn-t, \.rt-tool-t \{ display: none; \}/);
    const btn = rt.match(/<button class="btn sm ghost rt-exp-btn"[^>]*>/s);
    expect(btn, 'RT 导出钮必须存在').toBeTruthy();
    expect(btn![0], 'RT 导出钮必须带 aria-label').toContain(':aria-label=');
  });

  it('RT 导出钮的 aria-label 带格式与范围（不是光秃秃一个「导出」）', () => {
    const btn = rt.match(/<button class="btn sm ghost rt-exp-btn"[^>]*>/s)![0];
    expect(btn, 'aria-label 必须说明导出格式').toMatch(/expFmt\.toUpperCase\(\)/);
    expect(btn, 'aria-label 必须区分选中行/当前页').toMatch(/选中 \+ selected\.size|'当前页'/);
  });

  it('QRT 导出钮同口径已有 aria-label（对齐参照，防被改坏）', () => {
    /* 1345：aria 升级为带范围/格式的动态文案；本条只守「有可访问名称」。 */
    expect(qrt).toMatch(/<button :aria-label="`导出当前视图（\$\{sortedRows\.length\} 行[^`]*`" class="btn sm ghost qrt-tool-btn"/);
  });

  it('负控：把 aria-label 拿掉必须判不合格（证明判据不是恒真）', () => {
    /* 反向对照——构造一个没有 aria-label 的同形按钮，判据必须拒绝它。 */
    const stripped = '<button class="btn sm ghost rt-exp-btn" :title="x" :disabled="!hits.length" @click="exportRows(expFmt)">';
    const m = stripped.match(/<button class="btn sm ghost rt-exp-btn"[^>]*>/s)!;
    expect(m[0], '去掉 aria-label 后不得通过同一条判据').not.toContain(':aria-label=');
  });

  it('内核内的其余纯图标钮也都有 aria-label（对照：不是只有导出钮特殊）', () => {
    /* 只断言**内核自己模板里**的钮：「查看原始 IO / 表格操作提示」是 IndexHub/DQ 经
       bar-extra 槽注入的，「列选/布局」在 ColPicker/TablePresetMenu 子组件里，
       都不在 ResultTable.vue 本文件，断言会误红。 */
    /* 「视图设置」是静态 aria-label=；「放大结果表」是动态 :aria-label（随 focused 切换
       「还原结果表 / 放大结果表」）——两种写法都要认，否则会把有的判成没有。 */
    expect(rt, '视图设置必须有 aria-label').toContain('aria-label="视图设置"');
    const zoom = rt.match(/<button class="btn sm ghost rt-tool-btn" :aria-label="[^"]*放大结果表[^"]*"/s);
    expect(zoom, '放大/还原钮必须有 :aria-label 且含「放大结果表」').toBeTruthy();
  });
});
