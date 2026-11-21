/**
 * R130 第一百一十三批：命令面板关闭后焦点归还触发钮——键盘用户 ⌘K 开面板、
 * Esc/选中关闭后焦点悬空（A3 键盘可达范式的焦点管理半边）。
 * 链路：CmdPalette.close() → store.emit('palette-closed') → App.vue watch →
 * TopBar.focusPaletteBtn()（defineExpose）。
 * 锁定（静态）：链路四段接线齐全。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const cmdSrc = readFileSync(join(SRC, 'components/CmdPalette.vue'), 'utf-8');
const appSrc = readFileSync(join(SRC, 'App.vue'), 'utf-8');
const topSrc = readFileSync(join(SRC, 'components/TopBar.vue'), 'utf-8');

describe('命令面板焦点归还（一百一十三批）', () => {
  it('CmdPalette.close() 发 palette-closed 事件', () => {
    const closeBlock = cmdSrc.slice(cmdSrc.indexOf('function close()'), cmdSrc.indexOf('function close()') + 300);
    expect(closeBlock).toContain("emit('update:show', false)");
    expect(closeBlock).toContain("store.emit('palette-closed')");
  });

  it('App.vue watch 监听并调用 TopBar expose', () => {
    expect(appSrc).toMatch(/if \(ev\?\.name === 'palette-closed'\) topBarRef\.value\?\.focusPaletteBtn\?\.\(\);/);
    expect(appSrc).toMatch(/<TopBar ref="topBarRef"/);
    expect(appSrc).toContain('const topBarRef = ref<any>(null);');
  });

  it('TopBar defineExpose focusPaletteBtn', () => {
    expect(topSrc).toMatch(/function focusPaletteBtn\(\) \{ palBtnRef\.value\?\.focus\(\); \}/);
    expect(topSrc).toContain('defineExpose({ focusPaletteBtn })');
  });
});
