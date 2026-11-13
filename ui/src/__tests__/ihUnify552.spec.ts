/**
 * 五百五十二批：直方图/Profile 同一套组件抽取 + IndexHub 接线。
 * 用户裁决：「直方图和 Profile 的组件应该是同一套，且位置是同一套」——
 * DslQueryView 的直方图节头/Profile 树此前是视图内联物，IndexHub 两 tab 完全没有；
 * 组件抽独立文件（HistogramSection/ProfileTree）+ 注入链收 composables/useHistAgg
 * + IndexHub docs/query 两 tab 同位接线（检索/执行区后、结果表前）。DQ 侧同位替换
 * 下批做（ DQ 零改，仅作复制源）。
 *
 * 契约（验收锚）：
 * ① 三新文件在场 + HistogramSection props/emits 契约（源码锁，类名 dq-hist-* 逐字保留，
 *    .dq-hist-sec 无 border-bottom/padding 框感——dqHistHead549 约定同步更新）；
 * ② IndexHub docs/query 两 tab 各含 <HistogramSection 且位于结果表之前（模板序断言）；
 * ③ runDocs/runDsl 注入 applyHistToBody + 降级链 shouldDegrade/stripHist/markBroken + onResp 喂桶；
 * ④ useHistAgg 偏好键走调用方 ih 前缀（ih.docs.autoHist / ih.qry.autoHist，与 DQ 键分开）；
 * ⑤ AggBarChart 0 宽兜底在场（v-show=false 挂载测到 0 宽不落值，rAF 有界重测 + RO 非 0 定宽）；
 * ⑥ 挂载行为：HistogramSection 桶喂数→AggBarChart svg 渲染 + 节头 toggle / 开关 update:autoHist
 *    emit；ProfileTree 嵌套 node→递归渲染 + close emit。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';

const hist = readFileSync(join(__dirname, '../components/HistogramSection.vue'), 'utf-8');
const tree = readFileSync(join(__dirname, '../components/ProfileTree.vue'), 'utf-8');
const uha = readFileSync(join(__dirname, '../composables/useHistAgg.ts'), 'utf-8');
const abc = readFileSync(join(__dirname, '../components/AggBarChart.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('552 ①：三新文件在场 + HistogramSection 契约（源码锁）', () => {
  it('props：buckets/open/meta/brushRange/noDateField + v-model:autoHist', () => {
    expect(hist).toMatch(/buckets: HistBucket\[\]/);
    expect(hist).toMatch(/\bopen: boolean\b/);
    expect(hist).toMatch(/meta\?: string/);
    expect(hist).toMatch(/brushRange\?: string/);
    expect(hist).toMatch(/noDateField\?: boolean/);
    expect(hist).toMatch(/autoHist\?: boolean/);
  });
  it('emits：toggle / brush(from,to) / clear-brush / update:autoHist', () => {
    expect(hist).toMatch(/\(e: 'toggle'\): void/);
    /* 1319b：brush 增第三参 endKey（选区右开边界）——契约只增不减，from/to 语义不变 */
    expect(hist).toMatch(/\(e: 'brush', from: HistBucket, to: HistBucket, endKey: number \| string\): void/);
    expect(hist).toMatch(/\(e: 'clear-brush'\): void/);
    expect(hist).toMatch(/\(e: 'update:autoHist', v: boolean\): void/);
  });
  it('DQ 类名逐字保留 + AggBarChart :height="80" @brush 透传', () => {
    for (const cls of ['dq-hist-sec', 'dq-hist-head', 'dq-sec-tg', 'dq-sec-meta', 'dq-sw dq-bar-hist', 'dq-hist-none', 'dq-hist-body']) {
      expect(hist, cls + ' 在场').toContain(cls);
    }
    expect(hist).toContain('<AggBarChart :buckets="buckets" :height="80"');
    expect(hist).toMatch(/@brush=/);
  });
  it('dqHistHead549 约定同步更新：.dq-hist-sec 无 border-bottom/padding 框感', () => {
    expect(hist.match(/\.dq-hist-sec \{[^}]*\}/)?.[0]).not.toMatch(/border-bottom/);
    expect(hist.match(/\.dq-hist-sec \{[^}]*\}/)?.[0]).not.toMatch(/padding:/);
  });
  it('ProfileTree 契约：props node/total、emit close、pf-* 类名整体迁入', () => {
    expect(tree).toMatch(/node: Record<string, unknown>/);
    expect(tree).toMatch(/total: number/);
    expect(tree).toMatch(/\(e: 'close'\): void/);
    for (const cls of ['dq-profile', 'pf-node', 'pf-row', 'pf-type', 'pf-desc', 'pf-time', 'pf-bar']) {
      expect(tree, cls + ' 在场').toContain(cls);
    }
  });
});

