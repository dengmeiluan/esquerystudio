/**
 * 直连重建的成员别名安全门（前端接线，真挂载 AdhocRebuildView）：
 * 删除物理索引会连带断开其所属别名的成员关系，业务侧查询将失效——源物理索引还是
 * 别名成员时，向导必须在探测现场给出常驻红字警示，并提供「一键改用别名入口」的
 * 纠正路径（chip 点击换名重探）。服务端 start 另有硬拒兜底（AdhocMemberAliasGuardTest）。
 *
 * 断言取真实 DOM（不读组件内部 ref）：读 ref 等于把实现再抄一遍，模板 v-if 写错时照样绿。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const PHYS = 'qa_bond_basic_adhoc_20260806134223';
const BIZ_ALIAS = 'qa_onshore-bond-basic_bond_basic_asset_basic_info';

/* 探测出口按输入名出桩：物理索引=直连+挂业务别名；别名=原子切换形态 */
const prepareFn = vi.fn(async (index: string) => {
  if (index === BIZ_ALIAS) {
    return {
      index: BIZ_ALIAS, isAlias: true, physicals: [PHYS], memberAliases: [BIZ_ALIAS],
      sourcePhysical: PHYS, docCount: 7,
      settingsJson: '{"index":{"number_of_replicas":1}}',
      mappingJson: '{"properties":{"created_at":{"type":"date"}}}',
      suggestedDest: 'qa_bond_basic_adhoc_x2', timeFieldCandidates: [{ field: 'created_at', type: 'date' }],
    };
  }
  return {
    index: PHYS, isAlias: false, physicals: [], memberAliases: [BIZ_ALIAS, 'qa_extra_alias'],
    sourcePhysical: PHYS, docCount: 7,
    settingsJson: '{"index":{"number_of_replicas":1}}',
    mappingJson: '{"properties":{"created_at":{"type":"date"}}}',
    suggestedDest: 'qa_bond_basic_adhoc_x2', timeFieldCandidates: [{ field: 'created_at', type: 'date' }],
  };
});
const jobsFn = vi.fn(async () => [] as any[]);

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      adhoc: { ...orig.api.adhoc, prepare: prepareFn, jobs: jobsFn },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub"></div>',
  },
}));

async function mountWizard() {
  const { createApp, h, nextTick } = await import('vue');
  const { createPinia, setActivePinia } = await import('pinia');
  const { useAppStore } = await import('../stores/app');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const View = (await import('../views/AdhocRebuildView.vue')).default;
  const pinia = createPinia();
  setActivePinia(pinia);
  const appStore = useAppStore();
  appStore.setTarget('', 'host');
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(View) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  const settle = async () => { await new Promise(r => setTimeout(r, 30)); await nextTick(); };
  const click = async (re: RegExp) => {
    const b = [...host.querySelectorAll('button')]
      .find(x => re.test(x.textContent || '')) as HTMLButtonElement | undefined;
    b?.click();
    await settle();
    return !!b;
  };
  /** 输入索引名并点「探测」——驱动真实 doPrepare 链 */
  const probe = async (name: string) => {
    const idx = host.querySelector('.ixp-inp') as HTMLInputElement | null;
    if (idx) { idx.value = name; idx.dispatchEvent(new Event('input')); await nextTick(); }
    await click(/探测/);
  };
  const warnBar = () => [...host.querySelectorAll('.ar-dest-err')].map(e => e.textContent || '');
  /** 所属别名行的 chips（真实 DOM：行文本以「所属别名」开头） */
  const aliasChips = () => {
    const row = [...host.querySelectorAll('.probe .p-row')]
      .find(r => (r.textContent || '').includes('所属别名'));
    return row ? [...row.querySelectorAll('button.ar-tf-chip')].map(b => (b.textContent || '').trim()) : [];
  };
  return { app, host, probe, click, warnBar, aliasChips, settle };
}

beforeEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
  localStorage.removeItem('es_picked');
  prepareFn.mockClear();
});

describe('直连重建的成员别名安全门（向导侧）', () => {
  it('直连物理索引挂在别名下：红字警示条常驻（点名别名与 404 后果），所属别名 chips 在场', async () => {
    const { host, probe, warnBar, aliasChips } = await mountWizard();
    await probe(PHYS);

    expect(warnBar().join('\n'), '警示条必须点名成员别名并说明业务 404 后果')
      .toContain(BIZ_ALIAS);
    expect(warnBar().join('\n')).toContain('直连重建会删除它并断开这些别名');
    expect(warnBar().join('\n')).toContain('404');
    expect(aliasChips(), '所属别名行须渲染全部成员别名 chip').toEqual([BIZ_ALIAS, 'qa_extra_alias']);
    expect(host.querySelector('.probe .p-row .warn-txt')?.textContent || '', '形态行仍标注直连物理索引')
      .toContain('直连物理索引');
  });

  it('别名 chip 一键换入口：点击后索引名换成该别名并自动重新探测（警示条随新形态消失）', async () => {
    const { host, probe, warnBar, aliasChips, settle } = await mountWizard();
    await probe(PHYS);
    expect(warnBar().length, '前置构造校验：直连形态警示条必须在场').toBeGreaterThan(0);

    const chip = [...host.querySelectorAll('button.ar-tf-chip')]
      .find(b => (b.textContent || '').trim() === BIZ_ALIAS) as HTMLButtonElement;
    expect(chip, '前置构造校验：业务别名 chip 必须在场').toBeTruthy();
    chip.click();
    await settle();

    expect(prepareFn.mock.calls[prepareFn.mock.calls.length - 1]?.[0],
      'chip 点击必须把索引名换成该别名并重新探测').toBe(BIZ_ALIAS);
    expect(warnBar(), '别名形态（原子切换不动成员）不得再渲染直连警示条').toEqual([]);
    expect((host.querySelector('.ixp-inp') as HTMLInputElement)?.value,
      '输入框同步换成别名名，续走流程不再以物理索引为入口').toBe(BIZ_ALIAS);
    expect(aliasChips(), '别名形态下所属别名行仍渲染（信息展示）').toEqual([BIZ_ALIAS]);
  });

  it('memberAliases 为空：警示条与所属别名行都不渲染（零噪音）', async () => {
    prepareFn.mockImplementation(async () => ({
      index: 'plain_idx', isAlias: false, physicals: [], memberAliases: [],
      sourcePhysical: 'plain_idx', docCount: 0,
      settingsJson: '{"index":{}}', mappingJson: '{"properties":{}}',
      suggestedDest: 'plain_idx_adhoc_x', timeFieldCandidates: [],
    }));
    const { host, probe, warnBar, aliasChips } = await mountWizard();
    await probe('plain_idx');

    expect(warnBar(), '无成员别名的直连索引不渲染成员别名警示条').toEqual([]);
    expect(host.textContent || '', '「所属别名」行整体不渲染').not.toContain('所属别名');
    expect(aliasChips()).toEqual([]);
  });
});
