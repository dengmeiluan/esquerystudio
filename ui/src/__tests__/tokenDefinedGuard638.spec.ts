/**
 * 六百三十八批：**未定义 token 的 fallback 就是真源**——浅色主题不可读的根因守卫。
 *
 * 现象（635 批 Phase 0 真机实证 = G25）：安全中心「页面授权」区 `.pg-chip` 文字与
 *   `.pg-conn-sum:hover` 文字在**浅色主题下近白不可读**（真鼠标 hover + 截图在
 *   `infra-w3-audit/perf/shots-635/`）。深色主题下看着正常，故视觉走查与全量测试都抓不到。
 *
 * 根因：`--dim` / `--tx` 是 theme.css:144「兼容别名」表**从未注册**的两个旧名。
 *   `var(--dim, #8a93a5)` / `var(--tx, #e8ecf2)` 的 fallback 是**深色档硬编码色**，
 *   因变量不存在而**必然生效**——浅色主题下前景落在白底上，对比度直接坏掉。
 *
 * 约定（本文件即面）：`var(--x, fallback)` 的 fallback 只在 `--x` **真未定义**时生效，
 *   所以「未定义 token + 硬编码颜色 fallback」≡ 把一个主题色写死。判据二选：
 *   ① 换正版 token（--tx0 / --tx1 / --tx2 / --line / --brand…）
 *   ② fallback 本身写另一个 token（如 `var(--bg-hover, var(--bg2))`，合法兜底写法）。
 *   已定义 token 的 fallback 永远是噪音（`themeTokenGuard` 既定口径），本文件不重复。
 *
 * 覆盖范围（按字面理解，不要外推）：
 *   - 只扫**产品码**（src 下，跳过 `__tests__/`）；只认 `var(` 第一个逗号后的**首个**参数。
 *   - 非颜色 fallback（`0` / `56vh` / `max(240px, 42vh)`）一律放行。
 *   - 「已定义」= 源内任何 `--x:` 声明（含 `:style="{ '--x': … }"` 与 `setProperty('--x')`）
 *     或 `--x-` naive-ui 运行期变量。拖动分栏的 `--cv-left-w` 一族即此形态，
 *     其 fallback 是首帧缺省值，合法。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === '__tests__' || e === 'node_modules') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(vue|css|ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
/* 剥注释放文件级做（逐行剥不掉跨行块注释——`var(--sp-*)` 这类注释通配写法会假红）。
   块注释替换为**同长度空白但保留换行**：行号才不会整体上移（报错行号要能直接跳转）。 */
const blank = (m: string) => m.replace(/[^\n]/g, ' ');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');

const sources = files.map(f => ({ rel: relative(SRC, f).replace(/\\/g, '/'), src: stripComments(readFileSync(f, 'utf8')) }));

/* ── 已定义 token 全集（声明 + 运行期注入）──
   815 批扩形态：--x' / --x" 后跟冒号也算声明（:style="{ '--x': … }" 动态注入族，
   --cv-left-w 一族的 SplitHandle 双栏宽即此形态——裸引用用例不误伤）。 */
