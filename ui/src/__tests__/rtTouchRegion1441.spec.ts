/**
 * 一千四百四十一批：RT 补触屏两击框选（与 QRT 1408 同款）。
 *
 * 缺口实证：QRT 有触屏框选（touchAnchor/pointerType 11 处），RT 0 处——
 * 用户在平板上打开查询工作台/索引工作台，根本框不出选区（拖动=滚动页面）。
 * 这是 1408 只补 QRT 一侧留下的不对称。
 *
 * 本批把同一套逻辑下沉到 RT：长按 500ms 设起点 → 点对角成矩形；
 * 起点格虚线标记 + 浮动条引导；同手势合成 mousedown 被时间窗短路。
 *
 * 锁：
 *  ① RT 有 pointer 绑定与两击逻辑；
 *  ② 起点格有 rt-region-anchor 类与虚线样式；
 *  ③ 起点待选时真有引导条（否则平板用户长按后看不到任何变化）；
 *  ④ 同手势合成 mousedown 被短路（仅靠 mousedown 路径会立刻把矩形清空）；
 *  ⑤ Esc/清除同时清起点。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('1441 RT 触屏两击框选', () => {
  it('① pointer 事件绑在单元格上，且两击逻辑存在', () => {
    expect(RT).toMatch(/@pointerdown="onCellPointerDown\(\$event, ri, ci\)"/);
    expect(RT).toMatch(/@pointerup="onCellPointerUp"/);
    expect(RT).toContain('function onCellPointerDown(e: PointerEvent, ri: number, ci: number)');
    expect(RT, '只认 touch').toContain("if (e.pointerType !== 'touch') return;");
    expect(RT, '长按阈值 500ms').toMatch(/\}, 500\);/);
  });

  it('② 起点格有类名与虚线样式', () => {
    expect(RT).toMatch(/'rt-region-anchor': !!touchAnchor && touchAnchor\.ri === ri && touchAnchor\.ci === ci/);
    expect(RT).toMatch(/\.rt-cell\.rt-region-anchor \{ outline: 2px dashed var\(--info-line\); outline-offset: -2px; \}/);
  });

  it('③ 起点待选时有引导条（平板用户必须看得见状态）', () => {
    expect(RT).toMatch(/v-if="touchAnchor && !region"/);
    expect(RT).toContain('已设框选起点');
  });

  it('④ 同手势合成 mousedown 被时间窗短路（否则矩形立刻被清空）', () => {
    expect(RT).toMatch(/if \(lastPointerWasTouch && Date\.now\(\) - touchStamp < 700\) return;/);
    /* 负控：去掉该短路 → 红 */
    expect(RT.replace(/if \(lastPointerWasTouch && Date\.now\(\) - touchStamp < 700\) return;/, ''))
      .not.toMatch(/lastPointerWasTouch && Date\.now\(\)/);
  });

  it('⑤ Esc / 清除同时清起点', () => {
    expect(RT, 'clearSel 清起点').toMatch(/function clearSel\(\) \{[^}]*touchAnchor\.value = null/);
    expect(RT, 'clearRegion 清起点').toMatch(/function clearRegion\(\) \{[^}]*touchAnchor\.value = null/);
  });

  it('⑥ 与 QRT 同款（防两边再次分叉）', () => {
    for (const marker of [
      "if (e.pointerType !== 'touch') return;",
      'touchAnchor.value = { ri, ci };',
      '}, 500);',
      'if (touchTimer) cancelTouchTimer();',
    ]) {
      expect(RT, 'RT 缺 ' + marker).toContain(marker);
      expect(QRT, 'QRT 缺 ' + marker).toContain(marker);
    }
  });
});
