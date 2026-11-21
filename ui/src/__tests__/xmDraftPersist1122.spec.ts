/**
 * 2026-11-22 批：迁移工作台草稿跨会话持久化（workbench）。
 *
 *   ① 安全——写入 localStorage（esquerystudio.xmigrate.workbench-v1）的内容不含明文
 *     密码（写前 redactDraft 掩埋）；读回掩埋值（"***"）视为空重填，非凭据字段正常恢复
 *     + DraftBadge 恢复提示在场；
 *   ② 旧稿迁移——旧 draft2 sessionStorage 会话稿（conn/src-conn-id/form 三把）挂载时
 *     一次性搬入新 key（搬入即落盘）并删除旧 key，表单恢复用户无感；
 *   ③ batch 段——批量勾选+前缀对落同一 key 的 batch 段，刷新（重挂）后恢复；
 *   ④ 语义保持——「恢复到默认=清除」（全段归默认删 key）；badge 清除钮一键清稿（立即
     落盘不等节流）；500ms 节流合并写 + 卸载冲账（pending 窗口内编辑不丢）。
 * 挂具范式同 xmThrottle1122（全真挂载 + api mock）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';
import { draftStorageKey } from '../composables/useScopedDraft';

const XB_WB_KEY = 'esquerystudio.xmigrate.workbench-v1';

const xbJobs = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobs(...a),
        destIndices: async () => [],
      },
    },
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mountXm() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/xmigrate', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 安全：redact 写入 + 掩埋读回 ═══ */
describe('1122 workbench ①：凭据不落盘', () => {
  it('编辑 conn/form 后落 localStorage：明文密码绝不在场（redact 掩埋为 ***），非凭据字段在场', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.conn.host = 'es-old';
    st.conn.port = 9201;
    st.conn.username = 'ops';
    st.conn.password = 'secret-pw';
    st.form.sourceIndex = 'src-a';
    st.form.destIndex = 'dst-a';
    await settle(2);
    await sleep(620); /* 500ms 节流窗 */
    const raw = localStorage.getItem(XB_WB_KEY);
    expect(raw, 'workbench key 已落盘').toBeTruthy();
    expect(raw!, '明文密码绝不在场').not.toContain('secret-pw');
    expect(raw!, 'password 掩埋为 ***（redactDraft）').toContain('"password":"***"');
    expect(raw!).toContain('es-old');
    expect(raw!).toContain('dst-a');
    app.unmount();
    void host;
  }, 10000);

  it('读回掩埋值视为空：手置 password:"***" 稿 → password 置空重填，非凭据字段恢复 + badge 在场', async () => {
    localStorage.setItem(XB_WB_KEY, JSON.stringify({
      conn: { scheme: 'https', host: 'es-keep', port: 9200, username: 'u1', password: '***' },
      form: { destIndex: 'dst-keep', sourceIndex: 'src-keep', destCreateMode: 'NONE', tuneMode: 'AGGRESSIVE' },
    }));
    const { app } = await mountXm();
    const st = stateOf(app);
    expect(st.conn.password, '掩埋值视为空').toBe('');
    expect(st.conn.host, '非凭据字段恢复').toBe('es-keep');
    expect(st.conn.scheme).toBe('https');
    expect(st.form.destIndex).toBe('dst-keep');
    expect(st.form.autoVerify, '旧稿缺 autoVerify 归默认开').toBe(true);
    expect(document.querySelector('.draft-badge'), 'DraftBadge 恢复提示在场（来源变语义不变）').toBeTruthy();
    app.unmount();
  }, 10000);
});