describe('552 ④：useHistAgg 注入链（DQ execQuery :894-965 逻辑合并）', () => {
  it('封装面：applyHistToBody/injectField/sniffFromHits/shouldDegrade/stripHist/markBroken/onResp/reset', () => {
    expect(uha).toContain("from '../utils/histField'");
    for (const fn of ['applyHistToBody', 'injectField', 'sniffFromHits', 'shouldDegrade', 'stripHist', 'markBroken', 'onResp', 'reset']) {
      expect(uha, fn + ' 在场').toMatch(new RegExp('function ' + fn + '\\b'));
    }
  });
  it('偏好键 = 调用方前缀派生（autoHist/histSecOpen），ES 拒绝拉黑 histBrokenIdx 在场', () => {
    expect(uha).toMatch(/prefPrefix \+ '\.autoHist'/);
    expect(uha).toMatch(/prefPrefix \+ '\.histSecOpen'/);
    expect(uha).toContain('histBrokenIdx');
  });
});

describe('552 ②：IndexHub 两 tab 各含 <HistogramSection 且位于结果表之前（模板序）', () => {
  it('docs tab：检索区后、docsTbl 之前', () => {
    const seg = ih.slice(ih.indexOf("tab === 'docs'"), ih.indexOf("tab === 'query'"));
    const hs = seg.indexOf('<HistogramSection');
    expect(hs, 'docs tab 含 HistogramSection').toBeGreaterThan(-1);
    expect(hs, '位于结果表之前').toBeLessThan(seg.indexOf('<ResultTable ref="docsTbl"'));
  });
  it('query tab：执行行后、错误条/qryTbl 之前', () => {
    /* 锚用模板唯一标记：'tab === settings' 首现更早（骨架条件行），不能做切片终点 */
    const seg = ih.slice(ih.indexOf('<template v-else-if="tab === \'query\'">'), ih.indexOf('<!-- Settings -->'));
    const hs = seg.indexOf('<HistogramSection');
    expect(hs, 'query tab 含 HistogramSection').toBeGreaterThan(-1);
    expect(hs, '位于错误条之前').toBeLessThan(seg.indexOf('v-if="qryErr"'));
    expect(hs, '位于结果表之前').toBeLessThan(seg.indexOf('<ResultTable ref="qryTbl"'));
  });
});

