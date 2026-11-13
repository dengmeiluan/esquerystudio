/**
 * 1195：监控屏「节点最新水位」表的行右键。
 *
 * 这是同一屏上最后一张没有右键的表：1158 覆盖 Top 索引 / 慢请求 / 告警历史，
 * 1194 补了曲线档的窗内统计表，而节点下钻模式下的这张节点水位表一直是纯展示。
 * 节点名恰好是下游一切排查的入口（贴进节点详情、发给同事、填进告警规则），
 * 拿不走就只能手工框选。
 *
 * 锁：① 节点行挂 contextmenu，kind='node'（与三张表同一套 CellContextMenu 通道）；
 *     ② 标题模板点名节点（`节点 · xxx`），不能复用「索引 · 」的文案；
 *     ③ 一级只留一步（复制节点名），水位与整行 JSON 收进「复制…」二级；
 *     ④ 只读：节点面不得出现任何写/重启动作；
 *     ⑤ 负控：把行上的 @contextmenu 摘掉 → ① 必须转红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');

function nodeTableBlock(): string {
  const start = src.indexOf('ld-hist-ntab');
  expect(start, '节点水位表必须还在（类名是锚）').toBeGreaterThan(0);
  const end = src.indexOf('</div>\n      </div>', start);
  expect(end, '节点水位表必须闭合').toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('1195 节点水位表行右键', () => {
  it('节点行挂 contextmenu，kind = node', () => {
    const blk = nodeTableBlock();
    expect(blk).toContain(`@contextmenu.prevent="openLdRowMenu($event, 'node', n)"`);
  });

  it('负控：行不得裸着（没有 contextmenu 即失败）', () => {
    const blk = nodeTableBlock();
    const row = /<div v-for="n in nodeRows"[^>]*>/.exec(blk)?.[0] || '';
    expect(row, '节点行标签必须能被定位').not.toBe('');
    expect(row).toContain('@contextmenu');
  });

  it('标题点名节点，不是复用「索引 · 」那套文案', () => {
    expect(src).toContain("kind === 'node' ? `节点 · ${row.nodeName || row.connId || '-'}`");
  });

  it('一级只留一步（复制节点名），水位/整行 JSON 收进二级', () => {
    const menu = src.slice(src.indexOf("if (m.kind === 'node')"), src.indexOf('function gotoBrowser'));
    expect(menu).toContain("key: 'copy-node', label: '复制节点名'");
    expect(menu).toContain("key: 'copy-levels', label: '复制水位（Heap / CPU / 磁盘）'");
    expect(menu).toContain('copyGroup');
  });

  it('只读纪律：节点菜单不含写/重启动作', () => {
    const menu = src.slice(src.indexOf("if (m.kind === 'node')"), src.indexOf('function gotoBrowser'));
    expect(menu.length, '节点菜单段应被截取到').toBeGreaterThan(120);
    for (const word of ['重启', '删除', 'restart', 'POST ', 'PUT ']) {
      expect(menu, `节点菜单不应含写动作：${word}`).not.toContain(word);
    }
  });

  /* 1195 自查抓到的真 bug：第一版把水位又乘了 100（后端 jvm.mem.heap_used_percent /
     os.cpu.percent 本就是 0–100 的百分数），复制出来是「4000.0%」而表格显示 0.4。
     锁住「复制值与表格同口径」：不得出现 *100 / /100 这类二次换算。 */
  it('水位与表格同口径——不得再做 ×100 换算', () => {
    const menu = src.slice(src.indexOf("if (m.kind === 'node')"), src.indexOf('function gotoBrowser'));
    expect(menu).not.toContain('* 100');
    expect(menu).not.toContain('toFixed(1) + \'%\'');
    expect(menu, '复制文本必须走表格同一个 fmtN').toContain('fmtN(row.heapUsedPct)');
  });
});
