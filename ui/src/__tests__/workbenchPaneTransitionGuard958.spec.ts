/**
 * 布局件过渡粘滞守卫——DevTools 堆叠态响应 pane 塌缩 22px 真机实勘：
 * reduced-motion 强制块只缩 duration 时，transition-property 隐式取初始值 all，
 * 布局属性（flex/min-height/height）变化仍会创建过渡对象；渲染冻结/节流环境
 * （后台标签、headless 探针）下过渡停在起点值（wl-fill-pane 的 grow:1 / min-height:0），
 * pane 呈塌缩假象且内联 !important 无法夺回（过渡层优先级最高）。
 * 沿用 源码静态锁手法（Monaco 在 happy-dom 必炸）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rd = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const theme = rd('theme.css');

describe('reduced-motion 强制块钉死 transition-property（布局件过渡粘滞根治）', () => {
  it('transition-property: none 与 duration 同锁（无过渡=reduced-motion 正确语义）', () => {
    expect(theme).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation-duration: \.01ms !important; animation-iteration-count: 1 !important; transition-duration: \.01ms !important; transition-property: none !important; \}\s*\}/);
  });
});
