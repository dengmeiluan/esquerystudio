/**
 * 六百三十七批：周期档（对标阿里云每卡头「(周期:1分钟)」；626 裁决 D8 的「周期」半边，零 Java 改动）。
 *
 * 判据：
 *   1) 新增偏好 `usePref<string>('live.histPeriod','auto')`；档位 = 自动 / 原始逐点 /
 *      1m / 5m / 15m / 30m / 1h（**无 30 秒档**——采集默认 60s、下限 30s，
 *      30 秒桶在默认配置下产半空桶 = 「不存在的刻度」）；
 *   2) `mh2Interval` 由 `histPeriod` 驱动：auto→`intervalFor(mh2Range)`（现行为零变更）、
 *      raw→`undefined`（不传 interval＝controller 原始查询路径；`api.ts` 的 `q()` 对 undefined
 *      自动跳参）、其余→显式 date_histogram 桶宽字符串；
 *   3) 原始档 span 守卫：原始查询 size 钳 3000 + sort=asc，长窗先取满前 3000 行 →
 *      最新点被挡在窗外（≈ span > 50h 不安全）；以 `monitorSeries.MH_RAW_SPAN_MS` /
 *      `rawPeriodSafe` 判定，超限自动回落「自动」并在 title 说明；
 *   4) 落点在历史区工具行 ⋯（`<details class="ld-hist-more">`）浮层内（明面已用满 5 控件，
 *      铁律 C）；切档入重查 watch（独立 watch，**不得**连带重置 histGroup——它是导航过滤）。
 * 负锁一律剥注释后断言（unifyWave561 口径：历史备案注释里的字面不算数）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MH_RAW_SPAN_MS, rawPeriodSafe } from '../utils/monitorSeries';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const VIEW = codeOf('views/LiveDashboardView.vue');
const SERIES = codeOf('utils/monitorSeries.ts');

/** ⋯ 浮层内下拉落点锚 */
const MORE_IDX = VIEW.indexOf('class="ld-hist-more"');
const LABEL_IDX = VIEW.indexOf('聚合粒度');

