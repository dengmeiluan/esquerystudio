/**
 * 三百九十七批：useRowNav 行为级单测——55/135 批键盘行导航共享内核（RT/QRT 双宿主）。
 * 六契约：↑↓ 移动与边界钳制/Home/End 跳端/输入框聚焦与 guard 不接管/行集收缩自动钳位/
 * 失焦清高亮/焦点行 Enter·Ctrl+C 回调（-1 未聚焦时不触发）。
 */
import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useRowNav } from '../useRowNav';

function key(k: string, mods: { ctrl?: boolean } = {}): KeyboardEvent {
  return { key: k, ctrlKey: !!mods.ctrl, metaKey: false, preventDefault: () => {} } as KeyboardEvent;
}

describe('useRowNav 行为契约（397 批）', () => {
  it('↑↓ 移动与边界钳制；Home/End 跳端', () => {
    const n = ref(5);
    const nav = useRowNav(n);
    expect(nav.focusIdx.value).toBe(-1);
    nav.onRowNavKey(key('ArrowUp'));
    expect(nav.focusIdx.value, '顶部上移钳在 0').toBe(0);
    nav.onRowNavKey(key('ArrowDown'));
    expect(nav.focusIdx.value).toBe(1);
    nav.onRowNavKey(key('End'));
    expect(nav.focusIdx.value).toBe(4);
    nav.onRowNavKey(key('ArrowDown'));
    expect(nav.focusIdx.value, '尾部下移钳在 n-1').toBe(4);
    nav.onRowNavKey(key('Home'));
    expect(nav.focusIdx.value).toBe(0);
  });

  it('输入框聚焦/guard=false 不接管；空行集早退', () => {
    const n = ref(3);
    const el = document.createElement('input');
    document.body.appendChild(el);
    el.focus();
    const nav = useRowNav(n);
    nav.onRowNavKey(key('ArrowDown'));
    expect(nav.focusIdx.value, '输入框聚焦时不接管').toBe(-1);
    el.blur();
    let ok = false;
    const guarded = useRowNav(n, { guard: () => ok });
    guarded.onRowNavKey(key('ArrowDown'));
    expect(guarded.focusIdx.value, 'guard 拒绝不接管').toBe(-1);
    ok = true;
    guarded.onRowNavKey(key('ArrowDown'));
    expect(guarded.focusIdx.value).toBe(0);
    const empty = useRowNav(ref(0));
    empty.onRowNavKey(key('ArrowDown'));
    expect(empty.focusIdx.value, '空行集早退').toBe(-1);
    el.remove();
  });

  it('行集收缩自动钳位；失焦清高亮', async () => {
    const n = ref(5);
    const nav = useRowNav(n);
    nav.tblFocus.value = true; /* 先获焦（RT @focus 语义；同值赋 false 不触发 watch，须走 true→false 真实流转） */
    nav.onRowNavKey(key('End'));
    expect(nav.focusIdx.value).toBe(4);
    n.value = 2;
    await nextTick();
    expect(nav.focusIdx.value, '收缩后钳到 n-1').toBe(1);
    nav.tblFocus.value = false; /* 失焦（RT @blur 语义） */
    await nextTick();
    expect(nav.focusIdx.value, '失焦清高亮').toBe(-1);
  });

  it('焦点行 Enter/onCopy 回调；未聚焦（-1）时不触发', () => {
    const n = ref(3);
    const entered: number[] = [];
    const copied: number[] = [];
    const nav = useRowNav(n, { onEnter: i => entered.push(i), onCopy: i => copied.push(i) });
    nav.onRowNavKey(key('Enter'));
    nav.onRowNavKey(key('c', { ctrl: true }));
    expect(entered, '未聚焦时 Enter 不触发').toEqual([]);
    expect(copied).toEqual([]);
    nav.onRowNavKey(key('ArrowDown'));
    nav.onRowNavKey(key('ArrowDown'));
    nav.onRowNavKey(key('Enter'));
    nav.onRowNavKey(key('c', { ctrl: true }));
    expect(entered).toEqual([1]);
    expect(copied).toEqual([1]);
  });
});
