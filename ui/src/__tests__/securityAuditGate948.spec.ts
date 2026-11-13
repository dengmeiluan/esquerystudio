/**
 * 九百四十八批刀②：SecurityView loadAudit 执行闸（933-C1 通道覆盖律谱系）。
 *
 * 矿相：loadAudit 九通道执行体（两下拉 @change/仅看被拒钮/刷新钮/四个筛选 Enter/
 * 重试钮/onMounted/watch role）零本体闸——同拍双击刷新钮双发 opsAudit；在途窗内
 * 改筛选+回车使旧筛选慢包后到顶掉新筛选结果（筛选参数在 fetchAuditPage 调用时读
 * 当前 ref，两拍参数即分裂）；同文件 loadMore 有闸（moreLoading 短路，798 批在案）
 * 而 loadAudit 无=同域两口径。修法：闸读收本体首行（auditLoading 自守，与 loadMore
 * 同形）+刷新/仅看被拒两钮 :disabled 双保险。
 * 锁定形态：行为锚（挂载+pending 袋，securityRebindGate940 挂具范式）+源码锁；
 * inflightPatrol798（auditLoading/moreLoading 与重试钮字面）、securityReadability
 * （PAGE_DENIED 点击形态）、securityAuditToolRow639（工具行结构）、permGating（watch
 * 接线）共处零扰动。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const usersFn = vi.fn();
const opsAuditFn = vi.fn();
const opsAuditMineFn = vi.fn();
const facetsFn = vi.fn();
const statusFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api.auth,
        users: (...a: any[]) => usersFn(...a),
        auditFacets: (...a: any[]) => facetsFn(...a),
        opsAudit: (...a: any[]) => opsAuditFn(...a),
        opsAuditMine: (...a: any[]) => opsAuditMineFn(...a),
      },
      setup: {
        ...actual.api.setup,
        status: (...a: any[]) => statusFn(...a),
      },
    },
  };
});

import SecurityView from '../views/SecurityView.vue';
import { useAuthStore } from '../stores/auth';

const apps: ReturnType<typeof createApp>[] = [];
let pendingAudit: { res: (v: any) => void }[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const AUDIT_ROW = { timestamp: 1750000000000, username: 'bob', displayName: 'bob', role: 'VIEWER', source: 'console', action: 'LOGIN', method: 'GET', uri: '/internal/es/index/auth/me', connName: 'c1', connId: 'c1', ip: '127.0.0.1', httpStatus: 200, costMs: 5, detail: '' };

async function mountSec() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore(pinia);
  auth.me = { username: 't', role: 'ADMIN', fallback: false };
  const app = createApp({ render: () => h(SecurityView as any) });
  app.use(pinia);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle();
  return { app, host };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

function auditRefreshBtn(host: ParentNode): HTMLButtonElement {
  /* 审计卡刷新钮=全文唯一 trim 后恰为「刷新」的钮（刷新用户列表/安全状态等文案均带后缀） */
  const btns = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .filter(b => (b.textContent || '').trim() === '刷新');
  if (btns.length !== 1) throw new Error('audit refresh button not unique: ' + btns.length);
  return btns[0]!;
}

function auditUserInput(host: ParentNode): HTMLInputElement {
  const inp = host.querySelector<HTMLInputElement>('input[placeholder="按用户过滤"]');
  if (!inp) throw new Error('audit user filter input not found');
  return inp;
}