describe('552 ③：runDocs/runDsl 注入与降级链 + 切索引清桶态（源码锁）', () => {
  it('两链 applyHistToBody 注入 + onResp 喂桶', () => {
    expect(ih).toMatch(/docsHist\.applyHistToBody\(/);
    expect(ih).toMatch(/qryHist\.applyHistToBody\(/);
    expect(ih).toMatch(/docsHist\.onResp\(/);
    expect(ih).toMatch(/qryHist\.onResp\(/);
  });
  it('ES 拒绝降级：shouldDegrade 门 + stripHist 剥聚合 + markBroken 拉黑', () => {
    expect(ih).toMatch(/docsHist\.shouldDegrade\(/);
    expect(ih).toMatch(/qryHist\.shouldDegrade\(/);
    expect(ih).toMatch(/docsHist\.stripHist\(/);
    expect(ih).toMatch(/qryHist\.stripHist\(/);
    expect(ih).toMatch(/docsHist\.markBroken\(\)/);
    expect(ih).toMatch(/qryHist\.markBroken\(\)/);
  });
  it('usePref ih 前缀键与 DQ 键分开 + 切索引 reset 清桶态', () => {
    expect(ih).toContain("prefPrefix: 'ih.docs'");
    expect(ih).toContain("prefPrefix: 'ih.qry'");
    expect(ih).toMatch(/docsHist\.reset\(\)/);
    expect(ih).toMatch(/qryHist\.reset\(\)/);
  });
});

describe('552 ⑤：AggBarChart 0 宽兜底（直方图 svg 溢出/游离实报）', () => {
  it('0 宽不落值：rAF 有界重测 + RO 非 0 定宽；旧「直接落 clientWidth」退役', () => {
    expect(abc).toMatch(/clientWidth > 0/);
    expect(abc).toContain('requestAnimationFrame');
    expect(abc).not.toMatch(/w\.value = wrapRef\.value\.clientWidth;/);
  });
});

/* ═══ ⑥ 挂载行为 ═══ */
/* happy-dom 无布局（clientWidth 恒 0），ResizeObserver 缺席环境补最小桩（仅当缺席） */
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

describe('552 ⑥：HistogramSection 挂载（桶喂数→svg 渲染 + 开关事件）', () => {
  it('桶 prop 喂数→AggBarChart svg 渲染；节头点击 emit toggle；开关翻转 emit update:autoHist(false)', async () => {
    const events: string[][] = [];
    const { host, app } = mountComp((await import('../components/HistogramSection.vue')).default, {
      buckets: BUCKETS, open: true, meta: '2 桶', autoHist: true,
      onToggle: () => events.push(['toggle']),
      'onUpdate:autoHist': (v: boolean) => events.push(['update:autoHist', String(v)]),
    });
    await nextTick();
    expect(host.querySelector('.dq-hist-sec'), '节壳在场').toBeTruthy();
    expect(host.querySelector('.dq-hist-body svg'), '桶喂数后 svg 渲染').toBeTruthy();
    expect(host.querySelector('.dq-hist-body rect.agg-bar'), '桶条渲染').toBeTruthy();
    host.querySelector<HTMLButtonElement>('.dq-sec-tg')!.click();
    await nextTick();
    expect(events.some(e => e[0] === 'toggle'), '节头点击 emit toggle').toBe(true);
    host.querySelector<HTMLInputElement>('.dq-bar-hist input[type="checkbox"]')!.click();
    await nextTick();
    const upd = events.find(e => e[0] === 'update:autoHist');
    expect(upd, '开关翻转 emit update:autoHist').toBeTruthy();
    expect(upd![1]).toBe('false');
    app.unmount();
  });
  it('open=false 折叠：节头恒在场，图体 v-show 藏（display:none）；noDateField 标注在场', async () => {
    const { host, app } = mountComp((await import('../components/HistogramSection.vue')).default, {
      buckets: BUCKETS, open: false, meta: '2 桶', noDateField: true,
    });
    await nextTick();
    const body = host.querySelector<HTMLElement>('.dq-hist-body');
    expect(body, '图体节点在场（v-show 非 v-if）').toBeTruthy();
    expect(body!.style.display).toBe('none');
    expect(host.querySelector('.dq-hist-none'), '无时间字段标注在场').toBeTruthy();
    app.unmount();
  });
});

describe('552 ⑥：ProfileTree 挂载（嵌套 node→递归渲染 + close）', () => {
  it('嵌套 node 喂数→pf-row 递归渲染（行数=节点数），关闭钮 emit close', async () => {
    const NODE = {
      type: 'query', description: 'total', time_in_nanos: 100, children: [
        { type: 'TermQuery', description: 'status:A', time_in_nanos: 40 },
        { type: 'BooleanQuery', description: 'filter', time_in_nanos: 30, children: [
          { type: 'MatchAllDocsQuery', description: '*', time_in_nanos: 10 },
        ] },
      ],
    };
    let closed = false;
    const { host, app } = mountComp((await import('../components/ProfileTree.vue')).default, {
      node: NODE, total: 100, onClose: () => { closed = true; },
    });
    await nextTick();
    expect(host.querySelector('.dq-profile'), '外壳类保留').toBeTruthy();
    expect(host.querySelectorAll('.pf-row').length, '递归渲染：4 节点 4 行').toBe(4);
    host.querySelector<HTMLButtonElement>('button[aria-label="关闭 Profile 耗时树"]')!.click();
    await nextTick();
    expect(closed, '关闭钮 emit close').toBe(true);
    app.unmount();
  });
});
