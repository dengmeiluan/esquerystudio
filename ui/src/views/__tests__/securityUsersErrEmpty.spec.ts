/**
 * C3/#13：安全中心「用户管理」卡 err-bar 与 empty 严格互斥契约。
 *
 * 事故现场：empty 的 v-else 只挡 users.length——用户列表拉取失败时
 * usersErr 错误条与「暂无正式账号」空态同现，管理员被误导去重建用户。
 * 修复：empty 改 v-else-if="!usersErr"。
 *
 * 契约：
 *   1) users 接口 reject → err-bar 在，「暂无正式账号」不在
 *   2) users 接口 resolve []（无 err）→ 「暂无正式账号」在，err-bar 不在
 * 锚点收窄到「用户管理」卡内——审计卡也有 .err-bar/.empty，整页查询会误锚。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口，视图/组件/工具全用真的 */
const usersFn = vi.fn();

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api.auth,
        /* 惰性包装：vi.mock factory 被提升到文件顶执行，此时 usersFn 尚未初始化（TDZ），
           直接写 users: usersFn 会在 factory 求值瞬间炸 ReferenceError */
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

async function mountSecurity() {
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
  /* ADMIN 身份必须在挂载前注入：onMounted 的 loadUsers/loadAudit 以 isAdmin() 为门 */
  const auth = useAuthStore(pinia);
  auth.me = { username: 'root', role: 'ADMIN', fallback: false };
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function userCard(host: HTMLElement): HTMLElement {
  /* 锚 .card-t 而非整卡文本：「我的账号」卡的角色说明文案含「用户管理」四字，整卡查找会误锚
     （525 批：视图 .card-title 与全局 .card-t 并轨改名，锚随迁；
       554 批：顶层 .card 壳退役 → border-top 分节，查询锚改四分节类） */
  const card = [...host.querySelectorAll<HTMLElement>('.me-card, .us-card, .ctl-card, .audit-card')]
    .find(c => (c.querySelector('.card-t')?.textContent || '').includes('用户管理'));
  expect(card, '用户管理卡必须渲染').toBeTruthy();
  return card!;
}

beforeEach(() => {
  document.body.innerHTML = '';
  usersFn.mockReset();
});

describe('C3/#13 用户管理卡：err-bar 与 empty 互斥', () => {
  it('用户列表拉取失败 → err-bar 在，空态文案不在', async () => {
    usersFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountSecurity();
    const card = userCard(host);
    expect(card.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    expect(card.textContent, '失败时不许伪装成「暂无正式账号」').not.toContain('暂无正式账号');
    app.unmount();
  });

  it('用户列表为空且无错误 → 空态文案在，err-bar 不在', async () => {
    usersFn.mockResolvedValue([]);
    const { app, host } = await mountSecurity();
    const card = userCard(host);
    expect(card.querySelector('.err-bar'), '无错误时用户管理卡内不许出现错误条').toBeNull();
    expect(card.textContent).toContain('暂无正式账号');
    app.unmount();
  });
});
