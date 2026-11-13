/**
 * 六百四十二批：安全中心「收官刀」——G28（审计 >200 条可加载更多）+ G30（页面授权 chip 共用 .chip）。
 *
 * G28（P2）：审计拉取钳 200 条（AUDIT_PAGE），loadMore()/auditHasMore/.audit-more 全是孤儿
 *   死代码（无「加载更多」钮），>200 条永不可达。收口：复活 auditHasMore 门控的「加载更多」钮。
 * G30（P2）：页面授权区自绘 .pg-chip 芯片未共用全局 .chip——收口 chip.static（非交互）+ 局部
 *   .pg-w 可写修饰（品牌色），.pg-chip 自绘基座退役。
 * 负锁剥注释（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const SEC = codeOf('views/SecurityView.vue');

describe('六百四十二批① G28：审计 >200 条可加载更多（复活 loadMore 死代码）', () => {
  it('auditHasMore 门控的「加载更多」钮在场（loadMore 接线 + audit-more 落位）', () => {
    expect(SEC, '加载更多按钮接线').toContain('@click="loadMore"');
    expect(SEC, 'auditHasMore 门控').toContain('v-if="auditHasMore"');
    expect(SEC, '按钮文案').toContain('加载更多');
    expect(SEC, 'audit-more 落位（原孤儿 CSS 复活）').toContain('class="audit-more"');
  });
});

describe('六百四十二批② G30：页面授权 chip 共用 .chip（自绘 .pg-chip 退役）', () => {
  it('chip 共用（非交互 .static）+ 可写 .pg-w 修饰保留', () => {
    expect(SEC, 'chip 共用 + 非交互').toContain('class="chip static"');
    expect(SEC, '.pg-chip 自绘基座退役').not.toMatch(/\.pg-chip \{/);
    expect(SEC, '可写修饰 .pg-w 保留').toContain('.pg-w { color: var(--brand);');
    expect(SEC, '可写描边走品牌色').toContain("border-color: color-mix(in srgb, var(--brand) 45%, transparent)");
  });
});
