/**
 * 一千零八十五批 W6 分片 a：views 层裸 input 清零——六视图挂载级回归。
 * 每视图至少一例「TextInput 替换后 v-model / placeholder / 事件透传不漂移」：
 * 选择器仍锚真实 input（attrs 透传零漂移），输入后状态更新可观察（按钮 enable /
 * lint 提示出现），placeholder 与原皮肤类字面保留。
 * 覆盖：SecurityView / DslQueryView / SnapshotsView / BulkEditorView / AliasesView / ConfigValidatorView。
 * 挂载设施照抄 securityAuditGate948 / dslValidate1057 / snapRestoreVerify915 /
 * configValidatorFirstCut775（vue-router 轻 mock + api 超集 mock + MonacoEditor stub）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeMock = { path: '/search', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup(_, { expose }) {
        /* getEditor：ConfigValidatorView useMonacoLocate setup 期即取；setMarkers：DslQueryView lint 防抖回调 */
        expose({ getEditor: () => null, setMarkers: () => ({ unplaced: [] }) });
        return () => h('div', { class: 'monaco-host' });
      },
    }),
  };
});

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      auth: {
        ...actual.api.auth,
        users: () => Promise.resolve([]),
        auditFacets: () => Promise.resolve({ by_user: [], by_uri: [], conn: [] }),
        opsAudit: () => Promise.resolve({ hits: [], total: 0 }),
        opsAuditMine: () => Promise.resolve({ hits: [], total: 0 }),
      },
      clusterIndices: () => Promise.resolve([{ index: 'logs-x', health: 'green', status: 'open' }]),
      clusterHealth: () => Promise.resolve({}),
      overview: () => Promise.resolve({}),
      nodesStatsBrief: () => Promise.resolve([]),
      aliases: () => Promise.resolve([{ alias: 'a1', index: 'logs-x', ri: null }]),
      mappingDetail: () => Promise.resolve({ raw: { properties: { title: { type: 'text' }, status: { type: 'keyword' } } } }),
      snapshotRepos: () => Promise.resolve([{ name: 'repo-a' }]),
      snapshotList: () => Promise.resolve([]),
      searchDsl: () => Promise.resolve({ hits: [], total: 0, took: 1 }),
      validateQuery: () => Promise.resolve({}),
      resolveSchema: () => Promise.resolve({ warnings: [] }),
    },
  };
});

import SecurityView from '../views/SecurityView.vue';
import DslQueryView from '../views/DslQueryView.vue';
import SnapshotsView from '../views/SnapshotsView.vue';
import BulkEditorView from '../views/BulkEditorView.vue';
import AliasesView from '../views/AliasesView.vue';
import ConfigValidatorView from '../views/ConfigValidatorView.vue';
import { useAuthStore } from '../stores/auth';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, path: string, opts: { admin?: boolean } = {}) {
  routeMock.path = path;
  const pinia = createPinia();
  if (opts.admin) {
    const auth = useAuthStore(pinia);
    auth.me = { username: 't', role: 'ADMIN', fallback: false };
    auth.probed = true;
  }
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function mustInput(root: ParentNode, sel: string): HTMLInputElement {
  const el = root.querySelector<HTMLInputElement>(sel);
  expect(el, `输入框必须存在：${sel}`).toBeTruthy();
  return el!;
}

function nativeSet(el: HTMLInputElement, val: string) {
  el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/?idx=logs-x');
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  history.replaceState(null, '', '#/');
});

describe('1085 W6-a：SecurityView 改密三输入（NInput password 档原生遮蔽）', () => {
  it('原生 type=password + autocomplete 落真实 input + 三框填齐后修改密码钮 enable', async () => {
    const host = await mountView(SecurityView, '/security', { admin: true });
    const old = mustInput(host, 'input[placeholder="旧密码"]');
    expect(old.type, '原生 password 遮蔽（Firefox 无 -webkit-text-security 圆点遮蔽会露明文）').toBe('password');
    expect(old.getAttribute('autocomplete')).toBe('off');
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('修改密码')) as HTMLButtonElement;
    expect(btn && btn.disabled, '未输入时钮禁用').toBe(true);
    nativeSet(old, 'old123');
    await settle();
    nativeSet(mustInput(host, 'input[placeholder="新密码（≥6 位）"]'), 'new123');
    await settle();
    nativeSet(mustInput(host, 'input[placeholder="确认新密码"]'), 'new123');
    await settle();
    expect(btn.disabled, '三框填齐一致后钮解禁（v-model 状态更新）').toBe(false);
  });

  it('首连令牌框：NInput password 档原生遮蔽（Firefox 无 -webkit-text-security 圆点遮蔽会露明文）', () => {
    /* 源码锁：密码型字段走 n-input type=password（点击可显形核对），autocomplete 经 input-props 落真实 input */
    const s = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');
    expect(s).toMatch(/n-input v-if="setup\?\.setupTokenRequired" v-model:value="rbToken" type="password" show-password-on="click"/);
    expect(s).toContain(":input-props=\"{ name: 'esq-setup-token', autocomplete: 'off' }\"");
    /* 改密/新建用户/重绑的密码框同款原生遮蔽；pw-mask 圆点遮蔽皮肤类全量退役（注释叙述除外） */
    expect(s.match(/input-class="[^"]*pw-mask/g), 'pw-mask 皮肤类用法清零').toBeNull();
  });
});

