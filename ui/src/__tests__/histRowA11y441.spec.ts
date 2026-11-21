/**
 * 四百四十一批：DevTools 本 Tab 历史条目键盘可达——历史行此前纯 @click（div），
 * 键盘用户无法从历史回填请求。role=button+tabindex+Enter 填入（372 批 RestView
 * 历史重放同款口径）；重跑/删除钮本为原生 button 不受影响。
 * 第十批（lane）：历史行改用 QueryHistoryPanel 统一件——441 的键盘可达契约由共享件承接，
 * 本 spec 改为看守 DevTools 的接线与共享件的 a11y 实现。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
const qhp = readFileSync(join(__dirname, '../components/QueryHistoryPanel.vue'), 'utf-8');

describe('历史条目键盘可达（441 批，第十批合并 QueryHistoryPanel）', () => {
  it('DevTools 历史行列表已改用 QueryHistoryPanel（键盘可达契约随共享件承接）', () => {
    expect(v).toMatch(/<QueryHistoryPanel :items="histRows"/);
  });

  it('QueryHistoryPanel 共享件保留 role=button+tabindex+Enter 回放（441 契约）', () => {
    expect(qhp).toMatch(/role="button" tabindex="0" @keydown\.enter\.prevent/);
  });
});
