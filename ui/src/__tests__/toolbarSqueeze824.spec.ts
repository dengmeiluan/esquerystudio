/**
 * 八百二十四批（用户实报 20261009 14:36 三图）：查询工作台工具行「双搜索框并排+单行挤压撑高」三刀。
 *
 * 实报面（查询工作台 Profile 模式，条件树在侧结果栏变窄时）：
 * ① 图1 JSON 档：RT 内建快滤框「搜索结果…」（TableQSearch）与 DQ 自带「搜结果 JSON…」
 *   （dq-json-find）双搜索框并排——快滤管线只作用于表格行（quickFilterRows 跨可见列
 *   contains），非表格档=死 UI 占位（cards 档与 dq-cards-kw 过滤卡片框同病双框）；
 * ② 图3 特写：分页器 .pgn-pos「/ 500」无 nowrap，工具行挤压时 span 内部折行
 *   （"/"一行"500"一行）=分页器两行高→整条工具行撑高；
 * ③ 图2 表格档：左簇计数条（rt-info/qrt-coln，554 约定的 ellipsis 收缩缓冲）被吸干到
 *   「2…」近零宽=信息丢失——554 收缩序里快滤框恒 160px 固宽不让位，缓冲独木难支。
 *
 * 三刀（1 接线+2 声明，纯前端零 Java）：
 * · 件1 双框合一：DQ resultTbl :searchable="view === 'table'"——快滤框表格档唯一在场
 *   （json 档 dq-json-find / cards 档 dq-cards-kw 各自伴生；tree 档无伴生搜索=备案候选）；
 *   表格档行为零变，切档往返 kw 状态保留（铁律 B 状态不重置）；锁同步更新 rtSearchable614
 *   it2（614 原锁=接线存在性，接线仍真，档位收窄）。
 * · 件2 分页器防折：.pgn-pos white-space:nowrap——span min-content 抬到全串宽，
 *   flex min-width:auto 链使 .pgn 有效不可压折（撑高根除）；挤压改道既有设计缓冲
 *   （计数条 ellipsis 先行吸收）。
 * · 件3 快滤框弹性：.rt/.qrt-qsearch 根 span min-width:0（收缩使能）+ -inp min-width
 *   90px 地板（placeholder「搜索结果…」可读下限）——挤压时快滤框先让位至多 70px，
 *   计数条少吸干。
 *
 * 静态锁口径（612/614 rtTag 提取法同款；CSS 锁=源码正则，happy-dom 无布局通道）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const pgn = readFileSync(join(__dirname, '../components/Pagination.vue'), 'utf-8');
const qs = readFileSync(join(__dirname, '../components/TableQSearch.vue'), 'utf-8');

/* rtTag 提取法（rtSearchable612/614 同款）：从 <ResultTable ref="X" 切到 </ResultTable> */
function rtTag(src: string, ref: string): string {
  const start = src.indexOf('<ResultTable ref="' + ref + '"');
  expect(start, 'RT 消费标签存在（防空跑）').toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('</ResultTable>', start));
}

describe('八百二十四批：工具行双框合一+挤压撑高三刀', () => {
  it('件1 DQ resultTbl 档位接线 :searchable="view === \'table\'"（双框合一；恒真形态退役防回潮）', () => {
    expect(rtTag(dq, 'resultTbl')).toContain(":searchable=\"view === 'table'\"");
    expect(rtTag(dq, 'resultTbl'), '恒真接线=双框根因，不得回潮').not.toContain(':searchable="true"');
  });

  it('件2 .pgn-pos 防内部折行（white-space:nowrap 在场=撑高根除）', () => {
    expect(pgn).toMatch(/\.pgn-pos\s*\{[^}]*white-space:\s*nowrap/);
  });

  it('件3 快滤框弹性收缩（根 span min-width:0 使能 + -inp px 地板）', () => {
    expect(qs).toMatch(/\.qrt-qsearch,\s*\.rt-qsearch\s*\{[^}]*min-width:\s*0/);
    expect(qs).toMatch(/-inp[^}]*min-width:\s*\d+px/);
  });

  it('负锚：件2/件3 不动既有结构锁（pgn-jump 跳页输入与 qsearch placeholder 逐字保留）', () => {
    expect(pgn).toContain('class="pgn-jump"');
    expect(qs).toContain('placeholder="搜索结果…"');
  });
});
