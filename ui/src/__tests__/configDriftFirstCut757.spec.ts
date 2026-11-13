/**
 * 七百五十七批：ConfigDrift 首刀四小刀（R138；⑥756 头号建议落地=R137 裁决表
 * G206+G208+G207+G210；741 G148/743 G152/745/747/749/751/753/755 首刀族同构）。
 *
 * ① G206（P3 铁律 F·头号）全页无 RawIo 原始请求/响应入口（756 S-G206 实锚 0 钮；
 *    driftKeys 对象清单+drift 检测明细两读端点无原文直达；754 G200/746 G162/741 G148
 *    族）——修法=rim 族三件套（Terminal 钮+判空 toast 引导+直达弹窗 Esc 关），
 *    端点锚 '/config-lab/drift?'（含查询串前缀，与 /config-lab/drift/keys 清单端点
 *    互不混淆——755 '/cluster/tasks?' 前缀锚的读取侧镜像）。
 * ② G208（P3 铁律 D·次刀）cd-chip span onClick 无 role/tabindex/键盘（756 S-G208
 *    实锚 8 chips 全空——NsGroups 键 chip+组头 chip 仅鼠标可达）——修法=role=button
 *    +tabindex=0+keydown.enter=cd-item 行同款范式。
 * ③ G207（P3 注释失实）源码注释宣称「URL ?kw= 可重入」vs useScopedDraft 纯
 *    sessionStorage（756 S-G207 实锚零消费；754 G202/748 G176 同构）——修法=注释
 *    诚实化（行为零改；同页 ?key= 真 useUrlState 是另一条通道）。
 * ④ G210（弱 P3 aria 随批可裁）cd-list 容器无 role 语义+cd-item 选中态仅类 .on 无
 *    aria-current（756 S-G210 实锚；G47/G142/G154 族）——修法=容器 role=group
 *    +aria-label、选中行 :aria-current（LuceneQueryView 行锚同款）。
 *
 * 驱动方式照 taskTreeFirstCut755（视图/组件全真+只 mock ../api+Monaco stub——
 * Monaco 内核 happy-dom canvas 崩）；ConfigDrift 首例「首刀后」真挂载 spec
 * （qualityThreeState 三态挂载既有，本文件补四刀收口锚）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { RawIoRec } from '../api';

const src = readFileSync(join(__dirname, '../views/ConfigDriftView.vue'), 'utf-8');

/* ---- 网络出口 mock：taskTreeFirstCut755 同源（视图/组件全真） ---- */
const driftKeysFn = vi.fn();
const driftFn = vi.fn();
const pendingKeys: Array<(v: any) => void> = [];
const pendingDrift: Array<(v: any) => void> = [];
const ioRing: RawIoRec[] = [];
let ioSeq = 0;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      configLab: {
        ...actual.api.configLab,
        driftKeys: () => driftKeysFn(),
        drift: (indexKey: string) => driftFn(indexKey),
      },
    },
    ioRecorder: {
      last: (sub?: string) => [...ioRing].reverse().find(r => r.url.includes(sub ?? '')) ?? null,
      all: () => [...ioRing].reverse(),
      get: () => null,
      clear: () => { ioRing.length = 0; },
    },
  };
});

/* Monaco 内核 happy-dom canvas 崩统一 stub（743/745/747/755 spec 同款；RawIoModal 内两分节消费） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import ConfigDriftView from '../views/ConfigDriftView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/adhoc-rebuild', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(ConfigDriftView as any) });
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

/* 两对象：orders（全分支漂移：different 1 键+onlyInCode 4 个 analysis.* 折叠组+
   onlyInLive 2 运维态键）+clean（一致态） */
const KEYS_757 = [
  { indexKey: 'probe-orders-v2', alias: 'orders' },
  { indexKey: 'probe-clean-v1', alias: 'clean-idx' },
];
const MAP_757 = ['{ "properties": {', '  "id": { "type": "keyword" },', '} }'].join('\n');
const DRIFT_ORDERS = {
  liveExists: true, alias: 'orders', physicalIndex: 'orders-v2-20261001',
  codeSettings: '{"index":{"number_of_shards":"3","refresh_interval":"30s"}}',
  liveSettings: '{"index":{"number_of_shards":"3","refresh_interval":"1s"}}',
  settingsDiff: {
    clean: false,
    different: [{ key: 'index.refresh_interval', code: '30s', live: '1s' }],
    onlyInCode: [
      'analysis.analyzer.default.type', 'analysis.analyzer.my_analyzer.type',
      'analysis.filter.my_filter.type', 'analysis.filter.my_filter.max_token',
    ],
    onlyInLive: ['number_of_replicas', 'translog.sync_interval'],
  },
  codeMapping: MAP_757, liveMapping: MAP_757, mappingEqual: true,
};
const DRIFT_CLEAN = {
  liveExists: true, alias: 'clean-idx', physicalIndex: 'clean-idx-v1',
  codeSettings: '{"index":{"number_of_shards":"1"}}', liveSettings: '{"index":{"number_of_shards":"1"}}',
  settingsDiff: { clean: true, different: [], onlyInCode: [], onlyInLive: [] },
  codeMapping: MAP_757, liveMapping: MAP_757, mappingEqual: true,
};

