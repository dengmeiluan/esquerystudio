/**
 * 五百六十二批（轨3 表格内核）：数据表格内核本体增量四刀。
 *
 * T1 IP_TYPE_RE 双份字面合并单源——QRT/RT 各持一份本地 `const IP_TYPE_RE = /^ip(_range)?$/;`
 *    （QRT :1160 / RT :1331）退役，typeTiers 导出 IP_TYPE_RE + isIpType，双内核 isIpCol/
 *    isContainsCol 消费点改引（行为零变化）。
 * T2 ES highlight 渲染下沉 QRT（opt-in）——RT hlHtml 的片段装配（join ' … ' + hlSafe 净化 +
 *    空档短路）合并 highlightSanitize.hlSegment 共用纯函数，RT 一行委托（queryHighlightChain
 *    的 `import { hlSafe }`/`function hlHtml`/`v-html="hlHtml(hit, c)"` 字面锁保全）；
 *    QRT 新增 opt-in prop `highlight`（缺省 false 零行为变），开启且 hit 型行带
 *    highlight[col] 片段时走 hlSegment 净化 v-html（.qrt-hl），视觉语言与 RT rt-mark 同形态。
 * T3 QRT 表格头能力集成（「翻页/展示形式统一在表格头」收尾）——
 *    ① bar-prepend 槽脱 prefsOn 门控：无 storageKey 通道槽内容仍寄居 qrt-bar（此前连槽带
 *      工具行一起消失）；工具行其余内容（计数条/筛选提示/搜索/刷新/导出钮簇）维持 prefsOn
 *      门控不变（独立壳分支形态，有槽/迁头档才渲染，缺省零增量）。
 *    ② pagerInHead opt-in（缺省 false 保底 DOM 契约零变）：开启且 page/pageSize/total 三参
 *      齐备时分页器寄居 bar-left（RT :25 同款形态），底部 qrt-pgr 行退役（互斥合并在 pagerOn
 *      判定——rtFix552 的 qrt-pgr 行 v-if 字面逐字保全）。消费侧接线下批（不传参）。
 * T4 NON_SEMANTIC *_range 族解禁（date_range/number_range 等）——备案不做：typeTiers
 *    「待解禁」备案维持（561 判定：解禁将波及 isRangeCol/区间筛选既有行为面，557/561 行为锁
 *    在，不动；本件只锁现状防无备案漂移）。
 *
 * 挂载样板照抄 tableKernelWave547（裸 createApp + pinia，叠挂勿先 unmount（T39），
 * happy-dom 口径：点击一律 dispatchEvent(new MouseEvent('click'))（el.click 不可靠））。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import { IP_TYPE_RE, isIpType, isNonSemanticType } from '../utils/typeTiers';
import { hlSegment } from '../utils/highlightSanitize';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

/* hit 型样例：a 行带 ES highlight 片段（含恶意 <img onerror>），b 行不带（回落对照） */
const HL_HITS = [
  { _id: 'a', _index: 'h', _source: { title: 'hello world' }, highlight: { title: ['he<em>ll</em>o <img src=x onerror=alert(1)>'] } },
  { _id: 'b', _index: 'h', _source: { title: 'plain row' } },
] as any;
/* ip 列行为锁样例（fieldTypes 显式标注档，isIpCol 显式类型优先链；_index 在场保列序稳定） */
const IP_HITS = [{ _id: 'a', _index: 'h', _source: { host: '10.0.0.1', name: 'web-1' } }] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

