/**
 * 结构同步·兼容性自适应（sync-structure）——页面入口与报告呈现。
 * 2026-11-21 兼容计划批：入口升级两段式——「预览兼容计划」（dryRun=true 直发，无确认窗）
 * → 计划报告弹层（源→目标 vendor 芯片对 + planned 矩阵预剔除 / reactive 报错兜底剔除
 * 两段清单 + advice 建议 + 别名随迁 + 警告折叠，每刀带 reason）→ CTA「按此计划创建」
 * 走确认弹层二次确认 → dryRun=false 执行 → inline 执行报告（v2 同构布局）。
 * mock 打在 api.xb.syncStructure 层（不依赖 browserApi），桩序=预览在前、执行在后。
 * 覆盖：
 *   ① 入口禁用/启用（源索引未选禁用）+ 目标名预填（目标表单值优先，缺席默认同名）；
 *   ② CTA 确认 facts（源索引/目标索引/覆盖语义）+ 取消不发执行（预览请求已发的 1 次保留）；
 *     预览请求体 sourceIndex/destIndex/conn/dryRun/syncAliases；
 *   ③ 预览弹层渲染（vendor 芯片/两段清单/reason/CTA）+ 执行后 inline 报告 v2 布局；
 *   ④ created=false 失败态——红色失败徽标 + 「未创建索引」+ lastError + 已剔除清单照常；
 *   ⑤ 零剔除正面态——「全部属性兼容」正面态在场，空清单区块不渲染；
 *   ⑥ 浏览器模式 501（BROWSER_MODE_UNMAPPED）——诚实错误态，不冒充报告；
 *     服务端 4xx/5xx——错误全文 +「未创建索引」；
 *   ⑦ 成功后联动——目标索引表单为空则回填 + 「继续迁移数据」快捷动作 toast 提示。
 * 挂具范式同 xmigrateGovernance（全真挂载 + api/confirm mock）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';
import { useAppStore } from '../stores/app';

const xbJobs = vi.fn();
const xbSync = vi.fn();
const askConfirmFn = vi.fn();

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
        syncStructure: (...a: any[]) => xbSync(...a),
      },
    },
  };
});
vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));

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
  return { app, host, pinia };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

const apps: ReturnType<typeof createApp>[] = [];

/* 全量计划/报告（v2 契约：source/target vendor 对 + planned/reactive 两段清单 + advice +
   aliases + warnings）——剔除/降级/兜底各一件、其余语义化样本；dryRun:true=预览计划 */
const FULL_PLAN = {
  created: false, dryRun: true, destIndex: 'uat-orders', rounds: 3,
  source: { index: 'prod-orders', version: '7.10.2-aliyun', vendor: { id: 'aliyun', label: '阿里云 ES' }, plugins: ['apack'] },
  target: { index: 'uat-orders', version: '7.14.2', vendor: { id: 'tencent', label: '腾讯云 ES' }, plugins: [] },
  planned: {
    removedSettings: [{ key: 'index.apack.knn', reason: '目标集群无 apack 插件' }],
    removedAnalysis: [{ kind: 'analyzer', name: 'my_aliws', reason: '阿里云自定义分词器在目标不可用' }],
    downgradedFields: [{ field: 'title', attr: 'analyzer', from: 'my_aliws', to: 'standard', reason: '分词器缺失，降级为 standard' }],
  },
  reactive: {
    removedSettings: [{ key: 'index.apack.compress', reason: '试建报错 unknown setting，兜底剔除' }],
    removedAnalysis: [],
    downgradedFields: [],
  },
  aliases: { skipped: ['prod-orders-read'], synced: ['prod-orders-write'] },
  advice: [
    { kind: 'shard', key: 'number_of_shards', message: '单分片 50GB 超过建议值，建议拆分' },
    { kind: 'ilm', key: 'policy', message: '源带 ILM 策略，目标未装 ILM 插件' },
  ],
  warnings: ['index.number_of_shards 已按目标节点数收敛为 3'],
};
const EXEC_REPORT = { ...FULL_PLAN, created: true, dryRun: false };

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  /* 缺省两段桩：第一拍=预览计划，第二拍=执行报告（各 it 按需覆写） */
  xbSync.mockReset().mockResolvedValueOnce(FULL_PLAN).mockResolvedValue(EXEC_REPORT);
  askConfirmFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 入口：禁用/启用 + 目标名预填 ═══ */
