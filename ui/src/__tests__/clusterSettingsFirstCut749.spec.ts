/**
 * 七百四十九批：ClusterSettings 首刀四小刀（R130；⑥748 头号建议落地=R129 裁决表
 * G170+G171+G176+G175；741 G148/743 G152/745/747 首刀族同构）。
 *
 * ① G170（P3 铁律 D·头号）刷新钮 :disabled 绑 busy 而 load() 只置 loading——在途窗
 *    零守卫可连点重入 + loading 整块替换表格（748 S-G170 实锚 dis=false）；
 *    修法=改绑 busy||loading 一行刀。
 * ② G171（P3 铁律 D·次刀）下发钮 busy 只 disabled 无「下发中…」文案切换（748
 *    S-G171 实锚；721 G73/737 G132/747 G161 族；纯文本钮=722 G81 spinning 口径
 *    不适用，走文案通道）。
 * ③ G176（P3 注释失实·最重）R52 注释宣称过滤词进 URL 深链分享可复原，实现纯
 *    sessionStorage 零 URL query 读写（748 S-G176 实锚+D7b storage 通道真）；
 *    修法=注释对齐（真深链留增强裁决）。
 * ④ G175（弱 P3 随批可裁）showDefaults checkbox 无落盘（748 S-G175 实锚 reload
 *    丢勾选）；修法=usePref 一行刀（键 cs.showDefaults）。
 *
 * 驱动方式照 clusterThreeState（视图/组件全真+只 mock ../api 网络出口）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const src = readFileSync(join(__dirname, '../views/ClusterSettingsView.vue'), 'utf-8');

/* ---- 网络出口 mock：clusterThreeState 同源（视图/组件全真，惰性包装防 TDZ） ---- */
const settingsFn = vi.fn();
const putFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterSettings: (...args: any[]) => settingsFn(...args),
      putClusterSettings: (...args: any[]) => putFn(...args),
    },
  };
});

import ClusterSettingsView from '../views/ClusterSettingsView.vue';
/* askConfirm 写共享 confirmState，须复刻 App.vue 宿主绑定（ConfirmModal 的 show 是
   prop 非自读 state，@confirm=resolveConfirm——R42 §8.1 全局确认服务消费面） */
