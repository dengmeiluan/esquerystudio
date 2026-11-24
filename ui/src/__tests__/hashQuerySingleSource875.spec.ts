/**
 * hash query 解析单源收编（readHashQuery 导出）。
 * 背景：composables/urlState.ts 的 readHashQuery 一直私有，QueryHubView（3 处）
 * 与 DslQueryView（2 处）各自复刻 location.hash.split('?')[1] || '' 表达式
 * 取 hash query。收编后表达式复刻退役为单源调用；hash base 段（split('?')[0]）
 * 两处不收编——fallback 是各视图自身路由语义（#/search）而非重复实现。
 * 锁定：
 * 1) 单源行为语义四钉：读当前 hash query / 无 query 段空参数 / 空值参数保留
 *    空串 / 多参数并存与百分号解码；
 * 2) 源码锁：QueryHubView 与 DslQueryView 复刻字面退役（防回潮）；
 * 3) 源码锁：单源导出形态在场。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readHashQuery } from '../composables/urlState';

const qhSrc = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
const dqSrc = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const usSrc = readFileSync(join(__dirname, '../composables/urlState.ts'), 'utf-8');

const prevHash = location.hash;
afterEach(() => { location.hash = prevHash; });

describe('readHashQuery 单源收编', () => {
  it('导出可用：读取当前 hash query', () => {
    location.hash = '#/search?mode=dsl&page=2';
    expect(readHashQuery().get('mode')).toBe('dsl');
    expect(readHashQuery().get('page')).toBe('2');
  });

  it('无 query 段：返回空参数，不抛不误吞路由段', () => {
    location.hash = '#/search';
    const usp = readHashQuery();
    expect(usp.get('mode')).toBeNull();
    expect(usp.get('idx')).toBeNull();
  });

  it('空值参数保留为空串（|| \'\' 口径不丢键）', () => {
    location.hash = '#/search?idx=';
    expect(readHashQuery().get('idx')).toBe('');
  });

  it('多参数并存：各键独立解析且百分号解码（encodeDslParam 回读动线）', () => {
    location.hash = '#/search?mode=dsl&idx=a-idx&value=x%20y';
    const usp = readHashQuery();
    expect(usp.get('mode')).toBe('dsl');
    expect(usp.get('idx')).toBe('a-idx');
    expect(usp.get('value')).toBe('x y');
  });

  it('源码锁：两个视图的复刻字面退役（防回潮）', () => {
    expect(qhSrc).not.toContain("location.hash.split('?')[1]");
    expect(dqSrc).not.toContain("location.hash.split('?')[1]");
  });

  it('源码锁：单源导出在场', () => {
    expect(usSrc).toContain('export function readHashQuery');
  });
});
