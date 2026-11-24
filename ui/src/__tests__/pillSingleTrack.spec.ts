/* 徽标单轨的防回退看守（第四轮治理：StatusBadge 收敛）。
 *
 * 治理本体三件：
 *   1) 12 处自造徽标（.ga-badge/.ga-kind/.is-kind/.io-rec-sv + 8 组 19 处）
 *      的尺寸与色值全部并轨全局 .pill；
 *   2) 徽标底色的 color-mix(… N%) 八档（8/10/12/13/14/15/18/22%）→ -soft token；
 *   3) .pill 补 xs/sm 两档尺寸 + 五档分类色款，消除「没有我要的档位」这条不换的理由。
 *
 * 的静默失效风险比前三轮更隐蔽：
 *   - .pill 的色款是单字母（g/y/r/b/n），漏挂 = 无底色透明胶囊。这正是 R99 前
 *     AliasesView 七处 .p-* 的原始症状，pillColorTrack.spec.ts 已看守 template 侧；
 *     本文件补的是「消费方重新长出局部徽标 CSS」这一面。
 *   - color-mix 的百分比是固定值不随主题变。亮色主题下 22% 的底色比 -soft token
 *     深一倍以上——这是修掉的真实缺陷，不是风格差异。有人重新写一条
 *     color-mix 底色，暗色下几乎看不出差别，亮色下缺陷复发，全量测试毫无反应。
 *
 * 断言全部落在源文本上，与本仓库既有看守同一理由（emptyStatePadding.spec.ts:24-27）：
 * happy-dom 不参与 scoped <style> 计算，getComputedStyle(el).padding === ''，
 * 任何渲染后的数值断言都是死断言。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
/* 具名插槽让文件里有多个 </template>；取最后一个才是模板段边界。
   这个坑在 lrBarSingleTrack / emptyStatePadding 里各踩过一次。 */
const tplOf = (s: string) => s.slice(0, s.lastIndexOf('</template>'));

/* 已并轨的消费方：文件 → 曾经自带的徽标类名。
   类名多数保留着（作测试锚点或残余差异挂点），保留不是问题，
   重新长出「尺寸 + 色值」才是回潮。 */
const MERGED: Record<string, string[]> = {
  'components/GuardedActionButton.vue': ['ga-badge', 'ga-kind'],
  'views/IndexSettingsView.vue': ['is-kind'],
  'views/IndexOptimizerView.vue': ['io-rec-sv'],
  'views/AnalysisSettingsView.vue': ['as-badge'],
  'views/BulkEditorView.vue': ['be-badge'],
  'views/PluginsView.vue': ['pl-mx-badge'],
  'views/LiveDashboardView.vue': ['ld-al-badge'],
  'views/SqlBridgeView.vue': ['br-tag'],
  'views/ConfigDriftView.vue': ['cd-badge'],
  'views/PitScrollView.vue': ['pt-badge'],
  /* 五百五十二批：SettingsGrid sg-badge/sg-static 改用 StatusPill（静态档 r/默认档 n）——
     类名只留 DOM 锚，尺寸/色值禁再自带（FORBIDDEN 看守即对它生效）。 */
  'components/SettingsGrid.vue': ['sg-badge', 'sg-static'],
  /* 五百四十批：ConfigValidatorView cv-rp-badge 键清退——538 改用 StatusPill 后类全形态清零，
     字典项空转（防回潮已由 flattenWave538④「cv-rp-badge 锚类不再现」承接），非漏登记。 */
};

/* 这些属性一旦重新出现在已并轨的类上，就意味着又分叉出一份平行实现。
   gap 不在名单里：as-badge/pt-badge 的 2px/4px 是内嵌小图标的真实差异，有意保留。 */
const FORBIDDEN = ['font-size', 'border-radius', 'background', 'font-weight', 'padding'];

