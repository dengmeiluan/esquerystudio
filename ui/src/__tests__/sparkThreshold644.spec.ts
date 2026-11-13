/**
 * 六百四十四批：迷你 spark 阈值线几何常量漂移修复（20 → SPARK_H）。
 *
 * 病灶（629 批升档遗漏）：节点卡内迷你走势（.ld-spark）的折线 viewBox 与点串已收口
 *   `'0 0 180 ' + SPARK_H`（24px）与 `sparklinePointsPct(..., 180, SPARK_H)`，但阈值虚线
 *   仍写死 `20 - 20 * (m.thresh / 100)`——用旧 20px 迷你高（629 升档前）算 y，与折线 24px
 *   坐标系不同源：阈值线指示的百分比位置与曲线错位（heap 85% 阈值画在 20px 刻度 3.0 而非
 *   24px 刻度 3.6）。629 的「旧几何字面零残留」锁 `180,20`/`0 0 180 20` 但漏了 `20 - 20 *`。
 *   收口：阈值线 y 改 `SPARK_H - SPARK_H * (m.thresh / 100)`，与折线同源；旧 `20 - 20 *` 零残留。
 *   负锁剥注释（unifyWave561 口径）。
 *
 * ⚠七百八十一批 K3 改写：节点卡迷你 spark 整体退役（用户实报「节点卡信息过密」——
 *   与节点对比图〔seg 五档同数据〕+历史趋势「按节点查看」下钻重复=页面元素零重复面）。
 *   本 spec 锁对象（迷你 spark 阈值线）随之消亡——原几何同源锁退役，改立「迷你 spark
 *   零回潮」守卫（.ld-spark 族与 NODE_METRICS 字面零在场，防复发）；
 *   行为级断言在 liveUnifiedAxes781.spec K3 承接。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const VIEW = codeOf('views/LiveDashboardView.vue');

describe('六百四十四批（781 批 K3 改写）：迷你 spark 退役守卫', () => {
  it('节点卡迷你 spark 零回潮（.ld-spark 族/NODE_METRICS 零在场）', () => {
    expect(VIEW, 'ld-spark 类零残留').not.toContain('ld-spark');
    expect(VIEW, 'NODE_METRICS 表零残留').not.toContain('NODE_METRICS');
    expect(VIEW, '迷你 viewBox 零残留').not.toContain('0 0 180');
  });

  it('旧 20 字面零残留（629 升档遗漏的阈值线，史志负锚维持）', () => {
    expect(VIEW, '旧 20px 阈值线零残留').not.toContain('20 - 20 *');
  });
});
