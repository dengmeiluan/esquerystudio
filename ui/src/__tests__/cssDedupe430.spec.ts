/**
 * 四百三十批：重复 CSS 规则系统性收口——跨视图重复扫描（提取各视图 scoped 样式
 * 逐规则比对）发现的两大簇：
 * ① .pg-progress 定位规则×5（415 引入时的自创重复）→ 合并 theme.css 单一出处；
 * ② 本地 spinner 定义×13 视图（.spin animation: rot / animation: spin 两种来源，
 *    含 @keyframes spin 本地定义）→ 类名统一 spinning、规则/keyframes 删除，
 *    全部走 theme.css 全局 .spinning（428 已建）。
 * 附扫描清点的次要项（.mono/.dim/.sm-txt/.tbl th.sortable 等实用类×2~3 重复）
 * 留待后续批，避免单批过大。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const SRC = join(__dirname, '..');
const theme = readFileSync(join(SRC, 'theme.css'), 'utf-8');

describe('重复 CSS 收口（430 批）', () => {
  it('theme.css：.pg-progress 单一出处在场', () => {
    expect(theme).toMatch(/\.pg-progress \{ position: absolute; top: 0; left: 0; right: 0; color: var\(--ac\); \}/);
  });

  it('views 层 .pg-progress 本地定义清零（样式保留检查交由全局）', () => {
    let n = 0;
    for (const f of walk(join(SRC, 'views'))) {
      const s = readFileSync(f, 'utf-8');
      n += (s.match(/\.pg-progress \{ position: absolute/g) ?? []).length;
    }
    expect(n, 'views 内 pg-progress 定义应清零').toBe(0);
  });

  it('views 层本地 spinner 动画规则/keyframes 清零', () => {
    const offenders: string[] = [];
    for (const f of walk(join(SRC, 'views'))) {
      const s = readFileSync(f, 'utf-8');
      if (/\.(spin|spinning) \{ animation: (rot|spin) 1s linear infinite; \}/.test(s)) offenders.push(f);
      if (/@keyframes spin \{ to \{ transform: rotate\(360deg\); \} \}/.test(s)) offenders.push(f);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
