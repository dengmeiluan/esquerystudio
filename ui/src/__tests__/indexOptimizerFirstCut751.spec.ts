/**
 * 七百五十一批：IndexOptimizer 首刀三小刀（R132；⑥750 头号建议落地=R131 裁决表
 * G183+G185+G184；741 G148/743 G152/745/747/749 首刀族同构）。
 *
 * ① G183（P3 铁律 F·头号）当前设置 9 键裸英文无 :title 中文释义（750 S-G183 实锚 0/9）；
 *    修法=io-k 悬停 :title 接共享索引设置目录（557 批 csHint 同款形态：`中文释义｜示例：xxx`；
 *    英文键留检索=悬浮层中文语义，717 G60/736 G133/741 G149 双语同款；目录外键回落空串零扰动）。
 * ② G185（P3 铁律 D·次刀）force_merge 钮 Layers 图标在途窗无 spinning（750 S-G185 实锚；
 *    「合并中…」文案切换既有=半合规；721 G73/729 G95/737 G132/741 G147/743 G153/747 G161
 *    族一行刀——theme.css .spinning 全局类）。
 * ③ G184（弱 P3 aria 随批可裁）maxSegments number input 无 aria-label 且不在 label 内
 *    （750 S-G184 实锚；G47/G142/G154/G158 族三行刀）。
 *
 * 驱动方式照 749 spec（视图/组件全真+只 mock ../api 网络出口；ConfirmModal 宿主复刻
 * App.vue 绑定面——askConfirm 写共享 confirmState，749 探针课①）。深链种法=hash 内
 * query（750 探针课①：useUrlState 读 location.hash.split('?')[1]，query 挂 hash 前永不消费）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const src = readFileSync(join(__dirname, '../views/IndexOptimizerView.vue'), 'utf-8');

/* ---- 网络出口 mock：750 probe mock 球同源（IO_SETTINGS 6 建议+117 段 flagged） ---- */
const indexSettingsFn = vi.fn();
const clusterHealthFn = vi.fn();
const clusterIndicesFn = vi.fn();
const forceMergeFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      indexSettings: (...args: any[]) => indexSettingsFn(...args),
      clusterHealth: (...args: any[]) => clusterHealthFn(...args),
      clusterIndices: (...args: any[]) => clusterIndicesFn(...args),
      clusterForceMerge: (...args: any[]) => forceMergeFn(...args),
    },
  };
});

import IndexOptimizerView from '../views/IndexOptimizerView.vue';
/* askConfirm 写共享 confirmState，须复刻 App.vue 宿主绑定（ConfirmModal 的 show 是
   prop 非自读 state，@confirm=resolveConfirm——R42 §8.1 全局确认服务消费面） */
import ConfirmModal from '../components/ConfirmModal.vue';
import { confirmState, resolveConfirm } from '../composables/confirm';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* 深链种法=hash 内 query（挂载前写 location.hash；idx 空串=无深链空态档） */
async function mountView(idx = 'probe-a') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  history.replaceState(null, '', idx ? `#/optimizer?idx=${idx}` : '#/optimizer');
  const app = createApp({
    render: () => h('div', [
      h(IndexOptimizerView as any),
      h(ConfirmModal as any, {
        show: confirmState.show, title: confirmState.title, message: confirmState.message,
        level: confirmState.level, guardText: confirmState.guardText, okText: confirmState.okText,
        facts: confirmState.facts,
        onConfirm: () => resolveConfirm(true),
        'onUpdate:show': (v: boolean) => { if (!v) resolveConfirm(false); },
      }),
    ]),
  });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: ParentNode, re: RegExp): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => re.test((b.textContent || '').replace(/\s+/g, '')));
  expect(btn, `按钮必须存在：${re}`).toBeTruthy();
  return btn!;
}

/* GET settings 驱动 6 建议（refresh 1s→warn / rep0+3 数据节点→critical / mrw 100000→warn /
   codec default→info / delayed 未设→info / translog request→info）；_cat 行 117 段/3 主分片
   =每片 39>15 阈值→flagged+建议 2 段（750 probe mock 球同源） */
const IO_SETTINGS = {
  'probe-a': { settings: { index: {
    provided_name: 'probe-a', creation_date: '1700000000000', uuid: 'u-751', version: { created: '8500099' },
    refresh_interval: '1s', number_of_shards: '3', number_of_replicas: '0',
    codec: 'default', max_result_window: '100000',
    translog: { durability: 'request', sync_interval: '5s' },
  } } },
};
const CAT_ROWS = [
  { index: 'probe-a', status: 'open', pri: '3', rep: '0', 'store.size': '30gb', 'segments.count': '117', 'docs.deleted': '423369' },
];

