/**
 * 多索引批量迁移（XmigrateView 多选模式端到端）。
 *
 * 行为面：
 *   ① 多选开关切换——开=清单逐行勾选（NCheckbox，无原生 checkbox）+ 已选 chips 单个移除；
 *     关=单源向导原形态（chips 点击选源）；
 *   ② 前缀映射函数——纯字符串前缀替换：命中源前缀→目标前缀+余段、不命中保持原名、
 *     两前缀皆空=同名迁移；非法目标名（大写字母）行内红字标注且该行不进提交集；
 *   ③ 提交循环——确认弹层列全部映射对，逐个 start、失败不中断（继续下一个），
 *     完成后汇总 toast「批量迁移已下发：成功 M / 失败 K」+ 结果面板失败明细（可复制）；
 *   ④ REBUILD 危险保护——确认弹层每行红色警示「将删除目标索引现有数据」，
 *     确认钮文案升级「确认删除并迁移 N 个索引」（与单索引 REBUILD 确认同口吻）；
 *   ⑤ 单选模式回归——默认挂载即单源向导：chips 单选/目标输入/启动钮零变化。
 * 源码锚：六个 data-test 锚 + 映射函数/循环下发/汇总文案/REBUILD 文案字面。
 * 挂具范式同 xmigrateUx1120（setupState 直调 + 全真挂载；api/copyText 均 mock）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import XmigrateView from '../views/XmigrateView.vue';
import { useAppStore } from '../stores/app';

const xbJobs = vi.fn();
const xbStart = vi.fn();
const copyTextFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobs(...a),
        destIndices: async () => [],
        start: (...a: any[]) => xbStart(...a),
      },
    },
  };
});
/* copyText 打桩 spy（utils/format 其余导出保真）——失败清单复制断言只认实参串 */
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: (...a: any[]) => copyTextFn(...a) };
});

const REMOTE = [
  { index: 'onshore-bond-basic_2024', 'docs.count': '1200' },
  { index: 'onshore-bond-basic_2025', 'docs.count': '800' },
  { index: 'wiki-v2', 'docs.count': '30' },
];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountXm() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/xmigrate', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, store: useAppStore(pinia) };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/** 挂载 + 手输连接就绪（canBatchStart 要求 conn.host 在场）+ 旧集群清单注入 */
async function mountReady() {
  const ctx = await mountXm();
  const st = stateOf(ctx.app);
  st.conn = { scheme: 'http', host: 'old-es', port: 9200, username: '', password: '' };
  st.remoteIndices = REMOTE;
  await settle(2);
  return { ...ctx, st };
}

function clickToggle(host: ParentNode) {
  (host.querySelector('[data-test="xm-batch-toggle"]') as HTMLButtonElement).click();
}
/** 勾选第 i 行源索引（NCheckbox 根元素点击翻转，无原生 input） */
function checkRow(host: ParentNode, i: number) {
  const boxes = [...host.querySelectorAll('.xm-batch-item [role="checkbox"]')] as HTMLElement[];
  boxes[i]!.click();
}
function setInput(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbStart.mockReset().mockResolvedValue({ jobId: 'j-batch' });
  copyTextFn.mockReset().mockResolvedValue(true);
});

/* ═══ ① 多选开关切换 + 已选 chips 单个移除（挂载） ═══ */
describe('批量 ①：多选模式切换与已选 chips 移除', () => {
  it('默认单选形态；开启后清单逐行勾选，勾两行→已选 2，移除一行→已选 1', async () => {
    const { app, host, st } = await mountReady();
    expect(host.querySelector('[data-test="xm-batch-toggle"]')!.getAttribute('aria-pressed'), '默认单选').toBe('false');
    expect(host.querySelectorAll('.xm-r-list .chip[role="button"]').length, '单选 chips 在场').toBe(3);
    expect(host.querySelector('[data-test="xm-batch-srcprefix"]'), '批量前缀输入不在场').toBeNull();

    clickToggle(host);
    await settle(2);
    expect(host.querySelector('[data-test="xm-batch-toggle"]')!.getAttribute('aria-pressed'), '多选开启').toBe('true');
    expect(host.querySelectorAll('.xm-r-list .chip[role="button"]').length, '单选 chips 退场').toBe(0);
    expect(host.querySelectorAll('.xm-batch-item').length, '清单逐行勾选形态').toBe(3);
    expect(host.querySelectorAll('.xm-batch-item input[type="checkbox"]').length, '无原生 checkbox').toBe(0);

    checkRow(host, 0);
    checkRow(host, 1);
    await settle(2);
    expect(host.querySelector('.xm-batch-sel')!.textContent, '已选计数').toContain('已选 2');
    expect(host.querySelectorAll('.xm-batch-sel .chip').length, '已选 chips 两枚').toBe(2);
    expect(host.querySelectorAll('[data-test="xm-batch-map"] tbody tr').length, '映射预览两行').toBe(2);

    (host.querySelector('.xm-batch-x') as HTMLButtonElement).click();
    await settle(2);
    expect(host.querySelector('.xm-batch-sel')!.textContent, '移除一枚').toContain('已选 1');
    expect(st.batchSel.length).toBe(1);
    app.unmount();
  }, 8000);

  it('关闭开关即回单源向导，勾选清零不残留', async () => {
    const { app, host, st } = await mountReady();
    clickToggle(host); await settle(2);
    checkRow(host, 0); await settle(2);
    expect(st.batchSel.length).toBe(1);
    clickToggle(host); await settle(2);
    expect(host.querySelectorAll('.xm-r-list .chip[role="button"]').length, '单选 chips 回归').toBe(3);
    expect(host.querySelector('.xm-batch-sel'), '已选区退场').toBeNull();
    expect(host.querySelector('[data-test="xm-batch-map"]'), '映射表退场').toBeNull();
    expect(st.batchSel.length, '勾选清零').toBe(0);
    app.unmount();
  }, 8000);
});

