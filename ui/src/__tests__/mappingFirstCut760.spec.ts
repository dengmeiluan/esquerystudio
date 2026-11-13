/**
 * 七百六十批：Mapping 首刀三小刀（R140；⑥759 头号建议落地=R139 裁决表
 * G213+G214+G215；741 G148/743 G152/745/747/749/751/753/755/757 首刀族同构）。
 *
 * ① G213（P3 铁律 D·头号）PUT mapping/settings 提交在途零守卫（759 S-G213 实锚：
 *    确认后在途窗无 toast/spinning/disabled 任何反馈+再开弹窗提交钮立即可点+同一
 *    变更在途可重复触发〔calls 双发〕）——修法=putting ref 绑两弹窗提交钮 disabled
 *    +「提交中…」在途文案（纯文本钮走文案通道=G81 口径；749 G171/755 G198 族），
 *    doPutMapping/doPutSettings 起手守卫挡 Enter 通道（useModalEnter 直达 askPut*）。
 * ② G214（P3 一致性·次刀）doPutSettings 480 行错误链 e?.message 直拼未过
 *    friendlyEsError（doPutMapping 447 行已接=同页两标准）——修法一行同款：
 *    先过 friendlyEsError 再拼操作前缀。
 * ③ G215（弱 P3 aria 随批可裁）donut svg 无 role/aria-label+图例/弧段 title 英文
 *    裸 token（G142/G154 族）——修法=svg role=img+aria-label 概要+title 走
 *    fieldTypeZh 单源（esEnumZh 五百五十六批「只增收口」表，未知类型原样返回）。
 *
 * 驱动方式照 configDriftFirstCut757/taskTreeFirstCut755（视图/组件全真+只 mock
 * ../api+Monaco stub+confirm 服务边界）——n-modal teleport 到 body，弹窗域查询
 * 走 document 级（759 探针课①的 spec 侧形态）；深链走真实 hash 域（readHashQuery
 * 读 window.location.hash，memory router 不连通——useUrlState init 拍语义）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const src = readFileSync(join(__dirname, '../views/MappingView.vue'), 'utf-8');

/* ---- 网络出口 mock：757 同源（视图/组件全真，只换出口） ---- */
const inspectFn = vi.fn();
const putMappingFn = vi.fn();
const updateSettingsFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterInspect: (...a: any[]) => inspectFn(...a),
      putMapping: (...a: any[]) => putMappingFn(...a),
      updateSettings: (...a: any[]) => updateSettingsFn(...a),
      indexSettingsDefaults: () => Promise.resolve({ body: '{}' }),
      analysisSettings: () => Promise.resolve({ analysis: {} }),
    },
  };
});

/* 确认服务边界 mock：G213 域=确认后链路（askConfirm resolve true 直通 doPut*）；
   确认门自身行为（CF 文本/取消零写）759 probe D3b 已盖，本文件不重复 */
const confirmFn = vi.fn();
vi.mock('../composables/confirm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables/confirm')>();
  return { ...actual, askConfirm: (...a: any[]) => confirmFn(...a) };
});

/* Monaco 内核 happy-dom canvas 崩统一 stub（743/745/747/755/757 spec 同款） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import MappingView from '../views/MappingView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/analyzer-lab', component: { template: '<div/>' } },
      { path: '/mapping-designer', component: { template: '<div/>' } },
      { path: '/adhoc-rebuild', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(MappingView as any) });
  apps.push(app);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  setActivePinia(pinia);
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

/* n-modal teleport 到 body：弹窗域提交钮走 document 级查询（每次重查——弹窗重开 DOM 重建） */
function modalSubmitBtn(): HTMLButtonElement {
  const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('.n-modal button'))
    .find(b => (b.textContent || '').includes('提交'));
  expect(btn, '弹窗提交钮在场').toBeTruthy();
  return btn!;
}

/* inspect 数据：3 字段（keyword 1+text 2）→ donut 2 类图例+2 行 settings */
const INSPECT_760 = {
  docCount: 777,
  mappings: { 'orders-v9-20261001': { properties: {
    id: { type: 'keyword' }, name: { type: 'text' }, memo: { type: 'text' },
  } } },
  settings: { 'orders-v9-20261001': { 'index.refresh_interval': '1s', 'index.number_of_replicas': '1' } },
};

