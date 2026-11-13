/**
 * 五百六十六批：未解析组件全站守卫（resolve-components guard）。
 *
 * 背景：本应用不全局注册 naive-ui、也无 unplugin 自动导入（main.ts 无 app.use(naive)，
 * vite 无 resolver）——每个 SFC 模板里用到的 n-* 组件与 PascalCase 自定义组件
 * （含 lucide 图标）都必须在本文件显式 import。563 四刀在 Pagination.vue 用了
 * <n-popover> 却漏 import（真实浏览器组件不解析、触发钮不渲染、选项胶囊裸平铺，
 * 已随修），同一运行时扫荡又发现 ResultTable 的 n-popover、DocDiffModal 的
 * n-modal、QueryHubView 的 Copy、IlmView 的 TerminalSquare 同类缺失。
 *
 * 本守卫静态锁死整类：
 * ① 模板 <n-xxx> → 必须从 'naive-ui' import 对应 PascalCase 符号；
 * ② 模板 <PascalCase> → 必须出现在本文件任一 import（Vue 内建/Router 全局件豁免）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const VUE_BUILTIN = new Set(['Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense', 'RouterLink', 'RouterView']);

function walkVue(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkVue(p));
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const kebabToPascal = (s: string) => s.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase());

const offenders: string[] = [];
const files = walkVue(join(__dirname, '..'));

for (const fp of files) {
  const src = readFileSync(fp, 'utf-8');
  /* 摘掉 script/style 块与 HTML 注释后再扫模板标签 */
  const tpl = src
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const script = (src.match(/<script[\s\S]*?<\/script>/g) || []).join('\n');

  /* 收集本文件 import 的全部具名/默认符号（含 `import X, { Y } from` 混合形态） */
  const imported = new Set<string>();
  const naiveImported = new Set<string>();
  const collectNamed = (brace: string, mod: string) => {
    const names = brace.split(',').map((s) => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '')).filter(Boolean);
    for (const n of names) {
      imported.add(n);
      if (mod === 'naive-ui') naiveImported.add(n);
    }
  };
  for (const m of script.matchAll(/import\s+(?:type\s+)?{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g)) collectNamed(m[1], m[2]);
  for (const m of script.matchAll(/import\s+(?:type\s+)?(\w+)\s*(?:,\s*{([^}]*)})?\s*from\s*['"]([^'"]+)['"]/g)) {
    imported.add(m[1]);
    if (m[2]) collectNamed(m[2], m[3]);
  }
  /* 脚本内本地质名件：const X = defineAsyncComponent(...)/defineComponent(...) */
  for (const m of script.matchAll(/const\s+(\w+)(?:\s*:\s*[^=\n]+)?\s*=\s*(?:defineAsyncComponent|defineComponent)\(/g)) imported.add(m[1]);

  for (const m of tpl.matchAll(/<([A-Za-z][\w-]*)/g)) {
    const tag = m[1];
    /* SFC 递归自引用：Vue 支持组件按自身文件名递归（AggTreeNode/ExplainTree 先例），豁免 */
    if (tag === kebabToPascal(fp.replace(/\\/g, '/').split('/').pop()!.replace(/\.vue$/, ''))) continue;
    const line = src.slice(0, m.index ?? 0).split('\n').length;
    if (tag.startsWith('n-')) {
      const pascal = kebabToPascal(tag);
      if (!naiveImported.has(pascal)) offenders.push(`${fp.replace(__dirname + '/..', '')}:${line} <${tag}> 缺 import { ${pascal} } from 'naive-ui'`);
    } else if (/^[A-Z]/.test(tag)) {
      if (!VUE_BUILTIN.has(tag) && !imported.has(tag)) offenders.push(`${fp.replace(__dirname + '/..', '')}:${line} <${tag}> 未在任何 import 中声明`);
    }
  }
}

describe('未解析组件全站守卫（五百六十六批）', () => {
  it('全站模板标签均有对应 import（n-*→naive-ui；PascalCase→本文件 import）', () => {
    expect(offenders).toEqual([]);
  });
});
