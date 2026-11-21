/**
 * 缺陷 #68 回归看守：`.ar-diff` 的**渲染接线**（真挂载 AdhocRebuildView）。
 *
 * 为什么必须挂真组件：#68 的两个成因都不在纯函数里。
 *   主因（e2e 侧）：`.ar-diff` 位于 `v-if="step === 2"` 卡片内，而 step 2 只能由
 *     doValidateConfig(true) 推进；剧本少点一次按钮，0 行量的是「没走到」。
 *   次因（产品侧）：cfgDiff 原本只在 doPrepare 里被赋值一次，
 *     「先探测、后粘贴」这个自然顺序恒不出行且界面零提示。
 * diffConfig 的 61 条单测全绿而界面 0 行 —— 纯函数层照不到这一层，故本文件存在。
 *
 * 断言取「真实 DOM 里出现的行」，不取组件内部 ref：读 ref 等于把实现再抄一遍，
 * 模板 v-if 写错时照样绿。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 实际侧（ES 读回）：有 keepSame 与 onlyActual */
const ACTUAL = { properties: { keepSame: { type: 'keyword' }, onlyActual: { type: 'long' } } };
/** 期望侧（业务粘贴）：有 keepSame 与 onlyExpected。刻意与实际侧**同时**产出 added 与 removed */
const EXPECT = { properties: { keepSame: { type: 'keyword' }, onlyExpected: { type: 'keyword' } } };

const prepareFn = vi.fn(async () => ({
  index: 'diffStub', isAlias: true, physicals: ['diff_stub_v1'],
  sourcePhysical: 'diff_stub_v1', docCount: 3,
  settingsJson: '{"index":{"number_of_replicas":1}}',
  mappingJson: JSON.stringify(ACTUAL),
  suggestedDest: 'diff_stub_v2', timeFieldCandidates: [],
}));
const validateFn = vi.fn(async () => ({ valid: true, dryRunPassed: true, issues: [] }));

/* Task 5：终态视图的真实注入通道就是这两个出口。
   job 的唯一真实来源是 watchJob(jobId)→api.adhoc.status（798 行），而 watchJob 的真实
   触发点是「历史作业」卡片里那颗「查看详情」按钮；该卡片又由 onMounted→loadJobs→api.adhoc.jobs
   （793/898 行）喂数据。故要让 job 走真响应链落到指定状态，只需：jobsFn 返回一条作业行让卡片
   渲染出来，statusFn 决定点开后 job.value 的终态。全程不碰组件内部 ref。 */
const statusFn = vi.fn(async (jobId: string) => ({ jobId, status: 'RUNNING' }));
const jobsFn = vi.fn(async () => [] as any[]);

/* 只替换网络出口，其余（store / 工具函数 / 组件）全用真的 */
vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      adhoc: { ...orig.api.adhoc, prepare: prepareFn, status: statusFn, jobs: jobsFn },
      configLab: { ...orig.api.configLab, validate: validateFn },
    },
  };
});

/* ux2 Task 9：pasteRaw 换 Monaco——caps 捕获供粘贴驱动（setup 闭包迟引用 monacoCaps，无 TDZ） */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

