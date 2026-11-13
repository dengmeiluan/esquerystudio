/**
 * 七百九十三批：守护面扩员=全域死导出常驻守卫（死码域 785~792 八层总后的防回潮面）。
 * 与 deadExport787~792 十把点名锁的分工：点名锁管「已清符号任何 export 形态复发即红」，
 * 本守卫管「新增零提及死导出即时红」——787~792 五域扫描方法论固化为常驻 vitest 判定：
 * 行锚定（787-C1①）+分号分段逐段锚定（791-C1① 同行双句）+内联 type 剥除（789-C1③）
 * +词边界消费判定+vue 全文件文本含模板域（786-C1①）+default 具名导出跳过
 * （消费面走 import AnyName from，具名零提及是合法形态，793 口径约定）。
 * 口径（保守方向，宁可漏报不误报）：产品域 export 符号在「除声明行外的全树源文本」
 * （含 spec 域=readFileSync 文本锁符号天然活；注释/文案词提及也计活）词边界出现 >=1 = 活；
 * 0 = 孤儿（792 批 JobStatus/RiskLevel「生而孤儿」形态即时红）。
 * 豁免清单：无（793 时点孤儿=0，552 符号全活；未来确需零消费导出时在此显式登记+注理由）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.ts') || name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const ALL = walk(SRC);
/* 消费面语料=全树（spec 域含=文本锁符号天然活；每文件行数组预构建复用） */
const CORPUS = ALL.map(f => ({ f, lines: readFileSync(f, 'utf-8').split(/\r?\n/) }));

interface Decl { sym: string; file: string; lineIdx: number; line: string; }

const SEG_RE = /^export[ \t]+(?:declare[ \t]+)?(?:default[ \t]+)?(?:async[ \t]+)?(const|let|var|function\*?|class|abstract[ \t]+class|interface|type|enum)[ \t]+([A-Za-z_$][\w$]*)/;
const NAMED_RE = /^[ \t]*export[ \t]*\{([^}]*)\}(?![ \t]*from)/;

function extractDecls(): Decl[] {
  const decls: Decl[] = [];
  for (const { f, lines } of CORPUS) {
    if (f.includes('__tests__')) continue; /* 声明域=产品面 */
    lines.forEach((line, i) => {
      for (const segRaw of line.split(';')) {
        if (/\bexport\s+default\b/.test(segRaw)) continue;
        const m = segRaw.replace(/^[ \t]+/, '').match(SEG_RE);
        if (m) { decls.push({ sym: m[2], file: f, lineIdx: i, line }); continue; }
        const nm = segRaw.match(NAMED_RE);
        if (nm) {
          for (const part of nm[1].split(',')) {
            const piece = part.trim().replace(/^type[ \t]+/, '');
            const asM = piece.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
            if (asM) decls.push({ sym: asM[2] || asM[1], file: f, lineIdx: i, line });
          }
        }
      }
    });
  }
  return decls;
}

function isOrphan(d: Decl): boolean {
  const re = new RegExp(`\\b${d.sym.replace(/\$/g, '\\$')}\\b`);
  for (const { f, lines } of CORPUS) {
    for (let i = 0; i < lines.length; i++) {
      if (f === d.file && i === d.lineIdx && lines[i] === d.line) continue; /* 声明行排除 */
      if (re.test(lines[i])) return false;
    }
  }
  return true;
}

/* 豁免清单（793 时点为空；登记须注理由+批号） */
const EXEMPT: string[] = [];

describe('全域死导出常驻守卫（793 批·死码域总防回潮）', () => {
  it('产品域 export 符号零孤儿（零消费零自用即红）', () => {
    const decls = extractDecls();
    expect(decls.some(d => d.sym === 'fmtNum'), '扫描器工作自证：已知导出 fmtNum 必被提取（785-C1 假阴性教训）').toBe(true);
    const orphans = decls.filter(d => !EXEMPT.includes(d.sym) && isOrphan(d));
    expect(orphans.map(o => `${o.sym} @ ${o.file.replace(SRC, '')}:${o.lineIdx + 1}`).join('\n')).toBe('');
  });

  it('守卫自证·正向锚：已知活符号 fmtNum 判活（52 文件消费在案）', () => {
    expect(isOrphan({ sym: 'fmtNum', file: '', lineIdx: -1, line: '' })).toBe(false);
  });

  it('守卫自证·变异验红（559 方法论）：零提及符号必判孤儿', () => {
    /* 探针符号动态拼接=源码零完整字面量（705-C1 约定镜像：探针字面量自提及会让词边界自匹配假活） */
    const probe = ['__deadProbe793', 'ZeroMention__'].join('');
    expect(isOrphan({ sym: probe, file: '', lineIdx: -1, line: '' })).toBe(true);
  });
});

describe('模板域恒假死分支看守（786/790/791 三轮固化·791-C1② 判据）', () => {
  it('v-if 属性值 trim 后恰为 false 的死分支全站零命中（=== false 比较形态是活分支不在域内）', () => {
    const hits = CORPUS
      .filter(({ f }) => f.endsWith('.vue') && !f.includes('__tests__'))
      .filter(({ lines }) => lines.some(l => /v-if="\s*false\s*"/.test(l)))
      .map(({ f }) => f);
    expect(hits.join('\n')).toBe('');
  });
});
