/**
 * useJobNotify 看守（审查修复项）：授权态回显、幂等键重置、标题还原条件化、偏好读取防御、偏好共享。
 *
 *  · perm：响应式授权态（unsupported / default / denied / granted）——授权请求的回执、
 *    回到页面（visibilitychange）都会刷新；此前页面里用 computed 读 Notification.permission，
 *    零响应依赖，授权后回显永远不变；
 *  · resetJob(jobId)：作业状态回到 RUNNING（新一轮生命周期）时清该作业已发过的通知键，
 *    续跑/重跑沿用同一 jobId 时，停门/终态可再提醒；
 *  · 标题还原：停闪时仅当当前标题仍是本件写下的闪烁串才还原快照；闪烁期间标题被外部
 *    （路由器）改写则不动它 / 以新标题为底继续闪，不把新标题压回起闪时的旧页名；
 *  · 偏好读取：存储值是 JSON null / 非对象时按记录损坏回落默认档，不抛；
 *  · 偏好共享：titleEnabled / desktopEnabled 为模块级单例，两个调用方读写同一份。
 * 组件环境用 dummy 组件承接（onBeforeUnmount / 事件监听需要实例）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { useJobNotify } from '../composables/useJobNotify';

const KEY = 'job-notify-v1';

const notifyCreated: { title: string; options: any }[] = [];
let requestResult: string = 'granted';
const requestPermissionFn = vi.fn(async () => requestResult);
class FakeNotification {
  static permission = 'default';
  static requestPermission = requestPermissionFn;
  onclick: (() => void) | null = null;
  constructor(public title: string, public options: any) { notifyCreated.push({ title, options }); }
  close() { /* no-op */ }
}

let hiddenVal = false;
const apps: ReturnType<typeof createApp>[] = [];

function mountNotify(opts?: { storageKey?: string }): ReturnType<typeof useJobNotify> {
  let api: ReturnType<typeof useJobNotify> | null = null;
  const Comp = { setup() { api = useJobNotify(opts); return () => h('div'); } };
  const app = createApp(Comp);
  apps.push(app);
  app.mount(document.createElement('div'));
  return api!;
}

async function settle(n = 4) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  document.title = '';
  document.body.innerHTML = '';
  notifyCreated.length = 0;
  requestPermissionFn.mockClear();
  requestResult = 'granted';
  FakeNotification.permission = 'default';
  vi.stubGlobal('Notification', FakeNotification);
  hiddenVal = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hiddenVal);
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.title = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useJobNotify · 授权态回显（perm）', () => {
  it('初值按当前 Notification.permission 归一；无 Notification 环境 = unsupported', () => {
    FakeNotification.permission = 'granted';
    expect(mountNotify().perm.value).toBe('granted');
    FakeNotification.permission = 'denied';
    expect(mountNotify().perm.value).toBe('denied');
    FakeNotification.permission = 'default';
    expect(mountNotify().perm.value).toBe('default');
    FakeNotification.permission = 'whatever-unknown';
    expect(mountNotify().perm.value, '未知取值归 default 档').toBe('default');
    vi.unstubAllGlobals();
    /* 共享态在每次调用时按当前环境重读：拿掉 Notification 后新调用方读到 unsupported */
    expect(mountNotify().perm.value).toBe('unsupported');
  });

  it('requestDesktop 按授权回执更新 perm：拒绝 → denied 且返回 false；同意 → granted、落偏好并返回 true', async () => {
    const api = mountNotify();
    FakeNotification.permission = 'default';
    requestResult = 'denied';
    expect(await api.requestDesktop()).toBe(false);
    expect(api.perm.value, '用户在授权弹窗点了拒绝').toBe('denied');
    expect(api.desktopEnabled.value).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY) || '{}')).toEqual({ title: true, desktop: false });

    requestResult = 'granted';
    expect(await api.requestDesktop()).toBe(true);
    expect(api.perm.value, '同意后回显 granted').toBe('granted');
    expect(api.desktopEnabled.value).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY) || '{}')).toEqual({ title: true, desktop: true });
  });

  it('已是终局态不再弹授权窗：granted 直接返回 true；denied 返回 false 且不请求', async () => {
    const api = mountNotify();
    FakeNotification.permission = 'granted';
    expect(await api.requestDesktop()).toBe(true);
    FakeNotification.permission = 'denied';
    expect(await api.requestDesktop()).toBe(false);
    expect(api.perm.value).toBe('denied');
    expect(requestPermissionFn, '终局态不重复请求').not.toHaveBeenCalled();
  });

  it('回到页面（visibilitychange 转可见）重读授权态——站点设置里改过权限也能回显', async () => {
    FakeNotification.permission = 'denied';
    const api = mountNotify();
    expect(api.perm.value).toBe('denied');
    /* 隐藏期间用户去站点设置里放行；浏览器在切回标签页时才同步权限值 */
    FakeNotification.permission = 'granted';
    hiddenVal = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(api.perm.value, '隐藏拍不动').toBe('denied');
    hiddenVal = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(api.perm.value, '回前台后刷新为 granted').toBe('granted');
  });
});

