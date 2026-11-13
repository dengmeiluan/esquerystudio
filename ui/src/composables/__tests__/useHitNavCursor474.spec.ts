/**
 * 四百七十四批：useHitNav 游标行为直测——搜索定位核心（1-based wrap-around
 * 游标+收缩自动钳制）。六契约：count>0 初值落 1/count=0 游标 0（空态）/
 * next 尾回绕 1/prev 头回绕 count/reset 归位/收缩钳制（保住当前看到的那条）。
 */
import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useHitNav } from '../useHitNav';

describe('useHitNav 游标契约（474 批）', () => {
  it('count>0 初值落 1；next 尾回绕；prev 头回绕', () => {
    const nav = useHitNav(() => 3);
    expect(nav.current.value).toBe(1);
    nav.next();
    expect(nav.current.value).toBe(2);
    nav.next(); nav.next();
    expect(nav.current.value, '到尾回绕 1').toBe(1);
    nav.prev();
    expect(nav.current.value, '从头回绕 count').toBe(3);
  });

  it('count=0 游标归 0（空态）；出结果自动落 1', async () => {
    const count = ref(0);
    const nav = useHitNav(() => count.value);
    expect(nav.current.value).toBe(0);
    count.value = 5;
    await nextTick();
    expect(nav.current.value, '刚出结果即定位首个').toBe(1);
    count.value = 0;
    await nextTick();
    expect(nav.current.value).toBe(0);
  });

  it('收缩钳制：current 超界钳到新 count（保住正在看的那条）', async () => {
    const count = ref(10);
    const nav = useHitNav(() => count.value);
    nav.next(); nav.next(); nav.next(); // current=3
    count.value = 2;
    await nextTick();
    expect(nav.current.value, '超界钳到新 count').toBe(2);
  });

  it('reset：count>0 落 1，否则 0', () => {
    const count = ref(4);
    const nav = useHitNav(() => count.value);
    nav.reset();
    expect(nav.current.value).toBe(1);
    count.value = 0;
    nav.reset();
    expect(nav.current.value).toBe(0);
  });
});
