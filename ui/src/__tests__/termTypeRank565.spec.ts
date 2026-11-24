/* 五百六十五批件②：useTermsSuggest types 工厂参全站接线（类型感知排序落地）。
 *  背景：fieldSearch.rankTermsByType + useTermsSuggest 可选第二参 types 已 563 约定，
 *  但全站零接线（563 批头注称消费方全在黑名单已过时——LuceneInput/BoostTuner/sqlCompletion
 *  均非黑名单）。三处接线，types 是可选参：不传时行为逐字节不变（563 C 段锁面不回退）。
 *  锁面：
 *   A 源码锁：三消费方 useTermsSuggest 调用补第二参 types（字段类型源各随其字段段逻辑）；
 *   B 行为断言：rankTermsByType 真函数——date 字段值位 ISO 形态排前、epoch 殿后；
 *     不传 types 原序（缺省零行为，563 约定契约复锁）。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rankTermsByType } from '../utils/fieldSearch';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

describe('五百六十五批件② A：三消费方 types 接线（源码锁）', () => {
  it('LuceneInput：值位 terms 候选接 types（来源=useIndexFields 字段表）', () => {
    const li = read('components/LuceneInput.vue');
    expect(li).toMatch(/useTermsSuggest\(\(\) => props\.index, \(\) => fieldTypes\.value\)/);
    expect(li).toMatch(/const fieldTypes = computed<Record<string, string>>/);
  });

  it('BoostTunerView：搜索词值位候选接 types（来源=本页 useIndexFields 实例+ensure）', () => {
    const bt = read('views/BoostTunerView.vue');
    expect(bt).toMatch(/useTermsSuggest\(\(\) => index\.value, \(\) => fieldTypes\.value\)/);
    expect(bt).toContain('useIndexFields(() => index.value)');
  });

  it('sqlCompletion：值位候选源 valCtx 接 types（来源=getCtx().curFields 字段元数据）', () => {
    const sql = read('utils/sqlCompletion.ts');
    expect(sql).toMatch(/valCtx = useTermsSuggest\(\(\) => valIndex\.value, \(\) =>/);
  });
});

describe('五百六十五批件② B：类型感知排序行为（rankTermsByType 真函数锚）', () => {
  it('date 字段：ISO 形态值位排前、epoch 纯数字串殿后（接线后值位展示序语义）', () => {
    const out = rankTermsByType(['1700000000000', 'maintenance', '2024-01-15'], 'date');
    expect(out[0]).toBe('2024-01-15');
    expect(out[out.length - 1]).toBe('1700000000000');
  });

  it('不传 types（undefined 类型）：原序返回——缺省零行为，既有消费契约不回退', () => {
    const values = ['1700000000000', 'maintenance', '2024-01-15'];
    expect(rankTermsByType(values, undefined)).toEqual(values);
    expect(rankTermsByType(values, undefined)).toBe(values);
  });
});
