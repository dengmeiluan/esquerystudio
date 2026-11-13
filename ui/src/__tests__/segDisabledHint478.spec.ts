/**
 * 四百七十八批：Sandbox seg 禁用原因提示——aggs/explain/profile 三钮禁用时
 * 无任何解释（用户不知道为什么灰的）；补 title 说明解锁条件
 * （DSL 含 aggs / 请求勾选 explain / 请求勾选 profile）。
 * 「禁用必须可解释」——点击正确性的可发现性维度。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SearchSandboxView.vue'), 'utf-8');

describe('seg 禁用原因提示（478 批）', () => {
  it('478 title 在场；481 explain/profile 升级为一键自动解锁（title 换新语义）', () => {
    expect(v).toContain('title="DSL 需包含 aggs 聚合才有数据"');
    expect(v).toContain('title="自动勾选 explain 并显示解释树（请求选项可关）"');
    expect(v).toContain('title="自动勾选 profile 并显示分片耗时（请求选项可关）"');
    expect(v).not.toContain(':disabled="!opts.explain"');
    expect(v).not.toContain(':disabled="!opts.profile"');
  });
});
