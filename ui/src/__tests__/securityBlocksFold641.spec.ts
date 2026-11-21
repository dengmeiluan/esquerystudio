/**
 * 六百四十一批：安全中心「质感第三刀」——G26（五区块卡级折叠）+ G29（模式中文备注）。
 *
 * G26（P1）：五区块（我的账号/页面授权/用户管理/控制集群/操作审计）无卡级折叠，长页只能
 *   硬滚。收口：每块 `.card-t` 头行首加折叠 chevron（sec-fold，ChevronDown 折叠态 -90°），
 *   区块体 `v-show="!collapsed.<key>"` 折叠，状态 `usePref('security.blocks')` 落盘。
 * G29（P2）：控制集群模式中文说明只覆盖 BOOTSTRAP，SPRING/NONE 裸英文——补 MODE_TIP。
 * 负锁剥注释（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const SEC = codeOf('views/SecurityView.vue');

describe('六百四十一批① G26：五区块卡级折叠', () => {
  it('折叠状态 usePref 落盘（security.blocks，五区块 key 齐）', () => {
    expect(SEC, '折叠状态落盘').toContain("usePref<Record<string, boolean>>('security.blocks', {})");
  });

  it('五区块各一枚 sec-fold 折叠 chevron', () => {
    const folds = SEC.match(/class="sec-fold"/g) ?? [];
    expect(folds.length, '五区块折叠钮').toBe(5);
  });

  it('五区块体 v-show 折叠绑定（me/grant/users/ctl/audit）', () => {
    for (const k of ['me', 'grant', 'users', 'ctl', 'audit']) {
      expect(SEC, k + ' 区块折叠绑定').toContain(`v-show="!collapsed.${k}"`);
    }
  });

  it('折叠态 chevron 旋转（CSS transition 不触发布局）', () => {
    expect(SEC, '折叠态旋转').toMatch(/\.sec-fold\.folded[^}]*transform: rotate\(-90deg\)/);
  });
});

describe('六百四十一批② G29：控制集群模式中文备注补齐', () => {
  it('SPRING / NONE 模式中文说明在场（不再裸英文）', () => {
    expect(SEC, 'SPRING 说明').toContain("SPRING: 'Spring 模式");
    expect(SEC, 'NONE 说明').toContain("NONE: '未绑定");
    expect(SEC, 'BOOTSTRAP 保留').toContain("BOOTSTRAP: '引导模式");
  });
});
