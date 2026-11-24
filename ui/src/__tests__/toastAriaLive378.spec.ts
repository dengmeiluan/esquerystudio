/**
 * 三百七十八批：toast 屏幕阅读器播报通道——naive-ui notification 源码零 aria/role
 * （实测 grep 源码确认），视觉 toast 对读屏用户完全静默。
 * 修：NotifyConsumer 挂 sr-only aria-live 双容器——error 走 assertive/role=alert
 * 即时打断，其余 polite/role=status；不能 display:none（aria-live 对隐藏元素静默），
 * theme.css 补 .sr-only 视觉隐藏工具类。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = readFileSync(join(__dirname, '../App.vue'), 'utf-8');
const theme = readFileSync(join(__dirname, '../theme.css'), 'utf-8');

describe('toast 读屏播报（378 批）', () => {
  it('aria-live 双容器：polite/status + assertive/alert，error 分流 assertive', () => {
    expect(app).toMatch(/h\('div', \{ role: 'status', 'aria-live': 'polite' \}, ariaPolite\.value\)/);
    expect(app).toMatch(/h\('div', \{ role: 'alert', 'aria-live': 'assertive' \}, ariaAssertive\.value\)/);
    expect(app).toMatch(/if \(item\.kind === 'error'\) \{ ariaAssertive\.value = item\.msg; ariaPolite\.value = ''; \}/);
  });

  it('播报区 sr-only 而非 display:none（aria-live 对隐藏元素静默）', () => {
    expect(app).toMatch(/return \(\) => h\('div', \{ class: 'sr-only' \}, \[/);
    expect(app).not.toMatch(/return \(\) => h\('div', \{ style: 'display:none' \}\);/);
    expect(theme).toMatch(/\.sr-only \{ position: absolute; width: 1px; height: 1px;/);
    expect(theme).toMatch(/clip: rect\(0, 0, 0, 0\)/);
  });
});
