/* 代码缩进卫生看守（856 批·855 白空格误伤修复批）。
 *
 * 病灶家族：855 批词表清洗的伴随白空格压缩走「注释态扫描器」，正则字面量里的
 * /* 序列（如 CreateIndexModal 的 ILLEGAL 字符类）与 Monaco tokenizer 规则串、
 * URL // 形态会把扫描器带进假注释态——假注释区内的真实代码行被剥到 1 空格缩进。
 * 855-C1② 已对 spec 域回滚重做（空白保真版），产品域同类损伤由本批修复并立此看守。
 *
 * 断言口径：
 *   L 组：23 个被剥缩进的代码行逐字面锁（内容唯一定位+精确原缩进）。
 *   T 组：4 个模板文件 1 空格行上不得残留模板/属性/插值/链式代码形态。
 * 豁免：注释续行散文落 1 空格=855 文体归正的预期形态，不在禁形态内。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(__dirname, '..');
const read = (rel: string): string[] =>
  readFileSync(join(srcDir, rel), 'utf8').split('\n');

/* L 组：被假注释区误伤剥缩进的代码行（行号+内容+原缩进三重字面锁，787-C2 形态） */
const LITERAL_LOCKS: Array<{ file: string; line: number; content: string; indent: string }> = [
  // CreateIndexModal.vue — ILLEGAL 正则字符类 /* 序列触发假注释态
  { file: 'components/CreateIndexModal.vue', line: 156, content: 'const n = name.value;', indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 157, content: 'const out: Check[] = [];', indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 158, content: "const push = (pass: boolean, okT: string, errT: string, warn = false) =>", indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 159, content: "out.push(pass ? { t: okT, lv: 'ok' } : { t: errT, lv: warn ? 'warn' : 'err' });", indent: '    ' },
  { file: 'components/CreateIndexModal.vue', line: 160, content: "push(n === n.toLowerCase(), '全小写', '必须全小写（含大写字母不被 ES 接受）');", indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 161, content: 'push(!ILLEGAL.test(n), \'无非法字符\', \'含非法字符（\\\\ / * ? " < > | 空格 , # :）\');', indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 162, content: "push(!/^[-_+]/.test(n), '开头合法', '不能以 - _ + 开头');", indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 163, content: "push(n !== '.' && n !== '..', '非保留名', '不能是 . 或 ..');", indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 164, content: "push(new TextEncoder().encode(n).length < 255, '长度合规', '超过 255 字节上限');", indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 165, content: 'const dup = store.indices.some(i => i.index === n);', indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 166, content: "push(!dup, '名称未被占用', '同名索引已存在（后端也会拒绝）');", indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 167, content: "if (n.startsWith('.')) out.push({ t: '以 . 开头将被视为系统/隐藏索引，请确认这是有意为之', lv: 'warn' });", indent: '  ' },
  { file: 'components/CreateIndexModal.vue', line: 168, content: 'return out;', indent: '  ' },
  // useInputLint.ts — 同族假注释态
  { file: 'composables/useInputLint.ts', line: 39, content: "if (/^[._]/.test(v)) return { msg: '索引名不得以 . 或 _ 开头（保留给系统索引）' };", indent: '    ' },
  { file: 'composables/useInputLint.ts', line: 40, content: 'if (new TextEncoder().encode(v).length > 255) return { msg: \'索引名超长（>255 字节）\' };', indent: '    ' },
  { file: 'composables/useInputLint.ts', line: 41, content: 'return null;', indent: '    ' },
  { file: 'composables/useInputLint.ts', line: 42, content: '};', indent: '  ' },
  // monacoLanguages.ts — monarch 规则串 /* */ 形态触发假注释态
  { file: 'utils/monacoLanguages.ts', line: 72, content: "[/\\*\\//, 'comment', '@pop'],", indent: '        ' },
  { file: 'utils/monacoLanguages.ts', line: 73, content: "[/[/*]/, 'comment'],", indent: '        ' },
  { file: 'utils/monacoLanguages.ts', line: 74, content: '],', indent: '      ' },
  { file: 'utils/monacoLanguages.ts', line: 75, content: '},', indent: '    ' },
  { file: 'utils/monacoLanguages.ts', line: 76, content: '});', indent: '  ' },
  { file: 'utils/monacoLanguages.ts', line: 77, content: "monaco.languages.setLanguageConfiguration('painless', BRACKET_CONF);", indent: '  ' },
];

/* T 组：模板文件 1 空格行上的代码形态禁令（标签/插值/链式注释行/属性续行/闭括号） */
const TEMPLATE_SHAPE_FILES = [
  'views/ReindexAdvancedView.vue',
  'components/IndexOptionRow.vue',
  'components/MappingFieldTree.vue',
  'components/SettingsGrid.vue',
];
const TEMPLATE_CODE_SHAPE =
  /^(?:<\/?[A-Za-z]|\{\{|-->|[:@][a-z][\w.-]*\s*["'=]|\}\);|\],|\},|\);)/;

describe('indentHygiene856 · 假注释区代码剥缩进修复看守', () => {
  it('L1 23 个代码行行号字面锁：内容与缩进逐行精确', () => {
    const broken: string[] = [];
    const byFile = new Map<string, string[]>();
    for (const lock of LITERAL_LOCKS) {
      if (!byFile.has(lock.file)) byFile.set(lock.file, read(lock.file));
      const lines = byFile.get(lock.file) as string[];
      const ln = lines[lock.line - 1];
      if (ln === undefined) { broken.push(`${lock.file}:${lock.line} 越界`); continue; }
      const actualIndent = ln.match(/^[ \t]*/)?.[0] ?? '';
      if (ln.trim() !== lock.content || actualIndent !== lock.indent) {
        broken.push(`${lock.file}:${lock.line} 内容${ln.trim() === lock.content ? '合' : '不合'} 缩进=${JSON.stringify(actualIndent)} 期望=${JSON.stringify(lock.indent)}: ${lock.content.slice(0, 60)}`);
      }
    }
    expect(broken, `缩进误伤残留 ${broken.length} 处：\n${broken.join('\n')}`).toEqual([]);
  });

  it('T1 模板文件 1 空格行零代码形态', () => {
    const broken: string[] = [];
    for (const rel of TEMPLATE_SHAPE_FILES) {
      read(rel).forEach((ln, i) => {
        if (!/^ [^ ]/.test(ln)) return;
        const t = ln.trim();
        if (TEMPLATE_CODE_SHAPE.test(t)) {
          broken.push(`${rel}:${i + 1} [1 空格代码形态] ${t.slice(0, 90)}`);
        }
      });
    }
    expect(broken, `模板代码行仍落 1 空格 ${broken.length} 处：\n${broken.slice(0, 40).join('\n')}`).toEqual([]);
  });
});