async function mountWizard() {
  const { createApp, h, nextTick } = await import('vue');
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const View = (await import('../views/AdhocRebuildView.vue')).default;

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();

  let app: any;
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();

  const settle = async () => { await new Promise(r => setTimeout(r, 30)); await nextTick(); };
  const click = async (re: RegExp, scope: ParentNode = host) => {
    const b = [...scope.querySelectorAll('button')]
      .find(x => re.test(x.textContent || '')) as HTMLButtonElement | undefined;
    b?.click();
    await settle();
    return !!b;
  };

  /** 粘贴一份期望配置并 pick */
  const paste = async (mappingJson: string | null) => {
    /* ux2 Task 9：pasteRaw 换 Monaco——驱动迁移 stub cap emit（w80:130px 定高→min(200px,24vh)
       弹性档同步更新；531 批升 min(60vh, 420px) 视口弹性档同步更新；JsonArea 触点 Task 10 才换） */
    const cap = monacoCaps.find(c => c.props.height === 'min(60vh, 420px)');
    expect(cap, 'pasteRaw Monaco（min(60vh, 420px)）必须在位').toBeTruthy();
    cap!.emit('update:modelValue', JSON.stringify({
      indexKey: 'diffStub', alias: 'diff_stub',
      settingsJson: '{"index":{"number_of_replicas":1}}', mappingJson,
    }));
    await nextTick();
    await click(/预填|应用|解析|载入|确定/, host.querySelector('.ar-paste')!);
  };

  const probe = async () => {
    const idx = host.querySelector('.ixp-inp') as HTMLInputElement | null;
    if (idx) { idx.value = 'diffStub'; idx.dispatchEvent(new Event('input')); await nextTick(); }
    await click(/探测/);
  };

  /** 推进到策略步（.ar-diff 所在的卡片） */
  const gotoStrategy = async () => {
    await click(/下一步：审阅/);
    await click(/校验并继续/);
  };

  /** 真实 DOM 里的 diff 行 */
  const diffRows = () => [...host.querySelectorAll('.ar-diff tbody tr')].map(tr => ({
    cls: tr.className,
    kind: (tr.querySelector('td.cd-kind') as HTMLElement | null)?.textContent?.trim() || '',
    hint: (tr.querySelector('.cd-hint') as HTMLElement | null)?.textContent?.trim() || '',
  }));

  /** 走真实响应链打开一条作业的终态视图：
      前提是测试已在挂载前用 seedJob(status) 把 jobsFn/statusFn 配好，
      于是 onMounted→loadJobs 已把历史作业卡片连同「查看详情」按钮渲染出来。
      这里只做真实用户动作——点该行的 Eye 按钮，触发 watchJob(jobId)
      （step→4 + api.adhoc.status 回填 job.value）。全程不碰组件内部 ref。 */
  const openJob = async (jobId = 'test-job') => {
    /* 五百二十九批 W-B 同步更新：最近作业表换 QRT rows 壳（table.qrt-tbl）——行选择器同步更新，
       「找到含 jobId 的行 → 点查看详情（Eye）」语义与断言不变（table.tbl 仍归轮次表）。 */
    const rows = [...host.querySelectorAll('table.tbl tbody tr, table.qrt-tbl tbody tr')];
    const row = rows.find(tr => (tr.textContent || '').includes(jobId));
    (row?.querySelector('button[title="查看任务详情"]') as HTMLButtonElement | undefined)?.click();
    await settle();
    return !!row;
  };

  return { app, host, paste, probe, gotoStrategy, diffRows, openJob };
}

/** 在挂载前把作业列表出口与状态出口配好，让 onMounted→loadJobs 直接把这条作业
    渲染进历史卡片。status 即点开后 watchJob 回填的目标状态（终态/非终态皆可）。 */
function seedJob(status: string, jobId = 'test-job') {
  statusFn.mockImplementation(async (id: string) => ({ jobId: id, status }));
  jobsFn.mockImplementation(async () => [
    { jobId, logicalName: 'diffStub', strategy: 'WRITE_BLOCK', status, stage: '', startedAt: Date.now() },
  ]);
}

beforeEach(() => {
  document.body.innerHTML = '';
  monacoCaps.length = 0;
  /* Task 4：向导 step 现落 sessionStorage。本文件多条用例会把 step 推进到策略步，
     不清 sessionStorage 时下一条挂载会从复原值（非 0）起步，step===0 的粘贴框（Monaco stub）便不渲染。清干净以保证每条从流程起点开始。 */
  sessionStorage.clear();
  prepareFn.mockClear();
  validateFn.mockClear();
  /* Task 5：复位两个 job 出口回默认（空列表 / RUNNING），避免用例间串味。
     seedJob() 会在需要的用例里重设 mockImplementation。 */
  statusFn.mockReset();
  statusFn.mockImplementation(async (jobId: string) => ({ jobId, status: 'RUNNING' }));
  jobsFn.mockReset();
  jobsFn.mockImplementation(async () => []);
});

