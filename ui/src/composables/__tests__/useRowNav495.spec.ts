/**
 * 四百九十五批：useRowNav 行导航内核行为直测——55/135 批 RT/QRT 共用键盘
 * 行导航（此前只有源码锁）。契约：↑↓ 首末钳制/Home·End/输入框与 guard 豁免/
 * 行集收缩钳位/失焦清高亮/Enter·Ctrl+C 回调与未聚焦不触发/Mac Meta 同效。
 */
import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useRowNav } from '../useRowNav';

function key(k: string, mods: { ctrl?: boolean; meta?: boolean } = {}) {
  return { key: k, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, preventDefault() {} } as KeyboardEvent;
}

describe('useRowNav 内核契约（495 批）', () => {
  it('↑↓ 移动+首末钳制；Home/End 跳端', () => {
    const nav = useRowNav(ref(5));
    nav.onRowNavKey(key('ArrowUp'));
    expect(nav.focusIdx.value, '顶部 Up 钳 0').toBe(0);
    nav.onRowNavKey(key('ArrowDown'));
    expect(nav.focusIdx.value).toBe(1);
    nav.onRowNavKey(key('End'));
    expect(nav.focusIdx.value).toBe(4);
    nav.onRowNavKey(key('ArrowDown'));
    expect(nav.focusIdx.value, '底部 Down 钳 n-1').toBe(4);
    nav.onRowNavKey(key('Home'));
    expect(nav.focusIdx.value).toBe(0);
  });

  it('guard 不接管；空行集早退', () => {
    let guardOk = false;
    const guarded = useRowNav(ref(3), { guard: () => guardOk });
    guarded.onRowNavKey(key('ArrowDown'));
    expect(guarded.focusIdx.value, 'guard=false 不接管').toBe(-1);
    guardOk = true;
    guarded.onRowNavKey(key('ArrowDown'));
    expect(guarded.focusIdx.value).toBe(0);
    const empty = useRowNav(ref(0));
    empty.onRowNavKey(key('ArrowDown'));
    expect(empty.focusIdx.value, '空行集早退').toBe(-1);
  });

  it('行集收缩自动钳位', async () => {
    const rowCount = ref(5);
    const nav = useRowNav(rowCount);
    nav.onRowNavKey(key('End'));
    expect(nav.focusIdx.value).toBe(4);
    rowCount.value = 2;
    await nextTick();
    expect(nav.focusIdx.value, '收缩钳到新末行').toBe(1);
  });

  it('失焦清高亮（真实流转 true→false；同值赋 false 不触发 watch）', async () => {
    const rowCount = ref(3);
    const nav = useRowNav(rowCount);
    nav.tblFocus.value = true;
    await nextTick();
    nav.onRowNavKey(key('ArrowDown'));
    expect(nav.focusIdx.value).toBe(0);
    nav.tblFocus.value = false;
    await nextTick();
    await nextTick();
    expect(nav.focusIdx.value, '失焦清高亮').toBe(-1);
  });

  it('Enter/Ctrl+C 回调（焦点行）；Mac Meta+C 同效', () => {
    const entered: number[] = [];
    const copied: number[] = [];
    const nav = useRowNav(ref(3), { onEnter: i => entered.push(i), onCopy: i => copied.push(i) });
    nav.onRowNavKey(key('ArrowDown'));
    nav.onRowNavKey(key('Enter'));
    nav.onRowNavKey(key('c', { ctrl: true }));
    expect(entered).toEqual([0]);
    expect(copied).toEqual([0]);
    nav.onRowNavKey(key('c', { meta: true }));
    expect(copied, 'Mac Meta+C 同效').toEqual([0, 0]);
  });
});