describe('结构同步：入口', () => {
  it('源索引未选时入口禁用；选源后启用，目标名默认同名（目标表单值优先）', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-sync-btn"]')!;
    expect(btn, '同步入口在场（源配置预览区）').toBeTruthy();
    expect(btn.disabled, '源索引未选时禁用').toBe(true);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    expect(btn.disabled, '选源后启用').toBe(false);
    const inp = host.querySelector<HTMLInputElement>('[data-test="xm-sync-dest"]')!;
    expect(inp.value, '目标名默认同名').toBe('prod-orders');
    st.form.destIndex = 'uat-orders';
    await settle(2);
    expect(inp.value, '目标表单有值时预填表单值').toBe('uat-orders');
  });
});

/* ═══ ② 确认：两段式（预览无确认直发 dryRun；CTA 才走确认窗）+ facts 断言 + 取消不发执行 ═══ */
describe('结构同步：确认', () => {
  it('facts 含源索引/目标索引/覆盖语义；取消只发过预览、不发执行', async () => {
    askConfirmFn.mockResolvedValue(false);
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = 'uat-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
    await settle();
    /* 第一段：dryRun 预览直发（无确认窗），报告进弹层 */
    expect(xbSync, '预览请求已发（dryRun 无确认窗）').toHaveBeenCalledTimes(1);
    expect(xbSync.mock.calls[0][0]).toMatchObject({ dryRun: true });
    const plan = document.querySelector('[data-test="xm-sync-plan"]')!;
    expect(plan, '预览报告弹层在场').toBeTruthy();
    /* 第二段：CTA 走确认窗；取消不得发执行请求 */
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle();
    const arg = askConfirmFn.mock.calls[0][0] as any;
    expect(arg.okText).toBe('同步');
    const facts = Object.fromEntries((arg.facts || []).map((f: any) => [f.label, f.value]));
    expect(facts['源索引']).toBe('prod-orders');
    expect(facts['目标索引']).toBe('uat-orders');
    expect(facts['覆盖语义']).toContain('不会覆盖既有索引');
    expect(facts['覆盖语义']).toContain('目标已存在将失败');
    expect(arg.message).toContain('不会覆盖既有索引');
    expect(xbSync, '取消后执行不得发车').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('目标名留空时按源名同名提交；预览请求体带 sourceIndex/destIndex/conn/dryRun/syncAliases', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
    await settle();
    expect(xbSync).toHaveBeenCalledTimes(1);
    const req = xbSync.mock.calls[0][0] as any;
    expect(req.sourceIndex).toBe('prod-orders');
    expect(req.destIndex).toBe('prod-orders');
    expect(req.conn, '手输连接形态带 conn').toBeTruthy();
    expect(req.dryRun, '入口=预览（dryRun）').toBe(true);
    expect(req.syncAliases, '别名随迁开关默认关').toBe(false);
    app.unmount();
  });
});

/* ═══ ③ 成功报告渲染（两段式：预览弹层 → CTA → 确认 → 执行 inline 报告 v2 布局） ═══ */
describe('结构同步：成功报告', () => {
  it('预览弹层：vendor 芯片对+两段清单+每刀 reason+CTA；执行后 inline 报告同构', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = 'uat-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
    await settle();
    /* ── 预览弹层（teleport 到 body）：vendor 对 + planned/reactive + advice + 别名 + CTA ── */
    const plan = document.querySelector('[data-test="xm-sync-plan"]')!;
    expect(plan, '预览弹层在场').toBeTruthy();
    const vendor = plan.querySelector('[data-test="xm-plan-vendor"]')!;
    expect(vendor.textContent, '源 vendor 芯片').toContain('阿里云 ES');
    expect(vendor.textContent).toContain('7.10.2-aliyun');
    expect(vendor.textContent, '目标 vendor 芯片').toContain('腾讯云 ES');
    expect(vendor.textContent).toContain('7.14.2');
    const planned = plan.querySelector('[data-test="xm-plan-planned"]')!;
    expect(planned.textContent, '矩阵预剔除标题').toContain('矩阵预剔除');
    expect(planned.querySelector('code')!.textContent).toBe('index.apack.knn');
    expect(planned.textContent, '每刀带理由').toContain('目标集群无 apack 插件');
    const reactive = plan.querySelector('[data-test="xm-plan-reactive"]')!;
    expect(reactive.textContent, '报错兜底剔除段').toContain('报错兜底剔除');
    expect(reactive.textContent).toContain('index.apack.compress');
    expect(plan.querySelector('[data-test="xm-plan-advice"]')!.textContent).toContain('建议');
    expect(plan.querySelector('[data-test="xm-plan-advice"]')!.textContent).toContain('单分片 50GB');
    const aliases = plan.querySelector('[data-test="xm-plan-aliases"]')!;
    expect(aliases.textContent).toContain('prod-orders-write');
    expect(aliases.textContent).toContain('prod-orders-read');
    expect(document.querySelector('[data-test="xm-sync-apply"]'), 'dryRun 底部 CTA').toBeTruthy();
    /* ── CTA → 确认 → 执行（第二桩 EXEC_REPORT）→ inline 报告 ── */
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle();
    expect(xbSync).toHaveBeenCalledTimes(2);
    expect(xbSync.mock.calls[1][0]).toMatchObject({ dryRun: false });
    const rep = host.querySelector('[data-test="xm-sync-report"]')!;
    expect(rep, '执行报告 inline 在场').toBeTruthy();
    expect(rep.querySelector('.pill.g')!.textContent).toContain('结构已同步');
    const meta = rep.querySelector('.xm-sync-meta')!;
    expect(meta.textContent, '源版本→目标版本对').toContain('7.10.2-aliyun');
    expect(meta.textContent).toContain('7.14.2');
    expect(meta.textContent, 'rounds 轮收敛').toContain('轮');
    expect(rep.querySelector('[data-test="xm-sync-vendor"]')!.textContent, 'inline vendor 对').toContain('阿里云 ES');
    const sets = rep.querySelector('[data-test="xm-sync-planned"]')!;
    expect(sets.querySelector('code')!.textContent).toBe('index.apack.knn');
    expect(sets.textContent).toContain('目标集群无 apack 插件');
    expect(sets.textContent, '分析组件 kind+name+reason').toContain('my_aliws');
    expect(sets.textContent).toContain('阿里云自定义分词器在目标不可用');
    expect(sets.textContent, '降级字段 from→to').toContain('standard');
    const rc = rep.querySelector('[data-test="xm-sync-reactive"]')!;
    expect(rc.textContent).toContain('兜底剔除');
    /* 警告折叠（收起态标题在场，展开后逐条） */
    const warnsCp = rep.querySelector('[data-test="xm-sync-warnings"]')!;
    expect(warnsCp.textContent).toContain('同步警告');
    (warnsCp.querySelector('.cp-toggle') as HTMLButtonElement).click();
    await settle(2);
    expect(rep.querySelector('[data-test="xm-sync-warnings"]')!.textContent)
      .toContain('index.number_of_shards 已按目标节点数收敛为 3');
    /* 有剔除项时不显示零剔除正面态；成功后「继续迁移数据」在场 */
    expect(rep.querySelector('[data-test="xm-sync-allpass"]')).toBeNull();
    expect(rep.querySelector('[data-test="xm-sync-continue"]')).toBeTruthy();
    expect(host.querySelector('[data-test="xm-sync-err"]'), '成功无错误面板').toBeNull();
    app.unmount();
  });
});

