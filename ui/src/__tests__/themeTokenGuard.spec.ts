/* 浅色主题下会坏掉的硬编码底色看守。
 *
 * 治理本体：本仓库有四档主题（dark/light/auto/host，stores/app.ts:280），
 * 深浅两套 token 在 theme.css 的 :root 与 :root[data-theme="light"] 各自取值。
 * 但 5 处 pre/code 的底色写成了裸 rgba(0,0,0,.2~.25)——
 * 深色主题下看着正常（只是更暗一点），浅色主题下在白底上压出灰黑块，
 * 块内又是深色文字，对比度直接坏掉。
 *
 * 这类漏网点的复发方式很具体：下一个人写新面板时，
 * 照着旁边那行 `background: rgba(0,0,0,.25)` 抄一份。
 * 全量测试对此毫无反应——它在深色主题下确实不难看，
 * 而单测环境（happy-dom）不切主题、不注入 theme.css，
 * 任何"渲染后取色"的断言都是死断言。
 * 故断言落在源文本：不许再出现不跟随主题的深色叠加底。
 *
 * ── 覆盖范围（按字面理解，不要外推）──────────────────────────
 * 只认 background / background-color 上的 rgb(a)(0,0,0,…) 与近黑十六进制。
 * 换成 rgba(2,6,23,.25) 或 color-mix(in srgb, black 25%, transparent)
 * 都能绕过本看守——扩写法时必须同步 DARKISH 这个列表。
 *
 * 不管其余位置的硬编码色，那些经核查都不是缺陷：
 *   - var(--border, #333) 一类 fallback：--border 已在 theme.css:75 定义，
 *     fallback 永不生效，是噪音而非 bug（35 处，全在相关性调试几个页面）
 *   - 品牌渐变/实心徽标上的 #fff：两主题下底色都是品牌色，白字本就正确
 *   - @keyframes 里的品牌色光环 rgba(20,184,166,.15)：两主题都该是青色
 *
 * 正确替代（ 5 处即按此改）：
 *   中性容器内的代码块  → var(--code-bg)（theme.css:87，= var(--bg2)）
 *   语义色面板内的代码块 → var(--hl-soft)（theme.css:66/582，深浅各自取值，
 *                          半透明以透出底层成败色）
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['views', 'components'].map(d => join(__dirname, '..', d));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 不跟随主题的深色叠加底写法。rgb/rgba 两种函数名、任意空白、任意 alpha。
   近黑十六进制取 #000/#000000 及 #0x0x0x 一类极暗值里最常见的裸黑。 */
const DARKISH = String.raw`rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]|#000{1,5}\b`;
const DECL = new RegExp(String.raw`background(?:-color)?\s*:\s*[^;}]*(?:${DARKISH})[^;}]*`, 'gi');

/* color-mix(…, #000) 是「把语义色调暗」的混合参数，不是底色本身
   （UserMenu 的 .av-admin 等三档头像渐变即此形态：var(--err) 混 28% 黑作深色端，
   两主题下都该是同一语义色的暗版，正确写法）。
   剥掉全部 color-mix(...) 后再判纯黑，避免把调暗参数误报成硬编码底色。 */
const dropColorMix = (s: string) => s.replace(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/gi, ' ');

describe('浅色主题硬编码底色防回退', () => {
  for (const dir of roots) {
    for (const f of readdirSync(dir).filter(x => x.endsWith('.vue'))) {
      it(`${f} 的底色不得用不跟随主题的纯黑叠加`, () => {
        const src = strip(readFileSync(join(dir, f), 'utf8'));
        /* var(--x, rgba(0,0,0,.2)) 形态放过：只要变量已定义 fallback 就永不生效。
           这里不去解析 theme.css 判断定义与否——那会让本看守依赖另一份文件的解析，
           而 fallback 位的黑色本身不构成用户可见缺陷（同文件头注释）。 */
        const bad = [...src.matchAll(DECL)]
          .map(m => m[0].trim())
          .filter(d => !/var\(\s*--[a-z0-9-]+\s*,/i.test(d))
          /* 剥掉 color-mix 后仍留有纯黑的才是真底色 */
          .filter(d => new RegExp(DARKISH, 'i').test(dropColorMix(d)));

        expect(
          bad,
          `${f} 出现不跟随主题的深色底：浅色主题下会在白底压出灰黑块。`
          + '中性容器用 var(--code-bg)，语义色面板内用 var(--hl-soft)',
        ).toEqual([]);
      });
    }
  }
});
