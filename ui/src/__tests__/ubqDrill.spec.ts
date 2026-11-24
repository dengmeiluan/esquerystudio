/**
 * R130 第九十七批：UpdateByQuery 结果「去查询验证」下钻（九十六批 BulkEditor 的对称补齐——
 * 写类视图执行完就地验证写入结果是标准动作；此前的「到任务树」只覆盖异步任务场景）。
 * 锁定（静态）：按钮接线（index 门控）+ DSL 通道 idx 携带。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/UpdateByQueryView.vue'), 'utf-8');

describe('UpdateByQuery 结果下钻（九十七批）', () => {
  it('结果区有「去查询验证」按钮（index 门控），跳 DSL 通道携带 idx', () => {
    expect(src).toMatch(/v-if="index"[^>]*@click="router\.push\(\{ path: '\/search', query: \{ mode: 'dsl', idx: index \} \}\)"/);
    expect(src).toContain('去查询验证');
  });
});
