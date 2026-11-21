/**
 * 七百四十五批·轨6 全站轮转 次档⑳ ReindexAdvanced 首刀轮（R126；⑥744 头号建议落地
 * =R125 裁决表三刀+随批裁决刀+随批可裁；progressLink557 挂载范式/mock 球同源）：
 *
 * G157（P3 死代码·头号）：裸 textarea 退役伴漏删的组合规则死半支剥除——两条 input
 *   组合规则各含一无模板引用的死选择器半支，剥除后活半支成单选择器规则（死名单唯一，
 *   模板 0 引用双实锚；713/715/717 PageHeader 合并族先例链的「组合规则半支」新形态）。
 * G156（P3 铁律 F·次刀）：结果 MetaStrip total/created/updated 三段裸 label 补中文 tip
 *   （:title 悬停通道+help 档；英文 label 留检索悬浮层中文语义，G55/G60/G133 双语同款）。
 * G159（P3 铁律 F）：op_type/version_type/conflicts/refresh/wait_for_completion 五 select
 *   label 补 :title 中文释义 + version_type external_gt/external_gte 两选项补中文注释
 *   （对齐同页 561 批 slices 等五参数口径，一页两标准归一）。
 * G160（P3 意图与实现不符·随批裁决刀）：DraftBadge 草稿恢复徽标恒不可见——恢复回填
 *   与挂载首拍 body 快照都是程序化写，却经 refs watch 深写草稿对象触发 restored 翻
 *   false，徽标首渲染前即移除（单字段范式无此链=范式差异）。修法=挂载初始化期守卫。
 * G158（弱 P3 aria 随批可裁）：.ra-tabs 容器补 role=group+aria-label+双 .ra-tab
 *   :aria-pressed（739 G142/743 G154 族三行）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftStorageKey } from '../composables/useScopedDraft';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const view = () => read('../views/ReindexAdvancedView.vue');

/* ---- 网络出口 mock：progressLink557 同源（视图/组件全真） ---- */
const reindexAdvancedFn = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reindexAdvanced: (...args: any[]) => reindexAdvancedFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      keys: () => Promise.resolve([]),
      clustersList: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));

/* Monaco 内核 happy-dom 不可用统一 stub（progressLink557/735 spec 同款） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import ReindexAdvancedView from '../views/ReindexAdvancedView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountRA(hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(ReindexAdvancedView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function setInput(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}

function findLabel(root: ParentNode, text: string): HTMLLabelElement | undefined {
  return Array.from(root.querySelectorAll<HTMLLabelElement>('.ra-f label'))
    .find(l => l.textContent?.trim() === text);
}

/* 与视图 FORM_DEF 同构的全字段稿（useScopedDraftState 不做字段合并，缺字段恢复成 undefined） */
const FORM_ALL_DEF: Record<string, string> = {
  srcSize: '1000', srcQueryStr: '', destIndex: '', destOpType: '', destVersionType: '',
  destPipeline: '', scriptLang: '', scriptSource: '', conflicts: '', slices: 'auto',
  refresh: '', waitForCompletion: 'false', requestsPerSecond: '', scroll: '', timeout: '',
  waitForActiveShards: '', rawBody: '',
};
const RA_FORM_KEY = draftStorageKey({ route: 'reindex-advanced' }, 'form');

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  reindexAdvancedFn.mockReset().mockResolvedValue({ took: 500, total: 1200, created: 800, updated: 400 });
  askConfirmFn.mockReset().mockResolvedValue(true);
});

/* ═══════════ A0 挂载不变量（现状即守卫=绿锚） ═══════════ */
describe('745 A0：ReindexAdvanced 挂载不变量（四刀零破相守卫）', () => {
  it('页头/Power Mode 行/四分节/footer 三钮/URL 行全在场，源集群位置双钮', async () => {
    const { app, host } = await mountRA();
    expect(host.textContent).toContain('Reindex 高级自定义');
    expect(host.textContent).toContain('Power Mode — 请谨慎操作');
    for (const sec of ['Source', 'Dest', 'Script（可选）', '全局参数']) {
      expect(host.textContent, `分节「${sec}」必须在场`).toContain(sec);
    }
    expect(findBtn(host, '原始 IO')).toBeTruthy();
    expect(findBtn(host, '预览 body')).toBeTruthy();
    expect(findBtn(host, '开始 Reindex')).toBeTruthy();
    expect(host.textContent).toContain('POST /cluster/reindex-advanced?');
    expect(findBtn(host, '本地') && findBtn(host, '远程集群'), '源集群位置双钮必须在场').toBeTruthy();
    app.unmount();
  });
});