/* ═══ ② 前缀映射函数 + 非法目标名标注（直调 + 挂载） ═══ */
describe('批量 ②：前缀映射（纯字符串前缀替换）', () => {
  it('命中前缀替换；不匹配保持原名；两前缀皆空=同名；仅目标前缀=全量加前缀', async () => {
    const { app, st } = await mountReady();
    expect(st.mapBatchDest('onshore-bond-basic_2024', 'onshore-bond-basic_', 'uat_onshore-bond-basic_'))
      .toBe('uat_onshore-bond-basic_2024');
    expect(st.mapBatchDest('onshore-bond-basic_2024', '', ''), '两前缀皆空=同名迁移').toBe('onshore-bond-basic_2024');
    expect(st.mapBatchDest('wiki-v2', 'onshore-bond-basic_', 'uat_onshore-bond-basic_'), '不匹配保持原名').toBe('wiki-v2');
    expect(st.mapBatchDest('wiki-v2', '', 'uat_'), '空前缀恒命中=全量加前缀').toBe('uat_wiki-v2');
    expect(st.mapBatchDest('onshore-x', 'onshore-', ''), '空目标前缀=剥前缀').toBe('x');
    app.unmount();
  }, 8000);

  it('非法目标名（大写）行内红字标注且不进提交集：预览表红行+提交钮禁用', async () => {
    const { app, host, st } = await mountReady();
    clickToggle(host); await settle(2);
    checkRow(host, 0); await settle(2);
    setInput(host.querySelector('[data-test="xm-batch-dstprefix"]')!, 'UAT_');
    await settle(2);
    const badRow = host.querySelector('[data-test="xm-batch-map"] tbody tr')!;
    expect(badRow.className, '非法行红档类').toContain('xm-batch-bad');
    expect(badRow.textContent).toContain('含大写字母');
    expect(badRow.textContent, '行内禁用说明').toContain('该行不提交');
    expect(st.batchPairs.length, '非法行不进提交集').toBe(0);
    const submit = host.querySelector('[data-test="xm-batch-submit"]') as HTMLButtonElement;
    expect(submit.disabled, '零有效映射提交禁用').toBe(true);
    app.unmount();
  }, 8000);
});

