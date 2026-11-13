import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

/* 1104：1024 档查询构建器工具行裁切。
 * 真实浏览器实测：左组 nowrap+overflow:hidden 把「新文档/在构建器中打开/DSL→Lucene/
 * 索引工作区」裁出视口，按钮不可达。窄档改为左组换行；1440 单行锁定保持。 */
describe('1104 DSL 工具行窄档可换行', () => {
  it('1100 媒体查询内允许左组换行且不裁剪', () => {
    expect(dq).toContain('.dq-toolbar .lr-bar-l { flex-wrap: wrap; overflow: visible; row-gap: var(--sp-1h); }');
  });

  it('1440 单行锁定规则保持不动（原锚不变）', () => {
    expect(dq).toContain('.dq-toolbar .lr-bar-l, .dq-toolbar .lr-bar-r { flex-wrap: nowrap; white-space: nowrap; }');
    expect(dq).toContain('.dq-toolbar .lr-bar-l { flex: 1 1 auto; overflow: hidden; }');
  });
});
