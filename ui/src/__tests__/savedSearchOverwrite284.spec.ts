/**
 * 二百八十四批：保存的搜索同名覆盖确认——此前 unshift 产生重复同名条目（回放/删除歧义）。
 * 同名 → askConfirm 覆盖确认（info 级）；覆盖=原位更新 dsl/ts/idx/layout 不新增。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('保存的搜索覆盖确认（284 批）', () => {
  it('同名检测+覆盖确认+原位更新', () => {
    expect(dq).toMatch(/async function confirmSave\(\)/);
    expect(dq).toMatch(/const existing = renameTarget \?\? savedQueries\.value\.find\(sq => sq\.name === name\)/); /* 286 批 renameTarget 优先 */
    expect(dq).toMatch(/await askConfirm\(\{ title: '覆盖已存查询'/);
    expect(dq).toMatch(/existing\.dsl = dsl\.value; existing\.ts = Date\.now\(\); existing\.idx = store\.pickedIdx; existing\.layout = layout;/);
  });
});