const pendFM: Array<(v: any) => void> = [];

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  confirmState.show = false; /* 上一用例确认门残留不复染下一挂载（749 探针课①） */
  pendFM.length = 0;
  indexSettingsFn.mockReset().mockResolvedValue(IO_SETTINGS);
  clusterHealthFn.mockReset().mockResolvedValue({ status: 'yellow', number_of_data_nodes: 3 });
  clusterIndicesFn.mockReset().mockResolvedValue(CAT_ROWS);
  forceMergeFn.mockReset().mockImplementation(() => new Promise<any>(res => { pendFM.push(res); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('751 A0 挂载不变量负锚（现状即守卫）', () => {
  it('空态档：无深链无 target→EmptyState 引导+扫描钮 disabled（558 批契约）', async () => {
    const host = await mountView('');
    expect(host.textContent).toContain('尚未扫描任何索引');
    expect(host.textContent).toContain('右上角选择目标索引');
    expect(findBtn(host, /扫描/).disabled, '未选目标扫描禁用').toBe(true);
    expect(indexSettingsFn.mock.calls.length, '零触发').toBe(0);
  });

  it('深链档：9 键+建议 6 条(c1/w2/i3)+段体检 flagged+maxSeg=2 建议档+应用钮预勾 3', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('索引一键优化向导');
    expect(host.textContent).toContain('当前设置');
    const keys = [...host.querySelectorAll('.io-k')].map(k => (k.textContent || '').trim());
    expect(keys.length, 'currentEntries 固定键序 9 键').toBe(9);
    expect(keys[0]).toBe('refresh_interval');
    expect((host.querySelector('.io-recs-cnt')?.textContent || '').trim()).toBe('6');
    expect(host.querySelectorAll('.io-rec').length).toBe(6);
    expect(host.querySelectorAll('.io-rec.sv-critical').length).toBe(1);
    expect(host.querySelectorAll('.io-rec.sv-warn').length).toBe(2);
    expect(host.querySelectorAll('.io-rec.sv-info').length).toBe(3);
    expect(host.textContent).toContain('段碎片体检');
    const mx = host.querySelector('.io-seg-in') as HTMLInputElement;
    expect(mx.value, 'maxSeg=段体检建议档').toBe('2');
    expect(findBtn(host, /应用勾选（3）/, ).disabled, '预勾 3=非 info 可下发').toBe(false);
  });
});

describe('751 G183 当前设置键 :title 中文释义（铁律 F·头号·共享目录单源）', () => {
  it('9 键全部带 :title（修前红：0/9 裸英文）+refresh_interval 悬浮含「刷新间隔」与「示例」', async () => {
    const host = await mountView();
    const ks = [...host.querySelectorAll('.io-k')] as HTMLElement[];
    expect(ks.length).toBe(9);
    const withTitle = ks.filter(k => (k.getAttribute('title') || '').length > 3);
    expect(withTitle.length, 'G183 病灶：当前设置键无中文释义（修前红）').toBe(9);
    const ri = ks.find(k => (k.textContent || '').trim() === 'refresh_interval')!;
    expect(ri.getAttribute('title')).toContain('刷新间隔');
    expect(ri.getAttribute('title')).toContain('示例');
    /* dot-path 键（translog.durability）同走目录精确命中 */
    const td = ks.find(k => (k.textContent || '').trim() === 'translog.durability')!;
    expect((td.getAttribute('title') || '')).toContain('translog');
  });

  it('源码锁：悬浮接线走共享索引设置目录单源（557 csHint 同款 find 形态）', () => {
    expect(src).toMatch(/:title="ioHint\(k\)"/);
    expect(src).toMatch(/SETTINGS_CATALOG\.find/);
  });
});

describe('751 G184 maxSegments input aria-label（弱 P3 aria·三行刀）', () => {
  it('input 带 aria-label=目标段数 maxSegments（修前红：null 且不在 label 内）', async () => {
    const host = await mountView();
    const i = host.querySelector('.io-seg-in') as HTMLInputElement;
    expect(i, 'maxSegments input 在场').toBeTruthy();
    expect(i.getAttribute('aria-label'), 'G184 病灶：无 aria-label（修前红）').toBe('目标段数 maxSegments');
    expect(i.closest('label'), 'span 兄弟文本非 label 关联（形态备案）').toBeNull();
  });
});

describe('751 G185 force_merge 在途窗 spinning（铁律 D·747 G161 族一行刀）', () => {
  it('确认合并→在途窗 svg.spinning+disabled+「合并中…」；复常三通道移除+复拉', async () => {
    const host = await mountView();
    const fm = findBtn(host, /执行force_merge/);
    const mx = host.querySelector('.io-seg-in') as HTMLInputElement;
    mx.value = '3';
    mx.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(6);
    fm.click();
    await settle(6);
    const cf = document.querySelector('.cf');
    expect(cf, 'critical guard 确认门开').toBeTruthy();
    expect(cf!.textContent).toContain('不可逆');
    const guard = cf!.querySelector('.cf-guard input') as HTMLInputElement;
    expect(guard, 'guard 输入在场').toBeTruthy();
    guard.value = 'probe-a';
    guard.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(6);
    const ok = [...document.querySelectorAll<HTMLButtonElement>('.cf button')]
      .find(b => /合并到 3 段/.test(b.textContent || ''))!;
    expect(ok, '确认钮（okText=合并到 3 段）').toBeTruthy();
    expect(ok.disabled, '填 guard 解禁').toBe(false);
    ok.click();
    await settle(8);
    expect(forceMergeFn.mock.calls.length, '单发 force_merge').toBe(1);
    /* 在途窗三读：disabled（既有）+「合并中…」（既有）+spinning（G185 修后新增） */
    expect(fm.disabled, '在途窗 disabled（既有）').toBe(true);
    expect((fm.textContent || '').replace(/\s+/g, ''), '在途文案（既有）').toContain('合并中');
    expect(fm.querySelector('svg')?.classList.contains('spinning'), 'G185 病灶：Layers 无 spinning（修前红）').toBe(true);
    pendFM[0]({ acknowledged: true, taskId: 'task-751-fm' });
    await settle(16);
    expect(fm.querySelector('svg')?.classList.contains('spinning'), '复常 spinning 移除').toBe(false);
    expect((fm.textContent || '').replace(/\s+/g, ''), '复常文案回退').toContain('执行force_merge');
    expect(fm.disabled, '复常解禁').toBe(false);
    expect(indexSettingsFn.mock.calls.length, '合并后复拉（scan 收敛链）').toBe(2);
  });
});
