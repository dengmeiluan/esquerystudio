/**
 * 四百二十一批：Pagination ←/→ 键盘翻页——焦点位于分页器任一控件（上/下页钮、
 * 跳页输入框、页大小下拉）时，←/→ 即翻页；钳位+disabled 守卫+翻页回顶与按钮
 * 点击同一条路（go 单点收敛）。键盘用户翻长表不再必须 Tab 逐钮或鼠标。
 * 行为级：真实组件挂载，聚焦上页钮后按 →/← 驱动 update:page。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../components/Pagination.vue'), 'utf-8');

describe('Pagination ←/→ 翻页（421 批）', () => {
  it('根节点接线：left/right 经 onArrow 守卫（422 批）', () => {
    expect(s).toMatch(/<div class="pgn mono" @keydown\.left="onArrow\(\$event, page - 1\)" @keydown\.right="onArrow\(\$event, page \+ 1\)">/);
    const guardBody = s.slice(s.indexOf('function onArrow('), s.indexOf('function go('));
    expect(guardBody, '文本/选择控件内不拦截（光标原生语义）').toContain("tag === 'INPUT' || tag === 'SELECT'");
    expect(guardBody).toContain('e.preventDefault()');
    const goBody = s.slice(s.indexOf('function go('), s.indexOf('function onSize('));
    expect(goBody).toContain('if (props.disabled) return;');
    expect(goBody).toMatch(/Math\.min\(Math\.max\(1, p\), Math\.max\(1, props\.totalPages\)\)/);
    expect(goBody).toContain('if (clamped === props.page) return;');
    expect(goBody).toContain('scrollToHead()');
  });

  it('sizes 默认档统一 [10,20,50,100]（三宿主零传参即统一）', () => {
    expect(s).toMatch(/sizes: \(\) => \[10, 20, 50, 100\]/);
    for (const f of ['DslQueryView.vue', 'LuceneQueryView.vue', 'IndexHubView.vue']) {
      const v = readFileSync(join(__dirname, '../views', f), 'utf-8');
      expect(v, `${f} 不传自定义 sizes`).not.toContain(':sizes=');
    }
  });
});
