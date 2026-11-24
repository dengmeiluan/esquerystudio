import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEventReplay, REPLAY_SPEED_KEY, readReplaySpeed } from '../useEventReplay';

/* 1090：回放内核——排序/钳制/seek/step/倍速/播放到点/快照不变 */
describe('1090 useEventReplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    localStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('乱序输入按 ts 升序装载，长空档压缩、连发垫底，输入数组不被改写', () => {
    const r = useEventReplay({ minGapMs: 300, gapCapMs: 1500, tailMs: 900 });
    const input = [{ ts: 5000, m: 'c' }, { ts: 0, m: 'a' }, { ts: 100, m: 'b' }, { ts: 5100, m: 'd' }];
    r.load(input);
    expect(r.events.value.map(e => e.m)).toEqual(['a', 'b', 'c', 'd']);
    /* a→b 100 垫到 300；b→c 4900 压到 1500；c→d 100 垫到 300；尾部停留 900 */
    expect(r.totalMs.value).toBe(3000);
    expect(r.index.value).toBe(0);
    expect(r.current.value?.m).toBe('a');
    expect(input.map(e => e.m)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('seek 落在不晚于虚拟时刻的最近事件；step 逐条；边界夹紧', () => {
    const r = useEventReplay({ minGapMs: 300, gapCapMs: 1500, tailMs: 900 });
    r.load([{ ts: 0, m: 'a' }, { ts: 100, m: 'b' }, { ts: 5100, m: 'c' }, { ts: 5200, m: 'd' }]);
    r.seek(0.5); /* 1500ms → b(300) 之后、c(1800) 之前 */
    expect(r.current.value?.m).toBe('b');
    r.step(1);
    expect(r.current.value?.m).toBe('c');
    r.step(-2);
    expect(r.current.value?.m).toBe('a');
    r.step(-1);
    expect(r.current.value?.m).toBe('a');
    r.step(99);
    expect(r.current.value?.m).toBe('d');
    r.seek(2);
    expect(r.progress.value).toBe(1);
    expect(r.atEnd.value).toBe(true);
    r.seek(-1);
    expect(r.progress.value).toBe(0);
    expect(r.current.value?.m).toBe('a');
  });

  it('播放按虚拟时间推进，到末停留后停在终点；再次 play 从头开始', () => {
    const r = useEventReplay({ minGapMs: 300, gapCapMs: 1500, tailMs: 900 });
    r.load([{ ts: 0, m: 'a' }, { ts: 1000, m: 'b' }]);
    expect(r.totalMs.value).toBe(1900);
    r.play();
    expect(r.playing.value).toBe(true);
    vi.advanceTimersByTime(700);
    expect(r.current.value?.m, '700ms 未到 b(1000)').toBe('a');
    vi.advanceTimersByTime(500); /* 1200ms */
    expect(r.current.value?.m).toBe('b');
    vi.advanceTimersByTime(900); /* 2100ms → 夹到 1900 收尾 */
    expect(r.playing.value).toBe(false);
    expect(r.atEnd.value).toBe(true);
    expect(r.progress.value).toBe(1);
    r.play();
    expect(r.elapsedMs.value).toBe(0);
    expect(r.playing.value).toBe(true);
    r.pause();
    expect(r.playing.value).toBe(false);
  });

  it('倍速落 localStorage，非法/坏值回 1×；load 停止播放并过滤非法 ts', () => {
    expect(readReplaySpeed()).toBe(1);
    const r = useEventReplay();
    r.setSpeed(4);
    expect(r.speed.value).toBe(4);
    expect(localStorage.getItem(REPLAY_SPEED_KEY)).toBe('4');
    localStorage.setItem(REPLAY_SPEED_KEY, '2.5');
    expect(readReplaySpeed()).toBe(1);
    r.play();
    r.load([{ ts: 'bad', m: 'x' }, { ts: 10, m: 'y' }]);
    expect(r.playing.value).toBe(false);
    expect(r.events.value.map(e => e.m)).toEqual(['y']);
    r.reset();
    expect(r.events.value).toEqual([]);
    expect(r.totalMs.value).toBe(0);
  });
});
