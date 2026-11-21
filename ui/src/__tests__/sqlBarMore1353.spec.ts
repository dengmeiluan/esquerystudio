/**
 * 一千三百五十三批：SQL 结果表工具行的宿主侧两项收进「更多」菜单。
 *
 * 用户反复抱怨「表格操作的那个表头元素太多平铺」。真机量（SQL 控制台跑一次查询后）：
 *   修复前 `.qrt-bar` 里宿主注入 2 个图标钮（原始 IO / 结果表高度档），
 *           加上内核 8 项 → 1440 宽下按钮已跨 2 行，1280 下跨 3 行。
 *   修复后宿主两项合并成 1 个「结果表更多 ⋯」菜单 → 按钮 10→9，
 *           1440 下工具行 3 行 → 2 行（补样式后实测）。
 *
 * **踩坑（本批最重要的一条）**：`.qrt-menu / .qrt-mi / .qrt-m-t` 的样式写在
 * QueryResultTable 的 `<style scoped>` 里——scoped 不外溢，宿主的 SqlConsoleView
 * 只写类名是拿不到样式的：菜单会掉进文档流，把工具栏从 1 行挤成 3 行（实测行数反而变多）。
 * 所以宿主必须自带一份同形样式，spec 专门锁这条。
 *
 * 本 spec 锁：
 *  ① 宿主不再单独注入两个图标钮，改成一个 aria-haspopup 的「更多」；
 *  ② 菜单含三档高度（300/500/800）与「查看原始 IO」，当前档带 aria-checked；
 *  ③ 选档真的写到结果表（:max-height 跟着变）并关菜单；
 *  ④ **宿主 scoped 样式必须自带 .sq-bar-more 定位**（类名同名不算数——
 *     这正是内核 scoped 不外溢的坑；缺了它菜单进文档流，工具栏行数反而增加）；
 *  ⑤ 点外部关闭菜单（capture mousedown，且只作用于本菜单容器）；
 *  ⑥ 负控：删掉 ④ 那段样式 → 判据必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

describe('1353 SQL 结果表工具栏宿主项收口', () => {
  it('① 宿主 bar-extra 只注入一个「结果表更多」菜单钮（不再平铺两个图标）', () => {
    const i = SRC.indexOf('<template #bar-extra>');
    expect(i, '必须有 bar-extra 插槽').toBeGreaterThan(-1);
    const end = SRC.indexOf('</template>', i);
    const block = SRC.slice(i, end);
    expect(block, '必须有更多菜单钮').toContain('data-test="sq-bar-more"');
    expect(block, '必须声明是菜单触发器').toContain('aria-haspopup="menu"');
    expect(block, '旧的独立高度档钮必须退役').not.toContain('data-sq-result-h');
    /* 宿主侧按钮只应是这一颗图标钮（cursor 组是文字钮，单独计） */
    expect((block.match(/sq-icon-btn/g) || []).length, '宿主图标钮只留 1 颗').toBe(1);
  });

  it('② 菜单含三档高度 + 原始 IO，当前档 aria-checked', () => {
    expect(SRC).toContain('v-for="h in RESULT_H_TIERS"');
    expect(SRC).toMatch(/:aria-checked="resultH === h"/);
    expect(SRC).toContain('查看原始 IO');
    /* 1354：默认档改「填满」后档位表变成 ['fill', 500, 800]——本条意图是
       「档位来自单一字面数组、不散落各写一套」，随新口径迁移。 */
    expect(SRC, '档位必须仍来自单一字面数组').toMatch(/RESULT_H_TIERS = \['fill', 500, 800\] as const/);
  });

  it('③ 选档写回 resultH 且关菜单（高度绑定消费同一状态）', () => {
    /* 1354：填满档下高度由 resultMaxHeight / resultMinHeight 计算，
       本条意图是「用户选的档必须真的作用到表格上」——两个绑定都要在。 */
    expect(SRC).toContain(':max-height="resultMaxHeight"');
    expect(SRC).toContain(':min-height="resultMinHeight"');
    expect(SRC, 'setResultH 必须关菜单').toMatch(/function setResultH\(h: \(typeof RESULT_H_TIERS\)\[number\]\) \{\s*resultH\.value = h;\s*barMoreOpen\.value = false;/);
  });

  it('④ 宿主 scoped 必须自带菜单定位样式（内核 scoped 不外溢的坑）', () => {
    const styleAt = SRC.indexOf('<style scoped>');
    expect(styleAt).toBeGreaterThan(-1);
    const css = SRC.slice(styleAt);
    const rule = css.slice(css.indexOf('.sq-bar-more {'));
    expect(rule, '必须有 .sq-bar-more 规则').not.toBe('');
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body, '菜单必须绝对定位（否则掉进文档流把工具栏挤成多行）').toContain('position: absolute');
    expect(body, '必须有 z-index（否则被表格盖住）').toContain('z-index');
    /* 子项也要有样式，否则是裸 button 栈 */
    expect(css).toContain('.sq-bar-more .qrt-mi {');
    expect(css).toContain('.sq-bar-more .qrt-m-t {');
    expect(css).toContain('.sq-bar-more .qrt-m-sep {');
  });

  it('⑤ 点外部关闭：capture mousedown，且命中容器内不关', () => {
    expect(SRC).toContain('function onDocDownForBarMore');
    expect(SRC).toMatch(/if \(t\?\.closest\('\.sq-bar-more-wrap'\)\) return;/);
    expect(SRC, '只在展开时挂、卸载时摘').toMatch(/watch\(barMoreOpen, on => \{/);
    expect(SRC).toMatch(/document\.removeEventListener\('mousedown', onDocDownForBarMore, true\)/);
  });

  it('⑥ 负控：拿走 .sq-bar-more 的定位规则 → ④ 的定位判据必须红', () => {
    const stripped = SRC.replace(/\.sq-bar-more \{ position: absolute;/, '.sq-bar-more { /*x*/');
    expect(stripped, '负控必须真的改掉样式').not.toBe(SRC);
    const css = stripped.slice(stripped.indexOf('<style scoped>'));
    const rule = css.slice(css.indexOf('.sq-bar-more {'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body, '去掉定位后必须判不合格').not.toContain('position: absolute');
  });
});
