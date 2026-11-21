/**
 * ：Slm 首刀三小刀+史志注释修正（； 裁决表 G131+G132+G133+G139-②）。
 *
 * ① G131（P3 死代码·头号）PageHeader 合并后页头旧壳左组/图标/标题/副题四条死规则删
 *    （styleSheets 各 1 命中合计 4+模板 0 引用双实锚；活锚页头行基壳/右组钮容器/
 *    自动刷新 label 保留；713 G53/715 G56/717 G61/721 G72/727 G86/729 G94/733 G109/
 *    735 G120 先例链）。
 * ② G132（P3 铁律 D·次刀）立即执行钮 Play 补 spinning（execing 此前只 disabled+
 *    「触发中…」文案切换=半合规；735 G122 同形态；729 G95/731 G104/733 G110/
 *    735 G121 同族）。
 * ③ G133（P3 铁律 F）卡 MetaStrip indices 段英文裸 label 无 tip（title=null 实锚）；
 *    修法=补中文 tip，英文 label 留检索（717 G60 双语同款）。
 * ④ G139-②（史志失实随刀修正）注释宣称右键菜单四项而实现恒三项——
 *    注释与实现对齐（ G85 意图与实现不符弱形态；705-C1 转述零字面量）。
 *
 * 驱动方式照 lifecycleFirstCut735（vue-router 轻 mock + 只 mock ../api）+
 * protectThreeState 的 SLM 端点分桶；askConfirm 全程 mock 放行（确认门行为归
 * protectThreeState/probe 域，只锁在途窗与 tip 通道）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const routeMock = { path: '/slm', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* askConfirm 放行（G132 在途窗测试需要越过确认门直落 execing 态） */
vi.mock('../composables/confirm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables/confirm')>();
  return { ...actual, askConfirm: () => Promise.resolve(true) };
});

const slmPoliciesFn = vi.fn();
const slmStatusFn = vi.fn();
const slmExecuteFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      slmPolicies: (...a: any[]) => slmPoliciesFn(...a),
      slmStatus: (...a: any[]) => slmStatusFn(...a),
      slmExecute: (...a: any[]) => slmExecuteFn(...a),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import SlmView from '../views/SlmView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const app = createApp({ render: () => h(SlmView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: HTMLElement, re: RegExp): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => re.test((b.textContent || '').replace(/\s+/g, '')));
  expect(btn, `按钮必须存在：${re}`).toBeTruthy();
  return btn!;
}

function collapse(s: string | null): string { return (s || '').replace(/\s+/g, ''); }

/* 后端契约（EsIndexAdmin）：slmPolicies 成功 = name→{policy,last_success,...} 映射。
   三策略对齐 736 mock 球形态：audit-365d 无 retention / daily-logs 全量 retention /
   metrics-30d 仅 min_count——卡 meta 段数 3/4/4 全形态覆盖 G133 判据 */
const POLICIES_OK = {
  'audit-365d': {
    policy: { name: 'audit-365d', schedule: '0 0 1 * * ?', repository: 'fs-repo', config: { indices: ['audit-*'] } },
    last_success: { time: 1760000000000 },
    next_execution_millis: 1760003600000,
  },
  'daily-logs': {
    policy: { name: 'daily-logs-2026.10.03', schedule: '0 30 1 * * ?', repository: 'fs-repo', config: { indices: ['logs-*', 'trace-*'] }, retention: { expire_after: '7d' } },
    last_failure: { time: 1760001000000 },
    next_execution_millis: 1760007200000,
  },
  'metrics-30d': {
    policy: { name: 'metrics-30d', schedule: '0 15 2 * * ?', repository: 's3-repo', config: { indices: [] }, retention: { min_count: 10 } },
    next_execution_millis: 1760010800000,
  },
};
const STS_OK = { status: { operation_mode: 'RUNNING' }, stats: { total_snapshots_taken: 12, total_snapshots_failed: 1, retention_runs: 3, retention_deletion_time_millis: 65000 } };

