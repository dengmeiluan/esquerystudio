/**
 * R130 第一百零四批：UserMenu「复制诊断信息」——报障时一键带走身份/角色/来源/
 * ES 实例/时间，免手抄（报障场景高频：角色权限问题、实例指认）。
 * 锁定（静态）：按钮接线 + copyDiag 组装字段齐全 + import 在场。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/UserMenu.vue'), 'utf-8');

describe('UserMenu 复制诊断信息（一百零四批）', () => {
  it('按钮接线与 copyDiag 函数在场', () => {
    expect(src).toMatch(/@click="copyDiag"/);
    expect(src).toMatch(/async function copyDiag\(\)/);
  });

  it('诊断字段齐全（身份/角色/来源/实例/版本/时间）', () => {
    expect(src).toContain('`身份: ${primaryName.value}`');
    expect(src).toContain('`角色: ${me.role}（${roleHint.value}）`');
    expect(src).toContain('`来源: ${sourceLabel.value}`');
    expect(src).toContain('`ES 实例: ${self}`');
    expect(src).toContain('`ES 版本: ${ver}`');
    expect(src).toMatch(/attrEntries\.value\)\s*lines\.push/);
    expect(src).toContain('时间: ');
  });

  it('依赖 import 在场（copyText/useAppStore/ClipboardCopy）', () => {
    expect(src).toMatch(/import \{ copyText \} from '\.\.\/utils\/format'/);
    expect(src).toMatch(/import \{ useAppStore \} from '\.\.\/stores\/app'/);
    expect(src).toContain('ClipboardCopy');
  });
});