describe('#68 .ar-diff 渲染接线', () => {
  /* 到位判据独立于 .ar-diff 自身：否则「没走到策略步」与「走到了但没渲染」
     会混成同一条红，而 #68 恰恰是因为这两者混同才被误判成接线缺陷。 */
  it('前置：探测 → 审阅 → 校验并继续 能到达策略步', { timeout: 30000 }, async () => {
    const { host, paste, probe, gotoStrategy } = await mountWizard();
    await paste(JSON.stringify(EXPECT));
    await probe();
    await gotoStrategy();
    expect(host.querySelector('.ahr .strats')).not.toBeNull();
  });

  /* 主断言。防的失败模式：cfgDiff 又退回成「只在某个调用点赋值一次」的可写状态，
     或模板 v-if 被改写 —— 两者都会让这里回到 0 行。 */
  it.each([
    ['先粘贴、后探测', async (h: any) => { await h.paste(JSON.stringify(EXPECT)); await h.probe(); }],
    ['先探测、后粘贴', async (h: any) => { await h.probe(); await h.paste(JSON.stringify(EXPECT)); }],
  ])('%s —— 两侧输入齐备即出行，顺序不影响结果', { timeout: 30000 }, async (_name, drive) => {
    const h = await mountWizard();
    await drive(h);
    await h.gotoStrategy();
    const rows = h.diffRows();
    expect(rows.length).toBeGreaterThan(0);

    /* kindLabel 真被调用：列里是人话，不是 raw 枚举 */
    expect(rows.some(r => /^(added|removed|changed|same|ignored|conflict)$/.test(r.kind))).toBe(false);

    /* fixture 同时产出两种行；只有一种时标签对调测不出来 */
    const added = rows.find(r => /cd-added/.test(r.cls));
    const removed = rows.find(r => /cd-removed/.test(r.cls));
    expect(added, 'fixture 应产出 added 行').toBeDefined();
    expect(removed, 'fixture 应产出 removed 行').toBeDefined();
    expect(added!.kind).toBe('期望有，实际没有');
    expect(removed!.kind).toBe('实际有，期望没有');

    /* 挂载点：补充说明只挂 added（控制者写反过一次的那处语义） */
    expect(added!.hint.length).toBeGreaterThan(0);
    expect(removed!.hint.length).toBe(0);
  });

  /* C-1 不许因 #68 的派生化而复发：mappingJson 这个框在未粘贴时会被 doPrepare
     写入**源索引现状**。若拿它当期望，覆盖后期望==实际，会渲染一屏假 same ——
     用户没提供任何期望，界面却报「完全一致」。故期望必须另存一份。 */
  it('完全不粘贴：预填不得冒充期望，不出任何行', async () => {
    const h = await mountWizard();
    await h.probe();
    await h.gotoStrategy();
    expect(h.diffRows()).toHaveLength(0);
  });

  /* Task 4 的 null 透传路径（e2e 5-4 在跑）：粘了，但该索引 mappingJson 为 null。
     期望仍是「缺席」，不得拿 {} 去比而产出满屏假 removed。 */
  it('粘贴了但 mappingJson 为 null：期望仍缺席，不出行', async () => {
    const h = await mountWizard();
    await h.paste(null);
    await h.probe();
    await h.gotoStrategy();
    expect(h.diffRows()).toHaveLength(0);
  });

  /* 1205：差异行右键——真挂载、真 contextmenu，不是源码锁。
     此前这张表只能看不能取：用户要从差异行拿路径/值去改注解或贴工单。 */
  it('差异行右键：开菜单、标题带路径、一级只留高频复制、二级才见低频项', async () => {
    const h = await mountWizard();
    await h.paste(JSON.stringify(EXPECT));
    await h.probe();
    await h.gotoStrategy();
    const tr = h.host.querySelector('.ar-diff tbody tr.cd-real') as HTMLElement;
    expect(tr, '前置：差异表必须有真差异行').toBeTruthy();
    const path = (tr.querySelector('td.cd-path') as HTMLElement).textContent!.trim();

    tr.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }));
    await new Promise(r => setTimeout(r, 40));

    const mask = document.querySelector('.ccm-mask');
    expect(mask, '右键必须开出 CellContextMenu').toBeTruthy();
    expect((mask!.querySelector('.ccm-hd') as HTMLElement)?.textContent || '')
      .toContain(path);

    const top = [...mask!.querySelectorAll(':scope > .ccm > .ccm-it')].map(b => (b.textContent || '').trim());
    /* 一级：高频两项 + 一个分组父行，不把动作平铺 */
    expect(top).toEqual(['复制路径', '复制整行（TSV，可直接贴表格）', '复制…']);
    /* 分组项是父行（aria-haspopup），点开才出二级 —— 平铺会让一级重新变长 */
    const parent = [...mask!.querySelectorAll('.ccm-it')]
      .find(b => (b.textContent || '').trim() === '复制…') as HTMLButtonElement;
    expect(parent.getAttribute('aria-haspopup')).toBe('menu');
    parent.click();
    await new Promise(r => setTimeout(r, 40));
    const sub = [...mask!.querySelectorAll('.ccm-sub .ccm-it')].map(b => (b.textContent || '').trim());
    expect(sub).toContain('复制期望值 JSON');
    expect(sub).toContain('复制实际值 JSON');
  });
});

