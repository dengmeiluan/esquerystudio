/**
 * 一千三百一十九批 b：直方图刷选的两个真问题。
 *
 * 真机（1440×1000，research_report，拖选第 2~4 个桶）：
 *   ① 请求体写的是 `gte: 09-02, lte: 09-04` —— 日期直方图的桶 key 是**区间起点**，
 *      选中 09-02 / 09-03 / 09-04 三桶，实际只取到 09-04 00:00 那一刻，
 *      **最后一整天的数据被静默切掉**（用户完全看不出来，只会觉得「怎么比图上少」）。
 *   ② 节头回显是 `2026-09-02T00:00:00.000Z → 2026-09-04T00:00:00.000Z`，
 *      一串机器码，还和「6 桶」挤在同一行。
 *
 * 本 spec 锁：
 *  - 右界 = 下一桶 key，且用 `lt`（左闭右开）——日期/数值区间语义
 *  - 词条桶（key 是离散值）**保持 `lte`**，否则「选到 CLOSED」会把 CLOSED 自己排除
 *  - 回显是人类可读短日期，不再出现 `T00:00:00.000Z`
 * 负控：把右界改回 `to.key` + `lte` → 第一条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const chart = readFileSync(join(__dirname, '../components/AggBarChart.vue'), 'utf-8');
const sec = readFileSync(join(__dirname, '../components/HistogramSection.vue'), 'utf-8');

function fnBody(start: string): string {
  const i = dq.indexOf(start);
  expect(i, start + ' 必须存在').toBeGreaterThan(-1);
  const rest = dq.slice(i);
  const end = rest.indexOf('\n}\n');
  return end < 0 ? rest : rest.slice(0, end);
}

describe('1319b 刷选区间语义', () => {
  it('图表发出右开边界 endKey，且取的是下一桶 key', () => {
    expect(chart, 'brush 事件必须带 endKey').toMatch(/emit\('brush', from, to, endKey\)/);
    expect(chart, 'endKey 必须取下一桶').toMatch(/const next = bars\.value\[i1 \+ 1\]/);
    expect(chart, '末桶无下一桶时按步长外推').toMatch(/step > 0\) endKey = \(to\.key as number\) \+ step/);
  });

  it('日期区间用 gte/lt（不是 lte），且上界是 endKey', () => {
    const body = fnBody('function onBrush(');
    expect(body, '日期桶必须左闭右开').toContain('{ gte: from.key, lt: hi }');
    expect(body, '上界必须用 hi（= endKey）').toContain('const hi = endKey');
  });

  it('词条桶保持闭区间（lte），不得被区间语义误伤', () => {
    const body = fnBody('function onBrush(');
    expect(body, '词条桶必须 lte 含最后一项').toContain('{ gte: from.key, lte: to.key }');
    expect(body, '必须按 key 形态分支').toMatch(/isRangeKey\s*=/);
  });

  it('回显是人话短日期，不吐 ISO 原文', () => {
    const body = fnBody('function onBrush(');
    expect(body, '回显必须走 brushLabel').toContain('brushLabel(from)');
    const lbl = fnBody('function brushLabel(');
    expect(lbl, '必须截 MM-DD').toContain("ks.slice(5, 10)");
    expect(body, '不得再直接拼 key_as_string 原文').not.toMatch(/from\.key_as_string \|\| from\.key/);
  });
});

describe('1319b 透传链完整（HistogramSection 不得吞掉第三个参数）', () => {
  it('中间层把 endKey 原样转发', () => {
    expect(sec, '模板必须转发第三个参数').toMatch(/@brush="\(f, t, e\) => emit\('brush', f, t, e\)"/);
    expect(sec, 'emits 声明必须带 endKey').toMatch(/\(e: 'brush', from: HistBucket, to: HistBucket, endKey: number \| string\): void/);
  });
});
