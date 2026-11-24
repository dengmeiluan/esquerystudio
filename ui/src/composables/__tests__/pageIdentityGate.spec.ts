import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { usePageIdentityGate, useGatedBootRead } from '../usePageIdentityGate';
import { useAuthStore } from '../../stores/auth';

/* 1125：挂载期读取身份门的契约锁。
   核心是**方向**——身份未落地时必须拦（fail-closed），而「探测从未启动」的场景要放行，
   否则独立部署/测试宿主会被自己的门永久挡住。 */

const apps: ReturnType<typeof createApp>[] = [];

function mountWith(fn: (a: ReturnType<typeof useAuthStore>) => any) {
  const pinia = createPinia();
  let out: any;
  const C = defineComponent({
    setup() {
      const a = useAuthStore();
      out = fn(a);
      return () => h('div');
    },
  });
  const app = createApp(C);
  app.use(pinia);
  const el = document.createElement('div');
  document.body.appendChild(el);
  app.mount(el);
  apps.push(app);
  return { out, auth: useAuthStore(pinia) };
}
const settle = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const asAdmin = (a: any) => { a.beginProbe(); a.probed = true; a.me = { username: 'u', role: 'ADMIN', grantedPages: null }; };

beforeEach(() => {
  localStorage.clear();
  while (apps.length) { apps.pop()!.unmount(); }
  document.body.innerHTML = '';
});

describe('usePageIdentityGate 判定方向', () => {
  it('探测未启动（独立部署 / 测试宿主）放行', () => {
    const { out, auth } = mountWith(() => usePageIdentityGate('indices'));
    expect(auth.probeStarted).toBe(false);
    expect(out.allowed()).toBe(true);
  });

  it('探测进行中拦截 —— 不得写成 !probed 的 fail-open', () => {
    const { out, auth } = mountWith((a) => { a.beginProbe(); return usePageIdentityGate('indices'); });
    expect(auth.probeStarted).toBe(true);
    expect(auth.probed).toBe(false);
    expect(out.allowed()).toBe(false);
  });

  it('后端关闭鉴权时放行', () => {
    const { out } = mountWith((a) => { a.beginProbe(); (a as any).authDisabled = true; return usePageIdentityGate('indices'); });
    expect(out.allowed()).toBe(true);
  });

  it('身份落地且目标下可读时放行', () => {
    const { out } = mountWith((a) => { asAdmin(a); return usePageIdentityGate('indices'); });
    expect(out.allowed()).toBe(true);
  });

  it('身份落地但页面集为空（零授权）时拦截', () => {
    const { out } = mountWith((a) => {
      a.beginProbe(); a.probed = true; a.me = { username: 'u', role: 'VIEWER', grantedPages: [] } as any;
      return usePageIdentityGate('indices');
    });
    expect(out.allowed()).toBe(false);
  });
});

describe('useGatedBootRead 挂起与补跑', () => {
  it('composable 自身不自动执行（由页面显式触发）', () => {
    const run = vi.fn();
    mountWith(() => useGatedBootRead('indices', run));
    expect(run).not.toHaveBeenCalled();
  });

  it('未放行时 trigger 只挂起，身份落地后补跑恰好一次', async () => {
    const run = vi.fn();
    const { out, auth } = mountWith((a) => { a.beginProbe(); return useGatedBootRead('indices', run); });
    out.run();
    expect(run).not.toHaveBeenCalled();
    expect(out.pending()).toBe(true);

    asAdmin(auth);
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    expect(out.pending()).toBe(false);

    await settle();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('零授权账号不补跑（条件不满足继续挂起）', async () => {
    const run = vi.fn();
    const { out, auth } = mountWith((a) => { a.beginProbe(); return useGatedBootRead('indices', run); });
    out.run();
    auth.probed = true as any;
    auth.me = { username: 'u', role: 'VIEWER', grantedPages: [] } as any;
    await settle();
    expect(run).not.toHaveBeenCalled();
    expect(out.pending()).toBe(true);
  });

  it('放行状态下 trigger 直接执行（手动刷新路径）', () => {
    const run = vi.fn();
    const { out } = mountWith(() => useGatedBootRead('indices', run));
    out.run();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('targetId 变化同样触发挂起补偿', async () => {
    const run = vi.fn();
    const target = ref('qa');
    const { out, auth } = mountWith((a) => {
      a.beginProbe();
      return useGatedBootRead('indices', run, { targetId: () => target.value });
    });
    out.run();
    expect(run).not.toHaveBeenCalled();
    asAdmin(auth);
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
