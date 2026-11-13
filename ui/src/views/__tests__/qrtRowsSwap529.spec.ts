/**
 * 五百二十九批：裸表换壳 A 组三表 → QRT rows 型 行为锁（W-A）。
 * 基线 6d08c662；换壳铁法=先列锚清单再动手、零删用例、行为断言全数保留。
 *
 * 锁定（挂载级，源码锁见 sweep524/analyzerLink/analyzeLayout525W4b/securityReadability 随迁锚）：
 * 1) SecurityView 审计表：QRT 列头排序语义（HTTP 列数值升序）、TSV/Markdown 复制走
 *    getCsvBlock（时间列 exportCell=fmtTimeTz 加工、MD 动作列 actionZh 中文还原）、
 *    详情查看器打开路径不变（#cell-详情 槽按钮 → 审计详情弹层）；
 * 2) BrowserView 索引表：状态列 indexStatusZh 中文主显+英文小字（五百三十一批起 en 小字
 *    由 StatusPill 内建 .sp-en 承担，形态不回退）、
 *    行选中 .bw-picked 走 rowClass 契约、ForceMerge 钮走 askConfirm 确认门、
 *    #row-actions 复制行信息剪贴板、文档数列 fieldTypes long 采样徽标；
 * 3) AnalyzeView token 表（Monaco 挂载成本高走源码锁）：QRT rows 接线/中文列名键/
 *    fieldTypes double/#cell- 槽保真 Mapping。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AUDIT = [
  { timestamp: '2026-09-18T10:00:00Z', username: 'alice', role: 'VIEWER', action: 'WRITE', method: 'POST', uri: '/internal/es/index-a/_doc', httpStatus: 200, detail: '' },
  { timestamp: '2026-09-18T10:01:00Z', username: 'bob', role: 'VIEWER', action: 'PAGE_DENIED', method: 'GET', uri: '/internal/es/index-b', httpStatus: 403, detail: '已拒绝：非授权页面' },
  { timestamp: '2026-09-18T10:02:00Z', username: 'carol', role: 'OPERATOR', action: 'LOGIN', method: 'POST', uri: '/login', httpStatus: 200, detail: '' },
];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api.auth,
        users: vi.fn(async () => []),
        /* 五百五十五批：线缆 {records:[...]} 扁平直出（ES hits 包装契约退役） */
        opsAudit: vi.fn(async () => ({ records: AUDIT })),
      },
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve(INDICES),
      setup: { ...actual.api.setup, status: vi.fn(async () => ({ bound: true, mode: 'SELF', endpoint: 'http://127.0.0.1:9200', appName: 'test', hostVisible: false })) },
    },
  };
});

const INDICES = [
  { index: 'logs-app', health: 'green', status: 'open', 'docs.count': 12345, 'store.size': '1mb', pri: 1, rep: 1, 'creation.date.string': '2026-01-01' },
  { index: 'logs-web', health: 'yellow', status: 'close', 'docs.count': 7, 'store.size': '2mb', pri: 2, rep: 1, 'creation.date.string': '2026-02-01' },
];

import SecurityView from '../../views/SecurityView.vue';
import BrowserView from '../../views/BrowserView.vue';
import ConfirmModal from '../../components/ConfirmModal.vue';
import { confirmState } from '../../composables/confirm';
import { useAuthStore } from '../../stores/auth';
import { useAppStore } from '../../stores/app';

/* vue-router 部分mock（保留 createRouter 真身供 SecurityView 挂载）：BrowserView 的
   useUrlState 链需要 useRoute；goHub 的 push 侧可观测 */
const pushSpy = vi.fn();
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRouter: () => ({ push: pushSpy }),
    useRoute: () => ({ path: '/browser', query: {} }),
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '#/';
});

/* ═══ 1) SecurityView 审计表 ═══ */
async function mountSecurity() {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const host = makeHost();
  const app = createApp({ render: () => h(SecurityView) });
  app.use(pinia);
  app.use(router);
  const auth = useAuthStore(pinia);
  auth.me = { username: 'root', role: 'ADMIN', fallback: false } as any;
  app.mount(host);
  await settle();
  return { app, host };
}

const secAuditTable = (host: HTMLElement) => host.querySelector('table.qrt-tbl')!;
const secAuditRows = (host: HTMLElement) =>
  [...secAuditTable(host).querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));

