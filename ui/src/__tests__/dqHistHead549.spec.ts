/**
 * 五百四十九批：用户真机实报专修——直方图开关归位+节头恒显。
 * ①「直方图按钮为什么不是在上面」——开关藏在表格工具行右侧控件族（542/547 两迁），
 *   用户预期它挨着直方图本体：迁直方图分布节头行右端（开关与被控对象同区）。
 * ②「直方图和表格是嵌套容器，不够扁平化」——dq-hist-sec 带 padding+border-bottom 框感
 *   退役：节头恒显为自由行（无框），无桶时原因说明（hist-why 独立行）并入节头 meta，
 *   表格容器边框自然承接分界。无桶时节头也在场=开关永有归宿。
 * 五百五十三批同步更新：开关四迁执行行右组 Profile 旁（542 执行行→547 表格工具行→549 节头→
 *   553 执行行 Profile 旁，用户终审「直方图按钮应该跟 Profile 按钮样式一样，位置一块」）；
 *   节头恒显/无桶原因 meta/折叠语义/扁平化契约零触。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
/* 五百五十八批同步更新：DQ 页内联直方图节改用 HistogramSection 统一件，节壳锁同步更新组件源 */
const hist = readFileSync(join(__dirname, '../components/HistogramSection.vue'), 'utf-8');

describe('直方图节头恒显+开关归位（549 批；558 批同步更新：DQ 改用 HistogramSection，节壳锁同步更新组件）', () => {
  it('直方图节壳恒在场：DQ 改用组件且不受桶数门控（无桶时节头行也在，开关永有归宿）', () => {
    expect(dq, '桶数门控退役').not.toMatch(/v-if="histBuckets\.length"/);
    expect(dq, '页内联节壳退役（组件 dq-hist-sec 承接）').not.toContain('<div class="dq-hist-sec">');
    expect(dq).toContain('<HistogramSection');
    expect(hist, '节壳类名在组件源').toContain('class="dq-hist-sec"');
  });
  it('直方图开关迁执行行右组 Profile 旁（553 批四迁同步更新：执行行→表格工具行→节头→执行行 Profile 旁，用户终审；同款 .dq-sw 激活胶囊；558 改用 toggle-slot=host 落位零触）', () => {
    const runRowAt = dq.indexOf('<div class="dq-run-row">');
    const runRow = dq.slice(runRowAt, dq.indexOf('dq-params-standalone'));
    expect(runRow, '开关在执行行切片内').toContain('v-model="autoHist"');
    expect(runRow).toContain('dq-bar-hist');
    expect(runRow, 'Profile 同款激活胶囊').toContain(':class="{ on: autoHist }"');
    const hsAt = dq.indexOf('<HistogramSection');
    const hsTag = dq.slice(hsAt, dq.indexOf('/>', hsAt));
    expect(hsTag, '改用标签不承载开关（host 档归执行行）').not.toContain('autoHist');
    expect(hsTag).toContain('toggle-slot="host"');
    const extraAt = dq.indexOf('<template #bar-extra>');
    const extraEnd = dq.indexOf('</template>', extraAt);
    expect(dq.slice(extraAt, extraEnd), 'bar-extra 不再承载开关').not.toContain('v-model="autoHist"');
  });
  it('无桶原因说明并入节头 meta（dq-hist-why 独立行退役，消静默语义保留；558 同步更新：histHeadMeta 经 meta prop 直喂组件）', () => {
    expect(dq, '独立 why 行退役').not.toContain('class="dq-hist-why"');
    expect(dq, 'histHeadMeta 经 meta prop 直喂').toContain(':meta="histHeadMeta"');
    expect(dq, 'histHeadMeta 引用 histWhy 文案链').toMatch(/return histWhy\.value \|\| '未生成'/);
  });
  it('直方图折叠语义保留：图随节头 chevron 藏显（v-show），收起只剩节头一行（558 同步更新：开合走组件 open/toggle 契约）', () => {
    expect(dq).toMatch(/:open="histSecOpen"/);
    expect(dq).toMatch(/@toggle="histSecOpen = !histSecOpen"/);
    expect(hist, '图体 v-show 非 v-if（组件源承接）').toMatch(/v-show="open && buckets\.length"/);
    expect(hist).toContain('<AggBarChart');
    expect(hist).toContain("emit('toggle')");
  });
  it('扁平化：节头行无框感（padding 框/border 框退役，分节交表格容器边框承接）', () => {
    expect(hist.match(/\.dq-hist-sec \{[^}]*\}/)?.[0]).not.toMatch(/border-bottom/);
    expect(hist.match(/\.dq-hist-sec \{[^}]*\}/)?.[0]).not.toMatch(/padding:/);
  });
});
