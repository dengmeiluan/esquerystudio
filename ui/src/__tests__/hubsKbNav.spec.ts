/**
 * 二百一十九批：双中心键盘导航闭环。
 * ① 索引中心（IndexHub）索引列表 ↑↓/Home/End 浏览 + Enter 选中——useRowNav 共享内核合并
 *    （RT 48/QRT 55 同语义），搜索框 ↓ 直落列表，滚动跟随本视图接线，失焦清高亮。
 * ② 查询中心（QueryHub）模式条 ←→/Home/End roving 焦点（176 批 chips 同构，Enter/Space 切换）。
 * ③ HotkeyPanel 登记（173「有功能没人知道」防重演口径）。源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const qh = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
const hk = readFileSync(join(__dirname, '../components/HotkeyPanel.vue'), 'utf-8');

describe('索引中心：索引列表键盘导航（二百一十九批）', () => {
  it('useRowNav 内核接线：行数=filtered，Enter=select 选中', () => {
    expect(ih).toContain("import { useRowNav } from '../composables/useRowNav';");
    expect(ih).toMatch(/useRowNav\(\s*computed\(\(\) => filtered\.value\.length\)/);
    expect(ih).toContain('{ onEnter: (i) => { const it = filtered.value[i]; if (it) select(it.index); } }');
  });
  it('列表容器可聚焦+键控/焦点态接线；行高亮类；滚动跟随', () => {
    expect(ih).toMatch(/class="ih-list scroll-y" ref="listEl" tabindex="0"\s*@keydown="onRowNavKey" @focus="ihKb = true" @blur="ihKb = false"/);
    expect(ih).toContain("'ih-kb-focus': ihKb && i === ihFocus");
    expect(ih).toMatch(/watch\(ihFocus, \(i\) => \{/);
    expect(ih).toContain("listEl.value?.querySelectorAll('.ih-row')[i]?.scrollIntoView({ block: 'nearest' })");
  });
  it('搜索框 ↓ 直落列表（combobox 习惯）+ 获焦提示 + 样式锁', () => {
    expect(ih).toContain('@keydown.down.prevent="focusList"');
    expect(ih).toContain('listEl.value?.focus();');
    expect(ih).toContain('v-if="ihKb" class="ih-kbd-hint"');
    expect(ih).toContain('.ih-row.ih-kb-focus { background: var(--ac-soft); box-shadow: inset 3px 0 0 var(--ac-hi); }');
    expect(ih).toContain('.ih-list:focus-visible { outline: 2px solid var(--ac);');
  });
});

describe('查询中心：模式条 roving 焦点（二百一十九批）', () => {
  it('模式条 ←→/Home/End 移动焦点（176 chips 同构，不切换只移焦）', () => {
    /* 七百三十九批锁同步更新：模式组容器补 group 语义（G142 aria 随批刀） */
    expect(qh).toContain('<div class="qh-modes" role="group" aria-label="查询模式" @keydown="onModesKeydown">');
    expect(qh).toContain("if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;");
    expect(qh).toContain("querySelectorAll('.qh-mode')");
    expect(qh).toContain('btns[next]?.focus();');
  });
});

describe('HotkeyPanel 登记（二百一十九批）', () => {
  it('双中心键盘导航进速查面板', () => {
    expect(hk).toContain('索引 / 查询双中心（先点击或 Tab 聚焦）');
    expect(hk).toContain('索引工作区·索引列表：浏览高亮，Enter 选中；搜索框内 ↓ 直入列表');
    expect(hk).toContain('查询工作台·模式条：六通道间移动焦点（Enter/Space 切换）');
  });
});
