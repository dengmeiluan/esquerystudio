/**
 * 五百二十四批（W7）：全站 z-index 档位看守——白名单制。
 *
 * 纪律出处：theme.css z 阶梯注释族（v3.0.1 阶梯 + W8 补档 + W7 --z-routebar）。
 * 浮层一律消费注册档 var(--z-*)（或 calc 偏移），组件内只许 ≤100 的局部层级小值。
 * 本 spec 扫 src 全部 .vue/.css 文本，任何 z-index 声明必须落在三形态之一：
 *   ① var(--z-*)
 *   ② calc(var(--z-*) ± N)
 *   ③ ≤100 的整数局部小值（含负值）
 * 之外的取值只能进白名单（现存合法存量，合并后应趋零）。
 * 三位数新字面（9000/1200/9999…）回潮即红。
 *
 * 524 批合并记录：八处 .xx-pop 浮岛壳（fxp/ixp/li/skp/fs/epi/alv/hr）已挂 .float-pop
 * 消费 var(--z-island)，App.vue .route-bar 的 9999 黑户档注册为 --z-routebar；
 * 第九处漏网 .st-id-pop（SearchTemplatesView 模板名弹层）由 Lead 收尾同款合并，白名单归零。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(__dirname, '..');

function collectVueCss(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectVueCss(p, out);
    else if (/\.(vue|css)$/.test(name)) out.push(p);
  }
  return out;
}

/* 唯一豁免入口：现存合法存量（file=相对 src 的 posix 路径，value=归一化后的字面值）。
   ⚠ 合并完成时必须同步删除对应条目——下方第二条 it 会强制名单与源码双向一致，
   防死条目烂在名单里让 9000 回潮不报红。 */
const Z_LITERAL_WHITELIST: Array<{ file: string; value: string }> = [
  /* 524 批收尾已归零：第九处 .st-id-pop 曾在此豁免，Lead 收尾已挂 .float-pop 消费 var(--z-island)。
     新豁免须写明理由，合并后同步删条目（下方双向一致 it 强制）。 */
];

/* ① 形态允许等值数字回退（var(--z-drawer, 251) 等，IndexHubView 既有范式）：
   仍是注册档消费，回退数只作变量缺失兜底，不算新字面档位 */
const VAR_FORM = /^var\(--z-[\w-]+\s*(?:,\s*-?\d+)?\)$/;
const CALC_FORM = /^calc\(\s*var\(--z-[\w-]+\)\s*(?:[+-]\s*\d+)?\s*\)$/;

function normalize(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function classify(raw: string): string | null {
  const v = normalize(raw);
  if (VAR_FORM.test(v) || CALC_FORM.test(v)) return null;
  if (/^-?\d+$/.test(v) && Number(v) <= 100) return null;
  return v;
}

describe('themeZGuard524：全站 z-index 档位看守（白名单制）', () => {
  it('所有 z-index 声明只允许 var(--z-*) / calc(var(--z-*)±N) / ≤100 局部小值，例外须在白名单', () => {
    const violations: string[] = [];
    for (const abs of collectVueCss(SRC_ROOT)) {
      const rel = abs.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
      const text = readFileSync(abs, 'utf-8');
      /* 值段用 [^;{}]+（可跨行，如 calc 换行书写），逐个声明归一化判型 */
      const re = /z-index\s*:\s*([^;{}]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const v = classify(m[1]);
        if (v === null) continue;
        if (Z_LITERAL_WHITELIST.some(w => w.file === rel && w.value === v)) continue;
        violations.push(`${rel}: z-index: ${v}`);
      }
    }
    expect(violations, [
      '发现未注册档位的 z-index 字面（三位数回潮）：',
      '浮层请消费 theme.css 注册档 var(--z-ctx/--z-island/--z-fullscreen/--z-receipt/--z-routebar/…) 或 calc 偏移；',
      '组件内局部层级只许 ≤100（含负值）；确需豁免请把 (file, value) 记入本 spec 白名单数组并写明理由。',
    ].join('\n')).toEqual([]);
  });

  it('白名单条目必须仍指向真实存在的存量（合并完成后同步删条目，防名单腐烂）', () => {
    for (const w of Z_LITERAL_WHITELIST) {
      const text = readFileSync(join(SRC_ROOT, w.file), 'utf-8');
      expect(text, `白名单条目 ${w.file} z-index: ${w.value} 已不在源码中——该浮层已合并，请同步删除本条目`).toContain(`z-index: ${w.value}`);
    }
  });

  it('524 批合并锚：八处 .xx-pop 浮岛壳已挂 .float-pop（原类名保留作坐标/尺寸锚）', () => {
    const shells: Array<[string, string]> = [
      ['components/FieldPicker.vue', 'class="fxp-pop float-pop"'],
      ['components/IndexPicker.vue', 'class="ixp-pop float-pop"'],
      ['components/LuceneInput.vue', 'class="li-pop float-pop"'],
      ['components/SettingsKeyInput.vue', 'class="skp-pop float-pop"'],
      ['components/builder/FieldSelect.vue', 'class="fs-pop float-pop"'],
      ['components/devtools/EndpointPathInput.vue', 'class="epi-pop float-pop"'],
      ['views/AliasesView.vue', 'class="alv-pop float-pop"'],
      ['views/SearchTemplatesView.vue', 'class="st-id-pop float-pop"'],
    ];
    for (const [file, needle] of shells) {
      const text = readFileSync(join(SRC_ROOT, file), 'utf-8');
      expect(text, `${file} 浮岛壳未挂 .float-pop`).toContain(needle);
    }
    /* HealthReportView 一处壳类、两处挂载点 */
    const hr = readFileSync(join(SRC_ROOT, 'views/HealthReportView.vue'), 'utf-8');
    expect(hr.match(/class="hr-pop float-pop"/g)?.length, 'HealthReportView 基准/对照两处弹层都须挂 .float-pop').toBe(2);
    /* 壳字面随合并清零：八文件不再有 fixed+9000 手写壳 */
    for (const file of [...shells.map(s => s[0]), 'views/HealthReportView.vue']) {
      const text = readFileSync(join(SRC_ROOT, file), 'utf-8');
      expect(text, `${file} 仍有 z-index: 9000 手写壳残留`).not.toContain('z-index: 9000');
    }
  });

  it('route-bar 黑户档已注册：theme.css 定义 --z-routebar: 9999，App.vue 消费之', () => {
    const css = readFileSync(join(SRC_ROOT, 'theme.css'), 'utf-8');
    expect(css, 'theme.css 缺 --z-routebar 注册').toMatch(/--z-routebar:\s*9999/);
    const app = readFileSync(join(SRC_ROOT, 'App.vue'), 'utf-8');
    expect(app, 'App.vue .route-bar 未消费 var(--z-routebar)').toMatch(/\.route-bar\s*\{[^}]*z-index:\s*var\(--z-routebar\)/);
    /* 同名守护：--z-receipt 是 1310 回执档（GuardedActionButton 在消费），不得被 route-bar 借名重定义 */
    expect(css.match(/--z-receipt:\s*\d+/g)?.join(' '), '--z-receipt 出现重复定义（回执档 1310 必须唯一）').toBe('--z-receipt: 1310');
  });
});
