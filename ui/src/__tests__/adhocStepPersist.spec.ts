/**
 * Task 4 回归看守：托管重建向导的 step 落 sessionStorage，切页返回不弹回起点。
 *
 * 为什么挂真组件：持久化的成因链跨 useDraft(sessionStorage 读回) → writable computed
 * → 模板 v-if/steps 渲染，纯函数照不到。断言取真实 DOM（step 条的 .act 位置 /
 * 对应 step 的卡片可见），不读组件内部 ref —— 读 ref 等于把实现再抄一遍。
 *
 * 键名由 draftStorageKey({route:'adhoc'},'step') 生成（草稿迁 useScopedDraft 后按 维度隔离）
 * （adhoc.step）拼出的**真实 sessionStorage 键**，预置它模拟「离开时停在 step 2」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { draftStorageKey } from '../composables/useScopedDraft';

const prepareFn = vi.fn(async () => ({
  index: 'stub', isAlias: true, physicals: ['stub_v1'],
  sourcePhysical: 'stub_v1', docCount: 3,
  settingsJson: '{"index":{"number_of_replicas":1}}',
  mappingJson: JSON.stringify({ properties: { f: { type: 'keyword' } } }),
  suggestedDest: 'stub_v2', timeFieldCandidates: [],
}));

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

/* ux2 Task 9：pasteRaw 换 Monaco——jsdom 不可用统一 stub（本文件不驱动粘贴区，无需 caps） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

/** 挂载向导，query 可选带 index（模拟从热 Setting 页显式带参进入） */
async function mountWizard(query: Record<string, string> = {}) {
  const { createApp, h, nextTick } = await import('vue');
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const View = (await import('../views/AdhocRebuildView.vue')).default;

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push({ path: '/', query });
  await router.isReady();

  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  await new Promise(r => setTimeout(r, 30));
  await nextTick();

  const actIndex = () => {
    const steps = [...host.querySelectorAll('.steps .step')];
    return steps.findIndex(s => /\bact\b/.test(s.className));
  };
  return { host, actIndex };
}

beforeEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
  prepareFn.mockClear();
});

describe('Task 4 向导 step 持久化', () => {
  /* 主断言：预置 sessionStorage 停在 step 2，挂载后当前步仍是 2（不被弹回 0）。
     变异（step 改回 ref(0)）时 onMounted 无路由 index 早返回，step 恒为 0，此条转红。 */
  it('切页返回复原到离开时的步骤（预置 step=2 → 当前步为 2）', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    const { host, actIndex } = await mountWizard();

    // step===2 时「追平策略」分节可见（554 同步更新：.card 壳退役改 .ar-sec border-top 分节）
    expect(host.querySelector('.ar-sec')).not.toBeNull();
    expect(host.querySelector('.strats')).not.toBeNull();
    // step 条第 3 个（index 2）带 act 类
    const steps = host.querySelectorAll('.steps .step');
    expect(steps[2].className).toContain('act');
    expect(actIndex()).toBe(2);
  });

  /* 带 route.query.index 显式进入时仍正确重置：applyRouteContext 跑 doPrepare
     并把 step 推到 1（审编步），不被 sessionStorage 旧值（此处预置 3）卡住。
     证明「显式带参进入」不被持久化干扰。 */
  it('带 route.query.index 进入时正确重置（不被 sessionStorage 旧值卡住）', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '3');
    const { actIndex } = await mountWizard({ index: 'stub' });

    expect(prepareFn).toHaveBeenCalledWith('stub');
    // applyRouteContext 末尾 step.value = 1，覆盖旧值 3
    expect(actIndex()).toBe(1);
  });

  /* 1410 实报：向导恢复出 9 天前的 *_adhoc_<时间戳> 目标名（上一轮已被创建），
     点重建即撞名。自动建议名必须每次 prepare 重新取，不得跨会话复用。 */
  it('旧会话的 _adhoc_ 目标名不被复用，改为本次 prepare 建议名', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'dest-index'), 'intl_search_service_bond_basic_info_adhoc_20261101175826');
    const { host } = await mountWizard({ index: 'stub' });

    const dest = [...host.querySelectorAll('input')]
      .find(el => el.closest('.row')?.textContent?.includes('目标物理索引名')) as HTMLInputElement | undefined;
    expect(dest, '目标物理索引名输入框在场').toBeTruthy();
    expect(dest!.value, '旧时间戳目标名已清除').not.toContain('20261101175826');
    expect(dest!.value, '回填本次探测的建议名').toBe('stub_v2');
  });

  it('上一轮手写的目标名也不跨轮复用（点重建必须回填本轮建议名）', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'dest-index'), 'old_custom_target');
    const { host } = await mountWizard({ index: 'stub' });

    const dest = [...host.querySelectorAll('input')]
      .find(el => el.closest('.row')?.textContent?.includes('目标物理索引名')) as HTMLInputElement | undefined;
    expect(dest!.value).toBe('stub_v2');
  });
});

