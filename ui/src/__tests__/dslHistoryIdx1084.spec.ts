import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dsl = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

/* 1084：DSL 历史回放还原当时的索引现场。
 * 历史条目已记录 idx，但回放只装 DSL、按顶栏当前索引执行——A 索引的历史在切到 B 后
 * 回放会跑错索引。保存查询（saved）早已有跨索引连带切换语义，历史回放补齐同一约定。 */
describe('1084 DSL 历史回放切回记录索引', () => {
  it('回放先切索引，再按面板意图执行', () => {
    expect(dsl).toContain('const crossIdx = !!hst.idx && hst.idx !== store.pickedIdx;');
    expect(dsl).toContain('suppressIdxDslLoad = true;');
    expect(dsl).toContain('store.pick(hst.idx);');
    expect(dsl).toContain('已切到${label}索引 ${hst.idx} 并还原查询');
  });

  it('切索引执行前等 mapping 到位（直方图首查不丢）', () => {
    expect(dsl).toMatch(/if \(crossIdx\) \{[\s\S]{0,400}await preloadMapping\(\);[\s\S]{0,120}runQuery\(\);/);
  });

  it('保存查询复用历史回放：索引切换/mapping 等待单源，提示区分来源', () => {
    expect(dsl).toContain("await replayHist(sq, run, '保存时');");
    expect(dsl).not.toContain('suppressIdxDslLoad = true; store.pick(sq.idx);');
    expect(dsl).toContain('async function replayHist(hst: HistItem, run: boolean, label = \'历史记录\')');
    expect(dsl).toContain('已切到${label}索引 ${hst.idx} 并还原查询');
  });
});
