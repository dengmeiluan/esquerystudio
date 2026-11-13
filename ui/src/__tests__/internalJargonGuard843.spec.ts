import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// 内部记账语汇守卫：产品源码（src 下非测试代码）注释不得携带内部批号/轮次/Task 编号等
// 台账黑话——开源读者视角这些是无从查证的内部语汇。测试目录（__tests__）与文件名豁免
// （spec 批号后缀是内部记账锚点），内容清洗范围=页面与产品代码。
const JARGON = new RegExp(
  '(?<![A-Za-z0-9])R\\d{2,3}(?![0-9])' // R63 / R210
    + '|第[一二三四五六七八九十百千零]{1,3}[批轮]' // 第十批 / 第十七轮
    + '|[一二三四五六七八九十百千零]{2,}批' // 五百五十五批
    + '|\\b\\d{3} *批' // 222 批
    + '|(?<![A-Za-z])Task ?\\d+' // Task 6
    + '|用户(?=实报|裁决|令|点名)', // 用户实报 → 实报
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(vue|ts|css)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('internal jargon guard (843)', () => {
  it('product sources carry no internal jargon', () => {
    const root = join(__dirname, '..');
    const hits: string[] = [];
    for (const file of walk(root)) {
      const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (JARGON.test(lines[i])) {
          hits.push(`${relative(root, file)}:${i + 1}`);
        }
      }
    }
    expect(hits, `产品源码残留内部记账黑话 ${hits.length} 处（首 20）：\n${hits.slice(0, 20).join('\n')}`).toEqual([]);
  });
});
