/**
 * R91 守门契约：内联 render 组件（defineComponent + h()）产出的元素
 * 拿不到宿主 SFC 的 scope 属性——它们用到的 class 若被写进 scoped 样式
 * 且未包 :deep()，规则编译后永远匹配不上（Mapping 设计器字段树裸奔事故根因）。
 *
 * 本测试静态扫描全部 .vue：
 *   1) 文件含内联 defineComponent 才检查；
 *   2) 提取其 <script> 里 h() 调用用到的 class token（含 class: 'x'、class: [...]、
 *      class: 变量 → 回溯 const 变量 = '...' 字符串拼接）；
 *   3) 把 scoped 样式中 :deep(...) 段剔除后，若还能命中这些 token 的普通选择器 → 违规。
 * 修法：把该选择器改为 :deep(.x)，或挪进非 scoped <style> 块 / theme.css。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');

function listVueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listVueFiles(p));
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

function extractScript(src: string): string {
  const m = src.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
  return m ? m.join('\n') : '';
}

function extractScopedCss(src: string): string {
  const out: string[] = [];
  const re = /<style([^>]*)>([\s\S]*?)<\/style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (/\bscoped\b/.test(m[1])) out.push(m[2]);
  }
  return out.join('\n');
}

/** 剔除 :deep(...) 片段（含选择器本体），剩下的才是「纯 scoped」规则 */
function stripDeep(css: string): string {
  return css.replace(/:deep\([^)]*\)/g, '');
}

const TOKEN_RE = /^[a-zA-Z][\w-]*$/;

function classTokensFromScript(script: string): Set<string> {
  const tokens = new Set<string>();
  const addLiteral = (lit: string) => {
    for (const t of lit.split(/\s+/)) {
      if (TOKEN_RE.test(t) && !t.endsWith('-')) tokens.add(t);
    }
  };
  // class: 'a b' / class: "a b"
  for (const m of script.matchAll(/class:\s*(['"])([^'"]*)\1/g)) addLiteral(m[2]);
  // class: ['a', cond ? 'b' : '', ...] —— 取数组里全部字符串字面量
  for (const m of script.matchAll(/class:\s*\[([^\]]*)\]/g)) {
    for (const s of m[1].matchAll(/(['"])([^'"]*)\1/g)) addLiteral(s[2]);
  }
  // class: someVar —— 回溯 const someVar = '...'（含字符串拼接，取所有字面量段）
  for (const m of script.matchAll(/class:\s*([A-Za-z_$][\w$]*)\s*[,}]/g)) {
    const decl = script.match(new RegExp(`(?:const|let|var)\\s+${m[1]}\\s*=([^;\\n]*)`));
    if (decl) {
      for (const s of decl[1].matchAll(/(['"])([^'"]*)\1/g)) addLiteral(s[2]);
    }
  }
  return tokens;
}

describe('内联 render 组件的 class 不许落在纯 scoped 规则里（R91 守门）', () => {
  const files = listVueFiles(SRC);
  expect(files.length).toBeGreaterThan(20); // 扫描面完整性自检

  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const script = extractScript(src);
    if (!/defineComponent\s*\(/.test(script)) continue; // 只查含内联组件的 SFC
    const scopedPlain = stripDeep(extractScopedCss(src));
    if (!scopedPlain.trim()) continue;
    for (const t of classTokensFromScript(script)) {
      const sel = new RegExp(`\\.${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
      if (sel.test(scopedPlain)) {
        offenders.push(`${relative(SRC, f)} → .${t}（scoped 规则匹配不到内联 h() 元素，须 :deep(.${t}) 或全局样式）`);
      }
    }
  }
  it('全站零违规', () => {
    expect(offenders, '\n' + offenders.join('\n')).toEqual([]);
  });
});