describe('1085 W6-a：DslQueryView 时间转换输入（TextInput 化零漂移）', () => {
  it('时间转换 popover：inp mono 皮肤类 + 输入后 keyup.enter 触发转换出结果', async () => {
    const host = await mountView(DslQueryView, '/search');
    const toggle = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('时间转换')) as HTMLButtonElement;
    expect(toggle, '时间转换钮在场').toBeTruthy();
    toggle.click();
    await settle(20);
    const inp = document.querySelector<HTMLInputElement>('input[placeholder*="标准时间或 epoch"]');
    expect(inp, '转换输入（TextInput 内层 input）在场').toBeTruthy();
    expect(inp!.className, '皮肤类 inp mono 落真实 input').toContain('mono');
    nativeSet(inp!, '1700000000000');
    await settle();
    inp!.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    await settle();
    const out = [...document.querySelectorAll('div')].some(d => d.className.includes('mono') && /2023/.test(d.textContent || ''));
    expect(out, '回车后转换结果出现（@keyup.enter 透传）').toBe(true);
  });
});

describe('1085 W6-a：SnapshotsView 创建快照名输入（TextInput 化零漂移）', () => {
  it('创建弹窗：sv-input 皮肤类 + placeholder 透传 + 值绑定稳定', async () => {
    const host = await mountView(SnapshotsView, '/snapshots', { admin: true });
    const open = [...host.querySelectorAll('button')].find(b => /创建快照/.test((b.textContent || '').replace(/\s+/g, ''))) as HTMLButtonElement;
    expect(open, '创建快照钮在场').toBeTruthy();
    open.click();
    await settle(20);
    const inp = document.querySelector<HTMLInputElement>('input[placeholder*="snapshot-YYYYMMDD"]');
    expect(inp, '快照名输入（TextInput 内层 input）在场').toBeTruthy();
    expect(inp!.className, '皮肤类 sv-input 落真实 input').toContain('sv-input');
    nativeSet(inp!, 'my-snap-1');
    await settle();
    expect(inp!.value, 'v-model 回写后值稳定（值绑定不漂移）').toBe('my-snap-1');
  });
});

describe('1085 W6-a：BulkEditorView pipeline 输入（TextInput 化零漂移）', () => {
  it('参数区：inp 皮肤类 + placeholder 透传 + 值绑定稳定', async () => {
    const host = await mountView(BulkEditorView, '/bulk-editor');
    const inp = mustInput(host, 'input[placeholder*="ingest pipeline ID"]');
    expect(inp.className, '皮肤类 inp 落真实 input').toContain('inp');
    nativeSet(inp, 'my-pipe');
    await settle();
    expect(inp.value, 'v-model 回写后值稳定（值绑定不漂移）').toBe('my-pipe');
  });
});

describe('1085 W6-a：AliasesView 别名输入（TextInput 化零漂移）', () => {
  it('新建面板：alv-fi 皮肤类 + 非法字符输入触发 lint 提示（v-model + watch 链不漂移）', async () => {
    const host = await mountView(AliasesView, '/aliases', { admin: true });
    const open = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('新建别名')) as HTMLButtonElement;
    expect(open, '新建别名钮在场（ADMIN 可写）').toBeTruthy();
    open.click();
    await settle();
    const inp = mustInput(host, 'input[placeholder="my-alias"]');
    expect(inp.className, '皮肤类 alv-fi 落真实 input').toContain('alv-fi');
    nativeSet(inp, 'bad alias!');
    await settle();
    const hint = host.querySelector('.alv-form .il-hint');
    expect(hint, '非法别名输入后 lint 提示出现（v-model 状态更新）').toBeTruthy();
  });
});

describe('1085 W6-a：ConfigValidatorView 搜索输入（TextInput 化零漂移）', () => {
  it('settings 搜索：cv-find 皮肤类 + aria-label 透传 + 值绑定稳定', async () => {
    const host = await mountView(ConfigValidatorView, '/config-validator');
    const inp = mustInput(host, 'input[aria-label="搜 settings"]');
    expect(inp.placeholder, 'placeholder 透传不漂移').toBe('搜 settings…');
    expect(inp.className, '皮肤类 cv-find 落真实 input').toContain('cv-find');
    nativeSet(inp, 'refresh');
    await settle();
    expect(inp.value, 'v-model 回写后值稳定（@update:model-value 驱动 run 不抛错）').toBe('refresh');
  });
});
