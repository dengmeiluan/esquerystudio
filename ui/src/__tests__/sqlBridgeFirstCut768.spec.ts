/**
 * 七百六十八批：SqlBridge 首刀三刀半（R148；⑥767 头号建议落地=R147 裁决表
 * G237+G238+G239 首刀候选+G240 裁决随批；741 G148/743 G152/745/747/749/751/753/
 * 755/757/760/762/764/766 首刀族同构；SqlBridge 域首例真挂载首刀后 spec——
 * sqlBridgeMonaco 同源挂载/mock 形态：视图/组件全真，只 mock ../api 出口+
 * MonacoEditor 边界 stub+NModal 轻 stub（teleport 免依赖）+memory router）。
 *
 * ① G237（P3 死代码·头号）tag 族四死变体规则整删（767 S-G237 死扫实锚=恰一死类族，
 *    模板零引用 grep 实锚；pillSingleTrack MERGED 字典该类项=负向防回潮锚——断言
 *    「不得重新自带尺寸/色值」，规则删空后 matchAll 空=仍绿，字典项留作防回潮）
 *    ——修法=纯删零连锁；scoped 规则 30→27（恰减四+G240 补 .br-raw-pre 一行）。
 * ② G238（P3 铁律 D·次刀）一键全转换钮 Wand2 单态无 spinning 无在途文案（767 D5
 *    实锚=钮 dis 唯一通道；746 G161/765 G234/766 G234 族）——修法=Loader2 v-if
 *    busy + Wand2 v-else 双态+「转换中…」文案+重试钮对称双态（⚠重试钮在 err-bar
 *    面板内、doAll 起手清 convErr→面板随 busy 卸载，busy 态挂载不可观测=766 G234
 *    同先例，源码锁锚对称，挂载在途断言只锚常驻页头钮）+doAll 起手 busy 守卫
 *    （G213 键盘通道先例同构——⌘⏎ Monaco execute 绕过钮 disabled，runSql 起手
 *    已有对称守卫，同页两函数归一）。试跑钮已合规（qr 读秒+取消钮）不列刀。
 * ③ G239（弱 P3 aria·随批可裁）对比表无 caption+结果条无 role=status（G210/G224/
 *    G229/G235 族）——修法=sr-only caption（视觉零变化高度零影响）+role=status
 *    （lint-bar 族已广泛同款）。
 * ④ G240（P3 铁律 F·随批裁决=补位收口）试跑链 QRT 只展示 rows/columns=「所见非
 *    所存」缝隙（响应其余字段不可见）；translate 链已有 DSL 面全文+errPreHtml 双
 *    兜底不动——修法=Mapping R84「原始 JSON」轻形态同构：SQL pane 卡头恒驻钮
 *    （IndexHub 554 批 P1 形态=失败态也可回看）+n-modal highlightJson 全文+复制；
 *    三态置位（成功=响应体/noavail=available 体/异常=error 串；AbortError 取消
 *    不置位=旧值保留，与「旧结果保留」语义一致）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlBridgeView.vue'), 'utf-8');
/* 705-C1 防自伤：断言前剥注释——史志注释提及类名字面量不打红 */
const srcBare = src.replace(/\/\*[\s\S]*?\*\//g, ' ');

const sqlTranslateFn = vi.fn();
const sqlLenientFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      sqlTranslate: (...a: any[]) => sqlTranslateFn(...a),
      sqlLenient: (...a: any[]) => sqlLenientFn(...a),
    },
  };
});

/* MonacoEditor stub：sqlBridgeMonaco 同款（monaco esm happy-dom 起不来且与本契约无关） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup() { return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

/* NModal 轻 stub：teleport 免依赖，show 翻转即渲染 slot（本 spec 只锚内容域） */
vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  return {
    ...actual,
    NModal: { name: 'NModal', props: ['show'], template: '<div v-if="show" class="n-modal-stub"><slot name="footer" /><slot /></div>' },
  };
});

import SqlBridgeView from '../views/SqlBridgeView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountBr() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: SqlBridgeView }],
  });
  const app = createApp({ render: () => h(SqlBridgeView) });
  app.use(createPinia());
  app.use(router);
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

const btnOf = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text));
const sampleBtn = (host: HTMLElement) => btnOf(host, '加载示例');
const convBtn = (host: HTMLElement) => btnOf(host, '一键全转换');
const runBtn = (host: HTMLElement) => btnOf(host, '试跑');

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  sqlTranslateFn.mockReset().mockResolvedValue({ size: 100, query: { match_all: {} } });
  sqlLenientFn.mockReset().mockResolvedValue({ rows: [[1, 'a'], [2, 'b']], columns: ['id', 'name'] });
});

