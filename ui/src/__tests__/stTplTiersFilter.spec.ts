/**
 * 五百二十批：SearchTemplatesView 编辑器高度四档 + 侧栏名字过滤（P0 行为网）。
 *
 * 契约：
 * ① 模板源 Monaco 高度四档（editorTiers 统一件 + usePref st.editorH，IndexHub ih.editorH 同款）：
 *    档位钮组 4 钮、点档即改 Monaco 定高、偏好落盘 localStorage、满档 wrap 弹性（st-h-full）、
 *    预置偏好挂载即恢复；
 * ② 侧栏名字过滤：子串大小写不敏感（SnapshotsView filtered 同口径），Esc 清空恢复全量，
 *    过滤无命中独立空态（不误显「还没有模板」）。
 *
 * 设施：vue-router 轻 mock（useIdxState 只读 path/query）；只 mock ../api 出口。
 * MonacoEditor/QueryResultTable 以 stub 浅挂载（视图层档位/过滤行为网；编辑器组件本体
 * 另有专属 spec 网覆盖，且组件正处并行批次在途改造期——stub 隔离施工竞争）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createPinia } from 'pinia';

/* vue-router 轻 mock：useIdxState/useUrlState 只读 path/query（analyzerLink 同款） */
const routeMock = { path: '/search-templates', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* MonacoEditor stub：透传 height prop（档位断言锚 .monaco-host style.height），
   补全/编辑能力不在本网范围 */
vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup(props: any) {
        return () => h('div', { class: 'monaco-host', style: { height: props.height } });
      },
    }),
  };
});
/* QueryResultTable stub：结果表另网覆盖，此处只需占位（hits 空本就不渲染） */
vi.mock('../components/QueryResultTable.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return { default: dc({ props: ['hits'], setup: () => () => h('div', { class: 'qrt-stub' }) }) };
});

const listScriptsFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      listStoredScripts: (...a: any[]) => listScriptsFn(...a),
      /* 防御性 stub 挡真实 fetch 噪音（IndexPicker aliases / store 初始化） */
      aliases: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import SearchTemplatesView from '../views/SearchTemplatesView.vue';

const SCRIPTS = {
  scripts: {
    'tpl-alpha': { lang: 'mustache', source: '{"a":1}' },
    'tpl-beta': { lang: 'mustache', source: '{"b":2}' },
    'x-gamma': { lang: 'mustache', source: '{"g":3}' },
  },
};

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView() {
  const app = createApp({ render: () => h(SearchTemplatesView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  for (const k of Object.keys(routeMock.query)) delete routeMock.query[k];
  listScriptsFn.mockReset().mockResolvedValue(SCRIPTS);
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('模板中心编辑器高度四档（五百二十批）', () => {
  it('档位钮组 4 钮；默认 S 档；点 L → Monaco 定高 560px 并落盘 st.editorH', async () => {
    const host = await mountView();
    const btns = [...host.querySelectorAll<HTMLButtonElement>('.st-eh-btn')];
    expect(btns.map(b => b.textContent?.trim()), 'S/M/L/满 四档').toEqual(['S', 'M', 'L', '满']);
    /* 默认 S 档（usePref 缺省）：Monaco 内联定高 */
    const mhost = () => host.querySelector<HTMLElement>('.st-ed-wrap .monaco-host');
    expect(mhost()!.style.height).toBe('200px');
    /* 点 L：真实流转改档 → Monaco 高度跟随 + 偏好落盘（非 immediate watch 须真赋值触发） */
    btns[2].click();
    await settle();
    expect(mhost()!.style.height).toBe('560px');
    expect(localStorage.getItem('esquerystudio.pref.st.editorH')).toBe('"l"');
    /* 满档：wrap 弹性（st-h-full），Monaco 高度交 wrap 接管 */
    btns[3].click();
    await settle();
    expect(mhost()!.style.height).toBe('100%');
    expect(host.querySelector('.st-ed-wrap')!.className).toContain('st-h-full');
    expect(localStorage.getItem('esquerystudio.pref.st.editorH')).toBe('"full"');
  });

  it('预置偏好挂载即恢复（M 档 360px），不需点一次档位', async () => {
    localStorage.setItem('esquerystudio.pref.st.editorH', JSON.stringify('m'));
    const host = await mountView();
    expect(host.querySelector<HTMLElement>('.st-ed-wrap .monaco-host')!.style.height).toBe('360px');
    expect(host.querySelectorAll('.st-eh-btn.on')[0]?.textContent?.trim()).toBe('M');
  });
});

describe('模板侧栏名字过滤（五百二十批）', () => {
  it('子串大小写不敏感过滤；Esc 清空恢复全量；无命中独立空态', async () => {
    const host = await mountView();
    expect(host.querySelectorAll('.st-item').length, '初始 3 条全量').toBe(3);
    const inp = host.querySelector<HTMLInputElement>('.st-list-filter');
    expect(inp, '过滤框必须在真空/失败分支之外常驻').toBeTruthy();
    /* 大写子串命中小写名（口径同 SnapshotsView filtered） */
    inp!.value = 'ALP';
    inp!.dispatchEvent(new Event('input'));
    await settle();
    let rows = [...host.querySelectorAll('.st-item')];
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('tpl-alpha');
    /* 无命中独立空态：不回落「还没有 mustache 模板」真空态 */
    inp!.value = 'no-such-tpl';
    inp!.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelectorAll('.st-item').length).toBe(0);
    expect(host.textContent).toContain('无匹配模板');
    expect(host.textContent).not.toContain('还没有 mustache 模板');
    /* Esc 清空恢复全量 */
    inp!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(host.querySelectorAll('.st-item').length).toBe(3);
    expect(inp!.value).toBe('');
  });
});
