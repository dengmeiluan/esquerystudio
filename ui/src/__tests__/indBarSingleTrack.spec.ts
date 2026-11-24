/* 不确定进度条（indeterminate）骨架单轨看守。
 *
 * 治理本体：App.vue 的 .route-bar 与 DslQueryView 的 .dq-progress 原本各写一份
 * 完整实现——2px 高、35% 宽滑块、opacity 0/.on 切换、translateX(-100%)→400% 横扫，
 * 连 keyframes 终值 400% 都逐值相同，只差定位方式（fixed 顶栏 vs absolute 就地）
 * 与渐变段数。骨架已收敛到 theme.css 的 .ind-bar，两处只保留各自的定位与配色。
 *
 * 本文件防两类静默失效：
 *
 *  1) 消费方丢掉 .ind-bar 类。这是最危险的一种：opacity/height/::after/animation
 *     全部由骨架提供，局部只剩 position 与渐变。丢了类之后元素还在、DOM 还在、
 *     全量测试全绿，但条子高度为 0 且没有任何动画——用户完全看不到加载指示。
 *
 *  2) 骨架自身被掏空。.ind-bar 的四个要件（height / opacity 切换 / ::after 滑块 /
 *     keyframes 位移）少任何一个，两处消费方一起失效。
 *
 * 为什么走源文本匹配：本仓库 vitest 环境是 happy-dom，scoped <style> 与 theme.css
 * 都不参与计算，getComputedStyle(el).height === ''，任何渲染后的数值断言都是死断言
 * （恒真或恒假）。同 emptyStatePadding.spec.ts:24-27 的既有结论。
 *
 * 剥注释同 emptyStatePadding.spec.ts:29 的教训——注释里的字面不算数。
 *
 * ── 覆盖边界（按字面理解，不要外推）───────────────────────────
 * 只看守「已收敛到骨架的两处」+「骨架本体」。它不检查全站是否还有第三份手写
 * indeterminate 条：新写一个 .xx-loading-bar 完全绕过这里。
 * HealthReportView 的 .hr-load-bar 是有意不收敛的（4px 高、380px 居中、带轨道底色、
 * 常驻可见、真实子元素而非 ::after——是居中加载块不是边缘细条），故不在名单内。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (...p: string[]) => readFileSync(join(src, ...p), 'utf8');

/* 已收敛的消费方：文件 → 局部类名。新增消费方时同步这里，否则本看守失去覆盖。 */
const CONSUMERS: Array<[string, string[], string]> = [
  ['App.vue', ['App.vue'], 'route-bar'],
  ['DslQueryView.vue', ['views', 'DslQueryView.vue'], 'dq-progress'],
];

describe('indeterminate 进度骨架单轨', () => {
  for (const [label, path, localCls] of CONSUMERS) {
    it(`${label} 的 .${localCls} 必须与 .ind-bar 同时挂载`, () => {
      /* 取模板正文到最后一个 </template>：切第一个会在含具名插槽的文件上截断正文
         （pillColorTrack.spec.ts 与 emptyStatePadding.spec.ts:99 均踩过此坑）。 */
      const full = strip(read(...path));
      const end = full.lastIndexOf('</template>');
      const tpl = end === -1 ? full : full.slice(0, end);

      const tags = [...tpl.matchAll(new RegExp(String.raw`<[^>]*\b${localCls}\b[^>]*>`, 'g'))].map(m => m[0]);
      expect(tags.length, `.${localCls} 的挂载点消失了，进度条被删或改名`).toBeGreaterThanOrEqual(1);
      for (const tag of tags) {
        expect(
          /\bind-bar\b/.test(tag),
          `.${localCls} 未同时挂 .ind-bar——骨架提供 height/opacity/::after/animation，`
          + '丢了它元素高度为 0 且无动画，用户完全看不到加载指示（全量测试不会报错）',
        ).toBe(true);
      }
    });

    it(`${label} 不得重新内联骨架（height/opacity/::after 应只在骨架里）`, () => {
      const css = strip(read(...path));
      /* 抓局部类自己那条规则，断言它不再声明骨架已提供的要件 */
      const rule = new RegExp(String.raw`\.${localCls}\s*\{([^}]*)\}`).exec(css);
      expect(rule, `.${localCls} 的局部规则消失了`).toBeTruthy();
      const decl = rule![1];
      for (const prop of ['height', 'opacity', 'transition']) {
        expect(
          new RegExp(String.raw`\b${prop}\s*:`).test(decl),
          `.${localCls} 重新声明了 ${prop}——该属性属骨架职责，局部只应保留定位与配色`,
        ).toBe(false);
      }
      /* 局部不得再写自己的 keyframes 动画（骨架的 ind-slide 已提供横扫） */
      expect(
        /animation\s*:/.test(decl) || /@keyframes\s+(?!ind-slide)/.test(css) && new RegExp(String.raw`\.${localCls}::after[^}]*animation`).test(css),
        `.${localCls} 重新定义了自己的横扫动画——骨架的 ind-slide 已提供`,
      ).toBe(false);
    });
  }

  it('theme.css 的 .ind-bar 骨架四要件齐备', () => {
    const css = strip(read('theme.css'));

    const base = /(?:^|[\s,}])\.ind-bar\s*\{([^}]*)\}/m.exec(css);
    expect(base, 'theme.css 的 .ind-bar 规则消失了，两处消费方会一起失效').toBeTruthy();
    expect(/height\s*:\s*2px/.test(base![1]), '.ind-bar 的 2px 高度声明消失了').toBe(true);
    expect(/opacity\s*:\s*0/.test(base![1]), '.ind-bar 的默认隐藏（opacity:0）消失了，条会常驻可见').toBe(true);
    /* overflow:hidden 是 translateX(400%) 的裁剪依据，去掉即滑块外溢（App.vue 原注释 R89 记过） */
    expect(/overflow\s*:\s*hidden/.test(base![1]), '.ind-bar 的 overflow:hidden 消失了，滑块会溢出容器').toBe(true);

    expect(/\.ind-bar\.on\s*\{[^}]*opacity\s*:\s*1/.test(css), '.ind-bar.on 的显示态消失了，条永远不可见').toBe(true);

    const after = /\.ind-bar::after\s*\{([^}]*)\}/.exec(css);
    expect(after, '.ind-bar::after 滑块规则消失了').toBeTruthy();
    expect(/width\s*:\s*35%/.test(after![1]), '滑块宽度 35% 声明消失了').toBe(true);
    expect(/animation\s*:\s*ind-slide/.test(after![1]), '滑块未绑定 ind-slide 动画，条静止不动').toBe(true);

    const kf = /@keyframes\s+ind-slide\s*\{([^}]*\}[^}]*)\}/.exec(css);
    expect(kf, '@keyframes ind-slide 消失了').toBeTruthy();
    expect(/translateX\(-100%\)/.test(kf![1]), 'ind-slide 起点位移消失了').toBe(true);
    expect(/translateX\(400%\)/.test(kf![1]), 'ind-slide 终点位移消失了，滑块扫不过全宽').toBe(true);
  });

  it('.ind-bar 提供 reduced-motion 降级', () => {
    const css = strip(read('theme.css'));
    expect(
      /prefers-reduced-motion[^{]*\{[^}]*\.ind-bar::after[^}]*animation\s*:\s*none/.test(css),
      '.ind-bar 缺 prefers-reduced-motion 降级——无限横扫动画对动效敏感用户不可关闭',
    ).toBe(true);
  });
});