/* ═══ ③ 提交循环：确认弹层列映射对 + 逐个 start 失败不中断 + 汇总（挂载） ═══ */
describe('批量 ③：提交循环与汇总', () => {
  it('确认弹层列全部映射对；中间失败继续下一个；汇总 toast + 结果面板失败明细', async () => {
    xbStart
      .mockResolvedValueOnce({ jobId: 'j-1' })
      .mockRejectedValueOnce(new Error('磁盘水位超限'))
      .mockResolvedValueOnce({ jobId: 'j-3' });
    const { app, host, store } = await mountReady();
    const spy = vi.spyOn(store, 'notify');
    clickToggle(host); await settle(2);
    checkRow(host, 0); checkRow(host, 1); checkRow(host, 2); await settle(2);
    setInput(host.querySelector('[data-test="xm-batch-srcprefix"]')!, 'onshore-bond-basic_');
    setInput(host.querySelector('[data-test="xm-batch-dstprefix"]')!, 'uat_onshore-bond-basic_');
    await settle(2);

    (host.querySelector('[data-test="xm-batch-submit"]') as HTMLButtonElement).click();
    await settle(4);
    /* 确认弹层（teleport 到 body）列全部映射对：两行替换 + 一行不匹配保持原名 */
    const bodyTxt = document.body.textContent || '';
    expect(bodyTxt).toContain('onshore-bond-basic_2024 → uat_onshore-bond-basic_2024');
    expect(bodyTxt).toContain('wiki-v2 → wiki-v2');
    expect(bodyTxt).toContain('批量搬运 3 个索引');
    const okBtn = [...document.querySelectorAll('button')].find(b => b.textContent!.trim() === '启动 3 个迁移')!;
    okBtn.click();
    await settle(12);

    expect(xbStart, '失败不中断：三个都下发').toHaveBeenCalledTimes(3);
    expect(xbStart.mock.calls[0][0]).toMatchObject({ sourceIndex: 'onshore-bond-basic_2024', destIndex: 'uat_onshore-bond-basic_2024' });
    expect(xbStart.mock.calls[2][0]).toMatchObject({ sourceIndex: 'wiki-v2', destIndex: 'wiki-v2' });
    expect(spy).toHaveBeenCalledWith('warning', '批量迁移已下发：成功 2 / 失败 1', expect.objectContaining({ action: expect.anything() }));

    const panel = host.querySelector('[data-test="xm-batch-result"]')!;
    expect(panel.textContent, '结果面板汇总').toContain('批量迁移已下发：成功 2 / 失败 1');
    /* 1121 随迁：结果面板升级渐进式清单（全行状态随完成更新），失败明细行=含失败原因的行 */
    const failLine = [...panel.querySelectorAll('li')].find(li => li.textContent!.includes('磁盘水位超限'))!;
    expect(failLine, '失败明细行在场').toBeTruthy();
    expect(failLine.textContent, '失败明细=索引名+原因').toContain('onshore-bond-basic_2025 → uat_onshore-bond-basic_2025');
    expect(failLine.textContent).toContain('下发失败：磁盘水位超限');
    /* 失败清单可复制：每行一条「源 → 目标：原因」 */
    (panel.querySelector('button') as HTMLButtonElement).click();
    await settle(4);
    expect(copyTextFn).toHaveBeenCalledWith('onshore-bond-basic_2025 → uat_onshore-bond-basic_2025：磁盘水位超限');
    app.unmount();
  }, 12000);

  it('全成功：成功档 toast，勾选清零', async () => {
    const { app, host, store, st } = await mountReady();
    const spy = vi.spyOn(store, 'notify');
    clickToggle(host); await settle(2);
    checkRow(host, 2); await settle(2); /* wiki-v2 同名迁移（前缀留空） */
    (host.querySelector('[data-test="xm-batch-submit"]') as HTMLButtonElement).click();
    await settle(4);
    ([...document.querySelectorAll('button')].find(b => b.textContent!.trim() === '启动 1 个迁移') as HTMLButtonElement).click();
    await settle(10);
    expect(xbStart).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls.some(c => c[0] === 'success' && c[1] === '批量迁移已下发：成功 1 / 失败 0'), '成功档汇总 toast').toBe(true);
    expect(st.batchSel.length, '全成功清勾选').toBe(0);
    app.unmount();
  }, 12000);
});

/* ═══ ④ REBUILD 危险保护：确认弹层每行红色警示 + 确认钮文案升级（挂载） ═══ */
describe('批量 ④：REBUILD 确认文案升级', () => {
  it('每行红色警示「将删除目标索引现有数据」；确认钮=确认删除并迁移 N 个索引', async () => {
    const { app, host, st } = await mountReady();
    st.form.destCreateMode = 'REBUILD';
    clickToggle(host); await settle(2);
    checkRow(host, 0); checkRow(host, 1); await settle(2);
    (host.querySelector('[data-test="xm-batch-submit"]') as HTMLButtonElement).click();
    await settle(4);
    /* 横幅与单索引 REBUILD 确认同口吻（删旧重建/不可撤销） */
    expect(document.body.textContent).toContain('删旧重建模式');
    expect(document.body.textContent).toContain('此操作不可撤销');
    const dels = [...document.querySelectorAll('.xm-batch-del')];
    expect(dels.length, '每行一条红色警示').toBe(2);
    for (const d of dels) expect(d.textContent).toBe('将删除目标索引现有数据');
    const okBtn = [...document.querySelectorAll('button')].find(b => b.textContent!.includes('确认删除并迁移 2 个索引'))!;
    expect(okBtn, '确认钮文案升级').toBeTruthy();
    okBtn.click();
    await settle(8);
    expect(xbStart, '确认后逐个下发').toHaveBeenCalledTimes(2);
    expect(xbStart.mock.calls[0][0]).toMatchObject({ destCreateMode: 'REBUILD' });
    app.unmount();
  }, 12000);
});