/** 按触发序放行并摘袋（raceGuard860 release 同源：袋长=在途拍数） */
function releaseAudit(i: number, v: any) {
  if (!pendingAudit[i]) throw new Error(`pending #${i} 不在场`);
  pendingAudit.splice(i, 1)[0]!.res(v);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  pendingAudit = [];
  usersFn.mockReset().mockResolvedValue([]);
  opsAuditFn.mockReset().mockImplementation(() =>
    new Promise<any>(res => { pendingAudit.push({ res }); }));
  opsAuditMineFn.mockReset().mockResolvedValue({ records: [] });
  facetsFn.mockReset().mockResolvedValue({ actions: [], conns: [], users: [], uris: [] });
  statusFn.mockReset().mockResolvedValue({ bound: true, mode: 'BOOTSTRAP', endpoint: 'http://es1:9200', appName: 't', hostVisible: true });
});
afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('948 刀②：loadAudit 执行闸（行为锚）', () => {
  it('同拍双击刷新钮：单发铁证（挂载首拍之外恰一拍）', async () => {
    const { host } = await mountSec();
    expect(pendingAudit.length).toBe(1);                       /* 挂载首拍在袋 */
    releaseAudit(0, { records: [AUDIT_ROW] });
    await settle(8);
    const before = opsAuditFn.mock.calls.length;               /* =1 */
    const btn = auditRefreshBtn(host);
    btn.click();
    btn.click();                                               /* 同拍二击：Vue patch 前两 handler 均入队 */
    await settle(8);
    expect(opsAuditFn.mock.calls.length).toBe(before + 1);     /* 修复前=+2 */
    expect(pendingAudit.length).toBe(1);
  });

  it('在途窗内筛选 Enter 通道被闸：不叠加新拍', async () => {
    const { host } = await mountSec();
    await settle(4);
    expect(pendingAudit.length).toBe(1);                       /* 首拍保持慢包在途 */
    const inp = auditUserInput(host);
    inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    await settle(8);
    expect(opsAuditFn.mock.calls.length).toBe(1);              /* 修复前=3（挂载+双 Enter） */
  });

  it('落定复位防闸死：释放后刷新再拍；失败路径 err 后通道仍可用', async () => {
    const { host } = await mountSec();
    releaseAudit(0, { records: [AUDIT_ROW] });
    await settle(8);
    auditRefreshBtn(host).click();
    await settle(4);
    expect(pendingAudit.length).toBe(1);
    releaseAudit(0, Promise.reject(new Error('boom')));
    await settle(8);
    const st = stateOf(apps[0]!);
    expect(st.auditErr).not.toBe('');
    auditRefreshBtn(host).click();
    await settle(4);
    expect(pendingAudit.length).toBe(1);                       /* 失败不闸死 */
    releaseAudit(0, { records: [AUDIT_ROW] });
    await settle(8);
    expect(stateOf(apps[0]!).auditErr).toBe('');
  });

  it('在途窗钮面双保险：刷新/仅看被拒两钮 disabled，落定复位', async () => {
    const { host } = await mountSec();
    await settle(4);
    const refresh = auditRefreshBtn(host);
    const denied = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find(b => (b.textContent || '').includes('仅看被拒'));
    expect(denied, '仅看被拒钮在场').toBeTruthy();
    expect(refresh.disabled).toBe(true);
    expect(denied!.disabled).toBe(true);
    releaseAudit(0, { records: [AUDIT_ROW] });
    await settle(8);
    expect(refresh.disabled).toBe(false);
    expect(denied!.disabled).toBe(false);
  });
});

describe('948 刀②：loadAudit 执行闸（源码锁）', () => {
  const src = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');

  it('闸读收本体首行且先于置位；两钮守卫字面', () => {
    const body = src.slice(src.indexOf('async function loadAudit'), src.indexOf('async function loadMore'));
    expect(body, '闸读收本体首行').toContain('if (auditLoading.value) return;');
    expect(body.indexOf('if (auditLoading.value) return;'), '闸读先于置位')
      .toBeLessThan(body.indexOf('auditLoading.value = true;'));
    expect(src, '审计刷新钮守卫').toContain(
      '<button class="btn ghost sm" :disabled="auditLoading" @click="loadAudit"><RefreshCw :size="12" /> 刷新</button>');
    expect(src, '仅看被拒钮守卫').toContain(
      '<button class="btn ghost sm" :disabled="auditLoading" :class="{ on: fAction === \'PAGE_DENIED\' }"');
  });
});