/* ═══ ④ created=false 失败态（执行第二桩失败；预览照常成功后走 CTA） ═══ */
describe('结构同步：created=false 失败态', () => {
  it('红色失败徽标 + 未创建索引 + lastError + 已剔除清单照常展示', async () => {
    xbSync.mockReset()
      .mockResolvedValueOnce(FULL_PLAN)
      .mockResolvedValue({
        ...EXEC_REPORT, created: false,
        lastError: 'resource_already_exists_exception: index [uat-orders] already exists',
        reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
        advice: [], aliases: { skipped: [], synced: [] }, warnings: [],
      });
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = 'uat-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle();
    const rep = host.querySelector('[data-test="xm-sync-report"]')!;
    expect(rep.querySelector('.pill.r')!.textContent).toContain('同步未成功');
    const fail = rep.querySelector('[data-test="xm-sync-fail"]')!;
    expect(fail.getAttribute('role')).toBe('alert');
    expect(fail.textContent).toContain('未创建索引');
    expect(fail.textContent).toContain('resource_already_exists_exception');
    expect(rep.querySelector('[data-test="xm-sync-planned"]'), '已剔除清单照常展示').toBeTruthy();
    expect(rep.querySelector('[data-test="xm-sync-continue"]'), '失败不出继续动作').toBeNull();
    app.unmount();
  });
});