describe('529 换壳：SecurityView 审计表 QRT rows 型行为锁', () => {
  it('QRT 列头点击排序语义（HTTP 列数值升序：403 行移到末位）', async () => {
    const { app, host } = await mountSecurity();
    expect(secAuditRows(host).length).toBe(3);
    expect(secAuditRows(host)[1].textContent).toContain('bob');
    const th = [...secAuditTable(host).querySelectorAll<HTMLTableCellElement>('thead th')]
      .find(t => t.dataset.col === 'HTTP')!;
    th.click();
    await settle(6);
    const rows = secAuditRows(host);
    expect(rows[2].textContent, 'HTTP 升序 → bob(403) 移到末位').toContain('bob');
    expect(th.getAttribute('aria-sort')).toBe('ascending');
    app.unmount();
  });

  it('TSV 复制走 getCsvBlock：表头=中文键、时间列经 exportCell=fmtTimeTz 加工', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    const { app, host } = await mountSecurity();
    const tsvBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('TSV'))!;
    tsvBtn.click();
    await settle(6);
    expect(writeText).toHaveBeenCalled();
    const text = writeText.mock.calls[0][0] as string;
    const lines = text.split('\n');
    /* 五百七十二批随迁：R23（e2f906a0）审计列头「耗时」加注 (ms) 单位（信息可达铁律 F），
       12 列结构与数据行形态不变，表头断言字面随之 */
    expect(lines[0]).toBe('时间\t用户\t角色\t来源\t动作\t方法\tURI\t集群\tIP\tHTTP\t耗时(ms)\t详情');
    expect(lines[1]).toContain('alice');
    expect(lines[1]).toContain('(UTC+8)');
    app.unmount();
  });

  it('Markdown 复制：动作列 actionZh 中文还原（内核矩阵存原码），详情空档出 -', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    const { app, host } = await mountSecurity();
    const mdBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'Markdown')!;
    mdBtn.click();
    await settle(6);
    const md = writeText.mock.calls[0][0] as string;
    expect(md).toContain('| 时间 | 用户 | 角色 | 来源 | 动作 | 方法 | URI | 集群 | IP | HTTP | 耗时(ms) | 详情 |');
    expect(md).toContain('写操作');
    expect(md).toContain('页面被拒');
    app.unmount();
  });

  it('审计详情打开路径不变：#cell-详情 槽按钮 → 审计详情弹层', async () => {
    const { app, host } = await mountSecurity();
    const bobRow = secAuditRows(host).find(r => r.textContent!.includes('bob'))!;
    const btn = bobRow.querySelector<HTMLButtonElement>('button[aria-label="查看完整详情"]');
    expect(btn, '详情查看按钮在（槽内保真）').toBeTruthy();
    btn!.click();
    await settle(8);
    const modal = [...document.querySelectorAll('.n-card')].find(c => c.textContent!.includes('审计详情'));
    expect(modal, '审计详情弹层打开').toBeTruthy();
    /* 557 批锁随迁：审计详情 meta 换装 MetaStrip 单源后为「值前标签后」形态（'403 HTTP'，
       RemoteClusters 533 判例同构；新形态锚见 unifyWave557），原 'HTTP 403' 字面退役 */
    expect(modal!.textContent).toContain('403 HTTP');
    expect(modal!.textContent).toContain('bob');
    app.unmount();
  });
});

/* ═══ 2) BrowserView 索引表 ═══ */
async function mountBrowser(picked = '') {
  const pinia = createPinia();
  const store = useAppStore(pinia);
  const host = makeHost();
  /* ConfirmModal 宿主同挂（App.vue 全局确认服务唯一宿主范式）——ForceMerge/删除
     确认门可在裸挂载下渲染 */
  const app = createApp({
    setup: () => {
      store.indices = INDICES.map(i => ({ ...i })) as any;
      if (picked) store.pick(picked);
      /* ConfirmModal 需要显式 props 接 confirmState（App.vue 唯一宿主同款接线） */
      return () => h('div', [
        h(BrowserView as any),
        h(ConfirmModal as any, {
          show: confirmState.show, title: confirmState.title, message: confirmState.message,
          level: confirmState.level, guardText: confirmState.guardText, okText: confirmState.okText,
          facts: confirmState.facts,
        }),
      ]);
    },
  });
  app.use(pinia);
  app.mount(host);
  await settle(20);
  return { app, host, store };
}

