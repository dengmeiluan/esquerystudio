/**
 * R100 回归看守：粘贴期望配置时必须采用 **derivedMappingJson**（真挂载 AdhocRebuildView）。
 *
 * 为什么必须挂真组件：这条缺陷不在纯函数里，而在 `pickPaste` 往审编框写什么。
 * 业务侧实体没有 `@Mapping` 时，starter 把**注解推导**出的那份放进 payload 的
 * `derivedMappingJson` —— 它才是重建实际会应用的 mapping
 * （`IndexNameResolver.resolveMappingJson` 第②级）。宿主 没有接入方的实体类、
 * 无法自己推导，只能用这份。
 *
 * 不读它的后果（改造前的真实行为）：这里退化成「没有 mapping」，界面还告诉人
 * 「将由 ES 动态推断」，而重建实际会应用推导那份 —— 界面与行为对不上。
 *
 * 两处 DOM 分属不同步骤，测试须据此取值：
 *   step 0 —— 粘贴区（`.ar-paste`），提示文案在这里
 *   step 1 —— 审编区（`.editors`），mapping 文本框与来源标记在这里
 * 推进到 step 1 会经过 `doPrepare`，而它对粘贴流是**不覆盖**的（`pasteIdx >= 0` 时跳过预填），
 * 所以「推导那份能活着穿过 prepare」也一并被这几条钉住了。
 *
 * 断言取编辑器挂载面的实际内容与文案，不读组件内部 ref：
 * 读 ref 等于把实现再抄一遍，模板/赋值写错时照样绿。
 * （ux2 Task 10：审编框 JsonArea 内核升级 Monaco——内容改从 stub cap 响应式 props 现调现读，
 *   与「编辑器实际拿到的值」等价；min(200px,24vh) pasteRaw 钉特征不撞（w80:原 130px），
 *   审编框按挂载序 settings→mapping）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 业务侧 @Mapping 原文（有声明时用它） */
const DECLARED = { properties: { declaredField: { type: 'keyword' } } };
/** 注解推导出的 mapping（无 @Mapping 时用它） */
const DERIVED = { properties: { derivedField: { type: 'keyword' } } };
/** 源索引现状 —— 一旦它出现在审编框，就说明粘贴来的那份被冲掉了 */
const ACTUAL_FROM_ES = { properties: { fromOldIndex: { type: 'text' } } };

const prepareFn = vi.fn(async () => ({
  index: 'r100_stub', isAlias: true, physicals: ['r100_stub_v1'],
  sourcePhysical: 'r100_stub_v1', docCount: 1,
  settingsJson: '{"index":{"number_of_replicas":1}}',
  mappingJson: JSON.stringify(ACTUAL_FROM_ES),
  suggestedDest: 'r100_stub_v2', timeFieldCandidates: [],
}));

/* 只替换网络出口，其余（store / 工具函数 / 组件）全用真的 */
vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      adhoc: { ...orig.api.adhoc, prepare: prepareFn, jobs: vi.fn(async () => []) },
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

  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(View) });
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

  /** 在 step 0 粘贴一份期望配置并 pick */
  const paste = async (row: Record<string, unknown>) => {
    /* ux2 Task 9：pasteRaw 换 Monaco——驱动迁移 stub cap emit（同 adhocDiffWiring 形态；
       w80:130px 定高→min(200px,24vh) 弹性档同步更新；五百三十一批再升 min(60vh,420px) 大粘贴档；
       五百三十八批升四档 useTierCycle 循环——默认档=原 min(60vh, 420px) 保底，cap 寻址按
       默认档 DOM 值同步更新；档值数组+接线源码锚在 rebuildFlat534 高度档用例） */
    const cap = monacoCaps.find(c => c.props.height === 'min(60vh, 420px)');
    expect(cap, 'pasteRaw Monaco（默认档 min(60vh, 420px)）必须在位').toBeTruthy();
    cap!.emit('update:modelValue', JSON.stringify({
      indexKey: 'r100Stub', alias: 'r100_stub',
      settingsJson: '{"index":{"number_of_replicas":1}}',
      ...row,
    }));
    await nextTick();
    await click(/预填|应用|解析|载入|确定/, host.querySelector('.ar-paste')!);
  };

  /** 推进到审编步（.editors 所在的卡片） */
  const gotoEditors = async () => {
    const idx = host.querySelector('.ixp-inp') as HTMLInputElement | null;
    if (idx) { idx.value = 'r100_stub'; idx.dispatchEvent(new Event('input')); await nextTick(); }
    await click(/探测/);
    await click(/下一步：审阅/);
  };

  /** 审编框里 mapping 的实际内容（Monaco stub cap 响应式 props）。.editors 下顺序为 settings、mapping
   *  （554 同步更新：rows=14→282px 与 fill→'100%' 两形态随高度档退役——四框改 adhoc.edH rows 驱动，
   *  默认 16 档 → height=16*19+16=320px） */
  const mappingBox = () => {
    const caps = monacoCaps.filter(c => c.props.height === '320px');
    return caps.length >= 2 ? caps[1].props.modelValue : null;
  };
  /* 五百五十二批同步更新：注解推导徽标改用 StatusPill（私造类退役），存在性判据改 pill 文本寻址 */
  const derivedTag = () =>
    Array.from(host.querySelectorAll('.pill')).find(p => (p.textContent || '').includes('来自注解推导')) || null;
  const warnText = () => (host.querySelector('.ar-paste-warn') as HTMLElement | null)?.textContent || '';

  return { host, paste, gotoEditors, mappingBox, derivedTag, warnText };
}