describe('六百三十七批①：原始逐点 span 守卫单源（monitorSeries）', () => {
  it('MH_RAW_SPAN_MS = 50h（3000 点 × 60s 采集），并在守卫函数内参与判断', () => {
    expect(MH_RAW_SPAN_MS).toBe(50 * 3.6e6);
    expect(SERIES, '常量单源在场').toContain('export const MH_RAW_SPAN_MS = 50 * 3.6e6;');
    expect(SERIES, '守卫使用该常量').toMatch(/export function rawPeriodSafe\([\s\S]*?MH_RAW_SPAN_MS/);
  });

  it('rawPeriodSafe：≤50h 安全；>50h / 非正 / 非有限 不安全', () => {
    expect(rawPeriodSafe(1 * 3.6e6), '1h').toBe(true);
    expect(rawPeriodSafe(24 * 3.6e6), '24h').toBe(true);
    expect(rawPeriodSafe(MH_RAW_SPAN_MS), '边界 50h').toBe(true);
    expect(rawPeriodSafe(MH_RAW_SPAN_MS + 1), '超 1ms 即不安全').toBe(false);
    expect(rawPeriodSafe(3 * 8.64e7), '3d').toBe(false);
    expect(rawPeriodSafe(7 * 8.64e7), '7d').toBe(false);
    expect(rawPeriodSafe(14 * 8.64e7), '14d').toBe(false);
    expect(rawPeriodSafe(0), '塌缩').toBe(false);
    expect(rawPeriodSafe(-1), '负').toBe(false);
    expect(rawPeriodSafe(NaN), 'NaN').toBe(false);
    expect(rawPeriodSafe(Infinity), 'Infinity').toBe(false);
  });
});

describe('六百三十七批②：视图接线（LiveDashboardView 源码契约）', () => {
  it('偏好键 + 七档字面在场；原始逐点在场；无 30 秒档（负锁，剥注释）', () => {
    const s = VIEW;
    expect(s, '偏好键+默认 auto').toContain("usePref<string>('live.histPeriod', 'auto')");
    ['auto', 'raw', '1m', '5m', '15m', '30m', '1h'].forEach(v => {
      expect(s, `档位 value="${v}"`).toContain(`value="${v}"`);
    });
    expect(s, '下拉标签').toContain('聚合粒度');
    expect(s, '原始逐点档位文案').toContain('原始逐点');
    /* 负锁：不得出现 30 秒档（采集默认 60s、下限 30s，30s 桶默认配置产半空桶） */
    expect(s, '无 30 秒档').not.toContain('30s');
  });

  it('mh2Interval 由 histPeriod 驱动 + auto 回落 intervalFor（现行为零变更）+ 下推字面不变', () => {
    const s = VIEW;
    expect(s, 'computed 返回型含 undefined').toMatch(/const mh2Interval = computed<string \| undefined>\(/);
    expect(s, 'auto/未知档回落 intervalFor(range)').toContain('intervalFor(mh2Range.value)');
    expect(s, 'histPeriod 参与判断').toContain('histPeriod.value');
    expect(s, '显式桶宽单源').toMatch(/const MH_PERIODS = \['1m', '5m', '15m', '30m', '1h'\];/);
    expect(s, '取数下推字面不变（629 锁）').toContain('interval: mh2Interval.value');
  });

  it('原始档 → interval 传 undefined（源码形态）+ span 守卫存在', () => {
    const s = VIEW;
    expect(s, 'raw 分支返回 undefined').toMatch(/histRawSafe\.value \? undefined : intervalFor\(mh2Range\.value\)/);
    expect(s, 'span 由 rangeMs 单源算出').toContain('rangeMs.value.to - rangeMs.value.from');
    expect(s, '守卫调 monitorSeries.rawPeriodSafe').toMatch(/rawPeriodSafe\(/);
    expect(s, 'span 守卫参与 select option 禁用').toMatch(/:disabled="!histRawSafe"/);
    expect(s, '超限自动回落「自动」（写回偏好）').toMatch(/histPeriod\.value = 'auto'/);
    expect(s, '回落说明原因（title）').toContain(':title="histRawTitle"');
  });

  it('下拉落在 ⋯ 浮层面内（HTML 索引比较法：more 先于「聚合粒度」）', () => {
    expect(MORE_IDX, '⋯ details 在场').toBeGreaterThan(-1);
    expect(LABEL_IDX, '聚合粒度在场').toBeGreaterThan(-1);
    expect(LABEL_IDX, '聚合粒度在 ⋯ 之后').toBeGreaterThan(MORE_IDX);
    /* 下拉本体（含 raw 档）也在浮层内，非明面工具行 */
    expect(VIEW.indexOf('aria-label="聚合粒度"'), '下拉 aria 在 ⋯ 之后').toBeGreaterThan(MORE_IDX);
    expect(VIEW.indexOf('value="raw"'), 'raw 档在 ⋯ 之后').toBeGreaterThan(MORE_IDX);
  });

  it('工具行明面控件数不超 5（628-C1 口径：seg 无论几档恒计 1）', () => {
    const head = VIEW.slice(VIEW.indexOf('class="ld-hist-head"'), VIEW.indexOf('<div class="ld-hist-more-pop"'));
    expect(head.length, 'head 切片有效').toBeGreaterThan(0);
    /* 计数口径 = 控件（seg / select / 独立按钮 / ⋯ 各计 1）；下拉移入浮层故不计入 head。
       custom 起止 datetime-local 是「时间范围」这一控件的子输入，与 628-C1 同口径不计。 */
    const segCount = (head.match(/class="seg /g) ?? []).length;
    const selCount = (head.match(/<select /g) ?? []).length;
    const refreshCount = (head.match(/@click="loadHist"/g) ?? []).length;
    const moreCount = (head.match(/class="ld-hist-more"/g) ?? []).length;
    expect(segCount, '分组 seg 计 1').toBe(1);
    expect(segCount + selCount + refreshCount + moreCount, '明面控件 ≤5').toBeLessThanOrEqual(5);
    /* 负锁：新增的聚合粒度下拉**不在**明面切片内 */
    expect(head, '聚合粒度已收纳').not.toContain('聚合粒度');
  });

  it('切档即重查（独立 watch）+ 不重置 histGroup（导航过滤不入重查依赖）', () => {
    const s = VIEW;
    const periodWatch = s.match(/watch\(histPeriod, \(\) => \{[\s\S]*?\}\);/)?.[0] ?? '';
    expect(periodWatch, 'histPeriod 重查 watch 在场').not.toBe('');
    expect(periodWatch, '触发 loadHist').toContain('void loadHist()');
    expect(periodWatch, '不得连带 histGroup').not.toContain('histGroup');
    /* 反锁：histPeriod 不得塞进被逐字锁定的既有 watch 数组（628/633 教训：改字面即事故） */
    expect(s, '既有 watch 字面保形（monitorHistoryTrend 锁）')
      .toMatch(/watch\(\[mh2Range, clusterFilter, nodeMode, mhAgg, customFrom, customTo\]/);
    expect(s, 'histPeriod 不侵入既有数组').not.toMatch(/customTo, histPeriod\]/);
  });
});
