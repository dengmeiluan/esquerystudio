/**
 * 按钮主操作类名统一 primary：pri 是历史短名，theme.css 中 .btn.pri 与
 * .btn.primary 并列同定义（.pri 选择器为兼容存量保留），模板使用点已全部
 * 统一为 primary。本文件静态扫描 src/views 与 src/components 全量 .vue（含
 * 子目录），锁住 pri 在按钮场景的回潮：
 *  1) class 引号段中 btn 系类名含独立 pri 词（如 "btn sm pri" / "btn pri sm"）；
 *  2) :class 对象绑定以 pri 为键（:class="{ pri: ... }"）；
 *  3) 宽扫：class 属性里的独立 pri token、:class 数组绑定里的 'pri' 字符串字面量。
 * IndexHubView 的分片语义 pri（分片块主/副本类、分片图例圆点）与按钮无关，
 * 按文件名 + 行内容精确豁免；行内容变化时白名单同步更新。
 * 另锁 DevToolsView 弹层宽度档位（560px + 94vw 钳制，两处同款）与
 * theme.css 的 .btn.pri 别名保留及其注释。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const SCAN_DIRS = [join(SRC, 'views'), join(SRC, 'components')];

/* 分片语义白名单：IndexHubView 分片热力块的主/副本类与图例圆点，
   pri 表「主分片」，不是按钮类名 */
const SHARD_PRI_WHITELIST: { file: string; lineIncludes: string }[] = [
  { file: 'IndexHubView.vue', lineIncludes: `:class="[s.prirep === 'p' ? 'pri' : 'rep', { bad: s.state !== 'STARTED' }]"` },
  { file: 'IndexHubView.vue', lineIncludes: '<span class="ih-sh-lg pri"></span>' },
];

function listVueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listVueFiles(p));
    else if (e.isFile() && e.name.endsWith('.vue')) out.push(p);
  }
  return out;
}

function scanVueLines(match: (line: string) => boolean): string[] {
  const hits: string[] = [];
  for (const p of SCAN_DIRS.flatMap(listVueFiles)) {
    const name = p.split(/[\\/]/).pop()!;
    const lines = readFileSync(p, 'utf-8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!match(line)) return;
      if (SHARD_PRI_WHITELIST.some(w => name === w.file && line.includes(w.lineIncludes))) return;
      hits.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  return hits;
}

/* 静态形态：引号内 btn 系类名列表含独立 pri 词 */
const STATIC_BTN_PRI = /["']btn[^"']*\bpri\b/;
/* 动态对象绑定：:class="{ pri: ... }" */
const DYN_OBJ_PRI = /:class="\{\s*pri\s*:/;

/* 宽扫静态：class="..." 值按空格分词后恰有 pri token */
function classAttrHasPriToken(line: string): boolean {
  const re = /class="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1].split(/\s+/).includes('pri')) return true;
  }
  return false;
}

/* 宽扫动态：:class 数组/对象绑定值里的 'pri' 字符串字面量 */
const DYN_STR_PRI = /:class="[^"]*'pri'/;
/* 宽扫 scoped CSS：按钮样式钩子不再引用 .btn.pri 选择器（分片 .ih-sh-*.pri 不在此列） */
const CSS_BTN_PRI = /\.btn\.pri\b/;

describe('按钮类名统一 primary（pri 短名停用）', () => {
  it('静态形态：class 引号段中 btn 系类名不再含 pri', () => {
    const hits = scanVueLines(l => STATIC_BTN_PRI.test(l));
    expect(hits.join('\n')).toBe('');
  });

  it('动态绑定：:class 对象不再以 pri 为键', () => {
    const hits = scanVueLines(l => DYN_OBJ_PRI.test(l));
    expect(hits.join('\n')).toBe('');
  });

  it('宽扫：独立 pri token / 动态绑定 pri 字面量仅限分片图例白名单', () => {
    const hits = scanVueLines(l => classAttrHasPriToken(l) || DYN_STR_PRI.test(l));
    expect(hits.join('\n')).toBe('');
  });

  it('scoped CSS：按钮样式钩子不再引用 .btn.pri 选择器', () => {
    const hits = scanVueLines(l => CSS_BTN_PRI.test(l));
    expect(hits.join('\n')).toBe('');
  });

  it('DevToolsView：两处弹层宽度为 560px 档位，520 魔数不再出现', () => {
    const v = readFileSync(join(SRC, 'views', 'DevToolsView.vue'), 'utf-8');
    expect(v).not.toContain('width:520px');
    expect(v).not.toContain('width: 520px');
    expect(v.match(/width: 560px; max-width: 94vw/g)?.length).toBe(2);
  });

  it('theme.css：.btn.pri 别名保留（兼容存量），注释注明新代码用 primary', () => {
    const css = readFileSync(join(SRC, 'theme.css'), 'utf-8');
    expect(css).toContain('.btn.pri, .btn.primary {');
    expect(css).toContain('新代码用 primary');
  });
});