const DECL = /(^|[{;\s"'`(,])--([a-zA-Z0-9_-]+)['"]?\s*:/g;
const SETPROP = /setProperty\(\s*['"`]--([a-zA-Z0-9_-]+)/g;
const known = new Set<string>();
for (const { src } of sources) {
  for (const m of src.matchAll(DECL)) known.add(m[2]);
  for (const m of src.matchAll(SETPROP)) known.add(m[1]);
}

/* ── 取 var() 的 token 名与首个 fallback 实参（括号配平，支持 max(...)/var(...) 嵌套）── */
const COLORISH = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/;
function fallbacks(src: string) {
  const out: { name: string; fb: string; at: number }[] = [];
  const re = /var\(\s*--([a-zA-Z0-9_-]+)\s*(,)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (!m[2]) continue;
    let i = re.lastIndex, depth = 1, start = i;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (depth === 0) break;
      i++;
    }
    /* 首个逗号切参数，其后可能是嵌套调用 → 再按配平截断 */
    let j = start, d2 = 0, end = i;
    for (; j < i; j++) {
      const c = src[j];
      if (c === '(') d2++;
      else if (c === ')') d2--;
      else if (c === ',' && d2 === 0) { end = j; break; }
    }
    out.push({ name: m[1], fb: src.slice(start, end).trim(), at: m.index });
  }
  return out;
}

describe('未定义 token 的 fallback 不得是硬编码颜色（638 批约定）', () => {
  it('扫描器自检：确实扫到了产品码与 token 声明（防空跑假绿）', () => {
    expect(files.length, 'src 下产品码文件数').toBeGreaterThan(200);
    expect(known.size, 'theme.css 系 token 声明数').toBeGreaterThan(100);
  });

  it('全站产品码：未定义 token 的 fallback 里不得出现硬编码颜色', () => {
    const bad: string[] = [];
    for (const { rel, src } of sources) {
      if (!src.includes('var(--')) continue;
      for (const { name, fb, at } of fallbacks(src)) {
        if (name.startsWith('n-') || known.has(name)) continue;
        if (!COLORISH.test(fb)) continue;
        const line = src.slice(0, at).split('\n').length;
        bad.push(`${rel}:${line}  --${name} → ${fb.slice(0, 40)}`);
      }
    }
    expect(
      bad,
      '未定义 token 的 fallback 会真生效；写成硬编码色即「主题色写死」——浅色主题下必然坏。\n'
      + '改用正版 token（--tx0/--tx1/--tx2/--line/--brand…），或让 fallback 走另一个 token。\n'
      + bad.join('\n'),
    ).toEqual([]);
  });
});

describe('裸 var() 引用必须指向已定义 token（815 批约定）', () => {
  /**
   * 现象（815 批横切第五轮预扫实锚）：LiveDashboardView 四处 `color: var(--tx)`——
   *   --tx 从未注册（正版是 --tx0/--tx1/--tx2，638 批注释在案），裸引用无 fallback，
   *   声明 invalid at computed-value time 整条失效，color 静默走父级继承，
   *   hover 提亮失效+文本档位漂移被继承兜底掩盖——深浅两主题下都「看着正常」，
   *   视觉走查与全量测试双盲。
   *
   * 约定（本用例即面）：裸 `var(--x)`（无 fallback）必须指向已定义 token。
   *   与 638 主用例互补：那边只「带 fallback 的硬编码色」，这边裸引用域。
   */
  it('全站产品码：无 fallback 的 var(--x) 不得引用未定义 token', () => {
    const bad: string[] = [];
    for (const { rel, src } of sources) {
      if (!src.includes('var(--')) continue;
      for (const m of src.matchAll(/var\(\s*--([a-zA-Z0-9_-]+)\s*\)/g)) {
        const n = m[1];
        if (n.startsWith('n-') || known.has(n)) continue;
        const line = src.slice(0, m.index!).split('\n').length;
        bad.push(`${rel}:${line}  var(--${n})`);
      }
    }
    expect(
      bad,
      '未定义 token 的裸引用=声明整条失效，继承属性静默走父级继承掩盖缺陷。\n'
      + '改用正版 token（--tx0/--tx1/--tx2/--line/--brand…），或在 :style 动态注入处声明。\n'
      + bad.join('\n'),
    ).toEqual([]);
  });
});

describe('六百三十八批修复锚：安全中心页面授权区 .pg-* 走正版 token（G25 防回流）', () => {
  const sec = readFileSync(join(SRC, 'views/SecurityView.vue'), 'utf8');

  it('`.pg-conn-sum::before` / `.pg-conn-sum:hover` / `.pg-w` 三处引正版 token', () => {
    expect(sec, '折叠箭头色 → 弱文本档').toContain(".pg-conn-sum::before { content: '▸'; color: var(--tx2);");
    expect(sec, '悬浮提到主文本档').toContain('.pg-conn-sum:hover { color: var(--tx0); }');
    /* 六百四十二批 G30 同步更新：.pg-chip 自绘基座退役共用 .chip，可写修饰 .pg-w 走正版 --brand */
    expect(sec, '可写芯片 → 品牌色档（正版 --brand）').toContain('.pg-w { color: var(--brand);');
  });

  it('未注册旧别名 --dim / --tx 不得回流（正版是 --tx2 / --tx0）', () => {
    expect(sec, '--dim 从未注册，引用即走深色 fallback').not.toContain('var(--dim');
    expect(sec, '--tx 从未注册（--tx0/--tx1/--tx2 才是正版）').not.toMatch(/var\(--tx\s*[,)]/);
  });
});