describe('768 A0 挂载不变量负锚（现状即守卫，非刀面）', () => {
  it('页头三 action 钮+三 pane 标题+对比表 10 行×4 列+结果/预览零渲染', async () => {
    const { app, host } = await mountBr();
    expect(btnOf(host, '历史'), '历史钮').toBeTruthy();
    expect(sampleBtn(host), '加载示例钮').toBeTruthy();
    expect(convBtn(host), '一键全转换钮').toBeTruthy();
    const titles = [...host.querySelectorAll('.br-title')].map(e => e.textContent || '');
    expect(titles.filter(t => t.includes('分布式 SQL')).length).toBe(1);
    expect(titles.filter(t => t.includes('Elasticsearch 原生 JSON')).length).toBe(1);
    expect(titles.filter(t => t.includes('query_string')).length).toBe(1);
    const rows = host.querySelectorAll('.br-cmp tbody tr');
    expect(rows.length, '对比表 10 行（767 盘点口径）').toBe(10);
    expect(rows[0].querySelectorAll('td').length, '每行 4 列').toBe(4);
    expect(host.querySelector('.br-result')).toBe(null);
    expect(host.querySelector('.br-preview')).toBe(null);
    app.unmount();
  });
});

describe('768 G237 tag 族四死变体规则整删（死代码·头号·纯删零连锁）', () => {
  it('源码锁：四死规则绝迹（剥注释后全文零类名字面；pillSingleTrack 负向锚留字典防回潮）', () => {
    expect(srcBare, 'tag 族死规则须删（基础+三变体一条覆盖）').not.toMatch(/\.br-tag\b/);
  });
  it('scoped 规则恰 34（1111 错误自救新增 7 条；767 盘点 30→27 基线）+ 活锚 .br-card-hd/.br-title/.br-cmp 在场', () => {
    const style = src.slice(src.indexOf('<style scoped>'), src.indexOf('</style>'));
    const brRules = style.match(/^\.br-[a-z0-9-]+[^{\n]*\{/gm) || [];
    expect(brRules.length, '「.br-」前缀规则块数（@media 嵌套行不计；766 同口径）').toBe(34);
    expect(src, '.br-card-hd 活规则不动').toMatch(/^\.br-card-hd \{/m);
    expect(src, '.br-title 活规则不动').toMatch(/^\.br-title \{/m);
    expect(src, '.br-cmp 活规则不动').toMatch(/^\.br-cmp \{/m);
  });
});

describe('768 G238 一键全转换钮在途态（铁律 D·次刀·746 G161 spinning+在途文案族）', () => {
  it('挂载实锚：busy→页头钮「转换中…」+Loader2 spinning+disabled；完成复常 Wand2+「一键全转换」', async () => {
    let resolveT!: (v: any) => void;
    sqlTranslateFn.mockImplementation(() => new Promise(res => { resolveT = res; }));
    const { app, host } = await mountBr();
    sampleBtn(host)!.click();
    await settle(4);
    const btn = convBtn(host)!;
    expect(btn.disabled, '空 SQL 已回填示例，可点').toBe(false);
    btn.click();
    await settle(6);
    expect(btn.disabled, 'busy 期间禁用').toBe(true);
    expect(btn.textContent, '在途文案').toContain('转换中');
    expect(btn.querySelector('.spinning'), 'Loader2 spinning 图标在场').toBeTruthy();
    expect(btn.querySelector('[class*="lucide-wand"]'), 'busy 期 Wand2 静态图标让位').toBe(null);
    resolveT({ size: 100, query: { match_all: {} } });
    await settle(10);
    expect(btn.disabled, '完成复常解禁').toBe(false);
    expect(btn.textContent, '复常文案').toContain('一键全转换');
    expect(btn.querySelector('.spinning'), 'spinning 移除').toBe(null);
    /* 766 探针课（lucide 类名带 -icon 后缀）再演：Wand2 数字名转 kebab 带 -2- 段，
       token 精确匹配踩不到——图标类断言用 class*= 包形态（后缀形态免疫） */
    expect(btn.querySelector('[class*="lucide-wand"]'), 'Wand2 图标复位').toBeTruthy();
    app.unmount();
  });
  it('源码锁：重试钮对称双态（busy 态随 err-bar 卸载不可观测——源码对称防未来保形漏配）+doAll 起手 busy 守卫（G213 键盘通道先例：⌘⏎ Monaco execute 绕过钮 disabled）', () => {
    expect(src, '页头钮双态（Loader2/Wand2 互换+在途文案）')
      .toMatch(/<Loader2 v-if="busy" :size="12" class="spinning" \/><Wand2 v-else :size="12" \/> \{\{ busy \? '转换中…' : '一键全转换' \}\}/);
    expect(src, '重试钮对称双态（Loader2+在途文案）')
      .toMatch(/<Loader2 v-if="busy" :size="12" class="spinning" \/>\{\{ busy \? '转换中…' : '重试' \}\}/);
    expect(src, 'doAll 起手 busy 守卫（与 runSql 起手对称）')
      .toMatch(/async function doAll\(\) \{[\s\S]*?if \(!sql\.value\.trim\(\) \|\| busy\.value\) return;/);
  });
});

describe('768 G239 对比表 caption+结果条 aria（弱 P3·随批可裁·G210/G224/G229/G235 族）', () => {
  it('挂载实锚：对比表 sr-only caption 在场（视觉零变化）；结果条试跑成功后 role=status', async () => {
    const { app, host } = await mountBr();
    const cap = host.querySelector('.br-cmp caption.sr-only');
    expect(cap, 'sr-only caption 在场').toBeTruthy();
    expect(cap!.textContent).toContain('三者能力对比');
    sampleBtn(host)!.click();
    await settle(4);
    runBtn(host)!.click();
    await settle(10);
    const result = host.querySelector('.br-result');
    expect(result, '试跑成功结果条在场').toBeTruthy();
    expect(result!.getAttribute('role')).toBe('status');
    expect(result!.textContent).toContain('2 行 × 2 列');
    app.unmount();
  });
});

describe('768 G240 试跑原始响应入口（铁律 F·随批裁决=Mapping R84 轻形态补位；IndexHub 554 批 P1 失败态可回看形态）', () => {
  it('挂载实锚：空态钮禁用→试跑成功解禁→点开 modal 全文在场+复制钮', async () => {
    const { app, host } = await mountBr();
    sampleBtn(host)!.click();
    await settle(4);
    const rawBtn = host.querySelector<HTMLButtonElement>('[aria-label="查看试跑原始响应"]');
    expect(rawBtn, '卡头恒驻原始响应钮在场').toBeTruthy();
    expect(rawBtn!.disabled, '未试跑无响应可看=禁用（无数据 disabled 非 v-if 消失）').toBe(true);
    runBtn(host)!.click();
    await settle(10);
    expect(rawBtn!.disabled, '试跑成功后解禁').toBe(false);
    rawBtn!.click();
    await settle(6);
    const modal = host.querySelector('.n-modal-stub');
    expect(modal, '原始响应 modal 打开').toBeTruthy();
    const pre = modal!.querySelector('.br-raw-pre');
    expect(pre, 'highlightJson 全文 pre 在场').toBeTruthy();
    expect(pre!.textContent).toContain('rows');
    expect(pre!.textContent).toContain('columns');
    expect(btnOf(modal as HTMLElement, '复制'), '复制钮（铁律 F 一键获取/复制/查看）').toBeTruthy();
    app.unmount();
  });
  it('挂载实锚：试跑失败态红条在场+原始响应钮仍可回看（失败现场不丢）', async () => {
    sqlLenientFn.mockRejectedValueOnce(new Error('node-1 unreachable'));
    const { app, host } = await mountBr();
    sampleBtn(host)!.click();
    await settle(4);
    runBtn(host)!.click();
    await settle(10);
    const result = host.querySelector('.br-result.err');
    expect(result, '失败红条在场').toBeTruthy();
    expect(result!.textContent).toContain('node-1 unreachable');
    const rawBtn = host.querySelector<HTMLButtonElement>('[aria-label="查看试跑原始响应"]')!;
    expect(rawBtn!.disabled, '失败态仍可回看（554 批 P1 形态）').toBe(false);
    rawBtn!.click();
    await settle(6);
    expect(host.querySelector('.br-raw-pre')!.textContent).toContain('node-1 unreachable');
    app.unmount();
  });
  it('源码锁：translate 链双兜底不动（DSL 面全文+errPreHtml）+lenient 三态置位', () => {
    expect(src, 'translate 响应全文落 DSL 面（既有健康面不动）')
      .toMatch(/dsl\.value = JSON\.stringify\(r, null, 2\);/);
    expect(src, 'lenient 响应体旁路留存（成功/noavail 两分支共用 await 后置位）')
      .toMatch(/lastRaw\.value = r;/);
    expect(src, '异常态置位 error 串（失败现场可回看）')
      .toMatch(/lastRaw\.value = \{ error: String\(e\?\.message \|\| e\) \};/);
  });
});
