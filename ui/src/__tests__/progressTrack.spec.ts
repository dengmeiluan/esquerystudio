/**
 * 统一进度条 ProgressTrack 组件看守（行为 + 源码锚双面）：
 *  - 确定态：scaleX 比例驱动（不动画 width）、aria valuemin/max/now 全挂、负值/超界钳制；
 *  - 不确定态（value=null）：.pt-indet 光条类、aria-valuenow 省略；
 *  - state 四档语义色类 + size 三档高度类走主题 token（源码锚——happy-dom 不参与
 *    scoped <style> 计算，渲染后样式数值断言是死断言，semanticTier531 同理由）；
 *  - Tip 集成（showTip 走统一悬浮件 .tip-trigger 承载）与多根 $attrs 透传。
 * 组件冒烟沿用项目惯例：createApp 手工 mount，不依赖 @vue/test-utils。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ProgressTrack from '../components/ProgressTrack.vue';

const src = readFileSync(join(__dirname, '../components/ProgressTrack.vue'), 'utf-8');

const apps: App[] = [];
const settle = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
async function mountPt(props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(ProgressTrack as never, props as never) });
  app.config.warnHandler = () => {};
  apps.push(app);
  app.mount(host);
  await settle();
  return host;
}
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

describe('ProgressTrack 确定态（数值驱动）', () => {
  it('role/aria 全挂：progressbar + valuemin/max/now，填充 scaleX 比例', async () => {
    const host = await mountPt({ value: 40 });
    const track = host.querySelector<HTMLElement>('.pt-track')!;
    expect(track.getAttribute('role')).toBe('progressbar');
    expect(track.getAttribute('aria-valuemin')).toBe('0');
    expect(track.getAttribute('aria-valuemax')).toBe('100');
    expect(track.getAttribute('aria-valuenow')).toBe('40');
    const fill = track.querySelector<HTMLElement>('.pt-fill')!;
    expect(fill.getAttribute('style'), '填充走 scaleX（0.4 比例）').toContain('scaleX(0.4)');
  });

  it('钳制：负值钳 0、超 max 钳 max（后端脏数据不反条不溢出）', async () => {
    const neg = (await mountPt({ value: -5 })).querySelector<HTMLElement>('.pt-track')!;
    expect(neg.getAttribute('aria-valuenow')).toBe('0');
    expect(neg.querySelector('.pt-fill')!.getAttribute('style')).toContain('scaleX(0)');
    const over = (await mountPt({ value: 250 })).querySelector<HTMLElement>('.pt-track')!;
    expect(over.getAttribute('aria-valuenow')).toBe('100');
    expect(over.querySelector('.pt-fill')!.getAttribute('style')).toContain('scaleX(1)');
  });

  it('value=0 仍渲染轨道（0% 是合法读数不吞渲染）', async () => {
    const host = await mountPt({ value: 0 });
    const track = host.querySelector<HTMLElement>('.pt-track')!;
    expect(track).toBeTruthy();
    expect(track.querySelector('.pt-fill')).toBeTruthy();
    expect(track.getAttribute('aria-valuenow')).toBe('0');
  });

  it('自定义 max：比例按 value/max 归一', async () => {
    const host = await mountPt({ value: 1, max: 4 });
    const track = host.querySelector<HTMLElement>('.pt-track')!;
    expect(track.getAttribute('aria-valuemax')).toBe('4');
    expect(track.getAttribute('aria-valuenow')).toBe('1');
    expect(track.querySelector<HTMLElement>('.pt-fill')!.getAttribute('style')).toContain('scaleX(0.25)');
  });

  it('label 透传 aria-label', async () => {
    const track = (await mountPt({ value: 5, label: '迁移进度' })).querySelector<HTMLElement>('.pt-track')!;
    expect(track.getAttribute('aria-label')).toBe('迁移进度');
  });
});

describe('ProgressTrack 不确定态（value=null）', () => {
  it('.pt-indet 光条类在场 + aria-valuenow 省略（无值可报）', async () => {
    const host = await mountPt({ value: null });
    const track = host.querySelector<HTMLElement>('.pt-track')!;
    expect(track.getAttribute('role')).toBe('progressbar');
    expect(track.getAttribute('aria-valuenow'), '不确定态不得报 now').toBeNull();
    expect(track.querySelector('.pt-fill')!.classList.contains('pt-indet')).toBe(true);
  });
});

describe('ProgressTrack 档位类', () => {
  it('state 四档语义色类（primary 默认）', async () => {
    expect((await mountPt({ value: 1 })).querySelector('.pt-fill')!.classList.contains('pt-c-primary')).toBe(true);
    expect((await mountPt({ value: 1, state: 'success' })).querySelector('.pt-fill')!.classList.contains('pt-c-success')).toBe(true);
    expect((await mountPt({ value: 1, state: 'warning' })).querySelector('.pt-fill')!.classList.contains('pt-c-warning')).toBe(true);
    expect((await mountPt({ value: 1, state: 'danger' })).querySelector('.pt-fill')!.classList.contains('pt-c-danger')).toBe(true);
  });

  it('size 三档高度类（sm 默认）', async () => {
    expect((await mountPt({ value: 1, size: 'xs' })).querySelector('.pt-track')!.classList.contains('pt-xs')).toBe(true);
    expect((await mountPt({ value: 1 })).querySelector('.pt-track')!.classList.contains('pt-sm')).toBe(true);
    expect((await mountPt({ value: 1, size: 'md' })).querySelector('.pt-track')!.classList.contains('pt-md')).toBe(true);
  });
});

describe('ProgressTrack Tip 集成与 attrs 透传', () => {
  it('showTip：轨道外包统一悬浮件 .tip-trigger 承载', async () => {
    const withTip = await mountPt({ value: 5, showTip: true });
    expect(withTip.querySelector('.tip-trigger')).toBeTruthy();
    expect(withTip.querySelector('.tip-trigger .pt-track')).toBeTruthy();
    const bare = await mountPt({ value: 5 });
    expect(bare.querySelector('.tip-trigger'), '不开 Tip 时裸轨道直出').toBeNull();
  });

  it('多根模板 $attrs 落轨道（消费方 class 可挂）', async () => {
    const host = await mountPt({ value: 5, class: 'rp-qa-cls' });
    expect(host.querySelector('.pt-track')!.classList.contains('rp-qa-cls')).toBe(true);
  });
});

describe('ProgressTrack 源码锚（动画/降级/主题 token）', () => {
  it('确定态过渡只触 transform（300ms ease-out-quart），不动画 width', () => {
    expect(src).toMatch(/transition: transform 300ms cubic-bezier\(0\.25, 1, 0\.5, 1\);/);
    expect(src, 'width 过渡禁用（布局动画）').not.toMatch(/transition:[^;]*width/);
    expect(src, 'scaleX 驱动口径').toContain('transform-origin: 0 50%');
  });

  it('不确定态 keyframes 流动（translateX 循环）+ 减动效退化为透明度脉动', () => {
    expect(src).toMatch(/@keyframes pt-flow \{\s*\n\s*from \{ transform: translateX\(-100%\); \}/);
    expect(src).toMatch(/to \{ transform: translateX\(250%\); \}/);
    expect(src).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(src).toMatch(/@keyframes pt-pulse/);
    expect(src).toMatch(/50% \{ opacity: 1; \}/);
  });

  it('色值全走主题语义 token（无硬编码色）', () => {
    expect(src).toContain('background: var(--bg2);');
    expect(src).toContain('var(--ac)');
    expect(src).toContain('var(--ok)');
    expect(src).toContain('var(--warn)');
    expect(src).toContain('var(--err)');
    expect(src, '不允许硬编码十六进制色').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
