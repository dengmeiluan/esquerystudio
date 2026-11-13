/**
 * R130 第八十二批：收藏回放 carry 键契约闭环（死键修复）。
 * 背景：favReplay 的 bulk/ubq 分支仍写草稿前的旧命名空间
 *   `esquerystudio.draft.bulk-editor.body` / `esquerystudio.draft.update-by-query.query`——
 *   两视图草稿键早已迁 draft2（按集群/索引隔离），旧键无任何消费方：
 *   回放提示「已恢复」但编辑器是空的（notify 撒谎 + R54 同族漏网）。
 * 修：favReplay 改写一次性 carry 键（esquerystudio.bulk.carry / esquerystudio.ubq.carry），
 *   视图挂载即消费并转入自身 draft2 草稿（dsl.carry / doc-diff.carry 同款范式）。
 * 锁定（静态，两视图含 Monaco 不可挂载）：
 * 1) favReplay 写新 carry 键、死键清零；
 * 2) 两视图消费 carry（读+转草稿+removeItem 一次性语义）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const replaySrc = readFileSync(join(SRC, 'utils/favReplay.ts'), 'utf-8');
const bulkSrc = readFileSync(join(SRC, 'views/BulkEditorView.vue'), 'utf-8');
const ubqSrc = readFileSync(join(SRC, 'views/UpdateByQueryView.vue'), 'utf-8');

describe('收藏回放 carry 键契约（八十二批）', () => {
  it('favReplay 写新 carry 键，旧死键清零（无任何 setItem 写旧命名空间）', () => {
    /* 852 批同步更新：写侧走 writeStoredRaw 单源（storageWriteGuard852 同域），键契约不变 */
    expect(replaySrc).toMatch(/writeStoredRaw\(sessionStorage, 'esquerystudio\.bulk\.carry', p\.body\)/);
    expect(replaySrc).toMatch(/writeStoredRaw\(sessionStorage, 'esquerystudio\.ubq\.carry', p\.body\)/);
    /* 注释可提及历史键名,但禁止任何对旧命名空间的写入 */
    expect(replaySrc).not.toMatch(/setItem\('esquerystudio\.draft\./);
  });

  it('BulkEditorView 消费 carry 并转入 body 草稿（一次性）', () => {
    expect(bulkSrc).toMatch(/sessionStorage\.getItem\('esquerystudio\.bulk\.carry'\)/);
    expect(bulkSrc).toMatch(/body\.value = bulkCarry/);
    expect(bulkSrc).toMatch(/removeStoredRaw\(sessionStorage, 'esquerystudio\.bulk\.carry'\)/);
  });

  it('UpdateByQueryView 消费 carry（取 .query 入草稿，一次性）', () => {
    expect(ubqSrc).toMatch(/sessionStorage\.getItem\('esquerystudio\.ubq\.carry'\)/);
    expect(ubqSrc).toMatch(/queryStr\.value = JSON\.stringify\(q, null, 2\)/);
    expect(ubqSrc).toMatch(/removeStoredRaw\(sessionStorage, 'esquerystudio\.ubq\.carry'\)/);
  });
});
