/**
 * 1132：委派超管（产线 deng_test_x2 = role=ADMIN + delegated=true）在安全中心的取舍。
 *
 * 后端口径（BuiltinConsoleAuthService.forbidDelegatedLocalUserWrite）：本地账号是宿主体系外的
 * 全局身份，委派/页面模型身份一律不得建/改/删，只有内置 ADMIN 能管。
 * 前端若仍按 isAdmin() 提前放行，就会亮出一张提交必 400 的表单——第 5 条「可操作性在前端提前暴露」
 * 要求的是「提前暴露能不能做」，不是「让人点到失败才知道」。
 *
 * 契约：
 *   1) 委派超管：新建表单不渲染，用户列表照常可读，卡头给出「宿主委派身份只读」的理由
 *   2) 内置超管：新建表单照常渲染（有权限的人不得被误拦）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const usersFn = vi.fn();

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api.auth,
        users: (...args: any[]) => usersFn(...args),
        opsAudit: vi.fn(async () => ({ hits: { hits: [] } })),
      },
      setup: {
        ...actual.api.setup,
        status: vi.fn(async () => ({ bound: true, mode: 'SELF', endpoint: 'http://127.0.0.1:9200', appName: 'test', hostVisible: false })),
      },
    },
  };
});

import SecurityView from '../SecurityView.vue';
import { useAuthStore } from '../../stores/auth';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountSecurity(me: Record<string, unknown>) {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(SecurityView) });
  app.use(pinia);
  app.use(router);
  const auth = useAuthStore(pinia);
  auth.beginProbe();
  auth.me = me as any;
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function userCard(host: HTMLElement): HTMLElement {
  const card = [...host.querySelectorAll<HTMLElement>('.me-card, .us-card, .ctl-card, .audit-card')]
    .find(c => (c.querySelector('.card-t')?.textContent || '').includes('用户管理'));
  expect(card, '用户管理卡必须渲染').toBeTruthy();
  return card!;
}

beforeEach(() => {
  document.body.innerHTML = '';
  usersFn.mockReset();
  usersFn.mockResolvedValue([{ username: 'root', role: 'ADMIN', updatedAt: 1 }]);
});

const DELEGATED_ADMIN = {
  username: 'deng_test_x2', role: 'ADMIN', fallback: false, delegated: true,
  grantedPages: ['conn:host:security', 'conn:host:w:security'],
};

describe('1132 委派超管的用户管理入口', () => {
  it('委派超管：不渲染新建表单，给出委派只读理由，用户列表仍可读', async () => {
    const { app, host } = await mountSecurity(DELEGATED_ADMIN);
    const card = userCard(host);
    const txt = card.textContent || '';

    expect(card.querySelector('.new-user'), '委派身份不得亮出提交必失败的表单').toBeNull();
    expect(txt).toContain('宿主委派身份只读');
    /* 不得把「你没权限」写成唯一解释：委派超管的角色就是 ADMIN，让他去要 ADMIN 是错的方向 */
    expect(txt).not.toContain('账号管理需要 ADMIN 角色');
    /* 列表可读不能被写权一起拖走 */
    expect([...card.querySelectorAll('tr, .qrt-row')].length, '用户列表应照常渲染').toBeGreaterThan(0);
    app.unmount();
  });

  it('内置超管：新建表单照常渲染（有权限的人不被误拦）', async () => {
    const { app, host } = await mountSecurity({
      username: 'root', role: 'ADMIN', fallback: false, delegated: false,
    });
    const card = userCard(host);
    expect(card.querySelector('.new-user'), '内置 ADMIN 必须能管理本地账号').toBeTruthy();
    app.unmount();
  });
});