const ES_BAD_SETTING = JSON.stringify({ error: { root_cause: [{ type: 'illegal_argument_exception', reason: 'unknown setting [index.foo] please check' }] } });

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  inspectFn.mockReset().mockResolvedValue(INSPECT_760);
  putMappingFn.mockReset();
  updateSettingsFn.mockReset();
  confirmFn.mockReset().mockResolvedValue(true);
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('760 A0 挂载不变量负锚（现状即守卫）', () => {
  it('页头+777 条文档+3 个字段+四钮+donut 2 类图例（?idx= 深链直选）', async () => {
    history.replaceState(null, '', '#/?idx=orders-v9');
    const host = await mountView();
    await settle(8);
    expect(host.textContent).toContain('Mapping');
    expect(host.textContent).toContain('777 条文档');
    expect(host.textContent).toContain('3 个字段');
    expect(findBtn(host, /刷新/)).toBeTruthy();
    expect(findBtn(host, /原始JSON/)).toBeTruthy();
    expect(findBtn(host, /添加字段/)).toBeTruthy();
    expect(findBtn(host, /动态设置/)).toBeTruthy();
    const legs = host.querySelectorAll('.mp-leg-row');
    expect(legs.length, 'donut 图例 keyword+text 两类').toBe(2);
  });
});

describe('760 G213 PUT mapping 提交在途守卫（铁律 D·头号·749 G171/755 G198 族）', () => {
  it('在途窗：再开弹窗提交钮 disabled+「提交中…」→resolve 复原+单发不重复（修前：dis=false 零反馈可双发）', async () => {
    history.replaceState(null, '', '#/?idx=orders-v9');
    const host = await mountView();
    await settle(8);
    let releasePut: (() => void) | null = null;
    putMappingFn.mockImplementation(() => new Promise<any>(res => { releasePut = () => res({ status: 200, body: '{"acknowledged":true}' }); }));
    /* 首开弹窗：初始态可提交（JSON 模板合法） */
    findBtn(host, /添加字段/).click();
    await settle(6);
    expect(modalSubmitBtn().disabled, '非在途可点').toBe(false);
    expect(modalSubmitBtn().textContent).not.toContain('提交中');
    /* 提交→确认(true)→doPutMapping 在途 */
    modalSubmitBtn().click();
    await settle(10);
    expect(putMappingFn).toHaveBeenCalledTimes(1);
    /* 在途窗再开弹窗：守卫面（759 S-G213 修前实锚=dis false 立即可点） */
    findBtn(host, /添加字段/).click();
    await settle(6);
    expect(modalSubmitBtn().disabled, 'G213 在途窗提交钮禁用').toBe(true);
    expect(modalSubmitBtn().textContent, 'G213 在途文案（纯文本钮文案通道）').toContain('提交中');
    /* resolve→复原 */
    releasePut!();
    await settle(12);
    expect(putMappingFn).toHaveBeenCalledTimes(1);
    findBtn(host, /添加字段/).click();
    await settle(6);
    expect(modalSubmitBtn().disabled, '复常后可点').toBe(false);
    expect(modalSubmitBtn().textContent).not.toContain('提交中');
  });

  it('PUT settings 同构：在途窗提交钮 disabled+「提交中…」→单发复原', async () => {
    history.replaceState(null, '', '#/?idx=orders-v9');
    const host = await mountView();
    await settle(8);
    let releaseSet: (() => void) | null = null;
    updateSettingsFn.mockImplementation(() => new Promise<any>(res => { releaseSet = () => res({ status: 200, body: '{"acknowledged":true}' }); }));
    findBtn(host, /动态设置/).click();
    await settle(6);
    expect(modalSubmitBtn().disabled).toBe(false);
    modalSubmitBtn().click();
    await settle(10);
    expect(updateSettingsFn).toHaveBeenCalledTimes(1);
    findBtn(host, /动态设置/).click();
    await settle(6);
    expect(modalSubmitBtn().disabled, 'G213 settings 在途窗禁用').toBe(true);
    expect(modalSubmitBtn().textContent).toContain('提交中');
    releaseSet!();
    await settle(12);
    expect(updateSettingsFn).toHaveBeenCalledTimes(1);
  });

  it('源码锁：putting ref+doPut* 起手守卫（挡 Enter 通道重入）+两提交钮绑定', () => {
    expect(src).toMatch(/const putting = ref\(false\)/);
    expect(src.match(/if \(putting\.value\) return;/g)?.length, 'doPutMapping/doPutSettings 双起手守卫').toBe(2);
    expect(src.match(/:disabled="!new\w+Valid \|\| putting"/g)?.length, '两弹窗提交钮 disabled 绑定').toBe(2);
    expect(src.match(/putting \? '提交中…' : '提交'/g)?.length, '两提交钮在途文案').toBe(2);
    expect(src.match(/finally \{ putting\.value = false; \}/g)?.length, 'finally 复位双函数').toBe(2);
  });
});

