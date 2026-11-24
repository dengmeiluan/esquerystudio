/**
 * G7（UX 轮 II devx 组）三态与写链路——行为改动防回归：
 *
 *   RestView：
 *     A2 doSend() 头部 sending 守卫——path 输入框 Enter 键盘路径绕过按钮 :disabled
 *        不再并发重发（教训 7 评估项）；
 *     C1 sending 期间响应卡在场 +「发送中，等待集群响应…」占位，不闪引导空态；
 *     C2 失败态显式「重试」按钮——走 send()，PUT/DELETE 重开危险确认（确认门不绕过）；
 *   DevToolsView：
 *     A1 run() 头部 busy 守卫——Ctrl+Enter 键盘路径不再并发重发；
 *     C1 busy 期间「执行中…」占位，不闪 EmptyState 引导；C3 失败态显式「重试」；
 *   PainlessLabView：
 *     B2 storedLoading 初值 true——首帧「正在拉取已存储脚本…」，不闪「暂无存储脚本」；
 *     B3 err mini-bar 独立顶置——有旧列表刷新失败并存，不再互斥顶掉整列；
 *     C4 save() saving 防重入（守卫 + :disabled + 「保存中…」）；
 *     deleteStored 确认门（critical + guardText）锁定。
 *
 * Monaco 说明：RestView 含 MonacoEditor——jsdom 不可用，统一 stub 为 .monaco-stub
 * （本组断言不涉及编辑器行为，同 G6 范式）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口与全局确认服务，视图/组件/工具全用真的 */
const rawFn = vi.fn();
const painlessExecuteFn = vi.fn();
const listStoredScriptsFn = vi.fn();
const putStoredScriptFn = vi.fn();
const deleteStoredScriptFn = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ） */
      raw: (...args: any[]) => rawFn(...args),
      devtoolsExecute: (...args: any[]) => rawFn(...args),
      painlessExecute: (...args: any[]) => painlessExecuteFn(...args),
      listStoredScripts: (...args: any[]) => listStoredScriptsFn(...args),
      putStoredScript: (...args: any[]) => putStoredScriptFn(...args),
      deleteStoredScript: (...args: any[]) => deleteStoredScriptFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* store.loadIndices 链路出口补齐（防御性 stub 挡真实 fetch 噪音，教训 5） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));

/* Monaco 在 jsdom 不可用——stub 为静态占位（本组不断言编辑器行为） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    /* W6-T3：stub 模板渲 modelValue 文本——响应区改用后「错误全文直显」断言口径不变（原 pre textContent 迁移） */
    template: '<div class="monaco-stub">{{ modelValue }}</div>',
  },
}));

import RestView from '../views/RestView.vue';
import DevToolsView from '../views/DevToolsView.vue';
import PainlessLabView from '../views/PainlessLabView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/update-by-query', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}

/* 样例数据（按后端实际返回形态，教训 6） */
const RAW_OK = { status: 200, body: '{"ok":true}' };
const SCRIPTS_OK = { scripts: { 'my-script': { lang: 'painless', source: 'return 1;' } }, count: 1 };

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  rawFn.mockReset().mockResolvedValue(RAW_OK);
  painlessExecuteFn.mockReset().mockResolvedValue({ result: 3 });
  listStoredScriptsFn.mockReset().mockResolvedValue(SCRIPTS_OK);
  putStoredScriptFn.mockReset().mockResolvedValue({});
  deleteStoredScriptFn.mockReset().mockResolvedValue({});
  askConfirmFn.mockReset().mockResolvedValue(true);
});

/* RestView 工具：填 path（发送按钮有 !path.trim() 禁用门）
   W3-T11：.rt-path 渗透为 EndpointPathInput 后 class 落组件根 div，真实输入框是内层 .epi-inp */
async function fillPath(host: ParentNode, p = '/_cluster/health') {
  const inp = host.querySelector<HTMLInputElement>('.rt-path .epi-inp')!;
  inp.value = p;
  inp.dispatchEvent(new Event('input'));
  await settle(3);
}

