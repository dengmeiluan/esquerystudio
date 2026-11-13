/**
 * 五百五十八批：DQ 直方图分节改用 HistogramSection 统一件（553 遗留双形态收口）。
 * 552 批组件化时「DQ 侧同位替换下批做」——DslQueryView 页内联节与本组件并存两批，
 *  DQ 改用 <HistogramSection toggle-slot="host">，双形态差异归一：
 * ① 开关落位分叉根治：toggleSlot 'head'（节头内建，IH 消费点默认，零变动）| 'host'
 *    （组件不渲染开关，由宿主执行行承载——DQ 553 终审落位：执行行 Profile 旁）；
 * ② 节头 meta 手写「·」串合并 MetaStrip（557 DQ 侧合并形态归一组件源，IH 同享）；
 * ③ 552 ⑥ 节头形态三件（标题不吃满弹性+meta 省略号+行尾弹性占位）随改用归一组件。
 * 红线：高度结构语义零变动——节壳/节头/图体三层 DOM 高度链等值（六拍哨兵收口验）：
 * margin-bottom 归组件 scoped 同值承担；DQ 侧 .dq-hist-sec, .dq-partial flex-shrink:0
 * 高度链锁保形（scoped 规则命中子组件根，直方图/黄条不参与收缩语义零触）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const hist = readFileSync(join(__dirname, '../components/HistogramSection.vue'), 'utf-8');

/* happy-dom 无布局（clientWidth 恒 0），ResizeObserver 缺席环境补最小桩（ihUnify552 同款） */
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}

const BUCKETS = [
  { key: 1700000000000, key_as_string: '2023-11-15', doc_count: 3 },
  { key: 1700086400000, key_as_string: '2023-11-16', doc_count: 5 },
];

function mountComp(comp: unknown, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp as never, props as never) });
  app.config.warnHandler = () => {};
  app.mount(host);
  return { host, app };
}

describe('①toggleSlot 开关落位 prop（558 分叉根治）', () => {
  it('props 契约：toggleSlot?: \'head\' | \'host\'，缺省 head（IH 消费点零变动）', () => {
    expect(hist, 'prop 类型在声').toMatch(/toggleSlot\?: 'head' \| 'host'/);
    expect(hist, '缺省 head').toMatch(/toggleSlot: 'head'/);
  });
  it('head 档（默认）：开关在节头内（dq-bar-hist+无时间字段标注），翻转 emit update:autoHist', async () => {
    const events: string[][] = [];
    const { host, app } = mountComp((await import('../components/HistogramSection.vue')).default, {
      buckets: BUCKETS, open: true, meta: '2 桶', noDateField: true, autoHist: true,
      'onUpdate:autoHist': (v: boolean) => events.push(['update:autoHist', String(v)]),
    });
    await nextTick();
    const sw = host.querySelector<HTMLInputElement>('.dq-bar-hist input[type="checkbox"]');
    expect(sw, 'head 档开关在场').toBeTruthy();
    expect(host.querySelector('.dq-hist-none'), '无时间字段标注随开关').toBeTruthy();
    sw!.click();
    await nextTick();
    expect(events.some(e => e[0] === 'update:autoHist' && e[1] === 'false'), '翻转 emit update:autoHist').toBe(true);
    app.unmount();
  });
  it('host 档：组件不渲染开关（宿主执行行承载），节头标题/meta/清除刷选/图体照常', async () => {
    const events: string[] = [];
    const { host, app } = mountComp((await import('../components/HistogramSection.vue')).default, {
      buckets: BUCKETS, open: true, meta: '2 桶', brushRange: 'a → b', toggleSlot: 'host',
      onToggle: () => events.push('toggle'),
      onClearBrush: () => events.push('clear-brush'),
    });
    await nextTick();
    expect(host.querySelector('.dq-bar-hist'), 'host 档开关退役').toBeNull();
    expect(host.querySelector('.dq-hist-none'), '无时间字段标注随开关同退').toBeNull();
    expect(host.querySelector('.dq-hist-sec'), '节壳恒在场（549 约定）').toBeTruthy();
    expect(host.querySelector('.dq-sec-tg')!.textContent, '节头标题照常').toContain('直方图分布');
    expect(host.querySelector('.dq-sec-meta')!.textContent, 'meta 照常').toContain('2 桶');
    expect(host.querySelector('.dq-sec-meta')!.textContent, '刷选段照常').toContain('已刷选 a → b');
    expect(host.querySelector('.dq-hist-body rect.agg-bar'), '柱状图桶条照常渲染').toBeTruthy();
    host.querySelector<HTMLButtonElement>('.dq-sec-tg')!.click();
    await nextTick();
    expect(events, '节头点击 emit toggle').toContain('toggle');
    host.querySelector<HTMLButtonElement>('.dq-hist-head button.btn.sm.ghost')!.click();
    await nextTick();
    expect(events, '清除刷选 emit clear-brush').toContain('clear-brush');
    app.unmount();
  });
});

