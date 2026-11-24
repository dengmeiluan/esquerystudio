import { ref, onBeforeUnmount, type Ref } from 'vue';
import { readStoredJson, writeStoredRaw } from '../utils/safeJson';

/* 长作业后台通知：页面隐藏时长作业的停门/终态不再要求用户盯守——
   桌面通知（Notification API，按授权态）+ 标签页标题闪烁（免授权兜底）双通道；
   同一 jobId+level 只通知一次（幂等），回到页面自动停闪。两页（托管重建/跨集群迁移）
   共用，偏好持久化单键（默认开标题闪烁；桌面通知需用户显式授权，denied 后不再骚扰）。 */

export type JobNotifyLevel = 'gate' | 'done' | 'failed' | 'aborted';
/** 桌面通知授权态：unsupported=环境无 Notification，其余三档同 Notification.permission */
export type JobNotifyPerm = 'unsupported' | 'default' | 'denied' | 'granted';

const LEVEL_ICON: Record<JobNotifyLevel, string> = {
  gate: '⏸',
  done: '✅',
  failed: '✖',
  aborted: '⛔',
};

const DEFAULT_STORAGE_KEY = 'job-notify-v1';

interface NotifyPref { title: boolean; desktop: boolean }

function readPref(key: string): NotifyPref {
  /* isShape 挡住 JSON null/非对象记录：否则取 v.title 即抛，按记录损坏回落默认档 */
  const v = readStoredJson<Partial<NotifyPref>>(localStorage, key, {}, x => !!x && typeof x === 'object');
  return { title: v.title !== false, desktop: v.desktop === true };
}

function normPerm(raw: unknown): Exclude<JobNotifyPerm, 'unsupported'> {
  const p = String(raw ?? 'default') || 'default';
  return p === 'granted' || p === 'denied' ? p : 'default';
}
function readPerm(): JobNotifyPerm {
  return typeof Notification === 'undefined' ? 'unsupported' : normPerm(Notification.permission);
}

/* 偏好档与授权态为模块级单例（按存储键）：两页都挂在 KeepAlive 下同时存活，各持一份 ref 时
   一页改开关/拿到授权、另一页会停在旧值（持久化只负责落盘，不回推内存态）。
   每次调用仍按持久化记录/浏览器当前权限重读一次——新挂载的页面读盘语义不变
   （另一标签页改过的值也跟得上），存活期间经共享 ref 同步。 */
interface SharedState { title: Ref<boolean>; desktop: Ref<boolean>; perm: Ref<JobNotifyPerm> }
const sharedStates = new Map<string, SharedState>();
function sharedState(key: string): SharedState {
  let s = sharedStates.get(key);
  if (!s) {
    s = { title: ref(true), desktop: ref(false), perm: ref<JobNotifyPerm>('default') };
    sharedStates.set(key, s);
  }
  const stored = readPref(key);
  s.title.value = stored.title;
  s.desktop.value = stored.desktop;
  s.perm.value = readPerm();
  return s;
}

