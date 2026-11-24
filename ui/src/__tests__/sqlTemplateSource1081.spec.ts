import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1081：SQL 模板跟随语句目标索引（FROM 优先）。
 * 1080 让字段角色/补全读 FROM，但模板仍把表名写成顶栏选中索引——会把 A 索引的字段
 * 拼进 B 索引的 FROM，生成注定报错的 SQL。模板的索引与字段必须同源。 */
describe('1081 SQL 模板绑定索引', () => {
  it('模板索引取 effectiveSqlIndex，不写死顶栏选中', () => {
    expect(view).toContain('const tplIdx = effectiveSqlIndex.value;');
    expect(view).toContain('const idx = tplIdx ? `"${tplIdx}"` : \'"my-index"\';');
    expect(view).not.toContain('const idx = store.pickedIdx ? `"${store.pickedIdx}"`');
  });

  it('绑定提示标明是否跟随 FROM（用户知道为何不是顶栏索引）', () => {
    expect(view).toContain('模板已绑定索引 ${tplIdx}${tplIdx === store.pickedIdx ? \'\' : \'（跟随 FROM）\'}');
  });

  it('缺字段提示同时给出两条出路（顶栏选择或改写 FROM）', () => {
    expect(view).toContain('当前语句目标索引没有该字段——换一个索引（顶栏选择或改写 FROM）');
  });
});
