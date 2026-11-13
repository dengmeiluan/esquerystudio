/**
 * 六百三十二批：交互丝滑首刀（622 稿 P2 §3.1/§3.5；对标用户实报「交互按钮滑动的感觉也很差劲」）。
 *
 * 判据：
 *   1) theme.css 新增「时长三档 + 缓动 + 编排」令牌（纯令牌追加，零 @media / 零 reduced-motion，
 *      不得破 adaptive556 的「恰 4 处 @media / 2 处 prefers-reduced-motion」计数锁）；
 *   2) seg **滑动指示器**：LiveDashboardView 的两处 seg（对比卡 5 档 / 分组 8 档）加 `.ld-seg`
 *      等宽钮 + 单个 `.seg-thumb` 绝对定位滑块，`transform/width` 走 `--dur-fast`/`--ease-out` 过渡；
 *      激活钮 `.on` 的**自持背景退役**（由 pill 接管），实现「真·滑动」而非「换底快闪」；
 *   3) 不动 `.seg` 基类字面（responsiveGuard239 锁 `.seg{display:inline-flex;flex-wrap:wrap`），
 *      `.ld-seg` 只做**增量**修饰（class 并存，不改既有 `class="seg"`）。
 *   823 批锁同步更新注记：--dur-scene（场景档）已退役——632 约定后三周零消费（编排动画未落地），
 *      在场断言组同步收缩；防回潮锚=deadTokenGuard823 A2。
 * 负锁剥注释（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const CSS = codeOf('theme.css');
const VIEW = codeOf('views/LiveDashboardView.vue');

describe('六百三十二批①：时长/缓动令牌（theme.css，零 @media / 零 reduced-motion 增量）', () => {
  it('新增令牌在场', () => {
    expect(CSS, '缓动').toMatch(/--ease-out:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    expect(CSS, '微交互时长').toContain('--dur-fast: 160ms;');
    expect(CSS, '常规时长').toContain('--dur-base: 320ms;');
    expect(CSS, '编排间隔').toContain('--stagger: 60ms;');
  });
  it('不破 adaptive556 计数锁（@media 恒 3 / reduced-motion 恒 2——783 批 R66 兜底族退役 4→3）', () => {
    const media = (CSS.match(/@media/g) ?? []).length;
    const rm = (CSS.match(/prefers-reduced-motion/g) ?? []).length;
    expect(media, '@media 计数不变').toBe(3);
    expect(rm, 'reduced-motion 计数不变').toBe(2);
  });
});

describe('六百三十二批②：seg 滑动指示器（LiveDashboardView 两处 seg）', () => {
  it('滑块元素 + 等宽钮 + .on 自持背景退役（pill 接管）', () => {
    const pills = VIEW.match(/class="seg-thumb"/g) ?? [];
    expect(pills.length, '四处 seg 各一枚滑块（800 +监控明细 ld-detail-seg；896 +Top 指标切换 seg 同构）').toBe(4);
    expect(VIEW, '滑块 aria-hidden').toMatch(/class="seg-thumb"[^>]*aria-hidden="true"/);
    expect(VIEW, '滑块 style 由 segPillStyle 驱动').toMatch(/seg-thumb" :style="segPillStyle\(/);
    expect(VIEW, '等宽钮修饰').toMatch(/\.ld-seg button \{ position: relative; z-index: 1; flex: 1 1 0;/);
    expect(VIEW, '.on 自持背景退役').toMatch(/\.ld-seg button\.on \{ background: transparent; box-shadow: none;/);
  });
  it('滑块过渡走 --dur-fast + --ease-out（真·滑动，非换底快闪）', () => {
    expect(VIEW, '过渡缓动').toMatch(/\.ld-seg \.seg-thumb \{[\s\S]*?transition: left var\(--dur-fast\) var\(--ease-out\), width var\(--dur-fast\) var\(--ease-out\);/);
    expect(VIEW, 'pill 底+圆角+阴影').toMatch(/\.ld-seg \.seg-thumb \{[\s\S]*?background: var\(--bg3\);/);
    expect(VIEW, 'pill 圆角 r-s').toMatch(/\.ld-seg \.seg-thumb \{[\s\S]*?border-radius: var\(--r-s\);/);
  });
  it('两处 seg 均挂 ld-seg（class 并存，不改既有 class="seg"）', () => {
    expect(VIEW, '对比卡 seg').toMatch(/class="seg ld-seg"[^>]*aria-label="节点对比指标"/);
    expect(VIEW, '分组 seg').toMatch(/class="seg ld-seg ld-hist-group"[^>]*aria-label="指标分组"/);
  });
  it('active 索引 computed + segPillStyle 纯函数（等分算术）', () => {
    expect(VIEW, '分组索引 computed').toMatch(/histGroupIdx = computed\(/);
    expect(VIEW, '对比卡索引 computed').toMatch(/cmpMetricIdx = computed\(/);
    expect(VIEW, 'segPillStyle 等分算术').toMatch(/function segPillStyle\(count[^)]*\)\s*\{/);
    expect(VIEW, 'n = max(1,count)').toContain('const n = Math.max(1, count);');
    expect(VIEW, '左偏移 = idx·1/n%').toContain('left: `${(activeIdx * 100 / n)}%`');
    expect(VIEW, '宽度 = 1/n%').toContain('width: `${(100 / n)}%`');
  });
  it('不动 .seg 基类字面（responsiveGuard239 锁）', () => {
    expect(CSS, '.seg 基类逐字保形').toContain('.seg { display: inline-flex; flex-wrap: wrap;');
  });
});