/**
 * Task 3 分区渲染接线（真挂载 AdhocRebuildView）。
 *
 * 为什么仍要挂真组件、不测 partitionDiffRows 本身：分区纯函数已有单测，本文件
 * 唯一新增职责是「模板真的按 real/benign 两区渲染，且噪声默认折叠」——
 * 这一层照不到纯函数，只有真实 DOM 能钉死：模板若退回全平铺（一个 v-for cfgDiff），
 * .cd-real 就会把 benign 行一并算进去，行数不再等于真差异数。
 *
 * fixture 精心构造成 2 真差异 + 3 等价噪声：
 *   期望侧 keepField 声明 norms/doc_values/index=各自类型默认值 → ES 不回报 → 3 条 benign added；
 *   期望侧 expectOnly.type（叶子 type，非默认名）→ 1 条真 added；
 *   实际侧 esOnly（期望没有）→ 1 条真 removed。
 * keepField.type 两侧一致 → same，被 partition 跳过，不进任何一区。
 */
describe('Task 3 diff 表分区渲染', () => {
  /** 实际侧（ES 读回）：keepField 只回报 type，另有期望侧没有的 esOnly */
  const ACTUAL_LOCAL = {
    properties: { keepField: { type: 'keyword' }, esOnly: { type: 'long' } },
  };
  /** 期望侧（粘贴）：keepField 显式声明 3 个等于 ES 默认值的属性（→3 噪声），
      外加期望独有的 expectOnly（→1 真 added）；连同 esOnly（→1 真 removed）共 2 真差异 */
  const EXPECT_LOCAL = {
    properties: {
      keepField: { type: 'keyword', norms: true, doc_values: true, index: true },
      expectOnly: { type: 'text' },
    },
  };

  const overridePrepare = () => {
    /* w80 同步更新：pickPaste 粘贴成功即自动 doPrepare（幂等游标防重复）——原 mockResolvedValueOnce
       会被自动探测消耗掉、手动「探测」回落默认实现（ACTUAL），分区断言的 fixture 侧随之失真；
       改挂持续 implementation，自动/手动两条探测路径同源同值 */
    prepareFn.mockReset();
    prepareFn.mockImplementation(async () => ({
      index: 'diffStub', isAlias: true, physicals: ['diff_stub_v1'],
      sourcePhysical: 'diff_stub_v1', docCount: 3,
      settingsJson: '{"index":{"number_of_replicas":1}}',
      mappingJson: JSON.stringify(ACTUAL_LOCAL),
      suggestedDest: 'diff_stub_v2', timeFieldCandidates: [],
    }));
  };

  it('真差异区展开=真差异数；噪声默认折叠不入 DOM；折叠条文案含项数', async () => {
    const h = await mountWizard();
    overridePrepare();
    await h.paste(JSON.stringify(EXPECT_LOCAL));
    await h.probe();
    await h.gotoStrategy();

    /* ① 真差异区行数 = 真差异数（2）。全平铺退化时此处会变成 5（含 3 噪声）而转红。 */
    expect(h.host.querySelectorAll('.cd-real').length).toBe(2);

    /* ② 噪声默认折叠：benignOpen=false，.cd-benign 不进 DOM。 */
    expect(h.host.querySelectorAll('.cd-benign').length).toBe(0);

    /* ③ 折叠条存在且文案含「项已知等价默认值」，项数为 3。 */
    const toggle = h.host.querySelector('.cd-benign-toggle') as HTMLElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle!.textContent || '').toContain('项已知等价默认值');
    expect(toggle!.textContent || '').toContain('3');
  });

  it('点击折叠条后噪声区展开进入 DOM', async () => {
    const h = await mountWizard();
    overridePrepare();
    await h.paste(JSON.stringify(EXPECT_LOCAL));
    await h.probe();
    await h.gotoStrategy();

    const toggle = h.host.querySelector('.cd-benign-toggle') as HTMLElement;
    toggle.click();
    await new Promise(r => setTimeout(r, 5));
    const { nextTick } = await import('vue');
    await nextTick();

    expect(h.host.querySelectorAll('.cd-benign').length).toBe(3);
  });
});

