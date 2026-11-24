/**
 * R130 第六十二批：QueryResultTable 排序能力消费方对齐守卫（静态锁）。
 * 背景：sortable 组件能力二十八批随 SQL 通道落地，但 Lucene/PIT 消费方未开启——
 * hit 型结果（_score/_id/字段列）不可排序，与 SQL rows 型体验不一致。
 * 锁定：三个消费方（Lucene/PIT/SQL）的 <QueryResultTable> 均接线 sortable。
 * 自检：先断言模板能匹配到消费标签（防空跑假绿，confirmAudit 样板）。
 * 组件排序行为（列名键/数字列数值比/方向翻转）由 queryTablePrefs.spec 行为覆盖。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VIEWS = join(__dirname, '../views');

const CONSUMERS: Record<string, string> = {
  'SqlConsoleView.vue': 'SQL 通道（rows 型）',
  'LuceneQueryView.vue': 'Lucene 通道（hit 型）',
  'PitScrollView.vue': 'PIT 预览（hit 型）',
};

function tagSrc(file: string): string {
  const t = readFileSync(join(VIEWS, file), 'utf-8');
  const tpl = t.split('<script')[0];
  const m = tpl.match(/<QueryResultTable[\s\S]*?(?:\/>|<\/QueryResultTable>)/);
  return m ? m[0] : '';
}

describe('QRT 排序能力消费方对齐（六十二批）', () => {
  it('三个消费方的 <QueryResultTable> 均接线 sortable', () => {
    for (const [file, label] of Object.entries(CONSUMERS)) {
      const tag = tagSrc(file);
      expect(tag.length, `${file} 应存在 <QueryResultTable> 标签（自检防空跑）`).toBeGreaterThan(0);
      expect(tag, `${label} 应开启 sortable`).toMatch(/\bsortable\b/);
    }
  });
});

/* 一百二十二批：列头键盘可达——tabindex=0 + Enter/Space 触发（aria-sort 已由 81 批落地）。
   RT 与 QRT 两个可排序表都要锁（防止「点击可排序但键盘不可达」回潮）。 */
describe('列头键盘可达（一百二十二批）', () => {
  const rtSrc = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
  const qrtSrc = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

  it('RT 列头 tabindex + Enter/Space 触发排序（.stop 隔离双重排序/行导航串扰——键盘闭环批）', () => {
    expect(rtSrc).toMatch(/tabindex="0" @keydown\.enter\.prevent\.stop="sortBy\(c\)" @keydown\.space\.prevent\.stop="sortBy\(c\)"/);
  });

  it('QRT 列头 tabindex + Enter/Space 触发排序（仅 sortable 时）', () => {
    expect(qrtSrc).toMatch(/:tabindex="sortable \? 0 : undefined"/);
    /* .stop 防冒泡为合法增强（列头嵌套在可点行内），正则放宽兼容 */
    expect(qrtSrc).toMatch(/@keydown\.enter\.prevent(\.stop)?="onSort\(i\)"/);
    expect(qrtSrc).toMatch(/@keydown\.space\.prevent(\.stop)?="onSort\(i\)"/);
  });
});
