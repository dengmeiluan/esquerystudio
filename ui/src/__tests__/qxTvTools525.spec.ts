/**
 * 五百二十五批：QueryXrayView 词频表内核化 + 表格化修边。
 * 锁定：
 * 1) 每卡工具行：term kw 过滤（行数 >20 门控）+ doc_freq min/max 区间 + TSV/MD 复制
 *    （matrixText 内核，过滤后行集所见即所复制）+ 计数 N/M；
 * 2) term 走 MarkText（kw 命中 <mark>）；gotoAnalyzer 钮与稀有度 pill 保留；
 * 3) 531 批同步更新：裸 .qx-tbl 换 QRT rows 型（排序/漏斗/右键/导出归内核）——行为锚同步更新
 *    table.qrt-tbl（过滤后行集所见即所渲），末行双线/表高封顶/粘顶表头归内核单一出处。
 * 设施照抄 qxXrayErrW3b（vue-router 轻 mock + api mock + MonacoEditor stub）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeMock = { path: '/query-xray', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup() { return () => h('div', { class: 'monaco-host' }); },
    }),
  };
});

const termVectorsFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      validateQuery: () => Promise.resolve({}),
      termVectors: (...a: any[]) => termVectorsFn(...a),
      aliases: () => Promise.resolve([]),
      mappingDetail: () => Promise.resolve({ raw: { properties: { body: { type: 'text' } } } }),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import QueryXrayView from '../views/QueryXrayView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

/* 25 个词 t01..t25，doc_freq=i（≤20 不设限全量；25>20 → kw 门控开） */
function tvResp() {
  const terms: Record<string, any> = {};
  for (let i = 1; i <= 25; i++) {
    const id = String(i).padStart(2, '0');
    terms['t' + id] = { term_freq: i, doc_freq: i, ttf: i * 10 };
  }
  return { found: true, term_vectors: { body: { field_statistics: { doc_count: 100, sum_ttf: 5000 }, terms } } };
}

