/**
 * R130 第一百一十一批：命令面板「键盘速查面板」命令——HotkeyPanel 此前只有 ?
 * 键盘入口（鼠标用户/触屏用户不可达），命令面板直达补可发现性。
 * 机制：CmdPalette 发 store 事件 open-hotkeys → App.vue watch 置 helpOpen=true
 * （面板先 emit update:show=false 关闭，避免弹层叠加）。
 * 锁定（静态）：命令接线 + App 监听接线 + Keyboard 图标 import。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const cmdSrc = readFileSync(join(SRC, 'components/CmdPalette.vue'), 'utf-8');
const appSrc = readFileSync(join(SRC, 'App.vue'), 'utf-8');

describe('命令面板键盘速查直达（一百一十一批）', () => {
  it('CmdPalette 命令接线（先关面板再发事件）', () => {
    expect(cmdSrc).toMatch(/id: 'open-hotkeys'/);
    expect(cmdSrc).toMatch(/emit\('update:show', false\); store\.emit\('open-hotkeys'\)/);
    expect(cmdSrc).toContain('Keyboard');
  });

  it('App.vue 监听 open-hotkeys 置 helpOpen', () => {
    expect(appSrc).toMatch(/if \(ev\?\.name === 'open-hotkeys'\) helpOpen\.value = true;/);
  });
});