describe('G7 RestView：发送三态与重入守卫', () => {
  it('初始 → 引导空态在，响应卡不在（真空引导位）', async () => {
    const { app, host } = await mountView(RestView, '#/rest');
    expect(host.textContent).toContain('输入任意 ES REST path');
    expect(host.querySelector('.rt-resp')).toBeNull();
    app.unmount();
  });

  it('发送失败 → 内联错误面板（请求失败+全文）在，不闪引导空态；显式重试重跑', async () => {
    rawFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(RestView, '#/rest');
    await fillPath(host);
    findBtn(host, '发送')!.click();
    await settle();
    expect(host.textContent).toContain('请求失败');
    expect(host.textContent).toContain('connect refused');
    expect(host.textContent, '失败不许闪引导空态').not.toContain('输入任意 ES REST path');
    expect(host.querySelector('.rt-err-pre'), '错误全文必须内联直显（写链路口径）').toBeTruthy();
    rawFn.mockClear();
    findBtn(host, '重试')!.click();
    await settle();
    expect(rawFn, '重试必须重跑发送').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('失败 → 重试成功 → 错误消 + 响应出（反向锁，G6 复审 M3）', async () => {
    rawFn.mockRejectedValue(new Error('boom'));
    const { app, host } = await mountView(RestView, '#/rest');
    await fillPath(host);
    findBtn(host, '发送')!.click();
    await settle();
    expect(host.querySelector('.rt-err-pre')).toBeTruthy();
    rawFn.mockResolvedValue(RAW_OK);
    findBtn(host, '重试')!.click();
    await settle();
    expect(host.querySelector('.rt-err-pre'), '重试成功后错误面板必须消').toBeNull();
    expect(host.textContent, '重试成功后必须出响应').toContain('HTTP 200');
    expect(host.textContent).toContain('"ok"');
    app.unmount();
  });

  it('C1：发送中 → 占位文案在，引导空态不闪；按钮禁用 + 「发送中…」', async () => {
    rawFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟 in-flight */ }));
    const { app, host } = await mountView(RestView, '#/rest');
    await fillPath(host);
    /* 复审 M2：状态切换前先取按钮引用——in-flight 文案变化后 findBtn 仍命中同一枚 */
    const sendBtn = findBtn(host, '发送')!;
    sendBtn.click();
    await settle(3);
    expect(host.textContent, '发送中必须出占位文案').toContain('发送中，等待集群响应');
    expect(host.textContent, '发送中不许闪引导空态').not.toContain('输入任意 ES REST path');
    expect(sendBtn.disabled, '发送中按钮必须禁用').toBe(true);
    expect(sendBtn.textContent).toContain('发送中');
    app.unmount();
  });

  it('A2：发送中 path 输入框 Enter 连按不双发（键盘路径守卫锁）', async () => {
    rawFn.mockReturnValue(new Promise(() => { /* 永不 resolve */ }));
    const { app, host } = await mountView(RestView, '#/rest');
    await fillPath(host);
    /* W3-T11 渗透后真实事件序列：fillPath 后面板开着，首 Enter=choose 回填（不发送）；
       面板关后 Enter=透发首发（rawFn 1 次，永不 resolve 保持 in-flight）；
       此后 in-flight 期间——Enter 走 doSend 头部 sending 守卫拦截（键盘路径不受按钮 :disabled 约束），
       点击发送则被按钮 :disabled 拦截，双通道都不双发（T11 复审 M4：补锁 in-flight Enter 守卫断言） */
    const inp = host.querySelector<HTMLInputElement>('.rt-path .epi-inp')!;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(3);
    expect(rawFn, '面板关后 Enter 必须透发首发').toHaveBeenCalledTimes(1);
    /* 面板已关 + in-flight：再 Enter 透发 send→doSend，必须被头部 sending 守卫拦下 */
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(3);
    expect(rawFn, '面板关闭后 in-flight Enter 必须被 busy 守卫拦截').toHaveBeenCalledTimes(1);
    findBtn(host, '发送')!.click();
    await settle(3);
    expect(rawFn, 'in-flight 期间 Enter/点击重入不许双发').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('PUT/DELETE 确认门：发送先过全局 askConfirm 不直发；拒绝不执行、失败重试仍过确认门', async () => {
    const { app, host } = await mountView(RestView, '#/rest');
    host.querySelector<HTMLButtonElement>('button[data-m="DELETE"]')!.click();
    await settle(3);
    await fillPath(host, '/logs-2026.08');
    /* 第十批：RestView 确认门换全局 askConfirm 服务——断言从锚 .cf-mask DOM 改为锚服务调用与拒绝/确认双路径。
       首发先拒绝（beforeEach 默认 resolve(true)，不显式拒绝会直接执行破坏「门前不执行」断言） */
    askConfirmFn.mockClear();
    askConfirmFn.mockResolvedValue(false);
    findBtn(host, '发送')!.click();
    await settle();
    expect(askConfirmFn, 'DELETE 不许绕过确认门，必须先 askConfirm').toHaveBeenCalledTimes(1);
    /* 原本地 ConfirmModal 宿主即 level="warn"（危险操作确认标题+动态 okText），等价迁移不升档 */
    expect(askConfirmFn.mock.calls[0][0]).toMatchObject({ level: 'warn' });
    expect(String(askConfirmFn.mock.calls[0][0].guardText ?? '') + String(askConfirmFn.mock.calls[0][0].message ?? '')).toContain('/logs-2026.08');
    expect(rawFn, '确认门前不许执行').not.toHaveBeenCalled();
    /* 确认路径：确认 → 执行 */
    askConfirmFn.mockResolvedValue(true);
    findBtn(host, '发送')!.click();
    await settle();
    expect(askConfirmFn, '重发必须再过确认门').toHaveBeenCalledTimes(2);
    expect(rawFn, '确认后必须执行').toHaveBeenCalledTimes(1);
    /* 失败 → 重试：重开确认门，不直发（教训 7：重试不绕过确认门） */
    rawFn.mockRejectedValue(new Error('boom'));
    askConfirmFn.mockClear();
    findBtn(host, '发送')!.click();
    await settle();
    expect(askConfirmFn, '重发必须重过确认门').toHaveBeenCalledTimes(1);
    askConfirmFn.mockResolvedValue(true);
    findBtn(host, '发送')!.click();
    await settle();
    expect(host.querySelector('.rt-err-pre'), '失败必须出错误面板').toBeTruthy();
    /* 重试也必须重过门：先拒绝验证「门在且拦截」，执行链路已由上方确认段覆盖 */
    rawFn.mockClear();
    askConfirmFn.mockClear();
    askConfirmFn.mockResolvedValue(false);
    findBtn(host, '重试')!.click();
    await settle();
    expect(askConfirmFn, '重试必须重过确认门').toHaveBeenCalledTimes(1);
    expect(rawFn, 'DELETE 重试在确认门前不许直发').not.toHaveBeenCalled();
    app.unmount();
  });
});

describe('G7 DevToolsView：执行三态与重入守卫', () => {
  it('真空 → EmptyState + 三个一键起步按钮在', async () => {
    const { app, host } = await mountView(DevToolsView, '#/devtools');
    expect(host.querySelector('.empty-state'), '真空必须出 EmptyState 组件').toBeTruthy();
    expect(host.textContent).toContain('输入 REST 请求执行');
    expect(findBtn(host, '试试：集群健康')).toBeTruthy();
    expect(findBtn(host, '列出索引')).toBeTruthy();
    expect(findBtn(host, '全局搜 5 条')).toBeTruthy();
    app.unmount();
  });

  it('一键起步 → 填入示例并立即执行（R44 行为锁）', async () => {
    const { app, host } = await mountView(DevToolsView, '#/devtools');
    findBtn(host, '试试：集群健康')!.click();
    await settle();
    expect(rawFn).toHaveBeenCalledTimes(1);
    expect(rawFn.mock.calls[0][0]).toBe('GET');
    expect(rawFn.mock.calls[0][1]).toBe('/_cluster/health');
    expect(host.textContent).toContain('✓ 成功');
    app.unmount();
  });

  it('执行失败 → err 结果 + 显式重试在；重试重跑 run', async () => {
    rawFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(DevToolsView, '#/devtools');
    findBtn(host, '执行')!.click();
    await settle();
    /* W6-T3：响应区 pre 改用只读 Monaco——err 结果区迁移至 .dt-out-monaco.err（容器红框承接原 pre err 视觉），
       pre 形态本身即被替换对象（同 W6 body .dt-body-area 迁移先例） */
    const pre = host.querySelector('.dt-out-monaco.err');
    expect(pre, '失败必须出 err 结果区').toBeTruthy();
    expect(pre!.textContent).toContain('connect refused');
    expect(host.textContent).toContain('✗ 失败');
    rawFn.mockClear();
    findBtn(host, '重试')!.click();
    await settle();
    expect(rawFn, '重试必须重跑 run').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('失败 → 重试成功 → 结果出 + ✓ 成功（反向锁）', async () => {
    rawFn.mockRejectedValue(new Error('boom'));
    const { app, host } = await mountView(DevToolsView, '#/devtools');
    findBtn(host, '执行')!.click();
    await settle();
    expect(host.querySelector('.dt-out-monaco.err')).toBeTruthy();
    rawFn.mockResolvedValue(RAW_OK);
    findBtn(host, '重试')!.click();
    await settle();
    expect(host.querySelector('.dt-out-monaco.err'), '重试成功后 err 态必须消').toBeNull();
    expect(host.textContent).toContain('✓ 成功');
    app.unmount();
  });

  it('A1：busy 期间 Ctrl+Enter/重复点击不双发；执行中占位不闪 EmptyState', async () => {
    rawFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟 in-flight */ }));
    const { app, host } = await mountView(DevToolsView, '#/devtools');
    /* 复审 M2：状态切换前先取按钮引用 */
    const runBtn = findBtn(host, '执行')!;
    runBtn.click();
    await settle(3);
    expect(runBtn.disabled, 'busy 期间按钮必须禁用').toBe(true);
    expect(runBtn.textContent, 'busy 期间必须出 pending 文案').toContain('执行中');
    expect(host.textContent, '执行中必须出占位文案').toContain('执行中，等待集群响应');
    expect(host.textContent, '执行中不许闪 EmptyState 引导').not.toContain('输入 REST 请求执行');
    host.querySelector<HTMLInputElement>('.dt-path')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    runBtn.click();
    await settle(3);
    expect(rawFn, 'busy 期间 Ctrl+Enter/重复点击不许双发').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('F1：busy 期间切 tab —— 结果仍落原 tab 且原 tab busy 复位（复审 F1 回归锁）', async () => {
    let resolveRaw: (v: any) => void = () => {};
    rawFn.mockReturnValue(new Promise(r => { resolveRaw = r; }));
    const { app, host } = await mountView(DevToolsView, '#/devtools');
    findBtn(host, '执行')!.click();
    await settle(3);
    expect(findBtn(host, '执行中'), 'tab A 执行中必须出 pending 文案').toBeTruthy();
    /* in-flight 期间切到 tab B（默认三示例 tab 的第二个） */
    host.querySelectorAll<HTMLElement>('.dt-tab')[1].click();
    await settle(3);
    const runBtnB = findBtn(host, '执行')!;
    expect(runBtnB.disabled, 'tab B 有自己的 busy，不受 tab A 影响').toBe(false);
    /* resolve：结果必须写回 tab A 而非当前 tab B */
    resolveRaw(RAW_OK);
    await settle();
    expect(host.textContent, 'tab B 不许出现 tab A 的结果').not.toContain('✓ 成功');
    /* 切回 tab A：结果在 + busy 复位（修复前 busy=true 无人复位，Run 永久禁用） */
    host.querySelectorAll<HTMLElement>('.dt-tab')[0].click();
    await settle(3);
    expect(host.textContent, '结果必须落 tab A').toContain('✓ 成功');
    expect(findBtn(host, '执行')!.disabled, 'tab A busy 必须复位（修复前永久锁死）').toBe(false);
    app.unmount();
  });
});

describe('G7 PainlessLabView：已存储脚本三态与写链路守卫', () => {
  it('B2：首载中 → 「正在拉取已存储脚本…」在，「暂无存储脚本」不闪', async () => {
    listStoredScriptsFn.mockReturnValue(new Promise(() => { /* 永不 resolve */ }));
    const { app, host } = await mountView(PainlessLabView, '#/painless-lab');
    expect(host.textContent, '首载中必须出加载文案').toContain('正在拉取已存储脚本');
    expect(host.textContent, '首载中不许闪假空态').not.toContain('暂无存储脚本');
    expect(findBtn(host, '刷新')!.disabled, '首载中头部刷新必须禁用（复审 M2）').toBe(true);
    app.unmount();
  });

  it('B3：首载失败 → err mini-bar + 重试在，不伪装空态；重试重跑 loadStored', async () => {
    listStoredScriptsFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(PainlessLabView, '#/painless-lab');
    const err = host.querySelector('.pl-err-mini');
    expect(err, '失败必须出 err mini-bar').toBeTruthy();
    expect(err!.textContent).toContain('读取脚本列表失败');
    expect(err!.textContent).toContain('connect refused');
    expect(host.textContent, '失败不许伪装真空').not.toContain('暂无存储脚本');
    listStoredScriptsFn.mockClear();
    findBtn(err as ParentNode, '重试')!.click();
    await settle();
    expect(listStoredScriptsFn, '重试必须重跑 loadStored').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('真空（成功但空表）→ 暂无存储脚本在，err/加载文案不在', async () => {
    listStoredScriptsFn.mockResolvedValue({ scripts: {}, count: 0 });
    const { app, host } = await mountView(PainlessLabView, '#/painless-lab');
    expect(host.querySelector('.pl-err-mini')).toBeNull();
    expect(host.textContent).not.toContain('正在拉取已存储脚本');
    expect(host.textContent, '真空必须出空态文案').toContain('暂无存储脚本');
    app.unmount();
  });

  it('B3：有旧列表刷新失败 → err 在且旧列表保留（并存锁，教训 1）', async () => {
    const { app, host } = await mountView(PainlessLabView, '#/painless-lab');
    expect(host.textContent, '首载成功必须出脚本').toContain('my-script');
    listStoredScriptsFn.mockRejectedValue(new Error('timeout'));
    findBtn(host, '刷新')!.click();
    await settle();
    expect(host.querySelector('.pl-err-mini'), '刷新失败必须出 err mini-bar').toBeTruthy();
    expect(host.textContent).toContain('读取脚本列表失败');
    expect(host.textContent, '旧脚本必须保留（修复前被互斥顶掉）').toContain('my-script');
    app.unmount();
  });

  it('失败 → 重试成功 → err 消 + 列表出（反向锁）', async () => {
    listStoredScriptsFn.mockRejectedValue(new Error('boom'));
    const { app, host } = await mountView(PainlessLabView, '#/painless-lab');
    expect(host.querySelector('.pl-err-mini')).toBeTruthy();
    listStoredScriptsFn.mockResolvedValue(SCRIPTS_OK);
    findBtn(host.querySelector('.pl-err-mini') as ParentNode, '重试')!.click();
    await settle();
    expect(host.querySelector('.pl-err-mini'), '重试成功后 err 必须消').toBeNull();
    expect(host.textContent, '重试成功后列表必须出').toContain('my-script');
    app.unmount();
  });

  it('执行失败 → 结果区 err 标记；重跑成功 → err 消（复审 M1：错误不再与正常结果同色）', async () => {
    painlessExecuteFn.mockRejectedValue(new Error('script parse error'));
    const { app, host } = await mountView(PainlessLabView, '#/painless-lab');
    findBtn(host, '试跑')!.click();
    await settle();
    const out = host.querySelector('.pl-out.err');
    expect(out, '执行失败必须出 err 标记结果区').toBeTruthy();
    expect(out!.textContent).toContain('script parse error');
    painlessExecuteFn.mockResolvedValue({ result: 3 });
    findBtn(host, '试跑')!.click();
    await settle();
    expect(host.querySelector('.pl-out.err'), '重跑成功后 err 标记必须消').toBeNull();
    expect(host.querySelector('.pl-out'), '成功结果区必须在').toBeTruthy();
    app.unmount();
  });

  it('C4：save 防重入——保存中禁用 + 「保存中…」，重复点击不双发', async () => {
    const { app, host } = await mountView(PainlessLabView, '#/painless-lab');
    const idInp = host.querySelector<HTMLInputElement>('.pl-inp-sm')!;
    idInp.value = 'my-new-script';
    idInp.dispatchEvent(new Event('input'));
    await settle(3);
    putStoredScriptFn.mockReturnValue(new Promise(() => { /* 永不 resolve */ }));
    /* 复审 M2：状态切换前先取按钮引用 */
    const saveBtn = findBtn(host, '保存')!;
    saveBtn.click();
    await settle(3);
    expect(saveBtn.disabled, 'in-flight 期间保存按钮必须禁用').toBe(true);
    expect(saveBtn.textContent, 'in-flight 期间必须出 pending 文案').toContain('保存中');
    saveBtn.click();
    await settle(3);
    expect(putStoredScriptFn, 'in-flight 期间重复点击不许双发').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('ux2 Task 11：scriptId 查重命中 → il-hint 出 warn 文案（插值回归钉——字面文本 bug 曾漏网）', async () => {
    const { app, host } = await mountView(PainlessLabView, '#/painless-lab');
    const idInp = host.querySelector<HTMLInputElement>('.pl-inp-sm')!;
    idInp.value = 'my-script';
    idInp.dispatchEvent(new Event('input'));
    await settle(3);
    const hint = host.querySelector('.il-hint');
    expect(hint, '查重命中必须出提示条').toBeTruthy();
    expect(hint!.classList.contains('il-warn'), 'dupRule 默认 warn 级').toBe(true);
    expect(hint!.textContent, '提示条必须渲染插值文案而非变量名').toContain('my-script');
    expect(hint!.textContent).toContain('已存在');
    app.unmount();
  });

  it('deleteStored 确认门：askConfirm 拒绝则不删；确认则删并刷新列表', async () => {
    askConfirmFn.mockResolvedValue(false);
    const { app, host } = await mountView(PainlessLabView, '#/painless-lab');
    expect(host.textContent).toContain('my-script');
    host.querySelector<HTMLElement>('.pl-stored-x')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(askConfirmFn, '必须先过确认门').toHaveBeenCalledTimes(1);
    expect(deleteStoredScriptFn, '确认拒绝不许删除').not.toHaveBeenCalled();
    askConfirmFn.mockResolvedValue(true);
    listStoredScriptsFn.mockClear();
    host.querySelector<HTMLElement>('.pl-stored-x')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(deleteStoredScriptFn, '确认后必须删除').toHaveBeenCalledTimes(1);
    expect(deleteStoredScriptFn.mock.calls[0][0]).toBe('my-script');
    expect(listStoredScriptsFn, '删除后必须刷新列表').toHaveBeenCalledTimes(1);
    app.unmount();
  });
});
