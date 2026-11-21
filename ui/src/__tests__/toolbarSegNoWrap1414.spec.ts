/**
 * 一千四百一十四批：工具行「视图分段」在窄容器里被压成两行（表头占高翻倍）。
 *
 * 实测（1440×900，Lucene）：结果工具行高 67px、内部 4 个不同 y 值——
 * 「表格 / 文档 JSON」两档竖着摞起来了。根因是全局 `.seg { flex-wrap: wrap }`，
 * 762px 宽的结果槽里两档放不下就换行；其余宽度（1100/1280/1920）都是 41px 单行。
 *
 * 与 QRT 内建 `.qrt-view-seg { flex-wrap: nowrap }` 同口径收敛。
 * 判据是「工具行高度等于同行控件高」，不是某个类名存在——所以锁两条：
 *  ① 宿主对结果槽内的 .seg 显式 nowrap（且必须 :deep，seg 在子组件插槽里）；
 *  ② QRT 内建 seg 维持 nowrap（防止只修一边）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LUCENE = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('1414 工具行视图分段不折行', () => {
  it('① Lucene 结果槽内的 .seg 显式 nowrap（:deep，因为 seg 在 QRT 插槽里）', () => {
    expect(LUCENE).toMatch(/\.lc-result :deep\(\.seg\) \{ flex-wrap: nowrap; \}/);
    /* 负控：改成浅选择器（丢 :deep）→ 样式打不进子组件，本断言必须红 */
    expect(LUCENE.replace(/\.lc-result :deep\(\.seg\)/, '.lc-result .seg'))
      .not.toMatch(/\.lc-result :deep\(\.seg\) \{ flex-wrap: nowrap; \}/);
  });

  it('② QRT 内建视图分段同样 nowrap（单边修复不算修好）', () => {
    expect(QRT).toMatch(/\.qrt-view-seg \{ flex-wrap: nowrap; \}/);
  });

  it('③ 全局 .seg 仍是可换行（别的页面靠它换行，不得为了这一处改全局）', () => {
    const THEME = readFileSync(join(__dirname, '../theme.css'), 'utf-8');
    const block = THEME.match(/^\.seg \{[^}]*\}/m)?.[0] ?? '';
    expect(block, '全局规则必须仍在').toContain('flex-wrap: wrap');
  });
});
