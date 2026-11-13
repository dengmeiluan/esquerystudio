/**
 * R130 第一百一十二批：SideNav 底部「? 键盘速查」鼠标入口（111 批命令面板直达
 * 的第二可达路径——不打开命令面板也能一键到速查）。复用 store.emit('open-hotkeys')
 * 事件总线（App.vue watch 置 helpOpen），无需 props/emits 跨层传递。
 * 锁定（静态）：按钮接线 + 事件复用 + Keyboard 图标 import + foot-btn 样式。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/SideNav.vue'), 'utf-8');

describe('SideNav 速查鼠标入口（一百一十二批）', () => {
  it('按钮接线：emit open-hotkeys 复用事件总线', () => {
    expect(src).toMatch(/@click="store\.emit\('open-hotkeys'\)"/);
    expect(src).toContain('? 键盘速查');
  });

  it('样式：foot-btn 可点态 + Keyboard 图标 import', () => {
    expect(src).toMatch(/\.foot-btn \{ background: transparent/);
    expect(src).toMatch(/import \{[\s\S]*\bKeyboard\b[\s\S]*\} from 'lucide-vue-next'/);
  });
});
