/**
 * R130 第九十六批：BulkEditor 执行结果「去查询验证」下钻（联动轴）——
 * 24 批 Adhoc/Xmigrate 同款先例，BulkEditor 漏网：批量写完就地验证是天然下一步，
 * 结果区却无任何去處。跳 /search?mode=dsl&idx=<index>（DSL 通道验证写入）。
 * 锁定（静态）：按钮接线 + idx 上下文携带 + router/Search import 在场。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/BulkEditorView.vue'), 'utf-8');

describe('BulkEditor 结果下钻（九十六批）', () => {
  it('结果区有「去查询验证」按钮，跳 DSL 通道并携带 idx', () => {
    expect(src).toMatch(/去查询验证 →/);
    expect(src).toMatch(/path: '\/search', query: \{ mode: 'dsl', idx: index \}/);
  });

  it('router/Search 接线在场（防 import 漏）', () => {
    expect(src).toContain("import { useRouter } from 'vue-router'");
    expect(src).toContain('const router = useRouter()');
    expect(src).toMatch(/import \{[^}]*\bSearch\b[^}]*\} from 'lucide-vue-next'/);
  });
});