/**
 * Task 5 终态任务只读视图。
 *
 * 终态判定：job.status 为 SUCCEEDED/DONE/FAILED/ABORTED 时，向导锁死成只读：
 *   - step 条点击前面步骤无效（step 不变）
 *   - 无"上一步"/"下一步"操作按钮（只留"返回列表"类导航）
 */
describe('Task 5 终态任务只读视图', () => {
  /* 本文件既定原则（11-12 行）：断言取真实 DOM、注入走真响应链。
     job 的唯一真实来源是 watchJob→api.adhoc.status；watchJob 的真实触发点是
     「历史作业」卡片里的「查看详情」按钮，卡片本身由 onMounted→loadJobs→api.adhoc.jobs
     喂数据。故 seedJob(status) 在挂载前配好两个出口，openJob() 只做真实点击，
     step→4 与 job 状态全由生产代码自己落定——不写 vm.job / vm.step。 */
  it('终态任务:step 条锁死、无操作按钮', async () => {
    seedJob('SUCCEEDED');
    const { host, openJob } = await mountWizard();
    expect(await openJob(), '历史作业卡片应渲染出该作业行').toBe(true);

    const steps = host.querySelectorAll('.steps .step');
    // watchJob 真实把 step 推到 4（执行监控步），且 job 终态 → isTerminal 恒真
    const beforeStep = [...steps].findIndex(s => s.className.includes('act'));
    expect(beforeStep, 'watchJob 应把 step 推进到终态展示步(4)').toBe(4);

    // 真实点击前面的步骤：终态守卫 !isTerminal 应拦住，step 不变
    (steps[2] as HTMLElement).click();
    await new Promise(r => setTimeout(r, 30));
    const afterStep = [...host.querySelectorAll('.steps .step')].findIndex(s => s.className.includes('act'));
    expect(afterStep, '终态下点 step 条应被锁死，step 不回退').toBe(beforeStep);

    // 终态后无"上一步"/"下一步"操作按钮
    const btns = [...host.querySelectorAll('button')].map(b => b.textContent || '');
    expect(btns.some(t => /上一步|下一步/.test(t))).toBe(false);
  });

  it('非终态(RUNNING):回退仍可用、操作按钮在', async () => {
    seedJob('RUNNING');
    const { app, host, openJob } = await mountWizard();
    expect(await openJob(), '历史作业卡片应渲染出该作业行').toBe(true);

    const steps = host.querySelectorAll('.steps .step');
    // watchJob 同样把 step 推到 4，但 RUNNING 非终态 → isTerminal 为 false
    expect([...steps].findIndex(s => s.className.includes('act')), 'watchJob 应把 step 推进到 4').toBe(4);

    // 真实点击回退到 step 0：非终态守卫放行（i < step 成立）→ step 变 0
    (steps[0] as HTMLElement).click();
    await new Promise(r => setTimeout(r, 30));
    const newStep = [...host.querySelectorAll('.steps .step')].findIndex(s => s.className.includes('act'));
    expect(newStep, '非终态下 step 条回退应生效').toBe(0);

    // 卸载以停掉 RUNNING 触发的真实轮询 setInterval（onBeforeUnmount→stopPolling）
    app.unmount();
  });
});