describe('第四轮：徽标并轨 .pill 防回退', () => {
  for (const [rel, classes] of Object.entries(MERGED)) {
    for (const cls of classes) {
      it(`${rel} 的 .${cls} 不得重新自带尺寸/色值`, () => {
        const css = strip(readFileSync(join(SRC, rel), 'utf8'));
        /* 抓 .cls 本体与 .cls.xxx 变体的规则体；[^{}]* 之外用 (?![\w-]) 收尾，
           避免 .as-badge 命中 .as-badge-foo（同 lrBarSingleTrack 修过的边界 bug）。 */
        const bad = [...css.matchAll(
          new RegExp(String.raw`\.${cls}(?![\w-])[^{}]*\{([^}]*)\}`, 'g'),
        )]
          .flatMap(m => FORBIDDEN.filter(p => new RegExp(String.raw`(^|;)\s*${p}\s*:`).test(m[1]))
            .map(p => `${m[0].split('{')[0].trim()} → ${p}`));

        expect(bad, `.${cls} 已并轨全局 .pill；重新声明这些属性会分叉出第二份实现`).toEqual([]);
      });
    }
  }

  /* 面二：徽标底色不得回到 color-mix。
     只查 background 位——border-color 的 30/35% 是描边档，与 -soft 底色档是两回事，
     有意未动（也没有 --*-line 一族 token 可用）。 */
  it('徽标类的 background 不得用 color-mix（固定百分比在亮色主题下会过深）', () => {
    const bad: string[] = [];
    for (const dir of ['views', 'components', 'components/builder']) {
      for (const f of readdirSync(join(SRC, dir)).filter(x => x.endsWith('.vue'))) {
        const css = strip(readFileSync(join(SRC, dir, f), 'utf8'));
        for (const m of css.matchAll(
          /\.[a-z-]*(?:badge|pill|chip|verdict|tag|kind)[a-z-]*[^{}]*\{([^}]*)\}/gi,
        )) {
          if (/(^|;)\s*background(-color)?\s*:\s*color-mix/.test(m[1])) {
            bad.push(`${dir}/${f}: ${m[0].split('{')[0].trim()}`);
          }
        }
      }
    }
    expect(bad, '徽标底色应走 --*-soft token（两主题各自调过实色），不要写固定百分比 color-mix').toEqual([]);
  });

  /* 面三：theme.css 里 .pill 的档位必须齐。
     少任何一档，引用它的消费方就退化——xs/sm 缺失 → 字号回落到默认 11px（可感知）；
     分类色款缺失 → 透明无底色胶囊（就是 R99 前 AliasesView 的原始症状）。 */
  it('theme.css 的 .pill 尺寸档与分类色款必须齐备', () => {
    const css = strip(readFileSync(join(SRC, 'theme.css'), 'utf8'));
    for (const k of ['xs', 'sm']) {
      expect(
        new RegExp(String.raw`\.pill\.${k}\s*\{[^}]*font-size`).test(css),
        `theme.css 缺 .pill.${k} 尺寸档；引用它的徽标字号会回落到默认 11px`,
      ).toBe(true);
    }
    for (const k of ['cyan', 'blue', 'violet', 'purple', 'pink']) {
      expect(
        new RegExp(String.raw`\.pill\.${k}\s*\{[^}]*background`).test(css),
        `theme.css 缺 .pill.${k} 分类色款；引用它的徽标会变成无底色透明胶囊`,
      ).toBe(true);
    }
  });

  /* 面四：分类色的 -soft token 必须双主题都在。
     只在 :root 定义而漏了 light 段，亮色下会回落到暗色的 12%——
     语义四色的 soft 是暗 .12 / 亮 .10 各自调过的，分类色照同一口径。 */
  it('--dv-*-soft 必须在暗色与亮色两段都有定义', () => {
    const css = strip(readFileSync(join(SRC, 'theme.css'), 'utf8'));
    const lightAt = css.indexOf('[data-theme="light"]');
    expect(lightAt, 'theme.css 的亮色主题段消失了').toBeGreaterThan(0);
    const [dark, light] = [css.slice(0, lightAt), css.slice(lightAt)];
    for (const c of ['cyan', 'blue', 'violet', 'purple', 'pink']) {
      expect(dark.includes(`--dv-${c}-soft:`), `暗色段缺 --dv-${c}-soft`).toBe(true);
      expect(light.includes(`--dv-${c}-soft:`), `亮色段缺 --dv-${c}-soft；亮底上会用暗色的偏深档`).toBe(true);
    }
  });

  /* token 自引用（第七轮实战抓到，犯了两次）。
     批量把手写 color-mix 换成 var(--x-edge) 时，正则连 token 定义自身也换了，
     得到 `--ok-edge: var(--ok-edge);`。CSS 里这是无效声明——不报错，
     直接回退到继承值，描边/底纹静默消失。比缺 token 更难发现：token「存在」，
     只是求值失败。 */
  it('theme.css 里没有自引用的 token 定义', () => {
    const css = strip(readFileSync(join(SRC, 'theme.css'), 'utf8'));
    const bad = [...css.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/g)]
      .filter(m => m[1] === m[2])
      .map(m => m[0]);
    expect(bad, '自引用 token 是无效声明，会静默回退到继承值').toEqual([]);
  });

  /* 面五之前之前：token 存在性（第六轮实战抓到的坑）。
     并轨时把手写 color-mix 换成 var(--dv-orange-soft)，而该 token 从未定义过——
     CSS 静默失效（徽标变透明底），2185 条测试全绿，肉眼也难发现。
     写错名字、漏补一档、删 token 时漏改消费方，都是这一类。 */
  it('引用的每个 -soft/-line token 都必须在 theme.css 有定义', () => {
    const css = strip(readFileSync(join(SRC, 'theme.css'), 'utf8'));
    const lightAt = css.indexOf('[data-theme="light"]');
    const [dark, light] = [css.slice(0, lightAt), css.slice(lightAt)];

    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(join(SRC, dir), { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${dir}/${e.name}`);
        else if (/\.(vue|css)$/.test(e.name)) {
          for (const m of readFileSync(join(SRC, dir, e.name), 'utf8')
            .matchAll(/var\((--[a-z0-9-]+-(?:soft|line))\)/g)) used.add(m[1]);
        }
      }
    };
    walk('.');

    const missing: string[] = [];
    for (const t of [...used].sort()) {
      if (!dark.includes(`${t}:`)) { missing.push(`${t} 无暗色定义`); continue; }
      /* 别名（--x: var(--y)）随本体切换，不需要亮色段重复声明 */
      const isAlias = new RegExp(String.raw`${t}:\s*var\(`).test(dark);
      if (!isAlias && !light.includes(`${t}:`)) missing.push(`${t} 无亮色定义`);
    }
    expect(missing, '被引用但未定义的 token 会静默失效——底色/描边直接消失，测试不会报错').toEqual([]);
  });

  /* 面五之前：描边档（第五轮）。
     -line 与 -soft 是配套的两档：soft 是底色，line 是描边。此前全仓 85 处描边各写
     color-mix 20%~55%，九档散落且固定百分比不随主题变（亮底上 45% 过重）。
     统一到 .35（warn 原主峰即 35%，17 处单档最多）。

     只查「混 transparent」这一种写法——混 var(--line)/var(--bd) 的是另一回事
     （语义色掺进中性描边，不是纯淡化），有意保留，共 11 处。 */
  it('语义色描边不得回到 color-mix(…, transparent)（应走 -line token）', () => {
    const bad: string[] = [];
    for (const dir of ['views', 'components', 'components/builder']) {
      for (const f of readdirSync(join(SRC, dir)).filter(x => x.endsWith('.vue'))) {
        const css = strip(readFileSync(join(SRC, dir, f), 'utf8'));
        for (const m of css.matchAll(/border(?:-color|-top|-left|-bottom|-right)?\s*:\s*([^;}]*)/g)) {
          if (/color-mix\(in srgb,\s*var\(--(?:ok|warn|err|info|wn)\)\s*\d+%,\s*transparent\)/.test(m[1])) {
            bad.push(`${dir}/${f}: ${m[0].trim().slice(0, 70)}`);
          }
        }
      }
    }
    expect(bad, '语义色描边应走 --*-line token；固定百分比在亮色主题下会过重').toEqual([]);
  });

  it('theme.css 的 --*-line 四档必须双主题齐备', () => {
    const css = strip(readFileSync(join(SRC, 'theme.css'), 'utf8'));
    const lightAt = css.indexOf('[data-theme="light"]');
    const [dark, light] = [css.slice(0, lightAt), css.slice(lightAt)];
    for (const c of ['ok', 'warn', 'err', 'info']) {
      expect(dark.includes(`--${c}-line:`), `暗色段缺 --${c}-line`).toBe(true);
      expect(light.includes(`--${c}-line:`), `亮色段缺 --${c}-line；亮底上会用暗色的偏淡档`).toBe(true);
    }
  });

  /* 面五：并轨后的消费方模板里，.pill 必须带色款。
     pillColorTrack.spec.ts 看的是「不许出现无定义的 p-* 后缀」，
     本条看的是另一半：新挂的这些 .pill 每个都真带了色款。
     动态色款（:class="x ? 'g' : 'r'"）也要算进来，否则会误判。 */
  it('并轨的 .pill 挂载点都带色款', () => {
    /* 1439：补 theme.css 的语义别名档（.pill.err/.warn/.info 与 r/y/b 同 token，
       「写侧统一 --err/--warn」裁决）——只认短码会把新挂的 pill warn 误判成无底色 */
    const VALID = ['g', 'y', 'r', 'b', 'n', 'cyan', 'blue', 'violet', 'purple', 'pink', 'err', 'warn', 'info'];
    const bad: string[] = [];
    for (const rel of Object.keys(MERGED)) {
      const tpl = tplOf(readFileSync(join(SRC, rel), 'utf8'));
      for (const m of tpl.matchAll(/<[^>]*class="([^"]*\bpill\b[^"]*)"([^>]*)>/g)) {
        const inStatic = m[1].split(/\s+/).some(t => VALID.includes(t));
        /* 动态绑定：:class="cond ? 'g' : 'r'" 或 :class="pillTone" 之类 */
        const dyn = /:class\s*=/.test(m[2]) || /:class\s*=/.test(m[0]);
        if (!inStatic && !dyn) bad.push(`${rel}: class="${m[1]}"`);
      }
    }
    expect(bad, '.pill 不带色款会渲染成无底色透明胶囊（R99 前 AliasesView 的原始症状）').toEqual([]);
  });
});