import ConfirmModal from '../components/ConfirmModal.vue';
import { confirmState, resolveConfirm } from '../composables/confirm';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({
    render: () => h('div', [
      h(ClusterSettingsView as any),
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

/* 白名单 17 项全渲染；mock 三桶只种 watermark.high 一键（P 值 90%/defaults 85%，
   P 输入框 placeholder=90% 即该行唯一锚） */
const SETTINGS = {
  persistent: { cluster: { routing: { allocation: { disk: { watermark: { high: '90%' } } } } } },
  transient: {},
  defaults: { cluster: { routing: { allocation: { disk: { watermark: { high: '85%' } } } } } },
};
function qrtRows(host: ParentNode): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('table.qrt-tbl tbody tr')]
    .filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
}
function pInput(host: ParentNode): HTMLInputElement {
  const inp = [...host.querySelectorAll<HTMLInputElement>('input.cs-in')]
    .find(i => i.placeholder === '90%');
  expect(inp, 'watermark.high 行 Persistent 输入框（placeholder=90%）').toBeTruthy();
  return inp!;
}

const pendS: Array<(v: any) => void> = [];
const pendP: Array<(v: any) => void> = [];

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  confirmState.show = false; /* 上一用例确认门残留不复染下一挂载 */
  pendS.length = 0;
  pendP.length = 0;
  settingsFn.mockReset().mockResolvedValue(SETTINGS);
  putFn.mockReset().mockImplementation(() => new Promise<any>(res => { pendP.push(res); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('749 A0 挂载不变量负锚（现状即守卫）', () => {
  it('页头+pill 0 项+defaults chk+TSV/MD+两下发+丢弃+原始 IO+刷新+QRT 17 行', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('集群设置');
    expect((host.querySelector('.cs-bar .pill')?.textContent || '').trim()).toBe('0 项待下发');
    const chk = host.querySelector('.cs-chk input') as HTMLInputElement;
    expect(chk, 'defaults checkbox 在场').toBeTruthy();
    expect(chk.checked, 'defaults 默认关').toBe(false);
    for (const re of [/TSV/, /MD/, /下发persistent/, /下发transient/, /丢弃改动/, /原始IO/, /刷新/]) {
      expect(findBtn(host, re), `工具行按钮 ${re}`).toBeTruthy();
    }
    expect(qrtRows(host).length, '白名单 17 项全渲染').toBe(17);
    expect(pInput(host).placeholder).toBe('90%');
  });

  it('编辑链健康面：P 值改 93%→脏行 1+pill 1 项+下发钮解禁', async () => {
    const host = await mountView();
    const inp = pInput(host);
    inp.value = '93%';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(6);
    expect(host.querySelectorAll('tr.cs-dirty').length).toBe(1);
    expect((host.querySelector('.cs-bar .pill')?.textContent || '').trim()).toBe('1 项待下发');
    expect(findBtn(host, /下发persistent/).disabled, '有改动解禁').toBe(false);
  });
});

describe('749 G170 刷新钮在途守卫（铁律 D 防重入·一行刀）', () => {
  it('load 在途窗：刷新钮 disabled（病灶：修前绑 busy 漏 loading 可连点）+loading 态在场；复常解禁+表格回 17 行', async () => {
    settingsFn.mockReset().mockImplementation(() => new Promise<any>(res => { pendS.push(res); }));
    const host = await mountView();
    const btn = findBtn(host, /刷新/);
    expect(host.querySelector('.cs-loading'), '在途 loading 态在场').toBeTruthy();
    expect(btn.disabled, 'G170 病灶：load 在途窗刷新钮可连点（修前红）').toBe(true);
    pendS[0](SETTINGS);
    await settle(12);
    expect(host.querySelector('.cs-loading')).toBeFalsy();
    expect(btn.disabled, '复常解禁').toBe(false);
    expect(qrtRows(host).length, '表格回全量').toBe(17);
  });
});

describe('749 G171 下发钮在途「下发中…」文案（铁律 D·747 G161 族文案通道）', () => {
  it('确认下发→在途窗两下发钮文案切「下发中…」+disabled；复常文案回退', async () => {
    const host = await mountView();
    const inp = pInput(host);
    inp.value = '93%';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(6);
    findBtn(host, /下发persistent/).click();
    await settle(6);
    const cf = document.querySelector('.cf');
    expect(cf, '确认门开').toBeTruthy();
    expect(cf!.textContent).toContain('93');
    const ok = [...document.querySelectorAll<HTMLButtonElement>('.cf button')]
      .find(b => (b.textContent || '').trim() === '下发设置');
    expect(ok, '确认钮（okText=下发设置）').toBeTruthy();
    ok!.click();
    await settle(6);
    expect(putFn.mock.calls.length, '单发下发').toBe(1);
    /* busy 态文案已换「下发中…」——label finder 失效，改 .cs-bar-r 按钮序锚
       [0]=persistent [1]=transient（749 探针同口径；丢弃/原始 IO/刷新在其后不受扰） */
    const barBtns = [...host.querySelectorAll<HTMLButtonElement>('.cs-bar-r button')];
    const bp = barBtns[0];
    const bt = barBtns[1];
    expect(bp && bt, '两下发钮在场').toBeTruthy();
    expect(bp.disabled && bt.disabled, '在途窗双下发钮禁用（busy 既有）').toBe(true);
    expect((bp.textContent || '').replace(/\s+/g, ''), 'G171 病灶：在途文案无「下发中」（修前红）').toContain('下发中');
    expect((bt.textContent || '').replace(/\s+/g, ''), 'transient 侧同窗文案').toContain('下发中');
    pendP[0]({});
    await settle(14);
    expect((findBtn(host, /下发persistent/).textContent || '').replace(/\s+/g, ''), '复常文案回退').toBe('下发persistent');
    expect(settingsFn.mock.calls.length, '下发后复拉（R121 吸收链）').toBe(2);
  });
});

describe('749 G176 R52 注释对齐（史志失实根治·注释对齐支）', () => {
  it('源码锁：失实宣称清零+诚实表述在场（会话草稿通道+不写入 URL）', () => {
    expect(src.includes('（?q=）'), 'G176 病灶：旧注释宣称 URL 深链（修前红）').toBe(false);
    expect(src.includes('不写入 URL'), '诚实表述：过滤词不进 URL').toBe(true);
    expect(src.includes('会话草稿'), '诚实表述：真通道=会话草稿').toBe(true);
  });
});

describe('749 G175 showDefaults 落盘（铁律 B 弱形态·usePref 一行刀）', () => {
  it('预置偏好 true→挂载即勾选+Default 列在场（病灶：修前恒 false）', async () => {
    localStorage.setItem('esquerystudio.pref.cs.showDefaults', 'true');
    const host = await mountView();
    const chk = host.querySelector('.cs-chk input') as HTMLInputElement;
    expect(chk.checked, 'G175 病灶：勾选不落盘 reload 丢（修前红）').toBe(true);
    const heads = [...host.querySelectorAll('.qrt-tbl thead th')].map(th => (th.textContent || '').trim());
    expect(heads.some(h => h.startsWith('Default')), 'Default 列随勾选呈现（前缀匹配——QRT 列头带排序指示符，748 探针课①）').toBe(true);
  });

  it('交互落盘：点选→localStorage 写 true+Default 列出现', async () => {
    const host = await mountView();
    const chk = host.querySelector('.cs-chk input') as HTMLInputElement;
    expect(chk.checked).toBe(false);
    chk.click();
    await settle(6);
    expect(localStorage.getItem('esquerystudio.pref.cs.showDefaults'), 'usePref 落盘').toBe('true');
    const heads = [...host.querySelectorAll('.qrt-tbl thead th')].map(th => (th.textContent || '').trim());
    expect(heads.some(h => h.startsWith('Default'))).toBe(true);
  });
});