/* ═══════════ G157 死选择器半支剥除（源码锁） ═══════════ */
describe('745 G157：textarea 退役伴漏删的组合规则死半支剥除', () => {
  it('两条 input 组合规则的死半支不回流，活半支成单选择器规则', () => {
    const v = view();
    /* 死半支：组合选择器形态（逗号并集）/独立死选择器/死 focus 半支——三形态全清零 */
    expect(v, '基础档组合规则死半支不回流').not.toMatch(/\.ra-t\s*[,{:]/);
    expect(v, 'focus 档组合规则死半支不回流').not.toMatch(/\.ra-t:focus/);
    /* 活半支：剥半支后成单选择器规则（背景档+focus 档双锚） */
    expect(v, 'input/select 活半支基础档保留').toContain('.ra-i { background: var(--bg-alt);');
    expect(v, 'input/select 活半支 focus 档保留').toContain('.ra-i:focus { border-color: var(--brand); }');
    /* 模板守卫：裸 textarea 类名零引用（含 ra-tabs/ra-tab 相邻符号不误伤口径） */
    expect(v, '模板无死类名引用').not.toContain('class="ra-t"');
    /* 相邻活符号不误伤（tabs/tab 是另一组选择器） */
    expect(v, 'ra-tabs 容器规则保留').toMatch(/\.ra-tabs \{ display: flex/);
    expect(v, 'ra-tab 按钮规则保留').toMatch(/\.ra-tab \{ padding/);
  });
});

/* ═══════════ G156 结果 MetaStrip 三段中文 tip（行为锚） ═══════════ */
describe('745 G156：结果 MetaStrip total/created/updated 三段中文 tip', () => {
  it('同步完成 → 三段 help 档 :title 中文语义（label 英文留检索）', async () => {
    const { app, host } = await mountRA();
    setInput(host.querySelectorAll<HTMLInputElement>('.ixp-inp')[1], 'orders-v2');
    await settle(2);
    findBtn(host, '开始 Reindex')!.click();
    await settle();
    expect(host.textContent, '同步结果必须出已提交').toContain('已提交');
    const seg = (label: string) => Array.from(host.querySelectorAll('.ms-i'))
      .find(el => el.querySelector('i')?.textContent === label);
    const totalSeg = seg('total');
    expect(totalSeg, 'total 段必须在场').toBeTruthy();
    /* 段提示已迁 v-tip 指令（DOM 无 title 属性）——三段中文 tip 改源码锚（items prop 传 tip） */
    const v = view();
    expect(v).toContain("tip: 'total：本次 reindex 处理的文档总数'");
    expect(totalSeg!.classList.contains('help'), 'tip 段 help 档（cursor:help）').toBe(true);
    const createdSeg = seg('created');
    expect(createdSeg, 'created 段必须在场').toBeTruthy();
    expect(v).toContain("tip: 'created：新写入 dest 的文档数'");
    const updatedSeg = seg('updated');
    expect(updatedSeg, 'updated 段必须在场').toBeTruthy();
    expect(v).toContain("tip: 'updated：覆盖更新（同 ID 重写）的文档数'");
    app.unmount();
  });
});

/* ═══════════ G159 五参数 label :title + external_gt/gte 选项中文 ═══════════ */
describe('745 G159：五 select label 中文释义 + version_type 两选项中文', () => {
  it('op_type/version_type/conflicts/refresh/wait_for_completion 五 label 中文释义全量', async () => {
    const { app, host } = await mountRA();
    /* label 提示已迁 v-tip 指令（DOM 无 title 属性）——三段释义改源码锚 */
    const v = view();
    expect(v).toContain('v-tip="\'op_type：写入方式——create 仅新增（同 ID 已存在即冲突报错），index 存在则覆盖（默认）\'"');
    expect(v).toContain('v-tip="\'conflicts：版本冲突策略——abort 遇冲突中止（默认），proceed 跳过冲突文档继续\'"');
    expect(v).toContain('v-tip="\'refresh：完成后刷新——不刷新（默认）/ true 立即可搜 / wait_for 等待下次自动刷新\'"');
    for (const name of ['op_type', 'conflicts', 'refresh']) {
      expect(findLabel(host, name), `label「${name}」必须在场`).toBeTruthy();
    }
    /* version_type 释义 116 字符超原生 title 承载，迁 Tip long 档悬浮（1120 存量
       迁移，接线形态由 qualityBacklog1120 看守）——Tip 浮层未 hover 不在挂载 DOM，
       释义锁随迁源码形态；label 元素仍在场且不再带原生 title */
    const vtLabel = findLabel(host, 'version_type');
    expect(vtLabel, 'label「version_type」必须在场').toBeTruthy();
    expect(vtLabel!.getAttribute('title'), '释义已迁 Tip，原生 title 不再在场').toBeNull();
    expect(view(), 'version_type 释义走 Tip text 承载').toContain('<Tip long text="version_type：版本控制');
    /* wait_for_completion 释义超长同迁 Tip long 档——label 在场且不再带原生 title，
       释义锚走源码 Tip text（含 taskId 异步语义），旧 label title 写法不回潮 */
    const wfcLabel = findLabel(host, 'wait_for_completion');
    expect(wfcLabel, 'label「wait_for_completion」必须在场').toBeTruthy();
    expect(wfcLabel!.getAttribute('title'), '释义已迁 Tip，原生 title 不再在场').toBeNull();
    expect(view(), 'wait_for_completion 释义走 Tip text 承载').toContain('<Tip long text="wait_for_completion：false 立即返回 taskId');
    expect(view(), '旧原生 label title 写法不回潮').not.toContain('<label title="wait_for_completion：');
    app.unmount();
  });

  it('version_type external_gt/external_gte 两选项补中文注释（同 external 段形态）', () => {
    /* 原生 select 升档 NSelect（W3b）——option 字面迁 DEST_VERSION_TYPE_OPTS 常量，锁面随迁源码锁 */
    const v = view();
    const opts = v.match(/const DEST_VERSION_TYPE_OPTS = \[([\s\S]*?)\];/);
    expect(opts, 'version_type options 常量必须在场').toBeTruthy();
    const gt = opts![1].split('\n').find(l => l.includes("value: 'external_gt'"))!;
    expect(gt, 'external_gt 选项须含中文注释').toContain('更大');
    const gte = opts![1].split('\n').find(l => l.includes("value: 'external_gte'"))!;
    expect(gte, 'external_gte 选项须含中文注释（与 gt 区分：含相等语义）').toMatch(/相等|≥/);
  });

  it('既有五参数（slices 等 561 批口径）释义不受扰（负锚）', async () => {
    const { app, host } = await mountRA();
    const slicesLabel = findLabel(host, 'slices');
    expect(slicesLabel, 'slices label 必须在场').toBeTruthy();
    /* label 提示已迁 v-tip 指令——既有释义改源码锚（561 批口径不动） */
    expect(view()).toContain('v-tip="\'slices：并行切片数——auto 交 ES 自定，或正整数\'"');
    app.unmount();
  });
});

/* ═══════════ G160 DraftBadge 草稿恢复徽标 wiring（行为刀三锚） ═══════════ */
describe('745 G160：草稿恢复徽标 wiring 修复（挂载在场→用户编辑移除→清除移除）', () => {
  it('锚1：非默认稿挂载 → 表单值恢复（既有行为不回归）+ 徽标在场（修前恒不可见）', async () => {
    sessionStorage.setItem(RA_FORM_KEY, JSON.stringify({ ...FORM_ALL_DEF, srcSize: '777', destIndex: 'orders-v9' }));
    const { app, host } = await mountRA();
    /* 值恢复（R121 既有核心功能，744 D10 已验健康——不得随刀回归） */
    const sizeInput = Array.from(host.querySelectorAll<HTMLInputElement>('input')).find(i => i.placeholder === '1000');
    expect(sizeInput, 'size 输入框必须在场').toBeTruthy();
    expect(sizeInput!.value, 'size 恢复 777').toBe('777');
    expect(host.querySelectorAll<HTMLInputElement>('.ixp-inp')[1].value, 'dest 恢复 orders-v9').toBe('orders-v9');
    /* 徽标在场（G160 收口主锚：修前恢复链深写草稿对象把 restored 在首渲染前翻 false） */
    const badge = host.querySelector('.draft-badge');
    expect(badge, '草稿恢复徽标必须在场').toBeTruthy();
    expect(badge!.textContent).toContain('已恢复草稿');
    expect(Array.from(badge!.querySelectorAll('button')).find(b => b.textContent?.includes('清除')), '徽标内清除钮').toBeTruthy();
    app.unmount();
  });

  it('锚2：用户真实编辑 → 徽标移除（程序化回填不算编辑）', async () => {
    sessionStorage.setItem(RA_FORM_KEY, JSON.stringify({ ...FORM_ALL_DEF, srcSize: '777', destIndex: 'orders-v9' }));
    const { app, host } = await mountRA();
    expect(host.querySelector('.draft-badge'), '编辑前徽标在场前置').toBeTruthy();
    const sizeInput = Array.from(host.querySelectorAll<HTMLInputElement>('input')).find(i => i.placeholder === '1000')!;
    setInput(sizeInput, '888');
    await settle();
    expect(host.querySelector('.draft-badge'), '用户编辑后徽标必须移除').toBeNull();
    app.unmount();
  });

  it('锚3：清除钮 → 徽标移除 + 草稿键清空（DraftBadge 双态收口）', async () => {
    sessionStorage.setItem(RA_FORM_KEY, JSON.stringify({ ...FORM_ALL_DEF, srcSize: '777', destIndex: 'orders-v9' }));
    const { app, host } = await mountRA();
    Array.from(host.querySelectorAll<HTMLButtonElement>('.draft-badge button')).find(b => b.textContent?.includes('清除'))!.click();
    await settle();
    expect(host.querySelector('.draft-badge'), '清除后徽标移除').toBeNull();
    expect(sessionStorage.getItem(RA_FORM_KEY), '草稿键必须清空').toBeNull();
    app.unmount();
  });

  it('负锚：无草稿挂载 → 徽标不在场（默认稿零误报）', async () => {
    const { app, host } = await mountRA();
    expect(host.querySelector('.draft-badge'), '无草稿零徽标').toBeNull();
    app.unmount();
  });
});

/* ═══════════ G158 源集群位置 tabs aria（随批可裁） ═══════════ */
describe('745 G158：源集群位置组容器 role/label + 双钮 aria-pressed', () => {
  it('容器 role=group+aria-label，双钮 pressed 随 srcRemote 精确翻转', async () => {
    const { app, host } = await mountRA();
    const tabs = host.querySelector('.ra-tabs');
    expect(tabs, 'tabs 容器必须在场').toBeTruthy();
    expect(tabs!.getAttribute('role')).toBe('group');
    expect(tabs!.getAttribute('aria-label'), '容器 aria-label 非空').toBeTruthy();
    const btns = Array.from(tabs!.querySelectorAll<HTMLButtonElement>('.ra-tab'));
    expect(btns.length).toBe(2);
    expect(btns.map(b => b.getAttribute('aria-pressed')), '初始本地档 pressed=[true,false]').toEqual(['true', 'false']);
    findBtn(host, '远程集群')!.click();
    await settle(2);
    const btns2 = Array.from(host.querySelector('.ra-tabs')!.querySelectorAll<HTMLButtonElement>('.ra-tab'));
    expect(btns2.map(b => b.getAttribute('aria-pressed')), '切远程后 pressed=[false,true] 精确翻转').toEqual(['false', 'true']);
    expect(host.querySelector('.ra-remote'), '远程源表单必须随切换出现').toBeTruthy();
    app.unmount();
  });
});