describe('useJobNotify · 幂等键重置（resetJob）', () => {
  it('同一 jobId+level 只通知一次；resetJob 后该作业可再通知，别的作业的键不受影响', () => {
    /* 桌面通知需授权 + 偏好开：构造调用全量记录，用作「通知是否发出」的观测量 */
    localStorage.setItem(KEY, JSON.stringify({ title: true, desktop: true }));
    FakeNotification.permission = 'granted';
    hiddenVal = true;
    const api = mountNotify();
    api.notify('j1', 'failed', '作业 j1 失败');
    api.notify('j1', 'failed', '作业 j1 失败');
    api.notify('j2', 'failed', '作业 j2 失败');
    expect(notifyCreated.map(n => n.options.tag)).toEqual(['j1::failed', 'j2::failed']);

    /* j1 续跑后再次失败：重置前被上一轮的键吞掉，重置后可再提醒 */
    api.resetJob('j1');
    api.notify('j1', 'failed', '作业 j1 再次失败');
    expect(notifyCreated.map(n => n.options.tag)).toEqual(['j1::failed', 'j2::failed', 'j1::failed']);

    /* 重置只摘该作业的键：j2 仍被幂等挡住；前缀相同的作业 id 不被误删（j10 不是 j1） */
    api.notify('j2', 'failed', '作业 j2 失败');
    api.resetJob('j1');
    api.notify('j10', 'failed', '作业 j10 失败');
    api.notify('j10', 'failed', '作业 j10 失败');
    expect(notifyCreated.map(n => n.options.tag)).toEqual(['j1::failed', 'j2::failed', 'j1::failed', 'j10::failed']);
  });
});

describe('useJobNotify · 标题还原条件化', () => {
  it('正常停闪：当前标题仍是闪烁串 → 还原起闪快照', () => {
    hiddenVal = true;
    const api = mountNotify();
    document.title = '迁移 | ESQueryStudio';
    api.notify('j1', 'done', 'x');
    expect(document.title).toBe('✅ 迁移 | ESQueryStudio');
    api.settle();
    expect(document.title).toBe('迁移 | ESQueryStudio');
  });

  it('底标题为空时也能还原（document.title 读取会剥掉首尾空白，「图标+空格」读回来只剩图标）', () => {
    hiddenVal = true;
    const api = mountNotify();
    api.notify('j1', 'gate', 'x');
    expect(document.title).toBe('⏸');
    api.settle();
    expect(document.title).toBe('');
  });

  it('两拍之间标题被路由器改写：停闪不动新标题（不写回起闪时的旧页名）', () => {
    hiddenVal = true;
    const api = mountNotify();
    document.title = '迁移 | ESQueryStudio';
    api.notify('j1', 'done', 'x');
    document.title = '安全中心 | ESQueryStudio';
    api.settle();
    expect(document.title, '新标题保持原样').toBe('安全中心 | ESQueryStudio');
  });

  it('闪烁拍之间标题被路由器改写：下一拍以新标题为底继续闪，停闪还原成新标题', async () => {
    vi.useFakeTimers();
    hiddenVal = true;
    const api = mountNotify();
    document.title = '迁移 | ESQueryStudio';
    api.notify('j1', 'done', 'x');
    document.title = '安全中心 | ESQueryStudio';
    await vi.advanceTimersByTimeAsync(900);
    expect(document.title, '下一拍翻到「灭」态：显示新标题，不带旧页名').toBe('安全中心 | ESQueryStudio');
    await vi.advanceTimersByTimeAsync(900);
    expect(document.title, '再翻到「亮」态：新标题前带图标').toBe('✅ 安全中心 | ESQueryStudio');
    api.settle();
    expect(document.title).toBe('安全中心 | ESQueryStudio');
  });
});

describe('useJobNotify · 偏好读取与共享', () => {
  it.each(['null', '123', '"text"', 'true'])('存储记录为 %s（非对象）：不抛，回落默认档', (raw) => {
    localStorage.setItem(KEY, raw);
    const api = mountNotify();
    expect(api.titleEnabled.value).toBe(true);
    expect(api.desktopEnabled.value).toBe(false);
  });

  it('合法记录照常读回；缺字段落默认', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: false }));
    const api = mountNotify();
    expect(api.titleEnabled.value).toBe(false);
    expect(api.desktopEnabled.value, '缺 desktop 字段 = 默认关').toBe(false);
  });

  it('titleEnabled / desktopEnabled 为模块级单例：一处改开关，另一处同步可见并照旧落盘', async () => {
    const a = mountNotify();
    const b = mountNotify();
    expect(b.titleEnabled.value).toBe(true);
    a.setTitleEnabled(false);
    await settle();
    expect(b.titleEnabled.value, '同时存活的另一页读到同一份值').toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY) || '{}'), '持久化照旧').toEqual({ title: false, desktop: false });
    /* 新调用方仍按落盘记录读回（新挂载页面读盘语义不变） */
    const c = mountNotify();
    expect(c.titleEnabled.value).toBe(false);
    c.setTitleEnabled(true);
    expect(a.titleEnabled.value).toBe(true);
  });
});