describe('760 G214 doPutSettings 错误链 friendlyEsError 补位（一致性·次刀）', () => {
  it('行为链：PUT settings 失败→toast 含操作前缀+提取后 reason，无原始 JSON 块', async () => {
    history.replaceState(null, '', '#/?idx=orders-v9');
    const host = await mountView();
    await settle(8);
    updateSettingsFn.mockRejectedValueOnce(new Error(ES_BAD_SETTING));
    findBtn(host, /动态设置/).click();
    await settle(6);
    modalSubmitBtn().click();
    await settle(12);
    const q = useAppStore().notifyQueue;
    const last = q[q.length - 1];
    expect(last, '错误 toast 落队列').toBeTruthy();
    expect(last!.kind).toBe('error');
    expect(last!.msg).toContain('settings 更新失败');
    expect(last!.msg, 'ES 错误提取 reason（friendlyEsError 人话链）').toContain('unknown setting');
    expect(last!.msg, '原始 JSON 块不直出').not.toContain('root_cause');
  });

  it('源码锁：480 行直拼形态绝迹，两写路径同标准（先过 friendlyEsError 再拼前缀）', () => {
    expect(src).not.toMatch(/settings 更新失败: ' \+ \(e\?\.message \|\| e\)/);
    expect(src).toMatch(/settings 更新失败: ' \+ friendlyEsError\(String\(e\?\.message \?\? e\)\)\)/);
    expect(src).toMatch(/PUT mapping 失败: ' \+ friendlyEsError\(String\(e\?\.message \?\? e\)\)\)/);
  });
});

describe('760 G215 donut aria+图例中文释义（G142/G154 族·随批可裁）', () => {
  it('svg role=img+aria-label 概要（修前：无 role 无 aria-label）', async () => {
    history.replaceState(null, '', '#/?idx=orders-v9');
    const host = await mountView();
    await settle(8);
    const svg = host.querySelector('.mp-donut-wrap svg');
    expect(svg, 'donut svg 在场（.mp-sec svg 首匹配会命中节头 PieChart 图标——唯一锚走 donut-wrap）').toBeTruthy();
    expect(svg!.getAttribute('role')).toBe('img');
    expect(svg!.getAttribute('aria-label') || '').toContain('类型分布');
  });

  it('图例/弧段 title 走 fieldTypeZh 单源：keyword→精确值、text→文本（修前：英文裸 token）', async () => {
    history.replaceState(null, '', '#/?idx=orders-v9');
    const host = await mountView();
    await settle(8);
    const titles = Array.from(host.querySelectorAll<HTMLElement>('.mp-leg-t'))
      .map(el => el.getAttribute('title') || '');
    expect(titles.some(t => t.includes('精确值')), 'keyword 图例 title 中文').toBe(true);
    expect(titles.some(t => t.includes('文本')), 'text 图例 title 中文').toBe(true);
    const arcs = Array.from(host.querySelectorAll('.mp-arc title')).map(t => t.textContent || '');
    expect(arcs.some(t => t.includes('精确值') || t.includes('文本')), '弧段原生 tooltip 同步中文').toBe(true);
  });
});