/* 在途窗分桶 deferred（731 G104b 课：单 release 变量会被多 Promise 覆盖，按桶收集） */
let exRes: Array<(v: any) => void> = [];
const relAll = (bag: Array<(v: any) => void>, v: any) => { bag.splice(0).forEach(r => r(v)); };

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  for (const k of Object.keys(routeMock.query)) delete routeMock.query[k];
  exRes = [];
  slmPoliciesFn.mockReset().mockResolvedValue(POLICIES_OK);
  slmStatusFn.mockReset().mockResolvedValue(STS_OK);
  slmExecuteFn.mockReset().mockImplementation(() => new Promise<any>(res => { exRes.push(res); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

/* 卡 meta 段定位：按段尾 label 文本（.ms-i 内 <i>）找段（732 探针课③同型：MetaStrip
   段结构 .ms-i 直查，类名落根上时后代选择器恒空） */
function segOf(card: Element, label: string): Element | undefined {
  return Array.from(card.querySelectorAll('.ms-i'))
    .find(el => el.querySelector('i')?.textContent?.trim() === label);
}

describe('737 A0 挂载不变量负锚（现状即守卫）', () => {
  it('title+页头 MetaStrip 六段+3 卡（meta 段数 3/4/4）+exec/copy 钮在场', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('SLM 快照生命周期');
    const cards = host.querySelectorAll('.slm-card');
    expect(cards.length, '三策略卡').toBe(3);
    expect(host.querySelectorAll('.slm-meta .ms-i').length, '页头六段').toBe(6);
    /* 卡 meta 段数全形态：无 retention 3 段 / expire_after 4 段 / min_count 4 段 */
    expect(cards[0].querySelectorAll('.slm-card-meta .ms-i').length).toBe(3);
    expect(cards[1].querySelectorAll('.slm-card-meta .ms-i').length).toBe(4);
    expect(cards[2].querySelectorAll('.slm-card-meta .ms-i').length).toBe(4);
    expect(cards[0].textContent).toContain('audit-365d');
    expect(findBtn(cards[1] as HTMLElement, /立即执行/), 'exec 钮在场').toBeTruthy();
    expect(findBtn(cards[1] as HTMLElement, /复制/), 'copy 钮在场').toBeTruthy();
    expect(cards[2].querySelector('.slm-card-meta')?.textContent, '空 indices 走 (all) 兜底').toContain('(all)');
  });
});

describe('737 G132 立即执行钮在途窗（铁律 D·execing 半合规补全）', () => {
  it('确认后在途窗 disabled（既有）+「触发中…」（既有）+spinning（G132 病灶：修前零）；他卡不受扰；完成复常', async () => {
    const host = await mountView();
    const cards = host.querySelectorAll('.slm-card');
    const execA = findBtn(cards[0] as HTMLElement, /立即执行/);
    execA.click();
    await settle(4);
    expect(slmExecuteFn).toHaveBeenCalledTimes(1);
    expect(slmExecuteFn.mock.calls[0][0]).toBe('audit-365d');
    expect(execA.disabled, '防重入既有').toBe(true);
    expect(collapse(execA.textContent), '文案切换既有').toContain('触发中…');
    expect(execA.querySelector('.spinning'), 'G132 病灶：在途窗零 spinning').toBeTruthy();
    /* per 卡 execing 独立：他卡 exec 钮不受扰（可点+零 spinning） */
    const execB = findBtn(cards[1] as HTMLElement, /立即执行/);
    expect(execB.disabled, '他卡不受扰可点').toBe(false);
    expect(execB.querySelector('.spinning'), '他卡零 spinning').toBeNull();
    relAll(exRes, { snapshot_name: 'snap-737-a' });
    await settle();
    expect(execA.disabled, '完成复常可点').toBe(false);
    expect(execA.querySelector('.spinning')).toBeNull();
    expect(collapse(execA.textContent)).toContain('立即执行');
    /* execNow 成功补偿：立即 loadAll 复拉（策略元数据刷新不等 1200ms 兜底） */
    expect(slmPoliciesFn.mock.calls.length, '触发后立即复拉').toBeGreaterThanOrEqual(2);
  });
});

describe('737 G133 indices 段中文 tip（铁律 F·717 G60 双语同款）', () => {
  it('三卡 indices 段 title=「快照覆盖的索引列表」+help 档；tip 不进可见文本；其余段 title 仍缺省', async () => {
    const host = await mountView();
    const cards = host.querySelectorAll('.slm-card');
    for (const card of cards) {
      const seg = segOf(card, 'indices');
      expect(seg, 'indices 段在场').toBeTruthy();
      expect(seg!.getAttribute('title'), 'G133 病灶：indices 段无 tip').toBe('快照覆盖的索引列表');
      expect(seg!.className, 'tip 无 to 走 help 档（cursor:help）').toContain('help');
    }
    /* tip 走 :title 悬停通道，不进可见文本（可见面零泄漏） */
    expect(host.textContent).not.toContain('快照覆盖的索引列表');
    /* 修法只动 indices 段：同卡其余段（保留/上次/下次）title 仍缺省 */
    const segs1 = Array.from(cards[1].querySelectorAll('.slm-card-meta .ms-i'));
    expect(segs1.filter(el => el.getAttribute('title')).length, 'daily-logs 卡仅 indices 段带 title').toBe(1);
    expect(segOf(cards[1], '保留')!.getAttribute('title')).toBeNull();
    expect(segOf(cards[1], '上次')!.getAttribute('title')).toBeNull();
    expect(segOf(cards[1], '下次')!.getAttribute('title')).toBeNull();
  });
});

describe('737 G131 页头四条死规则退役（源码锁；735 G120 同族）', () => {
  it('死族零残留+活锚页头行基壳/右组钮容器/自动刷新 label 保留（CSS+模板双锚）', () => {
    const v = read('../views/SlmView.vue');
    /* 死族字面量须连注释一并零残留（705-C1：史志注释不得引用待清符号字面量自伤清零锁） */
    for (const dead of ['.slm-hd-l', '.slm-hd-ic', '.slm-hd-tt', '.slm-hd-sub']) {
      expect(v.includes(dead), `死规则残留：${dead}`).toBe(false);
    }
    /* 活锚保留：CSS 规则+模板消费双锚（基壳 .slm-hd 基础档+1100 断点恰两条） */
    expect((v.match(/\.slm-hd\s*\{/g) || []).length, '页头行基壳规则恰两条（基础+1100 断点）').toBe(2);
    expect(v).toMatch(/\.slm-hd-r \{/);
    expect(v).toMatch(/\.slm-auto-lbl \{/);
    expect(v).toMatch(/class="slm-hd"/);
    expect(v).toMatch(/class="slm-hd-r"/);
    expect(v).toMatch(/class="slm-auto-lbl"/);
  });
});

describe('737 G139-② 右键菜单史志注释与实现对齐（ G85 弱形态）', () => {
  it('失实第四项宣称零残留+修正注记在场（705-C1 转述零字面量）+菜单三项契约不回归', () => {
    const v = read('../views/SlmView.vue');
    expect(v.includes('在 DevTools 打开策略 JSON'), '史志失实宣称须随刀修正').toBe(false);
    expect(v).toMatch(/史志修正/);
    /* 三项契约（行为面归 slmMenu309，此处锁注释↔实现一致性锚） */
    for (const anchor of ["key: 'copy-id'", "key: 'copy-body'", "key: 'exec'"]) {
      expect(v, anchor).toContain(anchor);
    }
  });
});

describe('737 源码锁（spinning+tip 字面锚）', () => {
  it('两刀字面在场：执行钮 Play spinning / indices 段 tip', () => {
    const v = read('../views/SlmView.vue');
    expect(v).toContain('Play :size="12" :class="{ spinning: execing === p.id }"'); // G132
    expect(v).toContain("label: 'indices', tip: '快照覆盖的索引列表'"); // G133
    expect(v).toContain("'触发中…'"); // G132 文案切换既有
  });
});
