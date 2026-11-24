/**
 * 五百一十九批：列宽适应内容内核（useColFit）——RT/QRT 各自手写 fitCol 合并。
 * 锁定：测量=列头名与前 N 行单元格 scrollWidth 取最大；前置固定列偏移注入（RT=2/QRT=1）；
 * 钳位 COL_W_MIN~COL_W_MAX=60~600（五百二十批起上限与两表手动微调同源——双击自适应
 * 不再反缩手动拖宽的列）；max=0 安全 no-op 不写宽（happy-dom 无布局引擎口径）；
 * fitAll 遍历全部注入列。
 */
import { describe, it, expect } from 'vitest';
import { useColFit, COL_W_MIN, COL_W_MAX } from '../composables/useColFit';

function makeRoot(opts: { thW?: Record<string, number>; rows: number[][] }) {
  const trs = opts.rows.map(cells => ({ children: cells.map(w => ({ scrollWidth: w })) }));
  return {
    querySelector: (sel: string) => {
      const m = sel.match(/data-col="([^"]+)"/);
      const w = m && opts.thW?.[m[1]];
      return w != null ? { scrollWidth: w } : null;
    },
    querySelectorAll: () => trs,
  } as any;
}

describe('useColFit（五百一十九批）', () => {
  it('测量取列头/单元格最大值，+16 padding 写回；前置列偏移注入生效', () => {
    const written: Record<string, number> = {};
    const root = makeRoot({ thW: { a: 40 }, rows: [[0, 100], [0, 30]] });
    const { fitCol } = useColFit({
      rootEl: () => root,
      cols: () => ['a', 'b'],
      nameSel: '.x-name',
      cellOffset: 1,
      setWidth: (c, w) => { written[c] = w; },
    });
    fitCol('a');
    expect(written.a).toBe(116); // max(列头40, 格100)=100 +16
    fitCol('b'); // b 是 idx=1 → children[2] 不存在 → max=0 no-op
    expect(written.b).toBeUndefined();
  });

  it('钳位 60~600（五百二十批共享常量同源）；fitAll 遍历全部列；未知列安全 no-op', () => {
    expect(COL_W_MIN).toBe(60);
    expect(COL_W_MAX).toBe(600);
    const written: Record<string, number> = {};
    const root = makeRoot({ rows: [[1000, 10], [10, 10]] });
    const { fitCol, fitAll } = useColFit({
      rootEl: () => root,
      cols: () => ['big', 'tiny'],
      nameSel: '.x-name',
      cellOffset: 0,
      setWidth: (c, w) => { written[c] = w; },
    });
    fitCol('big');
    fitCol('tiny');
    expect(written.big).toBe(600);
    expect(written.tiny).toBe(60);
    written.big = 0;
    fitAll(); // 重算两列，值不变
    expect(written.big).toBe(600);
    expect(written.tiny).toBe(60);
    fitCol('nope');
    expect(written.nope).toBeUndefined();
  });

  it('五百二十批钳位语义：500 宽的列自适应不反缩（测量值 +16 落在上下限间原样写回）', () => {
    const written: Record<string, number> = {};
    const root = makeRoot({ rows: [[484], [484]] });
    const { fitCol } = useColFit({
      rootEl: () => root,
      cols: () => ['mid'],
      nameSel: '.x-name',
      cellOffset: 0,
      setWidth: (c, w) => { written[c] = w; },
    });
    fitCol('mid');
    expect(written.mid).toBe(500); // 484+16=500，不再被旧 320 上限压回
  });
});