describe('②DQ 改用 HistogramSection（558，页内联节退役）', () => {
  it('改用标签在场：toggle-slot="host"+数据链 props 原样直喂（brush 交互链保形）', () => {
    const hsAt = dq.indexOf('<HistogramSection');
    expect(hsAt, 'DQ 含 <HistogramSection').toBeGreaterThan(-1);
    const tag = dq.slice(hsAt, dq.indexOf('/>', hsAt));
    expect(tag).toContain('toggle-slot="host"');
    expect(tag).toContain(':buckets="histBuckets"');
    expect(tag).toContain(':open="histSecOpen"');
    expect(tag).toContain(':meta="histHeadMeta"');
    expect(tag).toContain(':brush-range="brushRange"');
    expect(tag).toContain('@toggle="histSecOpen = !histSecOpen"');
    expect(tag).toContain('@brush="onBrush"');
    expect(tag).toContain('@clear-brush="clearBrush"');
  });
  it('页内联节壳/图体退役：dq-hist-sec div 与 AggBarChart 直引出清（组件承接）', () => {
    expect(dq, '内联节壳退役').not.toContain('<div class="dq-hist-sec">');
    expect(dq, 'AggBarChart 直引退役（模板引用随改用入组件）').not.toContain('<AggBarChart');
  });
  it('开关留执行行（553 终审落位零触）：run-row 切片 v-model="autoHist"+Profile 同款胶囊', () => {
    const runRowAt = dq.indexOf('<div class="dq-run-row">');
    const runRow = dq.slice(runRowAt, dq.indexOf('dq-params-standalone'));
    expect(runRow).toContain('v-model="autoHist"');
    expect(runRow).toContain('dq-bar-hist');
    expect(runRow, 'Profile 旁（其后紧随）').toContain(':class="{ on: autoHist }"');
    expect(runRow.indexOf('v-model="profileOn"')).toBeLessThan(runRow.indexOf('v-model="autoHist"'));
  });
  it('高度链锁保形：.dq-hist-sec, .dq-partial flex-shrink:0 留 DQ（scoped 命中组件根）+margin-bottom 归组件同值', () => {
    expect(dq).toContain('.dq-hist-sec, .dq-partial { flex-shrink: 0; }');
    expect(hist).toContain('.dq-hist-sec { margin-bottom: var(--sp-1); }');
  });
});

describe('③数据到达渲染（DQ 数据形态直喂挂载）', () => {
  it('histHeadMeta/brushRange/histBuckets 喂入 → MetaStrip text 段+桶条渲染', async () => {
    const { host, app } = mountComp((await import('../components/HistogramSection.vue')).default, {
      buckets: BUCKETS, open: true, meta: '2 桶', brushRange: '2023-11-15 → 2023-11-16', toggleSlot: 'host',
    });
    await nextTick();
    const meta = host.querySelector('.dq-sec-meta');
    expect(meta, 'MetaStrip 根（dq-sec-meta 类）在场').toBeTruthy();
    expect(meta!.querySelectorAll('.ms-t').length, 'MetaStrip text 段两条（meta+已刷选，ms-sep 承担分隔）').toBe(2);
    expect(meta!.textContent).toContain('2 桶');
    expect(meta!.textContent).toContain('已刷选 2023-11-15 → 2023-11-16');
    expect(host.querySelector('.dq-hist-body svg'), 'svg 渲染').toBeTruthy();
    expect(host.querySelectorAll('.dq-hist-body rect.agg-bar').length, '两桶两矩形').toBe(2);
    app.unmount();
  });
});