/* 挂载辅助勿先 unmount（T39 卸载链断裂）——叠挂，卸载统一放钩子（547 同款） */
async function mountTbl(
  comp: unknown,
  propsFactory: () => Record<string, unknown>,
  slots?: Record<string, () => ReturnType<typeof h>>,
) {
  const app = createApp({ setup: () => () => h(comp as any, propsFactory(), slots) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const clickIt = async (el: Element) => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(4);
};

/* QRT 数据行（排除筛选空集/截断/展开提示行）与其单元格（列序=columns：_id/_index/业务列…） */
const qRows = () => [...host.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.qrt-cell'));
const qCell = (ri: number, ci: number) => qRows()[ri]!.querySelectorAll('td.qrt-cell')[ci] as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* ═══════════ T1：IP_TYPE_RE 双份字面合并 typeTiers 单源 ═══════════ */
describe('五百六十二批 T1：IP_TYPE_RE 双份字面合并 typeTiers 单源', () => {
  it('纯函数直测：isIpType 判 ip/ip_range 真、近名/缺类型假；IP_TYPE_RE 导出同判', () => {
    expect(isIpType('ip')).toBe(true);
    expect(isIpType('ip_range')).toBe(true);
    expect(isIpType('ipv4')).toBe(false); /* 列名兜底是 IP_NAME_RE 的职责，类型判不含 */
    expect(isIpType('ipv6')).toBe(false);
    expect(isIpType('keyword')).toBe(false);
    expect(isIpType(undefined)).toBe(false);
    expect(isIpType('')).toBe(false);
    expect(IP_TYPE_RE.test('ip')).toBe(true);
    expect(IP_TYPE_RE.test('ip_range')).toBe(true);
  });

  it('源码锁：双内核本地 const IP_TYPE_RE 字面退役，消费点改引 typeTiers.isIpType', () => {
    expect(qrt, 'QRT 本地字面退役').not.toContain('const IP_TYPE_RE = /^ip(_range)?$/;');
    expect(rt, 'RT 本地字面退役').not.toContain('const IP_TYPE_RE = /^ip(_range)?$/;');
    expect(qrt, 'QRT 改引单源').toMatch(/import \{[^}]*isIpType[^}]*\} from '\.\.\/utils\/typeTiers';/);
    expect(rt, 'RT 改引单源').toMatch(/import \{[^}]*isIpType[^}]*\} from '\.\.\/utils\/typeTiers';/);
    /* isIpCol 显式类型档 + isContainsCol 抑制档两消费点同改（IP_NAME_RE 列名兜底不动） */
    expect(qrt).toContain('if (t) return isIpType(t);');
    expect(rt).toContain('if (t) return isIpType(t);');
    expect(qrt).toContain('!isNonSemanticType(t) && !isIpType(t)');
    expect(rt).toContain('!isNonSemanticType(t) && !isIpType(t)');
  });

  it('行为锁（挂载）：ip 显式类型列 ip-col 等宽链零回归（QRT+RT 对称）', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: IP_HITS, fieldTypes: { host: 'ip' } }));
    /* QRT 列序：_id(0) _index(1) host(2) name(3)；semPref 默认开 */
    expect(qCell(0, 2).classList.contains('ip-col'), 'host 列（ip 型）ip-col 在场').toBe(true);
    expect(qCell(0, 3).classList.contains('ip-col'), 'name 列不在场').toBe(false);

    await mountTbl(ResultTable, () => ({ hits: IP_HITS, total: 1, index: 'w562ip', fieldTypes: { host: 'ip' } }));
    expect(host.querySelector('td.rt-cell[data-col="host"]')!.classList.contains('ip-col'), 'RT host 列 ip-col 在场').toBe(true);
    expect(host.querySelector('td.rt-cell[data-col="name"]')!.classList.contains('ip-col'), 'RT name 列不在场').toBe(false);
  });
});

/* ═══════════ T2：ES highlight 渲染下沉 QRT（opt-in）═══════════ */
describe('五百六十二批 T2：ES highlight 渲染下沉 QRT（opt-in highlight prop）', () => {
  it('hlSegment 纯函数：空档短路 + join " … " + 净化（em/mark 放行，img/script 转义 fail-closed）', () => {
    expect(hlSegment(undefined)).toBe('');
    expect(hlSegment([])).toBe('');
    expect(hlSegment(['a<em>b</em>', 'c<img src=x onerror=alert(1)>'])).toBe('a<em>b</em> … c&lt;img src=x onerror=alert(1)&gt;');
    expect(hlSegment(['<mark class="hl">3</mark>'])).toBe('<mark class="hl">3</mark>');
    expect(hlSegment(['<script>alert(1)</script>'])).not.toContain('<script');
  });

  it('RT 源码锁：hlHtml 一行委托 hlSegment；queryHighlightChain 三字面（hlSafe import/hlHtml/v-html 出口）保全', () => {
    expect(rt).toContain("import { hlSafe } from '../utils/highlightSanitize';");
    expect(rt).toContain("import { hlSegment } from '../utils/highlightSanitize';");
    expect(rt).toContain('return hlSegment(hit.highlight?.[c]);');
    expect(rt).toContain('function hlHtml');
    expect(rt).toContain('v-html="hlHtml(hit, c)"');
  });

  it('QRT 缺省零增量：不传 highlight，带 highlight 的 hits 走普通渲染（无 .qrt-hl）', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: HL_HITS }));
    expect(host.querySelector('.qrt-hl'), '缺省无 highlight 渲染分支（全站零增量）').toBeNull();
    expect(qCell(0, 2).textContent, 'title 格回落普通文本').toContain('hello world');
  });

  it('QRT opt-in：highlight=true 片段优先渲染（.qrt-hl），em 放行/img 转义；无片段行回落', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: HL_HITS, highlight: true }));
    const hl = qCell(0, 2).querySelector('.qrt-hl') as HTMLElement;
    expect(hl, 'a 行 title 格走 highlight 分支').toBeTruthy();
    expect(hl.innerHTML).toContain('he<em>ll</em>o');
    expect(hl.innerHTML, '存储型注入面 fail-closed').not.toContain('<img');
    expect(hl.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    const tdB = qCell(1, 2);
    expect(tdB.querySelector('.qrt-hl'), '无片段行回落普通渲染（对照）').toBeNull();
    expect(tdB.textContent).toContain('plain row');
  });

  it('QRT rows 型 + highlight=true：非 hit 型短路（无片段通道，零增量）', async () => {
    await mountTbl(QueryResultTable, () => ({ cols: ['v'], rows: [['x']] as any, highlight: true }));
    expect(host.querySelector('.qrt-hl')).toBeNull();
    expect(host.querySelector('.qrt-hl'), 'rows 型无 highlight 概念').toBeNull();
  });

  it('rt-mark 视觉语言对齐：QRT .qrt-hl em/mark 规则与 RT .rt-hl em/mark 同形态字面', () => {
    expect(qrt).toMatch(/\.qrt-hl em, \.qrt-hl mark \{ font-style: normal; background: var\(--warn\); color: var\(--tx-on-strong\); border-radius: 2px; padding: 0 1px; \}/);
    expect(rt).toContain('.rt-hl em, .rt-hl mark');
  });
});

