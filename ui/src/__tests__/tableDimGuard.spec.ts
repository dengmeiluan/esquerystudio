/**
 * R130 第六十三批：表格偏好记忆维度口径守卫（铁律「记忆性一律按索引维度」资产化）。
 * 背景：ResultTable/QRT 的偏好维度 = storageKey || index（useTablePrefs 口径）。
 * 若消费方传静态字面量 storage-key（如已退役的 "ihub-docs"），所有索引共享一份
 * 列选/密度/列宽——切索引不重读，违背索引维度口径。
 * 锁定：已知消费方（显式清单，新增消费方时在此登记）不得出现静态 storage-key
 * 字面量；需要非索引维度时必须用动态绑定（:storage-key="表达式"），守卫放行。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../');

/* 显式消费方清单：views/ 下全部 ResultTable / QueryResultTable 使用视图 */
const CONSUMER_FILES = [
  'views/DslQueryView.vue',
  'views/IndexHubView.vue',
  'views/LuceneQueryView.vue',
  'views/PitScrollView.vue',
  'views/SqlConsoleView.vue',
];

function tags(file: string): string[] {
  const t = readFileSync(join(ROOT, file), 'utf-8');
  const tpl = t.split('<script')[0];
  return [...tpl.matchAll(/<(?:ResultTable|QueryResultTable)\b[\s\S]*?(?:\/>|<\/(?:ResultTable|QueryResultTable)>)/g)]
    .map(m => m[0]);
}

describe('表格偏好记忆维度口径（六十三批）', () => {
  it('全站表格消费方不得使用静态 storage-key 字面量（记忆必须落索引/动态维度）', () => {
    let found = 0;
    const offenders: string[] = [];
    for (const file of CONSUMER_FILES) {
      for (const tag of tags(file)) {
        found++;
        /* 静态字面量：storage-key="固定串"（无 : 绑定前缀）→ 违规 */
        if (/(?:^|\s)storage-key="[a-zA-Z0-9_:.-]+"/.test(tag)) offenders.push(`${file}: ${tag.slice(0, 120)}`);
      }
    }
    /* 自检：扫描器必须先找到消费方，防空跑假绿 */
    expect(found, '应扫到 ResultTable/QueryResultTable 消费标签').toBeGreaterThanOrEqual(5);
    expect(offenders, '静态 storage-key 字面量违背索引维度口径').toEqual([]);
  });

  it('IndexHubView 两表已收敛到 :index 维度（ihub-* 固定键退役）', () => {
    const t = readFileSync(join(ROOT, 'views/IndexHubView.vue'), 'utf-8');
    expect(t).not.toContain('storage-key="ihub-');
    expect(t.match(/<ResultTable[\s\S]*?:index="cur"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