beforeEach(() => {
  document.body.innerHTML = '';
  monacoCaps.length = 0;
  /* Task 4：向导 step 现落 sessionStorage，跨用例保留。前一条推进 step 后，
     下一条挂载会从复原值起步、step===0 的粘贴框不渲染。清干净保证从起点开始。 */
  sessionStorage.clear();
  prepareFn.mockClear();
});

describe('R100 粘贴期望配置采用 derivedMappingJson', () => {
  /* 到位判据独立于本 Task 的断言：否则「没走到审编步」与「走到了但没采用推导」
     会混成同一条红。 */
  it('前置：粘贴 → 探测 → 下一步：审阅 能到达审编步', async () => {
    const { paste, gotoEditors, mappingBox } = await mountWizard();
    await paste({ mappingJson: JSON.stringify(DECLARED) });
    await gotoEditors();

    expect(mappingBox()).not.toBeNull();
  });

  /**
   * 核心判据：无 @Mapping 但有推导时，审编框必须装推导那份。
   *
   * 三条断言各有分工：contains(derivedField) 证明用了推导；
   * not.contains(fromOldIndex) 证明没被源索引现状冲掉；
   * derivedTag 非空证明界面标明了来源（否则人不知道这份不是业务侧写的）。
   */
  it('无 @Mapping 但有 derivedMappingJson → 审编框装推导那份，并标明来源', async () => {
    const { paste, gotoEditors, mappingBox, derivedTag } = await mountWizard();
    await paste({ mappingJson: null, derivedMappingJson: JSON.stringify(DERIVED) });
    await gotoEditors();

    expect(mappingBox()).toContain('derivedField');
    expect(mappingBox()).not.toContain('fromOldIndex');
    expect(derivedTag()).not.toBeNull();
  });

  /** 提示文案必须说清来源，且不许再说「将由 ES 动态推断」——对这一态那是假话。 */
  it('无 @Mapping 但有推导 → 提示说明来自注解推导，不再声称 ES 动态推断', async () => {
    const { paste, warnText } = await mountWizard();
    await paste({ mappingJson: null, derivedMappingJson: JSON.stringify(DERIVED) });

    expect(warnText()).toContain('注解推导');
    expect(warnText()).not.toContain('ES 动态推断');
  });

  /** 有 @Mapping 时以它为准，不许被推导覆盖，也不该打「来自注解推导」的标。 */
  it('有 @Mapping → 用 @Mapping 原文，推导那份不参与', async () => {
    const { paste, gotoEditors, mappingBox, derivedTag } = await mountWizard();
    await paste({
      mappingJson: JSON.stringify(DECLARED),
      derivedMappingJson: JSON.stringify(DERIVED),
    });
    await gotoEditors();

    expect(mappingBox()).toContain('declaredField');
    expect(mappingBox()).not.toContain('derivedField');
    expect(derivedTag()).toBeNull();
  });

  /** 两者皆空才是真的「将由 ES 动态推断」——原有告警必须保留。 */
  it('两者皆空 → 保留 ES 动态推断告警，审编框为空', async () => {
    const { paste, gotoEditors, mappingBox, warnText, derivedTag } = await mountWizard();
    await paste({ mappingJson: null, derivedMappingJson: null });

    expect(warnText()).toContain('ES 动态推断');

    await gotoEditors();
    expect(mappingBox()).toBe('');
    expect(derivedTag()).toBeNull();
  });
});
