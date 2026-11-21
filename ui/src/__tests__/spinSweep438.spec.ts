/**
 * 四百三十八批：加载类图标旋转全站覆盖终查——RefreshCw/Loader2 按钮此前 11 处
 * 无旋转绑定（部分连点无守卫：ConfigDrift 重试/Aliases 重试/IndexHub 详情重试）。
 * 统一：spinning 旋转+缺失 disabled 补齐；SetupWizard 本地 sw-rot 定义退役。
 * 全站「加载类图标必须旋转」承诺至此有扫描守卫兜底。
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
const files = walk(SRC);

describe('加载图标旋转覆盖（438 批）', () => {
  it('五处补齐锚', () => {
    const cases: [string, string][] = [
      ['views/ConfigValidatorView.vue', 'spinning: busy'],
      ['views/ConfigDriftView.vue', 'spinning: driftBusy'],
      ['views/BoostTunerView.vue', 'spinning: busy'],
      ['views/AliasesView.vue', 'spinning: loading'],
      ['views/IndexHubView.vue', 'spinning: detailLoading'],
    ];
    for (const [f, binding] of cases) {
      const s = readFileSync(join(SRC, f), 'utf-8');
      expect(s, f).toContain(`:class="{ ${binding} }"`);
    }
  });

  it('SetupWizard 本地 sw-rot 退役（全局 spinning 接管）', () => {
    const s = readFileSync(join(SRC, 'components/SetupWizard.vue'), 'utf-8');
    expect(s).not.toContain('sw-rot');
    expect(s).not.toContain('class="spin"');
    expect((s.match(/class="spinning"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
