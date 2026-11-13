/* 八百八十八批【权限可观测面】看守：PermModal 我的权限弹层。
 *
 * 后端 /auth/permissions 端点（ConsolePermissionsController）返回当前身份 × 目标连接的
 * 逐页读/写判定 + raw 直连档 + 共享写档；前端消费=REST 直连页「我的权限」入口弹层：
 *  · 按 target 拉取并渲染身份摘要（角色/连接实名/环境）；
 *  · raw 档被拒 → 拒绝态文案（非允许态）；
 *  · 逐页写判定文案：WRITE_DENIED=连接写权限未授予 / ROLE_INSUFFICIENT:*=需 X 角色 /
 *    PAGE_DENIED=页面未授权 / write=null=无写操作 / write=true=可写。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  permissions: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      auth: { ...orig.api.auth, permissions: mocks.permissions },
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PermModal from '../components/PermModal.vue';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountModal(target: string | null) {
  const app = createApp({
    data: () => ({ show: true }),
    render() {
      return h(PermModal, { show: (this as any).show, target, 'onUpdate:show': (v: boolean) => { (this as any).show = v; } });
    },
  });
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

const FIXTURE = {
  role: 'VIEWER', delegated: true, pageAuthEnabled: true, pageGateActive: true,
  target: 'c1', connName: '生产集群', env: 'PROD', connModel: true, envPagesApplied: false,
  rawAllowed: false, devtoolsAllowed: false, sharedWriteAllowed: false,
  groups: [
    { id: 'devx', name: '开发者工具', pages: [
      { key: 'rest', name: 'REST 直连', read: true, write: false, writeDeny: 'WRITE_DENIED' },
      { key: 'devtools', name: 'Dev Tools', read: true, write: false, writeDeny: 'WRITE_DENIED' },
    ] },
    { id: 'core', name: '总览与工作台', pages: [
      { key: 'overview', name: '概览', read: true, write: true },
    ] },
  ],
};

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  mocks.permissions.mockReset();
  mocks.permissions.mockResolvedValue(JSON.parse(JSON.stringify(FIXTURE)));
});

describe('八百八十八批：PermModal 我的权限弹层', () => {
  it('打开时按 target 拉取并渲染身份摘要（角色/连接实名/环境）', async () => {
    const { app, host } = await mountModal('c1');
    expect(mocks.permissions).toHaveBeenCalledWith('c1');
    const body = document.body.textContent ?? '';
    expect(body).toContain('VIEWER');
    expect(body).toContain('生产集群');
    expect(body).toContain('PROD');
    app.unmount();
  });

  it('raw 直连档被拒 → 渲染拒绝态（非允许态）', async () => {
    const { app, host } = await mountModal('c1');
    const raw = document.body.querySelector('[data-test="perm-raw"]');
    expect(raw, 'raw 档行必须渲染').toBeTruthy();
    expect(raw!.textContent).toContain('不可用');
    app.unmount();
  });

  it('rest 页 WRITE_DENIED → 行内显示「连接写权限未授予」', async () => {
    const { app, host } = await mountModal('c1');
    const row = document.body.querySelector('[data-test="perm-page-rest"]');
    expect(row, 'rest 页行必须渲染').toBeTruthy();
    expect(row!.textContent).toContain('REST 直连');
    expect(row!.textContent).toContain('连接写权限未授予');
    app.unmount();
  });

  it('write=true 页显示可写态；write=false 页显示拒绝原因', async () => {
    const { app, host } = await mountModal('c1');
    const ok = document.body.querySelector('[data-test="perm-page-overview"]');
    expect(ok).toBeTruthy();
    expect(ok!.textContent).toContain('可写');
    const no = document.body.querySelector('[data-test="perm-page-devtools"]');
    expect(no).toBeTruthy();
    expect(no!.textContent).toContain('连接写权限未授予');
    app.unmount();
  });

  it('ROLE_INSUFFICIENT 原因映射为「需 X 角色」文案', async () => {
    mocks.permissions.mockResolvedValue({ ...JSON.parse(JSON.stringify(FIXTURE)),
      groups: [{ id: 'core', name: '总览与工作台', pages: [
        { key: 'overview', name: '概览', read: true, write: false, writeDeny: 'ROLE_INSUFFICIENT:OPERATOR' },
      ] }] });
    const { app, host } = await mountModal('c1');
    const row = document.body.querySelector('[data-test="perm-page-overview"]');
    expect(row!.textContent).toContain('需 OPERATOR 角色');
    app.unmount();
  });

  it('源码锁：REST 直连页挂「我的权限」入口（ghost 钮+组件接线）', () => {
    const src = read('../views/RestView.vue');
    expect(src).toContain('我的权限');
    expect(src).toContain('PermModal');
  });
});