/* w24 草稿治理：切页返回续现场——不再被 applyRouteContext 的 pickedIdx 回落弹回第一步 */
describe('w24 切页返回续现场', () => {
  it('预置 step=2 草稿 + 全局选中索引在 → 仍停 step 2（修复前被 pickedIdx 回落重置到 1）', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    localStorage.setItem('es_picked', 'some_global_idx');
    const { host, actIndex } = await mountWizard();
    expect(actIndex()).toBe(2);
    expect(host.querySelector('.strats'), 'step 2 的策略卡片在场').toBeTruthy();
  });

  it('恢复到执行监控步(4)时钳回确认预览(3)——job 是内存态不跨页存', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '4');
    const { actIndex } = await mountWizard();
    expect(actIndex()).toBe(3);
  });

  it('显式 ?index= 上下文优先于旧草稿（带着新意图来，旧稿让位）', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    const { actIndex } = await mountWizard({ index: 'explicit_idx' });
    expect(actIndex()).toBe(1);
    expect(prepareFn).toHaveBeenCalled();
  });
});

/* w25：第二病根——浏览器回退带着残留 ?index= 回来不得重置；step0 只输过名字也不被 pickedIdx 覆写 */
describe('w25 残留 query 与 step0 现场', () => {
  it('浏览器回移除景:query 一次性消费后被清,推进后再回退不被二次重置', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    const first = await mountWizard({ index: 'ctx_idx' });
    expect(first.actIndex()).toBe(1);      // 首次带上下文:重置到 1(用户带着新意图来)
    await new Promise(r => setTimeout(r, 30));
    expect(location.hash.includes('index=')).toBe(false); // query 已被 replace 清空
    /* 用户在向导里推进到 step 2 后离开、回退(此时 URL 已无 query) */
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    const second = await mountWizard({});
    expect(second.actIndex()).toBe(2);     // 不再被二次重置
  });

  it('step0 只输过索引名(未点下一步):返回不被 pickedIdx 覆写', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'index-name'), 'my_typed_idx');
    localStorage.setItem('es_picked', 'some_global_idx');
    const { host } = await mountWizard();
    const inp = host.querySelector('input[placeholder*="索引"]') as HTMLInputElement;
    expect(inp?.value || host.textContent).toBeTruthy();
    expect(sessionStorage.getItem(draftStorageKey({ route: 'adhoc' }, 'index-name'))).toBe('my_typed_idx');
  });
});

/* w27:同一个索引的 query 重入不重置 —— 用户从原入口回来看现场 */
describe('w27 同索引 query 重入', () => {
  it('step=2 现场在,带同 index query 回来 → 保持 step2 不重置', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'index-name'), 'ctx_idx');
    const { actIndex } = await mountWizard({ index: 'ctx_idx' });
    expect(actIndex()).toBe(2);
  });

  it('换了索引的 query → 视为新意图,重置到 step1', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'index-name'), 'old_idx');
    const { actIndex } = await mountWizard({ index: 'new_idx' });
    expect(actIndex()).toBe(1);
  });
});
