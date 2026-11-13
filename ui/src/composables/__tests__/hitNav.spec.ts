/* 搜索定位核心游标契约：wrap-around 双向 / 收缩钳制 / 零命中 / reset。
 * watch 默认 pre-flush 异步批处理，改 count 后需 await nextTick 再断言
 * （组件内同理：钳制总在本帧渲染前完成，DOM 不会看到越界游标）。 */
import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useHitNav, useHitLocate } from '../useHitNav';

describe('useHitNav', () => {
  it('零命中 → current=0；next/prev 不炸仍为 0', () => {
    const n = ref(0);
    const nav = useHitNav(() => n.value);
    expect(nav.current.value).toBe(0);
    nav.next();
    nav.prev();
    expect(nav.current.value).toBe(0);
  });

  it('0→n：count 出现命中即落 1', async () => {
    const n = ref(0);
    const nav = useHitNav(() => n.value);
    n.value = 5;
    await nextTick();
    expect(nav.current.value).toBe(1);
  });

  it('next 到尾回绕到 1', () => {
    const n = ref(3);
    const nav = useHitNav(() => n.value);
    nav.next(); // 1→2
    nav.next(); // 2→3
    expect(nav.current.value).toBe(3);
    nav.next(); // 3→1（wrap）
    expect(nav.current.value).toBe(1);
  });

  it('prev 到头回绕到 count', () => {
    const n = ref(3);
    const nav = useHitNav(() => n.value);
    nav.prev(); // 1→3（wrap）
    expect(nav.current.value).toBe(3);
    nav.prev(); // 3→2
    expect(nav.current.value).toBe(2);
  });

  it('收缩钳制：current 超界收到新 count，不清零不越界', async () => {
    const n = ref(5);
    const nav = useHitNav(() => n.value);
    nav.next(); nav.next(); nav.next(); // current=4
    n.value = 2;
    await nextTick();
    expect(nav.current.value).toBe(2);
    // 收缩后继续 next 仍 wrap 正常
    nav.next();
    expect(nav.current.value).toBe(1);
  });

  it('count 归零 → current=0（「0 命中」空态）', async () => {
    const n = ref(4);
    const nav = useHitNav(() => n.value);
    nav.next(); // 2
    n.value = 0;
    await nextTick();
    expect(nav.current.value).toBe(0);
  });

  it('reset：有命中落 1，无命中落 0', async () => {
    const n = ref(4);
    const nav = useHitNav(() => n.value);
    nav.next(); nav.next(); // 3
    nav.reset();
    expect(nav.current.value).toBe(1);
    n.value = 0;
    await nextTick();
    nav.reset();
    expect(nav.current.value).toBe(0);
  });

  it('count 在合法区间内变化不打扰 current（看哪条还在哪条）', async () => {
    const n = ref(5);
    const nav = useHitNav(() => n.value);
    nav.next(); nav.next(); // 3
    n.value = 4;
    await nextTick();
    expect(nav.current.value).toBe(3);
  });
});

describe('useHitLocate', () => {
  it('游标变化后 nextTick 落位：滚动 + 唯一 .hit-cur', async () => {
    const host = document.createElement('div');
    for (let i = 1; i <= 3; i++) {
      const row = document.createElement('div');
      row.setAttribute('data-hit-idx', String(i));
      host.appendChild(row);
    }
    document.body.appendChild(host);
    /* happy-dom 的 scrollIntoView 是 no-op，仅验证不炸即可 */
    const nav = useHitLocate(() => 3, () => host);
    nav.next(); // 1→2
    await nextTick();
    await nextTick(); // 落位 watcher 自身又排了一帧 nextTick
    const second = host.querySelector('[data-hit-idx="2"]')!;
    expect(second.classList.contains('hit-cur')).toBe(true);
    expect(host.querySelectorAll('.hit-cur').length).toBe(1);
    nav.next(); // 2→3
    await nextTick();
    await nextTick();
    expect(host.querySelector('[data-hit-idx="3"]')!.classList.contains('hit-cur')).toBe(true);
    expect(host.querySelectorAll('.hit-cur').length, '旧行必须摘掉 .hit-cur').toBe(1);
    host.remove();
  });

  it('命中序在容器里找不到对应行时不炸（行未渲染的容错）', async () => {
    const empty = document.createElement('div');
    const nav = useHitLocate(() => 2, () => empty);
    nav.next(); // 1→2（容器里没有对应行）
    await nextTick();
    await nextTick();
    expect(nav.current.value).toBe(2);
  });
});