const bwRows = (host: HTMLElement) =>
  [...host.querySelectorAll('table.qrt-tbl tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));

describe('529 换壳：BrowserView 索引表 QRT rows 型行为锁', () => {
  it('状态列 indexStatusZh 中文主显 + 英文小字（五百三十一批起 StatusPill en 档组件化，.sp-en 归统一件）；close 行出中性 pill', async () => {
    const { app, host } = await mountBrowser();
    const closeRow = bwRows(host).find(r => r.textContent!.includes('logs-web'))!;
    const pill = closeRow.querySelector('.pill.n')!;
    expect(pill, 'close 状态行 pill 在').toBeTruthy();
    expect(pill.textContent).toContain('关闭');
    /* 五百三十一批锚随迁：.bw-st-en 本地小字退役，en 小字形态归 StatusPill 内建 .sp-en（形态不回退） */
    expect(pill.querySelector('.sp-en')?.textContent).toBe('close');
    app.unmount();
  });

  it('行选中高亮走 rowClass 契约（.bw-picked 挂内核 tr）', async () => {
    const { app, host } = await mountBrowser('logs-web');
    const picked = host.querySelector('tr.bw-picked');
    expect(picked, 'picked 行必须带 .bw-picked（rowClass）').toBeTruthy();
    expect(picked!.textContent).toContain('logs-web');
    app.unmount();
  });

  it('文档数列数值语义：fieldTypes long → num-col 右对齐 + 千分位 + 采样徽标', async () => {
    const { app, host } = await mountBrowser();
    const th = [...host.querySelectorAll<HTMLTableCellElement>('table.qrt-tbl thead th')]
      .find(t => t.dataset.col === '文档数')!;
    expect(th.querySelector('.qrt-th-type')?.textContent).toBe('long');
    const docsTd = bwRows(host)[0].querySelector('td.num-col');
    expect(docsTd, '文档数格挂 num-col 右对齐').toBeTruthy();
    expect(docsTd!.textContent).toContain('12,345');
    app.unmount();
  });

  it('ForceMerge 钮走 askConfirm 确认门（旧 askFm 执行体保真）', async () => {
    const { app, host } = await mountBrowser();
    /* 1148：ForceMerge 收进行内「更多 ⋯」弹层——先开菜单再点项 */
    const moreBtn = [...host.querySelectorAll<HTMLButtonElement>('.bw-acts button')][1];
    moreBtn.click();
    await settle(8);
    const fmBtn = [...document.querySelectorAll<HTMLButtonElement>('.bw-more .bw-more-it')]
      .find(b => (b.textContent ?? '').includes('ForceMerge'))!;
    expect(fmBtn, '「更多」里应有 ForceMerge').toBeTruthy();
    fmBtn.click();
    await settle(8);
    const modal = [...document.querySelectorAll('body > *')].map(m => m.textContent || '').join('');
    expect(modal).toContain('ForceMerge 段合并');
    app.unmount();
  });

  it('#row-actions 复制行信息剪贴板（单行事实串）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    const { app, host } = await mountBrowser();
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="复制行信息"]');
    expect(btn, '行尾复制行信息注入位在').toBeTruthy();
    btn!.click();
    await settle(6);
    expect(writeText).toHaveBeenCalledWith('logs-app: health=green status=open docs=12345 store=1mb shards=1/1 created=2026-01-01');
    app.unmount();
  });
});

/* ═══ 3) AnalyzeView token 表（源码锁） ═══ */
describe('529 换壳：AnalyzeView token 表 QRT rows 型源码锁', () => {
  const av = readFileSync(join(__dirname, '../../views/AnalyzeView.vue'), 'utf-8');

  it('QRT rows 接线：中文列名键 + fieldTypes double + storageKey 记忆 + kw 空态文案', () => {
    expect(av).toMatch(/<QueryResultTable\s*\n\s+:cols="AV_TOKEN_COLS" :rows="tokenMatrix" sortable/);
    expect(av).toContain('storage-key="analyze:tokens"');
    expect(av).toContain(":field-types=\"AV_TOKEN_TYPES\"");
    expect(av).toMatch(/:empty-text="tkKw\.trim\(\) \? '无匹配 token（过滤词：' \+ tkKw \+ '）' : '无数据'"/);
  });

  it('矩阵映射：# 序号=原数组位 i+1（kw 过滤不串位）、词性列存原码、offset 区间串', () => {
    expect(av).toMatch(/const tokenMatrix = computed<any\[\]\[\]>\(\(\) => shownTokens\.value\.map\(\(\{ t, i \}\) => \[\n {2}i \+ 1, t\.token, t\.position, `\$\{t\.start_offset\}-\$\{t\.end_offset\}`, t\.type, t\.end_offset - t\.start_offset,\n\]\)\);/);
  });

  it('槽保真：词元/词性 MarkText 命中、数值三列 title 原值、token 色 colorFor', () => {
    expect(av).toMatch(/#cell-词元="\{ value \}"/);
    expect(av).toMatch(/#cell-词性="\{ value \}"/);
    expect(av).toMatch(/#cell-序位="\{ value \}"/);
    expect(av).toMatch(/#cell-字符区间="\{ value \}"/);
    expect(av).toMatch(/#cell-长度="\{ value \}"/);
    expect(av).toContain('colorFor(value)');
  });
});
