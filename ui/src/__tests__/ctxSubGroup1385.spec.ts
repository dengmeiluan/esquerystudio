/**
 * 1385：表格右键「二级分组」不得再平铺（用户原话：太多功能平铺了）。
 *
 * 实测（1440×800，真实浏览器）：「列与导出…」一个二级里塞了 15 项、高 467px，
 * 距视口底只剩 8px——屏幕再矮一点最后几项就点不到；而且「现在就导出」「列操作」
 * 「改默认导出格式」三种完全不同意图混在一张表里，只能靠滚动去找。
 *
 * 修法：拆成三个语义分组（导出… / 列操作… / 默认导出格式…），每组 ≤6 项。
 *
 * 负控：见用例 ④（三组拼回一起项数必须 > 6）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

/** 顶层 return [ ... ] 段（子分组数组定义在它前面，不能一起数） */
function topLevelReturn(): string {
  const i = rt.indexOf('const cellMenuItems');
  expect(i, '缺 cellMenuItems').toBeGreaterThan(-1);
  const end = rt.indexOf('\n});', i);
  const all = rt.slice(i, end);
  const r = all.lastIndexOf('  return [');
  expect(r, '找不到顶层 return [').toBeGreaterThan(-1);
  return all.slice(r);
}

/** 取 `const xxxChildren(: CcmItem[]) = [ ... ];` 的数组体（有/无类型标注都认） */
function childrenOf(name: string): string | null {
  const startRe = new RegExp('const ' + name + '(: CcmItem\\[\\])? = \\[');
  const m = startRe.exec(rt);
  if (!m) return null;
  const from = m.index + m[0].length;
  const end = rt.indexOf('\n  ];', from);
  return end > from ? rt.slice(from, end) : null;
}
const countItems = (s: string) => (s.match(/\{ key: '/g) || []).length;

describe('1385 表格右键二级分组', () => {
  it('① 一级项数受控（新增分组不能让一级膨胀）', () => {
    const top = [...topLevelReturn().matchAll(/^    \{ key: '/gm)].length;
    /* 实测（1440×800）：7 项一级 = 2 直達（复制值/查看完整值）+ 5 分组，
       菜单高 ~250px，远未触及视口底——这是本次拆分后的一级真实额度。
       上限卡在 7：再多就该考虑把「默认导出格式…」并回「导出…」了。 */
    expect(top, `一级项数 ${top}，应 ≤7`).toBeLessThanOrEqual(7);
  });

  it('② 每个二级分组 ≤6 项（不许再出现 15 项长表）', () => {
    for (const name of ['exportChildren', 'colOpsChildren', 'fmtChildren', 'copyChildren', 'queryChildren']) {
      const body = childrenOf(name);
      expect(body, `找不到 ${name}`).toBeTruthy();
      const n = countItems(body!);
      expect(n, `${name} 有 ${n} 项，超过 6`).toBeLessThanOrEqual(6);
    }
  });

  it('③ 导出与「改默认格式」必须分开（两种意图不能混）', () => {
    const exp = childrenOf('exportChildren')!;
    const fmt = childrenOf('fmtChildren')!;
    expect(exp, '导出组里不该出现「导出格式：」这类改默认值的项').not.toMatch(/导出格式：/);
    expect(fmt, '默认格式组里不该出现真正的导出动作').not.toMatch(/exportRows\(/);
    const top = topLevelReturn();
    expect(top).toContain("key: 'export-group'");
    expect(top).toContain("key: 'default-fmt-group'");
  });

  it('④ 负控：三组拼回一起必须被判超限（说明判据真的在看项数）', () => {
    const merged = ['exportChildren', 'colOpsChildren', 'fmtChildren']
      .map(n => childrenOf(n)!).join('\n');
    expect(countItems(merged), '合并后应有 15 项').toBeGreaterThan(6);
  });
});