/* 模拟真实 fetch 包装层的记录环行为：resolve 同拍落一条记录（api.ts recordIo 语义），
   供 RawIoModal 直达链读到 */
function releaseKeys() {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'GET', url: '/config-lab/drift/keys', requestBody: '', status: 200, ok: true, durationMs: 5, responseRaw: JSON.stringify(KEYS_757) });
  pendingKeys.shift()!(KEYS_757);
}
function releaseDrift(body: any = DRIFT_ORDERS, url = '/config-lab/drift?indexKey=probe-orders-v2') {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'GET', url, requestBody: '', status: 200, ok: true, durationMs: 5, responseRaw: JSON.stringify(body) });
  pendingDrift.shift()!(body);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pendingKeys.length = 0;
  pendingDrift.length = 0;
  ioRing.length = 0;
  ioSeq = 0;
  driftKeysFn.mockReset().mockImplementation(() => new Promise<any>(res => { pendingKeys.push(res); }));
  driftFn.mockReset().mockImplementation(() => new Promise<any>(res => { pendingDrift.push(res); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('757 A0 挂载不变量负锚（现状即守卫）', () => {
  it('页头三件套+刷新钮+2 对象清单+kw 框+检测全部钮+清单行 title 全名', async () => {
    const host = await mountView();
    releaseKeys();
    await settle(8);
    expect(host.textContent).toContain('配置漂移检测');
    expect(host.textContent).toContain('双侧归一化后逐键对比');
    expect(findBtn(host, /刷新/)).toBeTruthy();
    const items = host.querySelectorAll('.cd-list .cd-item:not(.cd-none)');
    expect(items.length, '2 对象').toBe(2);
    expect(host.querySelector('.cd-kw-inp input'), 'kw 过滤框').toBeTruthy();
    expect(findBtn(host, /检测全部/)).toBeTruthy();
    expect((items[0].querySelector('.cd-item-key')?.textContent || '').trim()).toBe('probe-orders-v2');
  });
});

describe('757 G206 RawIo 三件套（铁律 F·头号·755 G200 同构）', () => {
  it('三件套接线源码锁：RawIoModal 组件+ioRecorder 取 /config-lab/drift?+Terminal 图标钮', () => {
    expect(src.includes("import RawIoModal from '../components/RawIoModal.vue';"), '弹窗组件接入').toBe(true);
    expect(src.includes("ioRecorder.last('/config-lab/drift?')"), '按页端点取最近记录（? 前缀与 drift/keys 清单端点互不混淆）').toBe(true);
    expect(src.includes('<Terminal'), 'Terminal 图标钮').toBe(true);
  });

  it('判空链：无记录点「原始 IO」→不开空弹窗（toast 引导）', async () => {
    const host = await mountView();
    releaseKeys();
    await settle(8);
    ioRing.length = 0; /* 清记录环模拟「从未检测」空窗 */
    findBtn(host, /原始IO/).click();
    await settle(4);
    expect(document.querySelector('.rim'), '无记录不开弹窗').toBeFalsy();
  });

  it('直达链：检测后点「原始 IO」→弹窗开+url 含 /config-lab/drift?+请求/响应两分节', async () => {
    const host = await mountView();
    releaseKeys();
    await settle(8);
    (host.querySelectorAll('.cd-list .cd-item:not(.cd-none)')[0] as HTMLElement).click();
    await settle(4);
    releaseDrift();
    await settle(8);
    findBtn(host, /原始IO/).click();
    await settle(6);
    const rim = document.querySelector('.rim');
    expect(rim, '弹窗开（ModalShell 挂 body 层）').toBeTruthy();
    expect(rim!.textContent).toContain('/config-lab/drift?');
    expect(rim!.textContent).toContain('原始请求');
    expect(rim!.textContent).toContain('原始响应');
  });
});

describe('757 G208 cd-chip 键盘可达（铁律 D·次刀·cd-item 行同款范式）', () => {
  it('全部 chips role=button+tabindex=0（G208 病灶：修前 SPAN 全空仅鼠标可达）', async () => {
    const host = await mountView();
    releaseKeys();
    await settle(8);
    (host.querySelectorAll('.cd-list .cd-item:not(.cd-none)')[0] as HTMLElement).click();
    await settle(4);
    releaseDrift();
    await settle(8);
    const chips = Array.from(host.querySelectorAll('.cd-chip'));
    expect(chips.length, 'grp 1+运维态平铺 2（折叠组未展开）').toBe(3);
    for (const c of chips) {
      expect(c.getAttribute('role'), `chip "${c.textContent}" role`).toBe('button');
      expect(c.getAttribute('tabindex'), `chip "${c.textContent}" tabindex`).toBe('0');
    }
  });

  it('Enter 行为链：grp chip 键盘展开 4 子键→再 Enter 收起（与鼠标点击同动作）', async () => {
    const host = await mountView();
    releaseKeys();
    await settle(8);
    (host.querySelectorAll('.cd-list .cd-item:not(.cd-none)')[0] as HTMLElement).click();
    await settle(4);
    releaseDrift();
    await settle(8);
    const grp = host.querySelector('.cd-chip.grp') as HTMLElement;
    expect(grp, '折叠组头 chip 在场').toBeTruthy();
    grp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(4);
    const kids = host.querySelectorAll('.cd-ns-kids .cd-chip');
    expect(kids.length, 'Enter 展开 4 子键').toBe(4);
    for (const k of kids) {
      expect(k.getAttribute('role'), '子键 chip role').toBe('button');
      expect(k.getAttribute('tabindex'), '子键 chip tabindex').toBe('0');
    }
    grp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(4);
    expect(host.querySelectorAll('.cd-ns-kids .cd-chip').length, '再 Enter 收起').toBe(0);
  });
});

describe('757 G207 注释诚实化（754 G202/748 G176 同款·源码锁·行为零改）', () => {
  it('注释不再宣称「URL ?kw= 可重入」，新注释记 useScopedDraft 草稿实况（G207 病灶：修前注释与实现不符）', () => {
    expect(src.includes('URL ?kw= 可重入'), '失实宣称清零').toBe(false);
    expect(src.includes('不进 URL'), '注释记实况：不进 URL').toBe(true);
    expect(src.includes('useScopedDraft'), '注释锚定实现件').toBe(true);
  });
});

describe('757 G210 清单容器语义+选中行 aria-current（G47/G142/G154 族·随批可裁）', () => {
  it('cd-list 容器 role=group+aria-label 对象清单（G210 病灶：修前容器 role 空）', async () => {
    const host = await mountView();
    releaseKeys();
    await settle(8);
    const list = host.querySelector('.cd-list');
    expect(list?.getAttribute('role')).toBe('group');
    expect(list?.getAttribute('aria-label') || '').toContain('对象清单');
  });

  it('选中行 aria-current=true+未选中行无（G210 病灶：修前仅类 .on 无 aria-current）', async () => {
    const host = await mountView();
    releaseKeys();
    await settle(8);
    const items = host.querySelectorAll('.cd-list .cd-item:not(.cd-none)');
    expect(items[0].getAttribute('aria-current'), '未点选无 aria-current').toBeFalsy();
    (items[0] as HTMLElement).click();
    await settle(4);
    releaseDrift();
    await settle(8);
    expect(items[0].getAttribute('aria-current'), '选中行 aria-current=true').toBe('true');
    expect(items[1].getAttribute('aria-current'), '未选中行无').toBeFalsy();
  });
});

describe('1439d 配置对象行右键', () => {
  it('右键/菜单键：检测、复制 indexKey/alias/深链（只读本地）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const host = await mountView();
    releaseKeys();
    await settle(8);
    const item = host.querySelector('.cd-list .cd-item:not(.cd-none)') as HTMLElement;
    item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }));
    await settle();
    const menu = document.body.querySelector<HTMLElement>('.ccm');
    expect(menu, '右键菜单').toBeTruthy();
    expect(menu!.textContent).toContain('配置对象 · probe-orders-v2');
    for (const label of ['检测此对象', '复制 indexKey', '复制 alias', '复制深链']) {
      expect(menu!.textContent, `菜单项 ${label}`).toContain(label);
    }
    (menu!.querySelector('[data-key="cd-copy-key"]') as HTMLElement).click();
    await settle(3);
    expect(writeText).toHaveBeenCalledWith('probe-orders-v2');

    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await settle();
    expect(document.body.querySelector('.ccm'), '菜单键必须开同一菜单').toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    delete (navigator as any).clipboard;
  });
});
