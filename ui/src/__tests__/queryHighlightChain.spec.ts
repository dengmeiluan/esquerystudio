/**
 * W-A：ES highlight 链路（P0 断链修复）端到端锁定。
 * 链路：ES 返回 hit.highlight → DslQueryView.normalizeResp 透传 → types.SearchHit.highlight
 * → ResultTable 单元格 hlSafe 净化（只放行 em/mark）后渲染。
 * 挂载样板照抄 rtCellDetail（裸 createApp + pinia + api mock）；DslQueryView 因 Monaco
 * 在 happy-dom 下初始化即抛错，其接线用源码静态锁定（dqViewMemory 同款手法）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';
import type { SearchHit } from '../types';
/* 五百六十批同步更新：RT 本地 hlSafe 定义退役合并 utils/highlightSanitize 单源（559 立牌兑现），
   本件从 RT 源码抽取求值改为直接 import 单源验证；下方行为断言逐字保留 */
import { hlSafe } from '../utils/highlightSanitize';

/* 带 highlight 的命中：title 片段含 ES 默认 <em> 与恶意 <img onerror>；n 片段用 <mark>；
   另一行不带 highlight（回落普通渲染的对照行） */
const HITS: SearchHit[] = [
  {
    _id: 'a', _index: 'hl1', _score: 1.0,
    _source: { title: 'hello world', n: 3 },
    highlight: { title: ['he<em>ll</em>o <img src=x onerror=alert(1)>'], n: ['<mark class="hl">3</mark>'] },
  },
  { _id: 'b', _index: 'hl1', _score: 0.5, _source: { title: 'plain row' } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountTbl() {
  document.body.appendChild(host);
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 2, index: 'hl1' }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

const cellByCol = (row: number, col: string) =>
  [...host.querySelectorAll('td.rt-cell')].filter(td => (td as HTMLElement).dataset.col === col)[row] as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
});

describe('ResultTable highlight 渲染与净化（挂载）', () => {
  it('highlight 片段优先渲染：<em> 放行高亮，<img onerror> 整段转义', async () => {
    await mountTbl();
    const td = cellByCol(0, 'title');
    const hl = td.querySelector('.rt-hl') as HTMLElement | null;
    expect(hl, 'title 格应走 highlight 分支（.rt-hl）').toBeTruthy();
    expect(hl!.innerHTML).toContain('he<em>ll</em>o');
    expect(hl!.innerHTML).not.toContain('<img');
    expect(hl!.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('<mark class="hl"> 同样放行（pre_tags 定制形态）', async () => {
    await mountTbl();
    const hl = cellByCol(0, 'n').querySelector('.rt-hl') as HTMLElement | null;
    expect(hl, 'n 格应走 highlight 分支').toBeTruthy();
    expect(hl!.innerHTML).toContain('<mark class="hl">3</mark>');
  });

  it('无 highlight 的行回落普通渲染（对照）', async () => {
    await mountTbl();
    const td = cellByCol(1, 'title');
    expect(td.querySelector('.rt-hl'), '对照行不应出现 highlight 分支').toBeNull();
    expect(td.textContent).toContain('plain row');
  });
});

describe('hlSafe 净化口径（五百六十批同步更新：单源 import 直验，断言逐字保留）', () => {
  it('受控 <em>/<mark> 放行；大小写/事件属性/伪标签维持转义', () => {
    expect(hlSafe('前<em>词</em>后')).toBe('前<em>词</em>后');
    expect(hlSafe('a<mark class="hl">b</mark>c')).toBe('a<mark class="hl">b</mark>c');
    expect(hlSafe('<EM>x</EM>')).not.toContain('<EM');
    expect(hlSafe('<em onclick="x()">y</em>')).not.toContain('<em onclick');
    expect(hlSafe('<em onclick="x()">y</em>')).toContain('&lt;em onclick');
  });

  it('裸 & < > 与脚本注入转义（fail-closed）', () => {
    expect(hlSafe('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    expect(hlSafe('<script>alert(1)</script>')).not.toContain('<script>');
  });
});

describe('链路上游接线（源码静态锁定）', () => {
  const dqSrc = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
  const typesSrc = readFileSync(join(__dirname, '../types.ts'), 'utf-8');

  it('types.SearchHit 有 highlight 字段', () => {
    expect(typesSrc).toContain('highlight?: Record<string, string[]>');
  });

  it('normalizeResp 透传 highlight（此前被丢弃的断链点）', () => {
    expect(dqSrc).toContain('h.highlight ? { highlight: h.highlight } : {}');
  });

  it('ResultTable 单元格 v-html 只走 hlSafe/hlHtml 净化出口', () => {
    /* 视图本体的 v-html（JSON 视图语法高亮）是既有通道，不在此断言；本次修复的
       highlight 渲染全部收口在 ResultTable 的 hlHtml（内含 hlSafe 净化）。
       五百六十批同步更新：hlSafe 本地定义退役合并单源 import（净化函数本体归
       utils/highlightSanitize，行为断言在本文件上方 describe 逐字保留） */
    const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
    expect(rt).toContain('v-html="hlHtml(hit, c)"');
    expect(rt).toContain('function hlHtml');
    expect(rt).toContain("import { hlSafe } from '../utils/highlightSanitize'");
  });
});
