/**
 * 四百八十五批：QRT 聚焦提示补「滚动到底自动加载」——446 自动续渲已实现但
 * 聚焦提示（title）未告知；用户不知道滚到底会自动加载。一行文案补全。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('聚焦提示补自动加载说明（485 批）', () => {
  it('kbd-hint title 含自动加载说明', () => {
    expect(v).toContain('Esc 退出；滚动到底自动加载后续行');
  });
});