export function useJobNotify(opts?: { storageKey?: string }) {
  const key = opts?.storageKey ?? DEFAULT_STORAGE_KEY;
  const { title: titleEnabled, desktop: desktopEnabled, perm } = sharedState(key);

  const fired = new Set<string>();
  let blinkTimer: ReturnType<typeof setInterval> | null = null;
  let baseTitle: string | null = null;
  let blinkIcon = '';
  let blinkOn = false;

  function persist() {
    /* 防御性写入单源（隐私模式/配额满吞异常）：存储不可用时偏好仅会话内生效 */
    writeStoredRaw(localStorage, key,
      JSON.stringify({ title: titleEnabled.value, desktop: desktopEnabled.value }));
  }

  /** 桌面通知授权：返回是否已授权（granted 才发桌面通知；denied 记忆不再重复请求） */
  async function requestDesktop(): Promise<boolean> {
    if (typeof Notification === 'undefined') { perm.value = 'unsupported'; return false; }
    if (Notification.permission === 'granted') { desktopEnabled.value = true; persist(); perm.value = 'granted'; return true; }
    if (Notification.permission === 'denied') { perm.value = 'denied'; return false; }
    try {
      const p = await Notification.requestPermission();
      const ok = p === 'granted';
      desktopEnabled.value = ok;
      persist();
      /* 以授权请求的回执为准（浏览器随后才把结果反映到 Notification.permission） */
      perm.value = normPerm(p);
      return ok;
    } catch {
      perm.value = readPerm();
      return false;
    }
  }

  function setTitleEnabled(v: boolean) {
    titleEnabled.value = v;
    if (!v) settle();
    persist();
  }

  /** 当前标题是否仍是本件写下的两条闪烁串之一（带图标前缀 / 等于起闪快照） */
  function isBlinkTitle(t: string): boolean {
    if (baseTitle === null) return false;
    /* document.title 读取时会剥掉首尾 ASCII 空白：底标题为空时写下去的「图标+空格」读回来只剩图标 */
    const onTitle = `${blinkIcon} ${baseTitle}`.replace(/[\t\n\f\r ]+$/, '');
    return blinkIcon !== '' && (t === onTitle || t === baseTitle);
  }

  function stopBlink() {
    if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
    /* 仅当当前标题仍是闪烁串时才还原快照：闪烁期间标题已被外部（路由器）改写时不动它，
       无条件写回会把新标题永久压回起闪时的旧页名 */
    if (baseTitle !== null && isBlinkTitle(document.title)) document.title = baseTitle;
    baseTitle = null;
    blinkIcon = '';
    blinkOn = false;
  }

  /** 回到页面 / 通知已消化：停标题闪烁并还原标题 */
  function settle() { stopBlink(); }

  function startBlink(icon: string) {
    if (!titleEnabled.value || blinkTimer) return;
    baseTitle = document.title;
    blinkIcon = icon;
    blinkOn = true;
    document.title = `${icon} ${baseTitle}`;
    blinkTimer = setInterval(() => {
      if (baseTitle === null) return;
      /* 两拍之间标题被外部改写：以新标题为底继续闪，否则本拍会把新标题盖掉、停闪时还原成旧页名 */
      if (!isBlinkTitle(document.title)) baseTitle = document.title;
      blinkOn = !blinkOn;
      document.title = blinkOn ? `${icon} ${baseTitle}` : baseTitle;
    }, 900);
  }

  /** 通知一次（页面隐藏时才发；同一 jobId+level 幂等）；回到页面调 settle() */
  function notify(jobId: string, level: JobNotifyLevel, text: string) {
    const dedupe = `${jobId}::${level}`;
    if (fired.has(dedupe)) return;
    fired.add(dedupe);
    if (!document.hidden) return;
    const icon = LEVEL_ICON[level] ?? '🔔';
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && desktopEnabled.value) {
      try {
        const n = new Notification(`${icon} ESQueryStudio`, { body: text, tag: dedupe });
        n.onclick = () => { window.focus(); n.close(); };
      } catch { /* 构造失败（某些环境需 ServiceWorker）退化为标题闪烁 */ }
    }
    startBlink(icon);
  }

  /** 作业开启新一轮生命周期（状态回到 RUNNING）时调用：清掉该 jobId 已发过的通知键，
      后续停门/终态可再提醒——幂等只在同一轮内去重，续跑/重跑沿用同一 jobId 时不被上一轮吞掉 */
  function resetJob(jobId: string) {
    const prefix = `${jobId}::`;
    for (const k of fired) if (k.startsWith(prefix)) fired.delete(k);
  }

  /* 回到页面：重读授权态（浏览器多在切回标签页时才把站点设置里改过的权限同步过来）并停闪 */
  function onVis() {
    if (document.hidden) return;
    perm.value = readPerm();
    settle();
  }
  document.addEventListener('visibilitychange', onVis);
  onBeforeUnmount(() => { stopBlink(); document.removeEventListener('visibilitychange', onVis); });

  return { titleEnabled, desktopEnabled, perm, requestDesktop, setTitleEnabled, notify, resetJob, settle };
}
