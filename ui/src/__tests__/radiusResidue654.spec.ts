/* 六百五十四批轨5【--r（圆角）残量侦察裁决合并】看守 + 六百五十九批【--r-xs 第四档约定】扩定。
 *
 * 654 轮全站审计（views+components+theme.css 的 border-radius 声明对照 theme.css:97
 * 档表 --r-s:6px / --r-m:8px / --r-l:12px）：
 *  · 654 合并 = 单值 6px→var(--r-s) 39 处 + 8px→var(--r-m) 22 处 + 12px→var(--r-l) 1 处
 *    （33 视图/组件文件 + theme.css 四处：scrollbar-thumb / err-bar / sk / toast-undo）；
 *  · 659 轮（用户令「全部可以开干」放行 654 ⑥-3 悬案）：第四档 --r-xs:4px 约定入
 *    theme.css:97 定义行，4px 单值残量全站等值合并 var(--r-xs)——654 时点 107 处、659 开工
 *    实测 105 处/60 文件（黑名单解禁后含 LiveDashboardView×4+LifecycleView×1；多角复合
 *    「4px 4px 0 0」形态不属单档等值，保字面不收）；3px/2px 刻意值维持豁免；
 *  · 豁免约定（刻意值保字面，651 批 --sp 同范式 527/590 先例）：
 *    - 亚阶梯微值 1/2/3/5/7/10/16px——无阶梯等值，强收即改渲染
 *      （滑轨/took-bar/kbd 族/内嵌胞刻意紧凑值；4px 已随 659 升档出册）；
 *    - 50% 圆点 / 0 直角 / 99px·999px 胶囊——语义形态非阶梯档位；
 *    - 多角不对称形式（0 0 var(--r-m) var(--r-m) 族）——已 token 化，无裸阶梯组合残量；
 *  · 658 批接管提交 9e999d7e 后黑名单制度性清零：654 的对方域三文件豁免（SKIP）随解禁
 *    移除，扫描全量覆盖（MonacoEditor 无命中，LiveDashboard/Lifecycle 随合并）；
 *  · 审计误命中两教训（spSweep538 声明级切分 / 650-C1 反锁断言防自注自踩）：
 *    扫描一律先剥行内注释段再测正则；本文件注释不书写「radius 属性名+冒号+裸值」形态字面量。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

/* 单值阶梯残量形态：属性名冒号后紧跟 4/6/8/12px 且以分号或规则收尾
 * （多角形式值后跟空格+数字，天然不命中；单角属性名不含该连续子串，天然不命中） */
const RESIDUE = /border-radius:\s*(?:4|6|8|12)px\s*[;}]/;

/* 剥行内注释段（650-C1：注释内字样不得计入声明残量） */
const stripComment = (l: string) => l.replace(/\/\*.*?\*\//g, '');

function collectResidue(dir: string, hits: string[]) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) collectResidue(p, hits);
    else if (/\.vue$/.test(f)) {
      const lines = readFileSync(p, 'utf-8').split(/\r?\n/);
      lines.forEach((l, i) => {
        if (RESIDUE.test(stripComment(l))) hits.push(`${p}:${i + 1}`);
      });
    }
  }
}

describe('六百五十四批：--r 阶梯等值残量合并与豁免约定', () => {
  it('theme.css 四处合并：scrollbar-thumb / err-bar / sk / toast-undo → var(--r-s)', () => {
    const css = src('theme.css');
    expect(css).toMatch(/scrollbar-thumb[^{}]*\{[^}]*border-radius:\s*var\(--r-s\)/);
    expect(css).toMatch(/\.err-bar\s*\{[^}]*border-radius:\s*var\(--r-s\)/);
    expect(css).toMatch(/\.sk\s*\{[^}]*border-radius:\s*var\(--r-s\)/);
    expect(css).toMatch(/\.toast-undo\s*\{[^}]*border-radius:\s*var\(--r-s\)/);
    expect(css, '四处裸 6px 不得回潮').not.toMatch(/border-radius:\s*6px\s*[;}]/);
  });

  it('theme.css:97 阶梯定义行保字面（token 单源，防自引用式误收；659 增第四档 --r-xs）', () => {
    expect(src('theme.css')).toContain('--r-xs: 4px; --r-s: 6px; --r-m: 8px; --r-l: 12px;');
  });

  it('views+components 单值阶梯残量全站零残量扫描（658 接管后黑名单清零，全量覆盖）', () => {
    const hits: string[] = [];
    collectResidue(join(__dirname, '..', 'views'), hits);
    collectResidue(join(__dirname, '..', 'components'), hits);
    expect(hits, `单值阶梯残量回潮：${hits.join(', ')}`).toEqual([]);
  });

  it('theme.css 本体同口径扫描（97 行定义域为唯一合法裸值行）', () => {
    const lines = src('theme.css').split(/\r?\n/);
    const hits: string[] = [];
    lines.forEach((l, i) => {
      if (l.includes('--r-xs: 4px')) return; /* token 定义行豁免 */
      if (RESIDUE.test(stripComment(l))) hits.push(`theme.css:${i + 1}`);
    });
    expect(hits, `theme.css 残量回潮：${hits.join(', ')}`).toEqual([]);
  });

  it('六百五十九批：theme.css 双件合并 checkbox/.kbd → var(--r-xs) + 裸 4px 反锁', () => {
    const css = src('theme.css');
    expect(css, 'checkbox 圆角随 659 升档').toMatch(
      /input\[type="checkbox"\]\s*\{\s*border-radius:\s*var\(--r-xs\);\s*\}/);
    expect(css, '.kbd 圆角随 659 升档').toMatch(/\.kbd\s*\{[^}]*border-radius:\s*var\(--r-xs\)/);
    expect(css, 'theme.css 裸 4px 不得回潮（定义行外）').not.toMatch(/border-radius:\s*4px\s*[;}]/);
  });

  it('豁免约定抽查：亚阶梯微值与语义形态保字面（防顺手过收；659 后 4px 出册）', () => {
    const css = src('theme.css');
    expect(css, 'kbd-mini 3px 亚阶梯').toMatch(/\.kbd-mini\s*\{[^}]*border-radius:\s*3px/);
    expect(css, 'took-bar 2px 亚阶梯').toMatch(/\.took-bar\s*\{[^}]*border-radius:\s*2px/);
    expect(css, 'kbd.inline 2px 亚阶梯').toMatch(/\.kbd\.inline\s*\{[^}]*border-radius:\s*2px/);
    expect(css, 'chip dot 50% 圆点语义').toMatch(/\.chip \.dot\s*\{[^}]*border-radius:\s*50%/);
    expect(css, 'tgl 99px 胶囊语义').toMatch(/\.tgl\s*\{[^}]*border-radius:\s*99px/);
    expect(src('views/FavoritesView.vue'), 'fv-tab 16px 胶囊型 tab').toMatch(/\.fv-tab\s*\{[^}]*border-radius:\s*16px/);
  });
});
