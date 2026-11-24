/**
 * 密码型输入与 v-model 修饰符的落位看守（审查修复项，挂载级）。
 *
 *  · McpPanel 工具试跑凭证框（NInput password 档）：name / autocomplete / spellcheck / aria-label
 *    必须落在真实 input 上。NInput 的根是包裹 div，这些属性直接写在标签上只会落到根 div——
 *    autocomplete 到不了 input，浏览器仍会把登录密码自动填进来；
 *  · SecurityView 首连令牌框：改用 NInput password 档做原生遮蔽（此前 TextInput + pw-mask
 *    走 -webkit-text-security 圆点，Firefox 不支持该属性，输入时直接露出明文）；
 *  · SecurityView 的 v-model.trim（经 SFC 编译的真实写法）：模型去首尾空白、输入框显示不被
 *    改写（词间空格可输入）、失焦后收敛到模型值、modelModifiers 不漏到 DOM。
 * 挂具范式：McpPanel 全真挂载（test 模式即服务端模式）；SecurityView 照抄 inputSweepW6a1085
 * （vue-router 轻 mock + api mock + MonacoEditor stub）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const routeMock = { path: '/search', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/* 审计自助面拉取：记录调用参数（回车时带上去空白后的集群筛值） */
const opsAuditMineFn = vi.fn();

vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup(_, { expose }) { expose({ getEditor: () => null, setMarkers: () => ({ unplaced: [] }) }); return () => h('div', { class: 'monaco-host' }); },
    }),
  };
});

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: {
        ...actual.api.setup,
        status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true, setupTokenRequired: true }),
      },
      auth: {
        ...actual.api.auth,
        users: () => Promise.resolve([]),
        auditFacets: () => Promise.resolve({ by_user: [], by_uri: [], conn: [] }),
        opsAudit: () => Promise.resolve({ hits: [], total: 0 }),
        opsAuditMine: (...a: any[]) => opsAuditMineFn(...a),
      },
      clusterIndices: () => Promise.resolve([{ index: 'logs-x', health: 'green', status: 'open' }]),
      clusterHealth: () => Promise.resolve({}),
      overview: () => Promise.resolve({}),
      nodesStatsBrief: () => Promise.resolve([]),
    },
  };
});

import McpPanel from '../components/McpPanel.vue';
import SecurityView from '../views/SecurityView.vue';
import { useAuthStore } from '../stores/auth';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function nativeSet(el: HTMLInputElement, val: string) {
  const st = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  st.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

function mountWith(comp: any, opts: { admin?: boolean; role?: string; props?: Record<string, unknown> } = {}) {
  const pinia = createPinia();
  if (opts.admin || opts.role) {
    const auth = useAuthStore(pinia);
    auth.me = { username: 't', role: opts.role ?? 'ADMIN', fallback: false };
    auth.probed = true;
  }
  const app = createApp({ render: () => h(comp, opts.props) });
  apps.push(app);
  app.use(pinia);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return { app, host };
}

async function mountSecurity() {
  const m = mountWith(SecurityView, { admin: true });
  await settle(20);
  return m;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  opsAuditMineFn.mockReset().mockResolvedValue({ records: [] });
  history.replaceState(null, '', '#/?idx=logs-x');
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  history.replaceState(null, '', '#/');
});

describe('McpPanel · 工具试跑凭证框（input-props 落真实 input）', () => {
  async function openTools() {
    /* inline 档直接铺在页面里（非 inline 走 NModal，show=false 时不渲染任何内容） */
    const m = mountWith(McpPanel, { props: { inline: true, show: false } });
    await settle();
    (m.host.querySelector('[data-test="mcp-tools-tab"]') as HTMLElement).click();
    await settle(8);
    return m;
  }

  it('真实 input 带 type=password / autocomplete=new-password / name / aria-label / spellcheck；根 div 不再背这些属性', async () => {
    const { host } = await openTools();
    const input = host.querySelector<HTMLInputElement>('.mcp-play-token input')!;
    expect(input, '凭证输入在场').toBeTruthy();
    expect(input.type, '原生密码遮蔽').toBe('password');
    expect(input.getAttribute('autocomplete'), '防浏览器把登录密码自动填进凭证框').toBe('new-password');
    expect(input.getAttribute('name')).toBe('esq-mcp-service-token');
    expect(input.getAttribute('aria-label')).toBe('服务端 MCP 凭证');
    expect(input.getAttribute('spellcheck')).toBe('false');
    const root = host.querySelector('.mcp-play-token')!;
    for (const attr of ['autocomplete', 'name', 'aria-label']) {
      expect(root.getAttribute(attr), `根容器 div 上不残留 ${attr}（落在 div 上到不了 input）`).toBeNull();
    }
  });

  it('输入凭证经 update:value 回写组件状态（换承载方式不丢绑定）', async () => {
    const { app, host } = await openTools();
    const input = host.querySelector<HTMLInputElement>('.mcp-play-token input')!;
    nativeSet(input, 'esq_mcp_key-abcdefghijklmnop');
    await settle(6);
    expect(stateOf(app).serverToken).toBe('esq_mcp_key-abcdefghijklmnop');
  });
});

