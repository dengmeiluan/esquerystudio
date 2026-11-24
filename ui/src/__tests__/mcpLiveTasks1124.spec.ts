/**
 * MCP 面板「调用任务」在途条（挂载级，服务端模式）。
 *
 * 守的是三件事：
 *  1) 输入凭证后真的按 `tasks/list` 拉台账，并把行渲染出来（不是只留个空壳）；
 *  2) 运行中的任务显示进度/死线，且提供可见的「取消」按钮（不是只能等 3 分钟死信）；
 *  3) 取消走 `tasks/cancel`，然后重拉台账——两步都发生。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/search', query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return { default: dc({ props: ['modelValue', 'language', 'height'], emits: ['update:modelValue'], setup(_, { expose }) { expose({ getEditor: () => null, setMarkers: () => ({ unplaced: [] }) }); return () => h('div', { class: 'monaco-host' }); } }) };
});

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const empty = () => Promise.resolve([]);
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true, setupTokenRequired: false }) },
      auth: { ...actual.api.auth, users: empty, auditFacets: () => Promise.resolve({ by_user: [], by_uri: [], conn: [] }), opsAudit: () => Promise.resolve({ hits: [], total: 0 }), opsAuditMine: empty },
      clusterIndices: empty, clusterHealth: () => Promise.resolve({}), overview: () => Promise.resolve({}), nodesStatsBrief: empty,
    },
  };
});

import McpPanel from '../components/McpPanel.vue';
import { useAuthStore } from '../stores/auth';

const apps: ReturnType<typeof createApp>[] = [];
const settle = async (n = 16) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

function nativeSet(el: HTMLInputElement, val: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function mountPanel() {
  const pinia = createPinia();
  const auth = useAuthStore(pinia);
  auth.me = { username: 't', role: 'ADMIN', fallback: false };
  auth.probed = true;
  const app = createApp({ render: () => h(McpPanel, { inline: true, show: false }) });
  apps.push(app);
  app.use(pinia);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return host;
}

let tasksMode: 'working' | 'cancelled' = 'working';
let cancelCalls = 0;
const rpcCalls: string[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  tasksMode = 'working';
  cancelCalls = 0;
  rpcCalls.length = 0;
  vi.unstubAllGlobals();
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const method = String(body.method || '');
    rpcCalls.push(method);
    const reply = (result: any) => new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (method === 'tasks/list') {
      return reply({
        tasks: [
          {
            taskId: 't-1', tool: 'es_reindex', status: tasksMode, stage: tasksMode === 'working' ? 'polling' : 'cancelled',
            elapsedMs: 12_000, remainingMs: 168_000, cancelReason: tasksMode === 'cancelled' ? 'CLIENT' : null,
          },
          {
            taskId: 't-2', tool: 'es_sql', status: 'working', stage: 'running',
            elapsedMs: 4_000, remainingMs: 176_000, remote: true,
          },
          {
            taskId: 't-3', tool: 'es_rest', status: 'cancelled', stage: 'cancelled',
            elapsedMs: 9_000, remainingMs: 0, cancelReason: 'EXECUTOR_LOST',
          },
        ],
        count: 3, callTimeoutMs: 180_000,
      });
    }
    if (method === 'tasks/cancel') { cancelCalls += 1; tasksMode = 'cancelled'; return reply({ taskId: 't-1', status: 'cancelled' }); }
    return reply({});
  }));
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  vi.unstubAllGlobals();
});

describe('McpPanel · 调用任务在途条', () => {
  async function openAndAuthenticate(): Promise<HTMLElement> {
    const host = mountPanel();
    await settle();
    (host.querySelector('[data-test="mcp-tools-tab"]') as HTMLElement).click();
    await settle(8);
    nativeSet(host.querySelector<HTMLInputElement>('.mcp-play-token input')!, 'esq_test_token');
    await settle(12);
    return host;
  }

  it('渲染在途任务行：工具名、阶段、耗时/剩余、取消按钮', async () => {
    const host = await openAndAuthenticate();
    expect(rpcCalls, '输入凭证后必须真的拉 tasks/list').toContain('tasks/list');
    const section = host.querySelector('.mcp-live');
    expect(section, '在途任务区必须渲染').toBeTruthy();
    const row = host.querySelector('.mcp-live-row')!;
    expect(row, '必须渲染任务行').toBeTruthy();
    expect(row.querySelector('.mcp-live-tool')!.textContent).toContain('es_reindex');
    expect(row.querySelector('.mcp-live-stage')!.textContent).toContain('轮询中');
    expect(row.querySelector('.mcp-live-time')!.textContent).toContain('12s');
    expect(row.querySelector('.mcp-live-time')!.textContent).toContain('2m48s');
    const cancel = row.querySelector('.mcp-live-cancel') as HTMLButtonElement;
    expect(cancel, '运行中必须给可见的取消入口').toBeTruthy();
    expect(cancel.textContent).toContain('取消');
  });

  it('跨实例与失联任务如实标注：其他实例 / 执行方失联', async () => {
    const host = await openAndAuthenticate();
    const rows = [...host.querySelectorAll('.mcp-live-row')] as HTMLElement[];
    const remoteRow = rows.find((r) => r.textContent?.includes('es_sql'))!;
    expect(remoteRow, '远端影子任务必须渲染').toBeTruthy();
    expect(remoteRow.querySelector('.mcp-live-status')?.textContent).toContain('运行中（其他实例）');
    const lostRow = rows.find((r) => r.textContent?.includes('es_rest'))!;
    expect(lostRow.querySelector('.mcp-live-status')?.textContent).toContain('执行方失联');
  });

  it('点取消走 tasks/cancel 并重拉台账', async () => {
    const host = await openAndAuthenticate();
    (host.querySelector('.mcp-live-cancel') as HTMLButtonElement).click();
    await settle(14);
    expect(cancelCalls, '点击取消必须真的发 tasks/cancel').toBe(1);
    const lists = rpcCalls.filter((m) => m === 'tasks/list').length;
    expect(lists, '取消后要重拉台账').toBeGreaterThanOrEqual(2);
  });

  it('没有凭证时不渲染该区（不伪造空表）', async () => {
    const host = mountPanel();
    await settle();
    (host.querySelector('[data-test="mcp-tools-tab"]') as HTMLElement).click();
    await settle(8);
    expect(host.querySelector('.mcp-live')).toBeNull();
  });
});

describe('McpPanel · 本地 exe 配置的客户端方言', () => {
  async function pickClient(label: string) {
    const host = mountPanel();
    await settle();
    (host.querySelector('[data-test="mcp-clients-tab"]') as HTMLElement).click();
    await settle(8);
    const tile = [...host.querySelectorAll('.mcp-client-tile')].find(el => (el.textContent || '').includes(label)) as HTMLElement;
    expect(tile, '客户端磁贴存在：' + label).toBeTruthy();
    tile.click();
    await settle(8);
    return host;
  }
  async function enableExe(host: HTMLElement) {
    const byLabel = (text: string) => ([...host.querySelectorAll('.n-checkbox')] as HTMLElement[])
      .find(el => (el.textContent || '').includes(text));
    const local = byLabel('通过本地 Node 直连');
    expect(local, '本地直连开关在场').toBeTruthy();
    local!.click();
    await settle(8);
    const exe = byLabel('改用单文件 exe');
    expect(exe, 'exe 开关在本地模式下出现').toBeTruthy();
    exe!.click();
    await settle(10);
  }
  function configText(host: HTMLElement): string {
    return (host.querySelector('pre.mcp-client-code') as HTMLElement)?.textContent || '';
  }

  it('Codex 走 TOML 方言，命令是 exe 路径', async () => {
    const host = await pickClient('Codex');
    await enableExe(host);
    const text = configText(host);
    expect(text).toContain('[mcp_servers.esquerystudio]');
    expect(text).toContain('esquerystudio-mcp.exe');
    expect(text, 'TOML 不应退回 JSON').not.toContain('mcpServers');
    expect(text, '路径用正斜杠避免 TOML 转义').toContain('C:/Users/<you>/esquerystudio/esquerystudio-mcp.exe');
  });

  it('Continue 走 YAML 方言，命令是 exe 路径', async () => {
    const host = await pickClient('Continue');
    await enableExe(host);
    const text = configText(host);
    expect(text).toContain('mcpServers:');
    expect(text).toContain('command: C:/Users/<you>/esquerystudio/esquerystudio-mcp.exe');
  });

  it('Cursor 保留 JSON 方言，exe 路径被正确转义', async () => {
    const host = await pickClient('Cursor');
    await enableExe(host);
    const text = configText(host);
    const parsed = JSON.parse(text);
    /* 通用 mcpServers 方言：缺省 type 即 stdio（Cursor/Claude Desktop 都这么吃）。 */
    expect(parsed.mcpServers.esquerystudio.command).toContain('esquerystudio-mcp.exe');
    expect(parsed.mcpServers.esquerystudio.args).toContain('--config');
  });
});
