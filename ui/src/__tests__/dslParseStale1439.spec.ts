/**
 * 1439：DSL 解析失败时，旧结果不许「无声顶替」。
 *
 * 实证（真实浏览器）：成功查一次 → 编辑器改成非法 JSON → 执行：
 * 只弹一个会消失的 toast，旧表原样留在屏幕上、没有任何标记——
 * 用户切走再回来会把上一次的命中当成这一版的结果。
 *
 * 现在：常驻错误条（说明结果来自上一次）+「恢复上次可执行版本」；
 * DSL 改回可解析后标记自动撤下。本 spec 锁接线，行为已浏览器实测。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DQ = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf8');

function problems(src: string): string[] {
  const out: string[] = [];
  if (!src.includes('data-test="dsl-parse-stale"')) out.push('缺常驻提示节点');
  if (!src.includes('下方结果来自上一次查询')) out.push('提示没有说明结果来自上一次');
  if (!src.includes('restoreLastGood')) out.push('缺恢复入口');
  if (!/parseErr\.value\s*=\s*'当前 DSL 不是合法 JSON/.test(src)) out.push('解析失败分支未设置标记');
  if (!/parseErr\.value\s*=\s*'';\s*\n\s*lastGoodDsl\.value\s*=\s*dsl\.value;/.test(src)) out.push('成功分支未清标记/未记可执行版本');
  if (!/watch\(dsl, \(v\) => \{[\s\S]*?if \(tryParse\(applyVars\(stripJsonComments\(v\)\)\)\) parseErr\.value = '';/.test(src)) out.push('改回可解析后未自动撤下标记');
  return out;
}

describe('1439 DSL 解析失败不静默顶替旧结果', () => {
  it('接线齐全', () => {
    expect(problems(DQ)).toEqual([]);
  });

  it('负控：去掉失败分支的标记 → 判据必须点名', () => {
    const broken = DQ.replace("parseErr.value = '当前 DSL 不是合法 JSON（已剥离注释后校验）';", '');
    expect(broken).not.toBe(DQ);
    expect(problems(broken)).not.toEqual([]);
  });

  it('负控：去掉自动撤下 watcher → 判据必须点名', () => {
    const broken = DQ.replace("if (tryParse(applyVars(stripJsonComments(v)))) parseErr.value = '';", '');
    expect(broken).not.toBe(DQ);
    expect(problems(broken)).not.toEqual([]);
  });
});
