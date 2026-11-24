/**
 * 六百批·值位候选类型精化收尾——FieldSelect/ClauseNode 接 useTermsSuggest 第二参 types
 * （轨1 宪法锚点「值位候选时延」五消费面接线 3/5→5/5 收口；五百六十五批件②三处先例同范式）。
 *
 * 背景：useTermsSuggest 可选第二参 types（563 约定）让候选展示值按 rankTermsByType
 * 类型精化排序（date 字段 ISO 形态排前、数值形态排前，缓存/stash 仍存 ES 权威序）。
 * 565 批已接线 LuceneInput/BoostTuner/sqlCompletion 三处；FieldSelect（字段选择器选中
 * keyword 族即空前缀预载）与 ClauseNode（条件树值位 datalist 双源之 terms-agg 源）两处
 * 仍无 types——builder 值位候选不吃精化：date 字段的 epoch 裸值与 ISO 形态混排，用户
 * 要多扫一眼才能拿到类型正确形态的值。
 *
 * 锁面（565 A 段同范式源码锁；静默闸 getActivePinia 三元形态随行保留）：
 *   A1 FieldSelect：valSuggest 定义行带 () => props.types 第二参；
 *   A2 ClauseNode：termCtx 定义行带 () => props.types 第二参。
 * 精化排序行为本体由 suggestTiers563 C 段 + termTypeRank565 B 段真函数锚覆盖，不重复。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

describe('六百批 A：builder 双面 types 接线（源码锁，565 A 段同范式）', () => {
  it('FieldSelect：值位 terms 候选接 types（来源=本组件 props.types 字段表，静默闸形态不变）', () => {
    const fsSrc = read('components/builder/FieldSelect.vue');
    expect(fsSrc).toMatch(
      /const valSuggest = getActivePinia\(\) \? useTermsSuggest\(curFieldSearchIndex, \(\) => props\.types\) : null;/,
    );
  });

  it('ClauseNode：值位 terms 候选接 types（来源=本组件 props.types 字段表，静默闸形态不变）', () => {
    const cn = read('components/builder/ClauseNode.vue');
    expect(cn).toMatch(
      /const termCtx = getActivePinia\(\) \? useTermsSuggest\(curFieldSearchIndex, \(\) => props\.types\) : null;/,
    );
  });
});
