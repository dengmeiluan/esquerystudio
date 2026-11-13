/**
 * 四百三十六批：构建产物体积预算守卫——433 实测基线（index 71.99KB/vendor 157.52KB/
 * monaco 757.03KB gzip）设定上限，新依赖/大资源混入使任一 chunk 超限即红。
 * 依赖预算白名单（289-298）的产物层姊妹守卫。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ASSETS = join(__dirname, '../../../modules/console/src/main/resources/static/esquerystudio/assets');

function gzipKB(file: string): number {
  return Math.round(gzipSync(readFileSync(file)).length / 1024);
}

describe('产物体积预算（436 批）', () => {
  it('产物目录存在（build 已跑）', () => {
    expect(existsSync(ASSETS), '先 npm run build 生成产物再跑本守卫').toBe(true);
  });

  it('主入口 chunk 预算：gzip ≤ 250KB（基线 72KB）', () => {
    const files = readdirSync(ASSETS).filter(f => /^index-[\w-]+\.js$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) {
      const kb = gzipKB(join(ASSETS, f));
      expect(kb, `${f} gzip ${kb}KB`).toBeLessThanOrEqual(250);
    }
  });

  it('vendor chunk 预算：gzip ≤ 200KB（基线 158KB）', () => {
    const files = readdirSync(ASSETS).filter(f => /^vendor-[\w-]+\.js$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) {
      const kb = gzipKB(join(ASSETS, f));
      expect(kb, `${f} gzip ${kb}KB`).toBeLessThanOrEqual(200);
    }
  });

  it('monaco chunk 预算：gzip ≤ 900KB（基线 757KB）', () => {
    const files = readdirSync(ASSETS).filter(f => /^monaco-[\w-]+\.js$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) {
      const kb = gzipKB(join(ASSETS, f));
      expect(kb, `${f} gzip ${kb}KB`).toBeLessThanOrEqual(900);
    }
  });

  it('视图级 chunk 单体预算：gzip ≤ 120KB（防单视图膨胀）', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(ASSETS)) {
      if (!f.endsWith('.js')) continue;
      if (/^(index|vendor|monaco)-/.test(f)) continue;
      const kb = gzipKB(join(ASSETS, f));
      if (kb > 120) offenders.push(`${f} gzip ${kb}KB`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
