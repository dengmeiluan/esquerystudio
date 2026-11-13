/**
 * 安全中心用户表排序 + 审计 kw 快滤（行为网）。
 * ① 用户表（531 批随迁：裸表换 QRT 壳，排序归内核三态升序起步；selectable 批量勾选通道开）；
 * ② 审计表 kw 客户端快滤 username/uri：大小写不敏感，空串全量；
 *    与「仅看被拒」PAGE_DENIED 芯片（服务端 fAction 过滤）叠加=AND——数据集先被 fAction 裁窄，
 *    kw 在其结果上再滤，两者任一命中不了即不出行。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const USERS = [
  { username: 'alice', role: 'VIEWER', updatedAt: '2026-09-01T10:00:00Z' },
  { username: 'bob', role: 'ADMIN', updatedAt: '2026-09-02T10:00:00Z' },
  { username: 'carol', role: 'OPERATOR', updatedAt: '2026-09-03T10:00:00Z' },
];
const AUDIT = [
  { timestamp: '2026-09-18T10:00:00Z', username: 'alice', role: 'VIEWER', action: 'WRITE', method: 'POST', uri: '/internal/es/index-a/_doc', httpStatus: 200, detail: '' },
  { timestamp: '2026-09-18T10:01:00Z', username: 'bob', role: 'VIEWER', action: 'PAGE_DENIED', method: 'GET', uri: '/internal/es/index-b', httpStatus: 403, detail: '' },
  { timestamp: '2026-09-18T10:02:00Z', username: 'carol', role: 'OPERATOR', action: 'LOGIN', method: 'POST', uri: '/login', httpStatus: 200, detail: '' },
];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api.auth,
        users: vi.fn(async () => USERS),
        /* fAction（含 PAGE_DENIED 芯片）是服务端过滤——mock 照实裁窄数据集，AND 语义才可观测 */
        /* 五百五十五批：线缆 {records:[...]} 扁平直出（ES hits 包装契约退役） */
        opsAudit: vi.fn(async (_user: any, action: string) => ({
          records: AUDIT.filter(r => !action || r.action === action),
        })),
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
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(SecurityView) });
  app.use(pinia);
  app.use(router);
  const auth = useAuthStore(pinia);
  auth.me = { username: 'root', role: 'ADMIN', fallback: false } as any;
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function cardByTitle(host: HTMLElement, title: string): HTMLElement {
  /* 五百五十四批锚随迁：顶层 .card 壳退役 → border-top 分节（me/us/ctl/audit 四锚类承接） */
  const card = [...host.querySelectorAll<HTMLElement>('.me-card, .us-card, .ctl-card, .audit-card')]
    .find(c => (c.querySelector('.card-t')?.textContent || '').includes(title));
  expect(card, `卡「${title}」必须渲染`).toBeTruthy();
  return card!;
}
/* 五百二十九批锚随迁：审计表 table.tbl → QRT table.qrt-tbl（剔除 .qrt-nomatch 提示行）；
   用户表仍走 table.tbl（useTableSort 契约不变） */
function auditRows(host: HTMLElement): HTMLElement[] {
  return Array.from(cardByTitle(host, '操作审计').querySelectorAll<HTMLTableRowElement>('table.qrt-tbl tbody tr'))
    .filter(tr => !tr.classList.contains('qrt-nomatch'));
}
async function typeAdKw(host: HTMLElement, kw: string) {
  const inp = host.querySelector<HTMLInputElement>('input[placeholder="过滤用户/URI/集群"]');
  expect(inp, '审计 kw 过滤框必须渲染').toBeTruthy();
  inp!.value = kw;
  inp!.dispatchEvent(new Event('input'));
  await settle();
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

describe('SecurityView 用户表排序（531 批随迁：换 QRT 壳，内核三态升序起步）', () => {
  it('点用户名 th → 升序（aria-sort=ascending）；再点降序；三击取消回原序', async () => {
    const { app, host } = await mountSecurity();
    const card = cardByTitle(host, '用户管理');
    const th = () => [...card.querySelectorAll<HTMLTableCellElement>('table.qrt-tbl thead th')]
      .find(t => t.dataset.col === '用户名')!;
    expect(th(), '用户名列 th 在（data-col=中文键）').toBeTruthy();
    const firstUser = () => card.querySelector('table.qrt-tbl tbody tr td.qrt-cell')!.textContent!.trim();
    expect(firstUser(), '默认无排序键=拉取原序').toBe('alice');
    th().click();
    await settle();
    expect(firstUser(), '首击升序（QRT 内核 227 批口径：升序起步）').toBe('alice');
    expect(th().getAttribute('aria-sort')).toBe('ascending');
    th().click();
    await settle();
    expect(firstUser(), '再点翻转降序').toBe('carol');
    expect(th().getAttribute('aria-sort')).toBe('descending');
    th().click();
    await settle();
    expect(firstUser(), '三击取消回原始序').toBe('alice');
    expect(th().getAttribute('aria-sort')).toBeNull();
    app.unmount();
  });

  it('selectable 行多选通道（批量场景）：勾选 tr 挂 qrt-sel + 计数徽标', async () => {
    const { app, host } = await mountSecurity();
    const card = cardByTitle(host, '用户管理');
    const boxes = [...card.querySelectorAll<HTMLInputElement>('tbody .qrt-sel-col input[type="checkbox"]')];
    expect(boxes.length, 'selectable 已开：每行勾选框在').toBe(3);
    boxes[0].click();
    await settle();
    expect(card.querySelector('tbody tr.qrt-sel'), '勾选行挂 qrt-sel').toBeTruthy();
    expect(card.textContent).toContain('已选 1 用户');
    app.unmount();
  });
});

describe('SecurityView 审计 kw 快滤（与 PAGE_DENIED 芯片 AND 叠加）', () => {
  it('uri 命中收窄；用户名大小写不敏感命中；空串全量', async () => {
    const { app, host } = await mountSecurity();
    expect(auditRows(host).length).toBe(3);
    await typeAdKw(host, 'index-b');
    expect(auditRows(host).length, 'uri includes 命中 bob 一行').toBe(1);
    expect(auditRows(host)[0].textContent).toContain('bob');
    await typeAdKw(host, 'ALICE');
    expect(auditRows(host).length, '大写过滤词命中（大小写不敏感）').toBe(1);
    expect(auditRows(host)[0].textContent).toContain('alice');
    await typeAdKw(host, '');
    expect(auditRows(host).length, '空串回全量').toBe(3);
    app.unmount();
  });

  it('AND 叠加：芯片裁窄数据集后，kw 命中被裁掉的用户也不出行', async () => {
    const { app, host } = await mountSecurity();
    const deniedBtn = [...cardByTitle(host, '操作审计').querySelectorAll<HTMLButtonElement>('button')]
      .find(b => b.textContent?.includes('仅看被拒'));
    deniedBtn!.click();
    await settle();
    expect(auditRows(host).length, 'PAGE_DENIED 服务端过滤后只剩 bob').toBe(1);
    await typeAdKw(host, 'alice');
    expect(auditRows(host).length, 'alice 被 fAction 裁掉，kw 命中也不复活（AND）').toBe(0);
    await typeAdKw(host, 'index-b');
    expect(auditRows(host).length, 'kw 与芯片同时命中才保留').toBe(1);
    app.unmount();
  });
});