/* ═══ ⑤ 单选模式回归不变（默认挂载即单源向导） ═══ */
describe('批量 ⑤：单选模式回归锁', () => {
  it('默认即单源向导：chips 单选回填/目标输入/启动钮，批量件全不在场', async () => {
    const { app, host, st } = await mountReady();
    /* 单选 chips：点击选为源 + 目标空时回填（既有行为） */
    const chip = host.querySelector('.xm-r-list .chip[role="button"]') as HTMLElement;
    chip.click();
    await settle(2);
    expect(st.form.sourceIndex).toBe('onshore-bond-basic_2024');
    expect(st.form.destIndex, '目标空时回填').toBe('onshore-bond-basic_2024');
    /* 目标索引输入在场（源/目标两个输入） */
    expect(host.querySelectorAll('input.xm-idx-inp').length).toBe(2);
    /* 启动钮仍是单源文案 */
    const startBtn = host.querySelector('.xm-actions button.btn.primary') as HTMLButtonElement;
    expect(startBtn.textContent!.trim()).toContain('启动迁移');
    /* 批量件全不在场 */
    for (const sel of ['[data-test="xm-batch-srcprefix"]', '[data-test="xm-batch-dstprefix"]', '[data-test="xm-batch-map"]', '[data-test="xm-batch-submit"]', '[data-test="xm-batch-result"]', '.xm-batch-sel']) {
      expect(host.querySelector(sel), sel + ' 不该在场').toBeNull();
    }
    expect(xbStart).not.toHaveBeenCalled();
    app.unmount();
  }, 8000);
});

/* ═══ 源码锚（六个 data-test + 映射/循环/汇总/REBUILD 字面 + 单源向导零回退） ═══ */
describe('批量 源码锚', () => {
  const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

  it('六个 data-test 锚齐备', () => {
    for (const key of ['xm-batch-toggle', 'xm-batch-srcprefix', 'xm-batch-dstprefix', 'xm-batch-map', 'xm-batch-submit', 'xm-batch-result']) {
      expect(src).toContain(`data-test="${key}"`);
    }
  });

  it('映射函数与非法行不进提交集；批量清单走 NCheckbox（无原生 checkbox）', () => {
    expect(src).toContain('function mapBatchDest(src: string, srcPrefix: string, dstPrefix: string): string {');
    expect(src).toContain('return src.startsWith(srcPrefix) ? dstPrefix + src.slice(srcPrefix.length) : src;');
    expect(src).toContain("const batchPairs = computed(() => batchMapRows.value.filter(r => !r.err));");
    expect(src).toMatch(/<n-checkbox :checked="batchSel\.includes\(ri\.index\)"/);
    expect(src).not.toMatch(/<input[^>]*type="checkbox"/);
  });

  it('提交循环：逐个 start 失败不中断 + 汇总 toast + 失败清单复制', () => {
    expect(src).toContain('const pairs = batchPairs.value.slice();');
    /* 1121 随迁：批量循环收敛 startOneRow（行参数落快照供重试），单源 doStart 与之共两处 start 调用点 */
    expect(src.match(/await api\.xb\.start\(/g)!.length, '单源/批量两处 start 调用点').toBe(2);
    expect(src).toContain('await api.xb.start(r.req, srcConnId.value || undefined);');
    expect(src).toContain('批量迁移已下发：成功 ${ok} / 失败 ${fail.length}');
    expect(src).toContain('失败不中断：记录后继续下一个，完成后汇总呈现');
    expect(src).toContain("${f.src} → ${f.dst}：${f.reason}");
  });

  it('REBUILD 行级红色警示与确认钮文案；单索引 REBUILD 口吻同源', () => {
    expect(src).toContain('将删除目标索引现有数据');
    expect(src).toContain("'确认删除并迁移 ' + batchPairs.length + ' 个索引'");
    expect(src).toContain('每个目标索引及其全部数据将被删除,然后按源结构重建并全量迁入。此操作不可撤销!');
  });

  it('单源向导零回退：chips 单选 Enter/Space 双通道与启动钮字面保留', () => {
    expect(src).toContain('@keydown.enter.prevent="form.sourceIndex = ri.index; if (!form.destIndex) form.destIndex = ri.index"');
    expect(src).toContain('@keydown.space.prevent="form.sourceIndex = ri.index; if (!form.destIndex) form.destIndex = ri.index"');
    expect(src).toContain('<button v-if="canOps" class="btn primary" :disabled="!canStart || starting" @click="openStartConfirm">');
    expect(src).toContain('快捷清单（{{ remoteIndices.length }}，点击选为源）：');
  });
});
