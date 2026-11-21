/**
 * 四百一十八批：Esc 收起路径全站守卫——「打开的东西键盘必须能关」收口：
 * 自绘浮层五件套逐一锚定 Esc 处理在场：
 *  ConfirmModal（446 前）/CmdPalette（R26）/HotkeyPanel/FocusableSurface（401 双态）/
 *  CellContextMenu（417 capture）。NModal/NPopover 系由 naive-ui 内建 Esc 兜底不在列。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const C = (n: string) => readFileSync(join(__dirname, '../components', n), 'utf-8');
const V = (n: string) => readFileSync(join(__dirname, '../views', n), 'utf-8');

describe('Esc 收起路径守卫（418 批）', () => {
  it('ConfirmModal：Esc 取消（五百六十九批起由 ModalShell 壳层捕获级单源承接，@close=cancel 同函数等价）', () => {
    const ms = C('ModalShell.vue');
    expect(ms, '壳层 document 捕获级收键在场（566/568 约定范式）').toContain("document.addEventListener('keydown', onDocEsc, true)");
    expect(ms).toMatch(/e\.key !== 'Escape'\) return;/);
    expect(ms).toMatch(/stopPropagation\(\);\s*emit\('close'\);/);
    const s = C('ConfirmModal.vue');
    expect(s, '消费方 @close 仍指向 cancel（取消语义承接点）').toContain('@close="cancel"');
  });

  it('CmdPalette：Esc 关闭', () => {
    const s = C('CmdPalette.vue');
    expect(s).toContain('@keydown.esc="close"');
  });

  it('FocusableSurface：Esc 退出聚焦（401 双态钮外的键盘路径）', () => {
    const s = C('FocusableSurface.vue');
    expect(s).toMatch(/if \(e\.key === 'Escape'\) \{/); /* 445 批：INPUT/TEXTAREA 豁免后关聚焦面 */
    expect(s).toContain("t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'");
    expect(s).toMatch(/emit\('update:enabled', false\);/);
  });

  it('CellContextMenu：Esc 关闭（417 capture 监听+卸载移除）', () => {
    const s = C('CellContextMenu.vue');
    /* 1142：Esc 两段——capture 监听仍停播，处理改走 onEsc（先关二级再关整菜单）；
       1439e：关二级同时把焦点归还父项（二级键盘闭环） */
    expect(s).toMatch(/function onKey\(e: KeyboardEvent\) \{\s*if \(e\.key === 'Escape'\) \{ e\.stopPropagation\(\); onEsc\(\); \}\s*\}/);
    expect(s).toMatch(/function onEsc\(\) \{\s*if \(sub\.value\) \{ closeSubAndFocusParent\(\); return; \}\s*emit\('close'\);\s*\}/);
    expect(s).toMatch(/function closeSubAndFocusParent\(\)/);
    expect(s).toMatch(/document\.addEventListener\('keydown', onKey, true\);/);
    expect(s).toMatch(/onBeforeUnmount\(\(\) => document\.removeEventListener\('keydown', onKey, true\)\);/);
  });

  it('DevTools/RT/QRT 宿主消费 CellContextMenu（守卫覆盖面确认）', () => {
    /* 1143 起 DevTools 标签右键也复用 CellContextMenu（标签批量关闭），原「DevTools 不得出现」
       的前提高度已失效。Esc 收起由组件自身 capture 监听承接（上方用例），这里只锁接线：
       宿主必须给 :items + @close 复位，否则菜单开着无处关闭。 */
    const dt = V('DevToolsView.vue');
    if (dt.includes('CellContextMenu')) {
      expect(dt).toContain('@close="tabMenu = null"');
      expect(dt).toContain(':items="tabMenuItems"');
    }
    expect(readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8')).toContain('<CellContextMenu');
    expect(readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8')).toContain('<CellContextMenu');
  });
});
