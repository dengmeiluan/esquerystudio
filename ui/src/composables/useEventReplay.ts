/* 作业事件回放内核：把 {ts,...} 事件序列压成可播放的虚拟时间轴。
 * 事件间隔做上下钳制（minGapMs 防连发挤成一帧、gapCapMs 防夜间空档白等），
 * 播放位置按虚拟时间推进，seek/step 始终落在事件上；宿主只负责渲染。 */
import { ref, computed, onBeforeUnmount, getCurrentInstance } from 'vue';
import { writeStoredRaw } from '../utils/safeJson';

export const REPLAY_SPEEDS = [1, 2, 4, 8] as const;
export const REPLAY_SPEED_KEY = 'xm-ev-replay-speed-v1';

export interface ReplayEventLike {
  ts?: number | string;
  [k: string]: any;
}

export interface EventReplayOptions {
  /** 事件间最小虚拟间隔（默认 300ms） */
  minGapMs?: number;
  /** 单段最长虚拟间隔（默认 1500ms，长空档不原速等待） */
  gapCapMs?: number;
  /** 末事件停留（默认 900ms，给最后一条留阅读时间） */
  tailMs?: number;
  /** 播放推进粒度（默认 80ms） */
  tickMs?: number;
  /** 初始倍速，缺省读 localStorage 上一次选择 */
  speed?: number;
}

export function readReplaySpeed(): number {
  try {
    const v = Number(localStorage.getItem(REPLAY_SPEED_KEY));
    return (REPLAY_SPEEDS as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

export function saveReplaySpeed(v: number) {
  writeStoredRaw(localStorage, REPLAY_SPEED_KEY, String(v)); /* 隐私模式写失败静默：内存态仍生效 */
}

function eventTs(ev: ReplayEventLike): number {
  const n = Number(ev?.ts);
  return Number.isFinite(n) ? n : NaN;
}

export function useEventReplay(opts: EventReplayOptions = {}) {
  const minGapMs = Math.max(0, opts.minGapMs ?? 300);
  const gapCapMs = Math.max(minGapMs, opts.gapCapMs ?? 1500);
  const tailMs = Math.max(0, opts.tailMs ?? 900);
  const tickMs = Math.max(16, opts.tickMs ?? 80);

  const events = ref<ReplayEventLike[]>([]);
  const positions = ref<number[]>([]);
  const totalMs = ref(0);
  const elapsedMs = ref(0);
  const speed = ref((REPLAY_SPEEDS as readonly number[]).includes(opts.speed ?? 0) ? (opts.speed as number) : readReplaySpeed());
  const playing = ref(false);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastTickAt = 0;

  const index = computed(() => {
    const pos = positions.value;
    if (!pos.length) return -1;
    const t = elapsedMs.value;
    let lo = 0;
    let hi = pos.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pos[mid] <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  });
  const current = computed<ReplayEventLike | null>(() => events.value[index.value] ?? null);
  const progress = computed(() => (totalMs.value > 0 ? Math.min(1, elapsedMs.value / totalMs.value) : 0));
  const atEnd = computed(() => !!events.value.length && elapsedMs.value >= totalMs.value);
  const finished = computed(() => atEnd.value && !playing.value);

  function stopTimer() {
    if (timer != null) { clearTimeout(timer); timer = null; }
  }

  function clampElapsed(t: number) {
    return Math.max(0, Math.min(totalMs.value, t));
  }

  function tick() {
    timer = null;
    if (!playing.value) return;
    const now = Date.now();
    const delta = Math.max(0, now - lastTickAt) * speed.value;
    lastTickAt = now;
    elapsedMs.value = clampElapsed(elapsedMs.value + delta);
    if (elapsedMs.value >= totalMs.value) {
      playing.value = false;
      return;
    }
    timer = setTimeout(tick, tickMs);
  }

  function play() {
    if (!events.value.length) return;
    if (atEnd.value) elapsedMs.value = 0;
    playing.value = true;
    lastTickAt = Date.now();
    stopTimer();
    timer = setTimeout(tick, tickMs);
  }

  function pause() {
    playing.value = false;
    stopTimer();
  }

  function toggle() {
    if (playing.value) pause(); else play();
  }

  function seek(p: number) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
    elapsedMs.value = clampElapsed(clamped * totalMs.value);
    lastTickAt = Date.now();
  }

  function step(delta: number) {
    const n = events.value.length;
    if (!n) return;
    const next = Math.max(0, Math.min(n - 1, (index.value < 0 ? 0 : index.value) + delta));
    elapsedMs.value = positions.value[next] ?? 0;
    lastTickAt = Date.now();
  }

  function setSpeed(v: number) {
    if (!Number.isFinite(v) || v <= 0) return;
    speed.value = Math.min(64, v);
    lastTickAt = Date.now();
    saveReplaySpeed(speed.value);
  }

  /** 载入一份事件快照（调用方负责冻结，回放期间不跟随实时刷新）。 */
  function load(list: ReplayEventLike[]) {
    pause();
    const sorted = (Array.isArray(list) ? list : [])
      .filter(ev => Number.isFinite(eventTs(ev)))
      .slice()
      .sort((a, b) => eventTs(a) - eventTs(b));
    const pos: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) pos.push(0);
      else {
        const gap = eventTs(sorted[i]) - eventTs(sorted[i - 1]);
        pos.push(pos[i - 1] + Math.max(minGapMs, Math.min(gapCapMs, gap)));
      }
    }
    events.value = sorted;
    positions.value = pos;
    totalMs.value = pos.length ? pos[pos.length - 1] + tailMs : 0;
    elapsedMs.value = 0;
    lastTickAt = Date.now();
  }

  function reset() {
    pause();
    events.value = [];
    positions.value = [];
    totalMs.value = 0;
    elapsedMs.value = 0;
  }

  if (getCurrentInstance()) onBeforeUnmount(() => { stopTimer(); });

  return {
    events, index, current, progress, totalMs, elapsedMs, speed, playing, atEnd, finished,
    load, play, pause, toggle, seek, step, setSpeed, reset,
    dispose: stopTimer,
  };
}
