/**
 * 八百二十三批·横切第六轮「token 定义死链域」小刀（815 批族1 引用死链的姊妹域）。
 *
 * 治理本体：theme.css 注册了但全站零引用的 CSS 变量=定义死链。与 638 批
 * tokenDefinedGuard（防「引用了未定义」）互为镜像：那个防悬空引用，这个防死定义。
 * 死定义的复发方式很具体：立储备 token「备而未收」（523 批 W8 --glow-s 注释明文），
 * 无人消费后没人记得它；下个人要做同类效果时看到定义，以为站内有统一档位就抄走——
 * 死 token 复活成引用，而原本的档位设计意图早已失传。
 *
 * ── 首刀四死证据链（823 Phase 0 HEAD 域扫描+人工全站 grep 终审+引入批次 blame）──
 * --lh-tight     行高三档之紧凑档零消费（normal/loose 活：PainlessLab/Lifecycle 等）
 * --glow-s       523 批 W8「备而未收」储备档零消费（glow-m 活：SideNav/OverviewView 3 处）
 * --dur-scene    632 批时长令牌 scene 档零消费（dur-base/stagger 活：live 域 8 处）
 * --panel-hover  迁入 2.2.7 原始遗留零引用（panel-2/hover 活）
 *
 * ── 断言口径（按字面理解，不要外推）────────────────────────────────
 * 引用集含 var(--x) 与 '--x' 字符串动态注入两形态（815-C1 DECL 12 族约定同源）。
 * 豁免名单 EXEMPT 恒空：未来有意立储备 token 须在此约定（token+批次+意图注释），
 * 无约定的死定义一律删——git 历史可捞。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() && e.name !== '__tests__' && e.name !== 'node_modules'
      ? walk(join(dir, e.name))
      : /\.(vue|ts|css)$/.test(e.name) ? [join(dir, e.name)] : []);

const sources = walk(srcDir).map(p => readFileSync(p, 'utf-8'));

const EXEMPT = new Set<string>([]);

describe('token 定义死链守卫（theme.css 定义集 ⊆ 全站引用集 ∪ 豁免）', () => {
  it('A1 死 token 定义集为空（新储备 token 须入 EXEMPT 约定）', () => {
    const used = new Set<string>();
    for (const src of sources) {
      for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) if (m[1]) used.add(m[1]);
      for (const m of src.matchAll(/['"`](--[\w-]+)['"`]/g)) if (m[1]) used.add(m[1]);
    }
    const defined = new Set<string>();
    for (const line of strip(readFileSync(join(srcDir, 'theme.css'), 'utf-8')).split('\n')) {
      // 按分号分段逐段锚定（787-C1 平移：一行多定义只锚行首=盲区假阴性，823 首跑实证 --lh-normal）
      for (const seg of line.split(';')) {
        const m = seg.match(/(?:^|[\s{])(--[\w-]+)\s*:/);
        if (m && m[1]) defined.add(m[1]);
      }
    }
    const dead = [...defined].filter(t => !used.has(t) && !EXEMPT.has(t));
    expect(dead, '死 token 定义（定义了但全站零引用）: ' + dead.join(', ')).toEqual([]);
  });

  it('A2 四死 token 负向锚（防回潮：定义行不得再现）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf-8'));
    for (const t of ['--lh-tight', '--glow-s', '--dur-scene', '--panel-hover']) {
      expect(new RegExp('^\\s*' + t + '\\s*:', 'm').test(css), t + ' 定义残留').toBe(false);
    }
  });

  it('A3 注释诚实化随刀（行高三档→两档/glow 两档→单档）', () => {
    const css = readFileSync(join(srcDir, 'theme.css'), 'utf-8');
    expect(css, '行高注释仍宣称三档（--lh-tight 已退役）').not.toContain('行高三档');
    expect(css, 'glow 注释仍宣称两档（--glow-s 已退役）').not.toContain('glow 两档');
  });
});
