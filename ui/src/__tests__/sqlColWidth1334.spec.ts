/**
 * 一千三百三十四批：SQL 结果表的列宽记不住（「三个工作台的表格能力没共享」的一个实例）。
 *
 * 真机（SQL 控制台，8 列宽表，真实鼠标拖列右缘）：
 *
 *   status 列拖到 106px → **重新执行一次，回到 66px**，localStorage 里一条列宽键都没有
 *
 * 对照：同一个 QueryResultTable 内核在 Lucene 页传了 `storage-key="lucene:<index>"`，
 * 列宽/密度/列选都记得住。SQL 页不传 → 整套记忆关闭。用户刚调好的列宽，
 * 换一次结果就白调，这跟「不要造轮子、复用组件能力」正好相反。
 *
 * 为什么当初不传：SQL 结果每跑一次列集就可能变（SELECT 换字段），若把列选一起记住，
 * 上一次的列集会被当成「用户选中的列」，**静默藏掉本次新出现的列**。
 * 所以修法不是简单加 storageKey，而是把两件事拆开：
 *   列宽/密度（跟列集无关）→ 记住；列选（跟列集强相关）→ 不记忆。
 *
 * 本 spec 锁这个拆分：
 *  ① SQL 传了 storage-key 且带 skip-cols-memory；
 *  ② useTablePrefs 在 skipColsMemory 时不写 es_cols（否则新列会被旧记忆藏掉）；
 *  ③ 列宽落盘键 es_tbl_w:<dim> 不受影响（这才是用户要的那个）；
 *  ④ 不传 skipColsMemory 的表（Lucene/索引工作区等）行为零变化——默认仍记忆列选。
 * 负控：把 `if (opts?.skipColsMemory) return;` 删掉 → 第 2 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const prefs = readFileSync(join(__dirname, '../composables/useTablePrefs.ts'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('1334 SQL 结果表要记住列宽（但不记忆列选）', () => {
  it('SQL 页传了 storage-key + skip-cols-memory', () => {
    expect(sql, '必须按索引记忆').toContain(`:storage-key="effectiveSqlIndex ? 'sql:' + effectiveSqlIndex : undefined"`);
    expect(sql, '必须声明跳过列选记忆').toContain('skip-cols-memory');
    /* 两者必须在同一个 QueryResultTable 标签里，不能一个绑在别处 */
    const tag = sql.match(/<QueryResultTable[\s\S]*?\n\s{8}>/);
    expect(tag, '必须能定位结果表开标签').toBeTruthy();
    expect(tag![0]).toContain(':storage-key=');
    expect(tag![0]).toContain('skip-cols-memory');
  });

  it('skipColsMemory 时不得写 es_cols（否则新查询的列被旧列集藏掉）', () => {
    const i = prefs.indexOf('function persistCols');
    expect(i, 'persistCols 必须存在').toBeGreaterThan(-1);
    const body = prefs.slice(i, prefs.indexOf('}', i));
    expect(body, '必须先短路 skipColsMemory').toMatch(/if\s*\(\s*opts\?\.skipColsMemory\s*\)\s*return;/);
    /* 同时恢复侧也不能读旧列集 */
    const ri = prefs.indexOf('function restoreCols');
    const rbody = prefs.slice(ri, prefs.indexOf('}', ri));
    expect(rbody, '恢复侧也必须跳过').toContain('skipColsMemory');
  });

  it('列宽落盘不受影响（es_tbl_w 仍按维度写）', () => {
    expect(prefs, '列宽键必须仍是 es_tbl_w:<dim>').toContain(`'es_tbl_w:' + dimension.value`);
    const i = prefs.indexOf('watch(colWidths');
    const seg = prefs.slice(i, prefs.indexOf('});', i));
    expect(seg, '列宽写入不得被 skipColsMemory 短路').not.toContain('skipColsMemory');
  });

  it('其它宿主零变化（QRT 缺省仍记忆列选）', () => {
    expect(qrt, 'QRT 必须透传该开关').toContain('skipColsMemory: !!props.skipColsMemory');
    /* 缺省 false：没传的表行为不变 */
    expect(qrt).toMatch(/skipColsMemory\?:\s*boolean/);
  });
});