async function mountViewWithTerms() {
  termVectorsFn.mockReset().mockResolvedValue(tvResp());
  const app = createApp({ render: () => h(QueryXrayView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  /* 切到词频取证 tab → 填 doc _id → 取证 */
  const tabs = [...host.querySelectorAll('.qx-tab')] as HTMLElement[];
  (tabs.find(b => b.textContent?.includes('词频取证')) as HTMLElement).click();
  await settle();
  const idInp = host.querySelector('input.qx-ii.wide') as HTMLInputElement;
  idInp.value = 'doc1';
  idInp.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  const run = [...host.querySelectorAll('.btn.primary.sm')].find(b => b.textContent?.includes('取证')) as HTMLElement;
  run.click();
  await settle(20);
  return host;
}

const writeText = vi.fn(async (_t: string) => undefined);

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  history.replaceState(null, '', '#/?idx=logs-x');
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
  history.replaceState(null, '', '#/');
});

/* 531 批同步更新：行集锚换 QRT 壳（过滤 nomatch/截断行，所见即所渲） */
const qrtRows = (root: ParentNode) =>
  [...root.querySelectorAll('table.qrt-tbl tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));

describe('QueryXray 词频表工具行（五百二十五批；531 同步更新 QRT 壳）', () => {
  it('kw 门控（25>20 出输入）→ 过滤行集+MarkText 命中+计数 N/M；空匹配提示', async () => {
    const host = await mountViewWithTerms();
    const card = host.querySelector('.qx-card') as HTMLElement;
    expect(card, '词频卡应渲染').toBeTruthy();
    expect(qrtRows(host).length).toBe(25);
    const nBadge = card.querySelector('.qx-tv-n') as HTMLElement;
    expect(nBadge.textContent).toContain('25/25');
    /* kw 过滤：词名 t01..t25，'t1' 命中 t10..t19 共 10 行 */
    const kw = card.querySelector('.qx-tv-inp') as HTMLInputElement;
    expect(kw, '25>20 应出 kw').toBeTruthy();
    kw.value = 't1';
    kw.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(qrtRows(host).length).toBe(10);
    expect((card.querySelector('.qx-tv-n') as HTMLElement).textContent).toContain('10/25');
    /* MarkText 命中（<mark> 包裹），gotoAnalyzer 钮与稀有度 pill 保留（#cell- 槽保真） */
    expect(card.querySelector('table.qrt-tbl mark')).toBeTruthy();
    expect(card.querySelector('.qx-term-link')).toBeTruthy();
    expect(card.querySelector('.qx-rare')).toBeTruthy();
    /* 空匹配 → 内核空态链（文案逐字保留） */
    kw.value = 'zzz';
    kw.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(card.textContent).toContain('无匹配 term');
    expect(qrtRows(host).length).toBe(0);
  }, 40000);

  it('doc_freq min/max 区间过滤（Number 比较，空=不设限）', async () => {
    const host = await mountViewWithTerms();
    const card = host.querySelector('.qx-card') as HTMLElement;
    const nums = card.querySelectorAll('.qx-tv-inp.num') as NodeListOf<HTMLInputElement>;
    expect(nums.length).toBe(2);
    nums[0].value = '20';
    nums[0].dispatchEvent(new Event('input', { bubbles: true }));
    nums[1].value = '22';
    nums[1].dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    /* doc_freq 20..22 → t20/t21/t22 共 3 行 */
    expect(qrtRows(host).length).toBe(3);
    expect((card.querySelector('.qx-tv-n') as HTMLElement).textContent).toContain('3/25');
  }, 40000);

  it('TSV 复制：表头行+过滤后行集（所见即所复制）', async () => {
    const host = await mountViewWithTerms();
    const card = host.querySelector('.qx-card') as HTMLElement;
    const nums = card.querySelectorAll('.qx-tv-inp.num') as NodeListOf<HTMLInputElement>;
    nums[0].value = '25';
    nums[0].dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    const tsvBtn = [...card.querySelectorAll('button')].find(b => b.textContent?.trim() === 'TSV') as HTMLElement;
    tsvBtn.click();
    await settle();
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0] as string;
    const lines = text.split('\n');
    expect(lines[0]).toBe('term\ttf\tdoc_freq\tttf\t稀有度');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('t25');
  }, 40000);
});

describe('QueryXray 词频表表格化修边（五百二十五批源码锁；531 批同步更新 QRT 壳）', () => {
  it('QRT rows 接线 + matrixText 内核 + MarkText/gotoAnalyzer/稀有度槽保真', () => {
    const v = readFileSync(join(__dirname, '../views/QueryXrayView.vue'), 'utf-8');
    /* 531 批同步更新：裸 .qx-tbl 退役换 QRT rows 型（storageKey/fieldTypes/empty-text 接线） */
    expect(v).not.toContain('.qx-tbl');
    expect(v).toMatch(/:cols="\['term', 'tf', 'doc_freq', 'ttf', '稀有度'\]"\s*\n\s*:rows="tvQRows\(fname\)" sortable/);
    expect(v).toContain('storage-key="xray:tv"');
    expect(v).toContain('empty-text="无匹配 term"');
    expect(v).toContain("import { matrixText } from '../utils/copyMatrix';");
    /* term 走 MarkText（kw 命中 <mark>）+ gotoAnalyzer 钮经 #cell-term 槽保真（531 同步更新） */
    expect(v).toContain("<MarkText :text=\"value\" :kw=\"tvTools[fname]?.kw ?? ''\" />");
    expect(v).toContain('@click="gotoAnalyzer(String(value))"');
    /* 稀有度 pill 保留：rareCls 单一真源在 termRows，槽经 rareClsOf 反查（531 同步更新） */
    expect(v).toContain('rareCls = \'hi\'');
    expect(v).toContain(':class="rareClsOf(String(value))"');
    /* 行集在 termRows 产出后套 computed */
    expect(v).toMatch(/const tvViewMap = computed/);
    /* 531 批：裸 sessionStorage 换 useLinkCarry 统一件（键与 payload 逐字保持） */
    expect(v).toContain("useLinkCarry<{ index?: string; id?: string }>('xray')");
    expect(v).toContain("useLinkCarry<{ index: string; text: string }>('analyzer')");
    expect(v).not.toContain("sessionStorage.getItem('esquerystudio.link.");
    expect(v).toMatch(/@media \(max-width: 900px\)/);
    expect(v, '全文禁 min-width:901px 倒挂档').not.toMatch(/min-width:\s*901px/);
  });
});
