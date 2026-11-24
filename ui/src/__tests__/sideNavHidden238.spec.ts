/**
 * 二百三十八批：侧栏三档（展开 208px / 图标条 56px / 完全隐藏全屏——dbx Mod+B 对位）。
 * 锁定：store navHidden 持久化与 toggle；App.vue Mod+B 分支 + SideNav v-if；
 * TopBar 三态钮文案；HotkeyPanel 登记。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = readFileSync(join(__dirname, '../App.vue'), 'utf-8');
const store = readFileSync(join(__dirname, '../stores/app.ts'), 'utf-8');
const topbar = readFileSync(join(__dirname, '../components/TopBar.vue'), 'utf-8');
const hotkey = readFileSync(join(__dirname, '../components/HotkeyPanel.vue'), 'utf-8');

describe('侧栏隐藏全屏档（238 批）', () => {
  it('store：navHidden 持久化 es_nav_hidden + toggleNavHidden', () => {
    expect(store).toMatch(/const navHidden = ref\(localStorage\.getItem\('es_nav_hidden'\) === '1'\)/);
    expect(store).toMatch(/toggleNavHidden/);
    /* 852 批同步更新：写侧走 writeStoredRaw 单源，持久化契约不变 */
    expect(store).toContain("writeStoredRaw(localStorage, 'es_nav_hidden', v ? '1' : '0')");
  });

  it('App.vue：Mod+B 分支 + SideNav 按 navHidden 条件渲染', () => {
    expect(app).toContain("e.key.toLowerCase() === 'b'");
    expect(app).toContain('store.toggleNavHidden()');
    expect(app).toMatch(/<SideNav v-if="!store\.navHidden" \/>/);
  });

  it('TopBar：navHidden 时优先恢复侧栏（三态钮）', () => {
    expect(topbar).toMatch(/store\.navHidden \? store\.setNavHidden\(false\) : store\.toggleNav\(\)/);
  });

  it('HotkeyPanel：Mod+B 登记（有功能没人知道防重演）', () => {
    expect(hotkey).toContain("keys: ['Ctrl', 'B']");
    expect(hotkey).toContain('隐藏 / 恢复侧栏');
  });
});
