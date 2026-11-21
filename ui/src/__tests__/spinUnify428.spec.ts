/**
 * 四百二十八批：旋转动画类名统一——此前 spin/spinning 双轨+本地 keyframes 五份重复
 * （ahr-rot/cv-spin/sp/spin×2），同一 360° 旋转至少五种写法。
 * 收口：theme.css 全局 `.spinning { animation: rot 1s linear infinite; }`（复用既有
 * rot keyframes），七视图本地定义删除，类名统一 spinning。
 * span.spin（边框转圈 loading 圈，元素选择器）语义不同保留不动。
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

describe('旋转动画统一（428 批）', () => {
  it('theme.css 全局 .spinning 在场（复用 rot keyframes）', () => {
    expect(theme).toMatch(/\.spinning \{ animation: rot 1s linear infinite; \}/);
    expect(theme).toContain('@keyframes rot { to { transform: rotate(360deg); } }');
  });

  it('七视图本地 .spin/.spinning 规则与本地 keyframes 清零', () => {
    for (const f of ['AdhocRebuildView.vue', 'AliasesView.vue', 'ConfigDriftView.vue', 'ConfigValidatorView.vue', 'IndexOptimizerView.vue', 'DiagView.vue', 'LifecycleView.vue']) {
      const s = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(s, f).not.toMatch(/\.(spin|spinning) \{ animation:/);
      expect(s, f).not.toMatch(/@keyframes (ahr-rot|cv-spin|sp)\b/);
      expect(s, f).not.toMatch(/\.(spin|spinning) \{[^}]*animation: spin/);
    }
  });

  it('使用面类名统一：无裸 class="spin" 残留（span.spin 边框圈除外）', () => {
    for (const f of ['AdhocRebuildView.vue', 'ConfigValidatorView.vue', 'LifecycleView.vue']) {
      const s = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(s, f).not.toMatch(/class="spin"/);
      expect(s, f).not.toMatch(/\{ spin: /);
    }
  });
});
