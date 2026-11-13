/**
 * 二百八十六批：保存的搜索重命名——面板 rename 动作预填旧名打开保存弹窗，
 * confirmSave 走 284 覆盖链原位更新（name 改新名+布局重捕获），不再产生重复条目。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panel = readFileSync(join(__dirname, '../components/QueryHistoryPanel.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('保存的搜索重命名（286 批）', () => {
  it('面板 rename 动作+emit', () => {
    /* 五百五十二批同步更新（击穿者：track2Wave552 ③ QHP actions 加 'curl'）——联合类型字面
       随枚举扩容更新，锁意图=rename 动作+emit 契约在场不破 */
    expect(panel).toMatch(/'play' \| 'fill' \| 'copy' \| 'curl' \| 'del' \| 'rename' \| 'fav'/);
    expect(panel).toMatch(/actions\.includes\('rename'\)/);
    expect(panel).toMatch(/\$emit\('rename', it\)/);
    expect(panel).toMatch(/Pencil/);
  });
  it('DslQueryView：renameSavedRow 预填+renameTarget 原位更新', () => {
    /* 五百五十四批同步更新（击穿者：554 B1 刀③——保存面板 actions 加 'curl' 行级复制 curl，
       组装归宿主 histCurl；rename 在册语义零回退，'curl' 置 del 前与 DevTools 六动作形同构） */
    expect(dq).toMatch(/'play', 'copy', 'rename', 'curl', 'del'/);
    expect(dq).toMatch(/function renameSavedRow\(row: \{ name\?: string \}\)/);
    expect(dq).toMatch(/const existing = renameTarget \?\? savedQueries\.value\.find/);
    expect(dq).toMatch(/existing\.name = name;/);
    expect(dq).toMatch(/@rename="renameSavedRow"/);
  });
});