describe('SecurityView · 首连令牌框（NInput password 档）', () => {
  it('真实 input 为 type=password 且 autocomplete=off；不再依赖 pw-mask 圆点；令牌填入后重绑钮解禁', async () => {
    const { app, host } = await mountSecurity();
    const row = host.querySelector('.rebind-row')!;
    expect(row, '重绑行在场（ADMIN + 已配置 setup-token）').toBeTruthy();
    const token = row.querySelector<HTMLInputElement>('input[placeholder="首连令牌 X-Setup-Token"]')!;
    expect(token, '首连令牌框在场').toBeTruthy();
    expect(token.type, '原生密码遮蔽（Firefox 下同样遮蔽）').toBe('password');
    expect(token.getAttribute('autocomplete')).toBe('off');
    expect(token.getAttribute('name')).toBe('esq-setup-token');
    expect(token.classList.contains('pw-mask'), '不再走 -webkit-text-security 圆点').toBe(false);

    /* 绑定与门控：地址 + 令牌填齐后「重绑」钮解禁 */
    const rebind = [...row.querySelectorAll('button')].find(b => (b.textContent || '').includes('重绑')) as HTMLButtonElement;
    expect(rebind.disabled, '未填时禁用').toBe(true);
    nativeSet(row.querySelector<HTMLInputElement>('input[placeholder="http://es-host:9200"]')!, 'http://es-host:9200');
    await settle(6);
    expect(rebind.disabled, '缺令牌仍禁用').toBe(true);
    nativeSet(token, 'tok-123');
    await settle(6);
    expect(stateOf(app).rbToken).toBe('tok-123');
    expect(rebind.disabled).toBe(false);
  });

  it('重绑行里令牌框与密码框是密码型（地址/用户名仍走 TextInput）', async () => {
    const { host } = await mountSecurity();
    expect(host.querySelector('input[placeholder="首连令牌 X-Setup-Token"]'), '已配置 setup-token：令牌框在场').toBeTruthy();
    expect(host.querySelectorAll('.rebind-row input[type="password"]'), '密码型=令牌框+密码框两个').toHaveLength(2);
    expect(host.querySelectorAll('.rebind-row input.ti-inp'), '地址/用户名仍走 TextInput').toHaveLength(2);
  });
});

describe('SecurityView · v-model.trim（真实 SFC 写法）', () => {
  it('新建用户名：模型去首尾空白；输入框显示保留空格；失焦后收敛；无 modelmodifiers 属性漏到 input', async () => {
    const { app, host } = await mountSecurity();
    const name = host.querySelector<HTMLInputElement>('input[placeholder="用户名"]')!;
    expect(name, '用户名输入在场').toBeTruthy();
    expect(name.hasAttribute('modelmodifiers'), 'DOM 上不得出现 modelmodifiers="[object Object]"').toBe(false);

    nativeSet(name, '  bob  ');
    await settle(6);
    expect(stateOf(app).nuName, '模型拿到去空白后的值').toBe('bob');
    expect(name.value, '输入框显示不被改写（原生 v-model.trim 同样不动 DOM）').toBe('  bob  ');

    name.dispatchEvent(new FocusEvent('blur'));
    await settle(6);
    expect(name.value, '失焦后显示收敛到模型值').toBe('bob');
  });

  it('词间空格可输入：重绑用户名/地址在模型变化触发的重渲染后仍保留词间空格', async () => {
    const { app, host } = await mountSecurity();
    const row = host.querySelector('.rebind-row')!;
    const user = row.querySelector<HTMLInputElement>('input[placeholder="用户名（可选）"]')!;
    nativeSet(user, 'a b');
    await settle(6);
    /* 触发一次无关重渲染（改另一个字段），输入框显示不应被同步成去空白值 */
    nativeSet(row.querySelector<HTMLInputElement>('input[placeholder="http://es-host:9200"]')!, 'http://es-host:9200');
    await settle(6);
    expect(stateOf(app).rbUser).toBe('a b');
    expect(user.value).toBe('a b');
    /* 尾随空格：模型不含，输入框仍显示，续敲词间空格不被吃 */
    nativeSet(user, 'a b ');
    await settle(6);
    expect(stateOf(app).rbUser).toBe('a b');
    expect(user.value, '尾随空格在输入过程中保留').toBe('a b ');
    nativeSet(user, 'a b c');
    await settle(6);
    expect(user.value).toBe('a b c');
    expect(stateOf(app).rbUser).toBe('a b c');
  });

  it('审计自助面集群筛选（⋯ 弹层内）：模型去首尾空白、回车请求带去空白后的集群名、输入过程空格不被吃', async () => {
    const { app } = mountWith(SecurityView, { role: 'VIEWER' });
    await settle(24);
    /* ⋯ 溢出弹层（NPopover）随开层挂到 body：先开层再取输入框 */
    (document.querySelector('.ad-more-sum') as HTMLElement).click();
    await settle(8);
    const kw = document.querySelector<HTMLInputElement>('input[placeholder="按集群过滤（默认当前集群，清空看全部）"]')!;
    expect(kw, '自助面集群筛输入在场').toBeTruthy();
    expect(kw.hasAttribute('modelmodifiers'), 'DOM 上不得出现 modelmodifiers="[object Object]"').toBe(false);
    opsAuditMineFn.mockClear(); /* 抛开挂载首拍 */

    nativeSet(kw, '  prod cluster  ');
    await settle(6);
    expect(stateOf(app).fConnMine, '模型去首尾空白').toBe('prod cluster');
    expect(kw.value, '输入框显示原样（词间空格在）').toBe('  prod cluster  ');

    kw.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    await settle(8);
    expect(opsAuditMineFn).toHaveBeenCalledTimes(1);
    expect(opsAuditMineFn.mock.calls[0][4], '回车请求带去空白后的集群名').toBe('prod cluster');
  });
});
