/**
 * R130 第九十八批：ReindexAdvanced 结果区「去查询验证」下钻（写类视图验证去處收口
 * 最后一项——96 批 BulkEditor / 97 批 UpdateByQuery 同款；同步完成（total 在场）立即可查，
 * 异步场景按钮仍出但建议先到任务树确认完成）。守卫静态锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/ReindexAdvancedView.vue'), 'utf-8');

describe('ReindexAdvanced 结果下钻（九十八批）', () => {
  it('结果区有「去查询验证」（destIndex 门控 + 同步完成或无 taskId）', () => {
    expect(src).toMatch(/v-if="destIndex && \(typeof result\.total === 'number' \|\| !result\.taskId\)"/);
    expect(src).toContain('去查询验证');
    expect(src).toMatch(/path: '\/search', query: \{ mode: 'dsl', idx: destIndex \}/);
  });

  it('Search 图标接线在场（防 import 漏）', () => {
    expect(src).toMatch(/import \{[^}]*\bSearch\b[^}]*\} from 'lucide-vue-next'/);
  });
});