/* ═══ ⑤ 零剔除正面态 ═══ */
describe('结构同步：零剔除正面态', () => {
  it('两段清单全空：正面态文案在场，空清单区块不渲染（渐进披露）', async () => {
    const CLEAN_EXEC = {
      created: true, dryRun: false, destIndex: 'uat-orders', rounds: 1,
      source: { index: 'prod-orders', version: '7.10.0', vendor: { id: 'oss', label: '开源 ES' }, plugins: [] },
      target: { index: 'uat-orders', version: '7.10.0', vendor: { id: 'oss', label: '开源 ES' }, plugins: [] },
      planned: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
      reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
      advice: [], aliases: { skipped: [], synced: [] }, warnings: [],
    };
    xbSync.mockReset()
      .mockResolvedValueOnce({ ...CLEAN_EXEC, created: false, dryRun: true })
      .mockResolvedValue(CLEAN_EXEC);
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = 'uat-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
    await settle();
    expect(document.querySelector('[data-test="xm-plan-allpass"]')!.textContent, '预览弹层零剔除正面态')
      .toContain('全部属性兼容，计划零剔除');
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle();
    const rep = host.querySelector('[data-test="xm-sync-report"]')!;
    expect(rep.querySelector('[data-test="xm-sync-allpass"]')!.textContent)
      .toContain('全部属性兼容，未剔除任何项');
    for (const key of ['xm-sync-planned', 'xm-sync-reactive', 'xm-sync-advice', 'xm-sync-aliases', 'xm-sync-warnings']) {
      expect(rep.querySelector(`[data-test="${key}"]`), `${key} 空清单不渲染`).toBeNull();
    }
    expect(rep.querySelector('[data-test="xm-sync-continue"]')).toBeTruthy();
    app.unmount();
  });
});

/* ═══ ⑥ 错误态：浏览器 501 / 服务端 4xx-5xx ═══ */
describe('结构同步：错误态', () => {
  it('浏览器模式 501（BROWSER_MODE_UNMAPPED）：诚实呈现能力边界，不冒充报告', async () => {
    xbSync.mockReset().mockRejectedValue(Object.assign(
      new Error('浏览器模式暂未映射迁移端点：/sync-structure'), { code: 'BROWSER_MODE_UNMAPPED' }));
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = 'uat-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
    await settle();
    const err = host.querySelector('[data-test="xm-sync-err"]')!;
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('浏览器模式未映射结构同步端点');
    expect(err.textContent).toContain('未创建索引');
    expect(host.querySelector('[data-test="xm-sync-report"]'), '错误态不冒充报告').toBeNull();
  });

  it('服务端 4xx/5xx：错误全文 +「未创建索引」', async () => {
    xbSync.mockReset().mockRejectedValue(Object.assign(
      new Error('custom analyzer [my_aliws] not found'), { status: 400 }));
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = 'uat-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
    await settle();
    const err = host.querySelector('[data-test="xm-sync-err"]')!;
    expect(err.textContent).toContain('结构同步失败');
    expect(err.textContent).toContain('my_aliws');
    expect(err.textContent).toContain('未创建索引');
    expect(host.querySelector('[data-test="xm-sync-report"]')).toBeNull();
  });
});

/* ═══ ⑦ 成功后联动 ═══ */
describe('结构同步：成功后联动', () => {
  it('目标索引表单为空则回填 destIndex；「继续迁移数据」回填+toast 提示', async () => {
    const { app, host, pinia } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = '';
    await settle(2);
    (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle();
    expect(st.form.destIndex, '目标表单为空则回填').toBe('uat-orders');
    const store = useAppStore(pinia);
    expect(store.notifyLog.some(n => n.msg.includes('uat-orders') && n.msg.includes('已创建')),
      '成功 toast').toBe(true);
    (host.querySelector('[data-test="xm-sync-continue"]') as HTMLButtonElement).click();
    await settle(2);
    expect(store.notifyLog.some(n => n.msg.includes('已就绪') && n.msg.includes('uat-orders')),
      '继续迁移数据 toast 提示').toBe(true);
    app.unmount();
  });
});