/* ═══════════ T3：QRT 表格头能力集成 ═══════════ */
describe('五百六十二批 T3①：QRT bar-prepend 槽脱 prefsOn 门控', () => {
  it('无 storageKey：槽内容仍寄居 qrt-bar（此前连槽带工具行一起消失）；导出钮簇/计数条不在场', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: HL_HITS }), {
      'bar-prepend': () => h('span', { class: 'w562-seg' }, 'SEG'),
    });
    const seg = host.querySelector('.qrt-bar .w562-seg') as HTMLElement;
    expect(seg, 'bar-prepend 槽脱 prefsOn：无 storageKey 仍渲染').toBeTruthy();
    expect(seg.textContent).toBe('SEG');
    expect(host.querySelector('.qrt-bar button.qrt-tool-btn'), '导出钮簇维持 prefsOn 门控').toBeNull();
    expect(host.querySelector('.qrt-coln'), '计数条维持 prefsOn 门控').toBeNull();
    expect(qRows().length, '槽注入不影响行渲染').toBe(2);
  });

  it('有 storageKey：槽寄居照旧 + 导出钮簇在场（547 既有锁复刻）', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: HL_HITS, storageKey: 'w562bp' }), {
      'bar-prepend': () => h('span', { class: 'w562-seg' }, 'SEG'),
    });
    expect(host.querySelector('.qrt-bar .w562-seg'), 'prefsOn 主壳槽寄居照旧').toBeTruthy();
    expect(host.querySelector('.qrt-bar button.qrt-tool-btn'), '导出钮簇在场').toBeTruthy();
  });

  it('源码锁：主壳 barOn 门控；独立壳分支 v-else-if="hasPrepend || pagerHeadOn" 寄居槽', () => {
    /* 1141：主壳门控从 prefsOn 放宽到 barOn（SQL 等内存态工具行走同一套内核工具）——
       锁意图不变：主壳字面 + 独立壳结构 + 先后序三锚 */
    /* 1163：主壳补工具行右键转发（属性追加，壳锚其余字面不变） */
    expect(qrt).toContain('<TableShell v-if="barOn" bar-class="qrt-bar" bar-r-class="qrt-bar-r" @bar-contextmenu="openBarMenu">');
    /* 六百零七批同步更新：独立壳条件扩 viewSegOn（内建视图档无 storageKey 通道同样可达，
       pagerInHead 同口径；判别力不变=主壳字面+独立壳结构+先后序三锚保全） */
    expect(qrt).toContain('<TableShell v-else-if="hasPrepend || pagerHeadOn || viewSegOn" bar-class="qrt-bar" bar-r-class="qrt-bar-r">');
    const mainAt = qrt.indexOf('<TableShell v-if="barOn"');
    const altAt = qrt.indexOf('<TableShell v-else-if="hasPrepend || pagerHeadOn || viewSegOn"');
    expect(altAt, '独立壳分支紧随主壳').toBeGreaterThan(mainAt);
  });
});

