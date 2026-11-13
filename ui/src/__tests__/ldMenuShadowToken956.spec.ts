/* 九百五十六批：明细 ⋯ 浮层 box-shadow 收编 --shadow-pop token（弹层质感单源·LiveDashboard 侧）。
 *
 * 治理本体：LiveDashboardView 的 .ld-detail-more-menu（明细行 ⋯ 浮层）box-shadow 硬编码
 * `0 6px 18px rgba(0, 0, 0, .35)`，同视图 .ld-hist-more-pop（历史 ⋯ 浮层）自九百四十七批
 * 起 `box-shadow: var(--shadow-pop)`——同页两个 ⋯ 浮层两种阴影口径（浅/深主题切换时硬编码
 * 值不随 token 联动）。收编后同域同 token，视觉由 theme.css 单源（:root 深值+浅主题覆写）
 * 承接，与导出 ▾ 聚合菜单（--shadow-pop 立法域）同语言。
 *
 * 断言面：
 *   ① 明细浮层正锁：.ld-detail-more-menu 规则含 `box-shadow: var(--shadow-pop)`；
 *   ② 硬编码防回潮：同规则零 rgba 硬编码阴影字面；
 *   ③ 单源正锁：theme.css --shadow-pop 定义在场（防删源留消费）；
 *   ④ 同域正锁：.ld-hist-more-pop 的 var(--shadow-pop) 形态不回潮。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const view = readFileSync(join(__dirname, '..', 'views', 'LiveDashboardView.vue'), 'utf8');
const theme = readFileSync(join(__dirname, '..', 'theme.css'), 'utf8');

const ruleOf = (cls: string): string => {
  const at = view.indexOf(`.${cls} {`);
  expect(at, `.${cls} 规则缺失`).toBeGreaterThanOrEqual(0);
  return view.slice(at, view.indexOf('}', at) + 1);
};

describe('ldMenuShadowToken956 · 明细 ⋯ 浮层阴影收编 --shadow-pop（同域单源）', () => {
  it('明细浮层走 var(--shadow-pop)（① 正锁）', () => {
    expect(ruleOf('ld-detail-more-menu')).toContain('box-shadow: var(--shadow-pop)');
  });

  it('明细浮层零硬编码 rgba 阴影（② 防回潮）', () => {
    expect(ruleOf('ld-detail-more-menu')).not.toMatch(/box-shadow:\s*0\s+\d+px[^;]*rgba\(/);
  });

  it('theme.css 单源定义 --shadow-pop 在场（③ 防删源留消费）', () => {
    expect(theme).toMatch(/--shadow-pop:\s*0\s+\d+px/);
  });

  it('历史浮层 var(--shadow-pop) 形态不回潮（④ 同域正锁）', () => {
    expect(ruleOf('ld-hist-more-pop')).toContain('box-shadow: var(--shadow-pop)');
  });
});
