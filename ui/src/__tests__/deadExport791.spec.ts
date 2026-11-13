import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 七百九十一批·死码域新矿=stores/api 域死导出清零（deadExport791）。
 * Phase 0 全域扫描（src/stores/*.ts 5 产品文件+src/api.ts；789 修正版扫描器平移
 *   +791-C1 两折修正：①同行双 import 语句〔import A from 'x';import B from 'y'——
 *   行锚定按分号分段逐段锚定，EP=AdhocRebuildView:701 同行双语句消费首轮误判内部活〕
 *   ②模板域恒假判据=属性值 trim 后恰为 'false'〔===false 比较形态是活分支非死分支〕）。
 * 机器分型 41 export 符号=产品活 25+spec 孤儿 8+内部活 8；
 *   人工终审（787-C1④ 全树全文 grep+锁面逐把查证）：
 *   · get/post（api.ts）+pushNodeRateSeries（liveMonitor）=spec 真 import 直采
 *     → export 留供单测豁免（788-C1 测试资产保全 30 例族）；
 *   · TrackedJob/del/put 的 readFileSync「锁」=假锁（obsStack530 的 TrackedJob
 *     仅在 describe/it 文案，断言锁的是 kind 联合类型等他形态；del/put 词边界
 *     在 readFileSync spec 零实证）→ 归位内部活；
 *   · SLOW_REQUEST_MS=obsStack530:71 export 形态真锁+ClusterSyncReport=
 *     clusterConnSyncStale:20 声明形态真锁 → 去 export 须锁同步更新（787-C2/789 约定）。
 * 刀B=11 处去 export 关键字（api.ts 8：XB/authHeaders/REQUEST_TIMEOUT_MS/
 *   SLOW_REQUEST_MS/DateFormsResp/SnapshotStageCounts/SnapshotIndexProgress/
 *   ClusterSyncReport+liveMonitor NodeSeries+queryHistory QueryHistItem+
 *   jobTracker TrackedJob；零外部消费内部活，typecheck 0=零漏判铁证）
 *   +2 把文本锁同步更新（export 形态断言→^行锚形态）。
 * 真死 0（.ts 域残矿低收益观察档与 789/790 预期一致）；
 * 模板域死分支三形态三轮零命中=备案（786/790/791）。 */

const rd = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('七百九十一批：stores/api 域 export 私有化（11 处内部活+2 锁同步更新）', () => {
  const apiSrc = rd('../api.ts');
  const liveSrc = rd('../stores/liveMonitor.ts');
  const qhSrc = rd('../stores/queryHistory.ts');
  const jtSrc = rd('../stores/jobTracker.ts');

  /* [符号, 所属源] 参数化——A1/A2 双断言=前缀清零+本体保留（790 A2 口径防全删） */
  const knife: Array<[string, string]> = [
    ['XB', apiSrc], ['authHeaders', apiSrc], ['REQUEST_TIMEOUT_MS', apiSrc],
    ['SLOW_REQUEST_MS', apiSrc], ['DateFormsResp', apiSrc], ['SnapshotStageCounts', apiSrc],
    ['SnapshotIndexProgress', apiSrc], ['ClusterSyncReport', apiSrc],
    ['NodeSeries', liveSrc], ['QueryHistItem', qhSrc], ['TrackedJob', jtSrc],
  ];

  it.each(knife)('A1 %s：任何 export 形态复发即红（780-C1 任意形态口径）', (sym, src) => {
    expect(src, `${sym} export 复发（791 已私有化：零外部消费铁证在档）`)
      .not.toMatch(new RegExp(`^\\s*export[^\\n]*\\b${sym}\\b`, 'm'));
  });

  it.each(knife)('A2 %s：声明本体保留（防全删）', (sym, src) => {
    expect(src).toMatch(new RegExp(`\\b(?:const|interface)\\s+${sym}\\b`));
  });

  it('B1 豁免锚：get/post/pushNodeRateSeries export 保留（spec 直采=788-C1 测试资产保全）', () => {
    expect(apiSrc).toMatch(/^export const get = </m);
    expect(apiSrc).toMatch(/^export const post = </m);
    expect(liveSrc).toMatch(/^export function pushNodeRateSeries\(/m);
  });

  it('B2 产品活锚：EP/api export 形态在场（防误扩刀——EP=AdhocRebuildView 同行双语句消费）', () => {
    expect(apiSrc).toMatch(/^export const EP = /m);
    expect(apiSrc).toMatch(/^export const api = \{/m);
  });

  it('B3 锁同步更新自证：两把 readFileSync 文本锁已 ^行锚化（787-C2/789 约定）', () => {
    expect(rd('obsStack530.spec.ts')).toMatch(/\^const SLOW_REQUEST_MS = 10_000;\/m/);
    expect(rd('clusterConnSyncStale.spec.ts')).toMatch(/\^interface ClusterSyncReport \\\{\/m/); /* 781-C1：源文本是反斜杠花括号，正则须 \\\{ 双层 */
  });
});
