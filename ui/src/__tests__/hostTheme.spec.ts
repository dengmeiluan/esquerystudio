/* 2.5.0 宿主主题跟随：readUrlHostTheme 纯函数 + app store host 档矩阵。
   注意边界：happy-dom 中 window.parent===window 不可桩，「嵌入态默认 host 档」分支
   无法单测——此处只覆盖纯函数与显式 setTheme('host') 后的行为，嵌入默认档列入 Task 13 真机验证。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readUrlHostTheme } from '../utils/hostTheme';
import { useAppStore } from '../stores/app';

describe('readUrlHostTheme', () => {
  it('dark → dark', () => { expect(readUrlHostTheme('?hostTheme=dark')).toBe('dark'); });
  it('light → light', () => { expect(readUrlHostTheme('?hostTheme=light')).toBe('light'); });
  it('混在其他参数中也能命中', () => { expect(readUrlHostTheme('?a=1&hostTheme=light&b=2')).toBe('light'); });
  it('非法值 → null（dark 兜底由调用方做，不在纯函数里藏默认值）', () => {
    expect(readUrlHostTheme('?hostTheme=blue')).toBeNull();
  });
  it('无参数 → null', () => {
    expect(readUrlHostTheme('')).toBeNull();
    expect(readUrlHostTheme('?a=1')).toBeNull();
  });
});

describe('app store host 档', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.background = '';
  });

  it('setTheme(\'host\') 后 effectiveTheme 跟随 hostTheme 值，applyTheme 落 dataset', () => {
    const s = useAppStore();
    s.setTheme('host');
    expect(s.settings.theme).toBe('host');
    expect(['dark', 'light']).toContain(s.effectiveTheme);
    expect(document.documentElement.dataset.theme).toBe(s.effectiveTheme);
  });

  it('host 档：setHostTheme 切换立即重应用（dataset 翻转 + style.background 同步）', () => {
    const s = useAppStore();
    s.setTheme('host');
    const before = s.effectiveTheme;
    s.setHostTheme(before === 'dark' ? 'light' : 'dark');
    expect(s.effectiveTheme).toBe(before === 'dark' ? 'light' : 'dark');
    expect(document.documentElement.dataset.theme).toBe(s.effectiveTheme);
    expect(document.documentElement.style.background).toBeTruthy();
  });

  it('用户覆盖反超：切到 dark 后宿主热推不再生效', () => {
    const s = useAppStore();
    s.setTheme('host');
    s.setHostTheme('light');
    s.setTheme('dark'); // 用户手动选择
    s.setHostTheme('light'); // 宿主再热推
    expect(s.effectiveTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('localStorage 已有显式选择时保持该选择（覆盖选择要活过刷新）', () => {
    localStorage.setItem('es_theme', 'light');
    setActivePinia(createPinia()); // 触发 store 重新初始化
    const s = useAppStore();
    expect(s.settings.theme).toBe('light');
  });

  it('非法 hostTheme 值被钳回 dark', () => {
    const s = useAppStore();
    s.setTheme('host');
    s.setHostTheme('blue' as any);
    expect(s.effectiveTheme).toBe('dark');
  });

  it('cycleTheme 四档循环含 host，且从 host 能继续切走', () => {
    const s = useAppStore();
    s.setTheme('host');
    s.cycleTheme();
    expect(s.settings.theme).not.toBe('host');
    expect(['dark', 'light', 'auto']).toContain(s.settings.theme);
  });
});
