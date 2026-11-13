/**
 * 四百三十三批：执行主按钮锁宽（CLS 治理）——「执行」→「执行中 X.Xs」文字变长
 * 推挤相邻布局（工具条跳动）。四处执行钮（DevTools/DslQuery/SearchTemplates/
 * IndexHub qry）加 .btn-run-lock（min-width 9.5em，匹配 busy 态宽度）。
 * IndexHub「检索」无 busy 文字变化不锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const theme = readFileSync(join(SRC, 'theme.css'), 'utf-8');

describe('执行按钮锁宽（433 批）', () => {
  it('theme.css：.btn-run-lock 在场', () => {
    expect(theme).toContain('.btn-run-lock { min-width: 9.5em; }');
  });

  it('四处执行钮接入锁宽类', () => {
    const cases: [string, string][] = [
      ['DevToolsView.vue', 'btn primary sm btn-run-lock'],
      ['DslQueryView.vue', 'btn primary sm btn-run-lock'],
      ['SearchTemplatesView.vue', 'btn primary sm btn-run-lock'],
      ['IndexHubView.vue', 'btn sm pri btn-run-lock'],
    ];
    for (const [f, cls] of cases) {
      const v = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(v, f).toContain(cls);
    }
  });
});
