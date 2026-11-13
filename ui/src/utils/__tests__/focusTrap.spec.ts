import { describe, it, expect, beforeEach } from 'vitest';
import { trapTabKey } from '../focusTrap';

/* R71：焦点陷阱——Tab 循环必须锁在容器内（自建弹窗 a11y 基线） */
function tab(shift = false) {
  return new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, cancelable: true });
}

describe('trapTabKey', () => {
  let box: HTMLElement;
  let b1: HTMLButtonElement;
  let b2: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    box = document.createElement('div');
    b1 = document.createElement('button');
    b2 = document.createElement('button');
    box.appendChild(b1);
    box.appendChild(b2);
    document.body.appendChild(box);
  });

  it('末位正向 Tab 圈回首位', () => {
    b2.focus();
    const e = tab();
    trapTabKey(box, e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b1);
  });

  it('首位 Shift+Tab 圈回末位', () => {
    b1.focus();
    const e = tab(true);
    trapTabKey(box, e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b2);
  });

  it('容器中段 Tab 不拦截（交给浏览器原生顺序）', () => {
    b1.focus();
    const e = tab();
    trapTabKey(box, e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('焦点已逃逸到容器外时拉回首位', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const e = tab();
    trapTabKey(box, e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b1);
  });

  it('非 Tab 键不处理', () => {
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    trapTabKey(box, e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('禁用按钮不参与循环', () => {
    b2.disabled = true;
    b1.focus();
    const e = tab();
    trapTabKey(box, e);
    /* 只剩 b1 一个可聚焦：视为末位，圈回自身 */
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b1);
  });
});