describe('五百六十二批 T3②：QRT pagerInHead 分页器迁工具行（opt-in，消费侧下批接线）', () => {
  it('源码锁：prop 缺省 false；互斥合并在 pagerOn 判定；qrt-pgr 行 v-if 字面逐字保留（rtFix552 锚）', () => {
    expect(qrt).toContain('pagerInHead?: boolean;');
    expect(qrt).toContain('pagerInHead: false,');
    expect(qrt).toContain('const pagerOn = computed(() => props.pagerInHead !== true && props.page != null && props.pageSize != null && props.total != null);');
    expect(qrt).toContain('const pagerHeadOn = computed(() => props.pagerInHead === true && props.page != null && props.pageSize != null && props.total != null);');
    /* 六百零七批同步更新：pgr 行字面 || hideBody→|| bodyHidden（rtFix552 锚同批改用，判别力不变） */
    expect(qrt).toContain('<div v-if="pagerOn && ((!loading && !isEmpty) || bodyHidden)" class="qrt-pgr">');
  });

  it('pagerInHead=true（有 storageKey）：分页器寄居 qrt-bar、底部 .qrt-pgr 退役；翻页只 emit', async () => {
    const onPage: number[] = [];
    await mountTbl(QueryResultTable, () => ({
      hits: HL_HITS, total: 45, page: 2, pageSize: 20, storageKey: 'w562ph', pagerInHead: true,
      'onUpdate:page': (p: number) => onPage.push(p),
    }));
    const jump = host.querySelector('.qrt-bar .pgn-jump') as HTMLInputElement;
    expect(jump, '迁头档分页器寄居 qrt-bar').toBeTruthy();
    expect(jump.value).toBe('2');
    expect(host.querySelector('.qrt-pgr'), '底部分页行退役').toBeNull();
    const nxt = host.querySelector('.qrt-bar [aria-label="下一页"]') as HTMLButtonElement;
    expect(nxt).toBeTruthy();
    await clickIt(nxt);
    expect(onPage, '翻页只 emit（取数归宿主）').toEqual([3]);
  });

  it('pagerInHead=true 无 storageKey：分页器仍寄居表格头（独立壳分支），底部退役', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: HL_HITS, total: 45, page: 2, pageSize: 20, pagerInHead: true }));
    expect(host.querySelector('.qrt-bar .pgn-jump'), '无记忆通道迁头可达').toBeTruthy();
    expect(host.querySelector('.qrt-pgr'), '底部分页行退役').toBeNull();
  });

  it('缺省不传 pagerInHead：底部 .qrt-pgr 既有链照旧（525 复锁），工具行内无分页器', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: HL_HITS, total: 45, page: 2, pageSize: 20 }));
    expect(host.querySelector('.qrt-pgr'), '底部分页行照旧').toBeTruthy();
    expect(host.querySelector('.qrt-bar'), '无槽/无 storageKey/缺省迁头=无工具行（零增量）').toBeNull();
    expect(host.querySelector('.qrt-bar .pgn-jump')).toBeNull();
  });
});

/* ═══════════ T4 + 缺省零增量总锁 ═══════════ */
describe('五百六十二批 T4：NON_SEMANTIC *_range 族解禁备案不做（现状锁防无备案漂移）', () => {
  it('date_range/number_range 维持未合并（待解禁备案维持）；核心豁免五型不收；RE 字面不含 *_range', async () => {
    const tiers = readFileSync(join(__dirname, '../utils/typeTiers.ts'), 'utf-8');
    expect(isNonSemanticType('date_range'), '解禁备案不做：date_range 仍不在抑制族').toBe(false);
    expect(isNonSemanticType('number_range'), 'number_range 同上').toBe(false);
    expect(isNonSemanticType('integer'), '豁免核心（数值白名单成员）不收').toBe(false);
    expect(isNonSemanticType('date'), '豁免核心（日期白名单成员）不收').toBe(false);
    expect(tiers).toContain('待解禁');
    expect(tiers, 'RE 字面无 date_range/number_range（不动）').not.toContain('|date_range');
    expect(tiers).not.toContain('|number_range');
  });
});

describe('五百六十二批：缺省零增量总锁（四刀缺省路径全不触）', () => {
  it('全缺省挂载：无 .qrt-hl/无工具行壳/底部分页行照既有链', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: HL_HITS, total: 3, page: 1, pageSize: 20 }));
    expect(host.querySelector('.qrt-hl'), 'highlight 缺省关').toBeNull();
    expect(host.querySelector('.qrt-bar'), 'bar-prepend/pagerInHead 缺省均不出壳').toBeNull();
    expect(host.querySelector('.qrt-pgr'), '底部分页行照旧').toBeTruthy();
    expect(qRows().length).toBe(2);
  });
});