/* ═══ ② 旧 sessionStorage 稿一次性迁移 ═══ */
describe('1122 workbench ②：旧稿迁移', () => {
  it('draft2 三把会话稿 → 搬入新 key（落盘）+ 删旧 key + 表单恢复无感', async () => {
    const kConn = draftStorageKey({ route: 'xmigrate' }, 'conn');
    const kSrc = draftStorageKey({ route: 'xmigrate' }, 'src-conn-id');
    const kForm = draftStorageKey({ route: 'xmigrate' }, 'form');
    sessionStorage.setItem(kConn, JSON.stringify({ scheme: 'http', host: 'old-host', port: 9202, username: 'ou', password: '***' }));
    sessionStorage.setItem(kSrc, 'conn-9');
    sessionStorage.setItem(kForm, JSON.stringify({ sourceIndex: 'old-src', destIndex: 'old-dst', destCreateMode: 'NONE', tuneMode: 'GENTLE' }));
    const { app } = await mountXm();
    const st = stateOf(app);
    expect(st.conn.host, 'conn 旧稿恢复').toBe('old-host');
    expect(st.conn.password, '旧稿掩埋密码置空').toBe('');
    expect(st.srcConnId, 'src-conn-id 旧稿恢复').toBe('conn-9');
    expect(st.form.sourceIndex, 'form 旧稿恢复').toBe('old-src');
    expect(st.form.tuneMode).toBe('GENTLE');
    expect(sessionStorage.getItem(kConn), '旧 key 已删（conn）').toBeNull();
    expect(sessionStorage.getItem(kSrc), '旧 key 已删（src-conn-id）').toBeNull();
    expect(sessionStorage.getItem(kForm), '旧 key 已删（form）').toBeNull();
    const raw = localStorage.getItem(XB_WB_KEY);
    expect(raw, '搬入即落盘新 key（中途关页不丢稿）').toBeTruthy();
    expect(raw!).toContain('old-host');
    expect(raw!).toContain('conn-9');
    expect(document.querySelector('.draft-badge'), '迁移恢复有 badge 提示').toBeTruthy();
    app.unmount();
  }, 10000);

  it('新 key 已有稿时不迁旧稿（旧稿作废，不覆盖新稿）', async () => {
    localStorage.setItem(XB_WB_KEY, JSON.stringify({ form: { destIndex: 'new-dst' } }));
    const kForm = draftStorageKey({ route: 'xmigrate' }, 'form');
    sessionStorage.setItem(kForm, JSON.stringify({ destIndex: 'stale-dst' }));
    const { app } = await mountXm();
    const st = stateOf(app);
    expect(st.form.destIndex, '新稿优先').toBe('new-dst');
    expect(localStorage.getItem(XB_WB_KEY)!).not.toContain('stale-dst');
    app.unmount();
  }, 10000);
});

/* ═══ ③ batch 段：勾选+前缀跨会话恢复 ═══ */
describe('1122 workbench ③：batch 段', () => {
  it('批量勾选+前缀进 batch 段；重挂（模拟刷新）后恢复', async () => {
    const m1 = await mountXm();
    const st1 = stateOf(m1.app);
    st1.batchSel.push('idx-a');
    st1.batchSel.push('idx-b');
    st1.batchSrcPrefix = 'on_';
    st1.batchDstPrefix = 'uat_';
    await settle(2);
    await sleep(620);
    const raw = localStorage.getItem(XB_WB_KEY)!;
    expect(raw).toContain('"idx-a"');
    expect(raw).toContain('uat_');
    m1.app.unmount();

    const m2 = await mountXm();
    const st2 = stateOf(m2.app);
    expect(st2.batchSel, '勾选跨会话恢复').toEqual(['idx-a', 'idx-b']);
    expect(st2.batchSrcPrefix).toBe('on_');
    expect(st2.batchDstPrefix).toBe('uat_');
    m2.app.unmount();
  }, 12000);
});

/* ═══ ④ 语义保持：默认=清除 / badge 清除 / 节流与冲账 ═══ */
describe('1122 workbench ④：语义保持与写通道', () => {
  it('恢复到默认=清除：form 归默认后整 key 删除（无任何非默认段）', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    st.form.destIndex = 'tmp-dst';
    await settle(2);
    await sleep(620);
    expect(localStorage.getItem(XB_WB_KEY), '非默认稿在场').toBeTruthy();
    st.form.destIndex = ''; /* 归默认（conn/srcConnId/batch 本就默认） */
    await settle(2);
    await sleep(620);
    expect(localStorage.getItem(XB_WB_KEY), '全段归默认=清除').toBeNull();
    app.unmount();
  }, 12000);

  it('DraftBadge 清除钮：一键清三把内容稿并立即落盘清除（不等节流窗）', async () => {
    localStorage.setItem(XB_WB_KEY, JSON.stringify({
      conn: { host: 'h9' }, form: { destIndex: 'd9' },
    }));
    const { app } = await mountXm();
    const st = stateOf(app);
    const xBtn = document.querySelector('.draft-badge-x') as HTMLButtonElement;
    expect(xBtn, 'badge 清除钮在场').toBeTruthy();
    xBtn.click();
    await settle(2);
    expect(st.conn.host, 'conn 已清默认').toBe('');
    expect(st.form.destIndex, 'form 已清默认').toBe('');
    expect(localStorage.getItem(XB_WB_KEY), '清除立即落盘（key 删）').toBeNull();
    app.unmount();
  }, 10000);

  it('500ms 节流合并写 + 卸载冲账：节流窗内连续编辑合并，unmount 前冲账落盘', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    st.form.destIndex = 'flush-1';
    await settle(2);
    expect(localStorage.getItem(XB_WB_KEY), '节流窗内未落盘').toBeNull();
    st.form.destIndex = 'flush-2'; /* 窗口内二次编辑合并 */
    await settle(2);
    app.unmount(); /* 卸载冲账：pending 窗口内的最后编辑不丢 */
    const raw = localStorage.getItem(XB_WB_KEY);
    expect(raw, '卸载冲账已落盘').toBeTruthy();
    expect(raw!).toContain('flush-2');
    expect(raw!).not.toContain('flush-1');
  }, 10000);
});
