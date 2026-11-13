import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 全站动态 import(...).then wire 点必须带 .catch——动态 chunk 加载失败（网络/stub
 面/包缺失）时裸奔 then 链=unhandled rejection 控制台报错。862 预扫实锚：全站四件
 monaco Ctrl+I wire 中 DslQueryView 编辑器命令 wire 漏件（同族三件均带「测试 stub
 面/包缺失时静默」catch），本守卫防回潮并管住未来新 wire 点。判定=行窗扫：
 wire 行起 12 行内无 .catch( 即红；`typeof import(` 类型态与 `await import(`（函数内
 try 全接、rejection 走调用方契约）不在扫域。 */

const ROOTS = ['src/views', 'src/components', 'src/utils', 'src/stores', 'src/composables'];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, out);
    else if (/\.vue$|\.ts$/.test(p)) out.push(p);
  }
  return out;
}

function isWireLine(line: string): boolean {
  if (!line.includes("import('")) return false;
  if (!line.includes('.then(')) return false;
  if (line.includes('typeof import(')) return false; // 类型态
  if (line.includes('await import(')) return false; // await 形态
  return true;
}

describe('monacoWireCatchGuard862', () => {
  it('every dynamic-import then-wire chain carries a catch', () => {
    const misses: string[] = [];
    for (const root of ROOTS) {
      for (const file of collectFiles(root)) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (!isWireLine(line)) return;
          const window = lines.slice(i, i + 12).join('\n');
          if (!window.includes('.catch(')) misses.push(`${file.replace(/\\/g, '/')}:${i + 1}`);
        });
      }
    }
    expect(misses, `动态 import wire 缺 .catch ${misses.length} 处（首 10）:\n  ` + misses.slice(0, 10).join('\n  ')).toEqual([]);
  });
});
