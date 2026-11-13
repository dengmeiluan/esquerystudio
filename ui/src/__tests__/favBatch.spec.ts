/**
 * R130 第一百批：收藏夹批量选择+批量删除（200 条上限下逐条删太累；对齐 RT
 * 勾选范式——勾选态按 id 集合、过滤/翻过滤不丢勾、全选=当前过滤结果）。
 * 删除走 askConfirm warn（单条删除是 warn 级本地数据的批量版）。
 * 锁定（静态）：状态机（toggleSel/toggleAll/delSelected）+ 模板接线 + 确认门控。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/FavoritesView.vue'), 'utf-8');

describe('收藏夹批量删除（一百批）', () => {
  it('状态机完整（toggleSel/toggleAll/delSelected/allChecked）', () => {
    expect(src).toMatch(/function toggleSel\(id: string\)/);
    expect(src).toMatch(/function toggleAll\(\)/);
    expect(src).toMatch(/async function delSelected\(\)/);
    expect(src).toMatch(/const allChecked = computed/);
  });

  it('模板接线：卡片勾选框/全选钮/浮动栏', () => {
    expect(src).toMatch(/:checked="selected\.has\(it\.id\)"[^>]*@change="toggleSel\(it\.id\)"/);
    expect(src).toMatch(/:checked="allChecked" @change="toggleAll"/);
    expect(src).toMatch(/已选 <b>\{\{ selCount \}\}<\/b> 条/);
    expect(src).toMatch(/@click="delSelected">删除选中</);
  });

  it('批量删除走 askConfirm warn 门控', () => {
    expect(src).toMatch(/title: '删除选中收藏'/);
    expect(src).toMatch(/level: 'warn'/);
  });
});
