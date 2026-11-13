/**
 * 五百六十三批·用户评审选定方案 A:「待提交变更」弹层精修=变更明细卡+主次动作。
 * (设计稿 design-pending-changes-563.html 方案 A,RT 内核一处落地全站可编辑表格生效——
 *  查询工作台/索引工作区同核覆盖。)
 *
 * 形态(设计稿 A 帧):
 *  - 头部:✎ 待提交更改 + 计数徽标 + 右侧首条变更 docId(mono);
 *  - 明细列表:逐条「字段 旧值(s 删除线)→ 新值 + 单条撤销」(最多 3 条),
 *    超出折叠「… 共 N 处」;revertOne 单条撤销(不再全有全无);
 *  - 底部动作行:预览 | NDJSON icon | spacer | 全部撤销 | 提交全部(pri 实底)。
 *  - 旧竖排 pend-pop-act 全宽文字列表退役;pend-chip 触发钮与迷你提交钮保留。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const rt = readFileSync(join(SRC, 'components/ResultTable.vue'), 'utf-8');

describe('563 方案 A:待提交变更弹层精修(变更明细卡+主次动作)', () => {
  it('头部:计数徽标 + 首条变更 docId(mono)', () => {
    expect(rt).toMatch(/<b class="pend-pop-n mono">\{\{ pendingCount \}\}<\/b>/);
    expect(rt).toMatch(/<span class="pend-pop-id mono" :title="pendItems\[0\]\?\.id \|\| ''">\{\{ pendItems\[0\]\?\.id \|\| '' \}\}<\/span>/);
  });
  it('明细列表:逐条「字段 旧值→新值 + 单条撤销」(pendItems 最多 3 条+折叠计数)', () => {
    expect(rt).toMatch(/class="pend-pop-item"/);
    expect(rt).toMatch(/<s>\{\{ jstr\(it\.oldVal\) \}\}<\/s>/);
    expect(rt).toMatch(/title="撤销此格更改" @click="revertOne\(it\.id, it\.field\)"/);
    expect(rt).toMatch(/const pendItems = computed/);
    expect(rt).toMatch(/pend-pop-more/);
  });
  it('底部动作行:预览/NDJSON/全部撤销/提交全部(pri)', () => {
    expect(rt).toMatch(/class="pend-pop-foot"/);
    expect(rt).toMatch(/@click="previewOpen = true; pendOpen = false"><Search :size="12" \/> 预览</);
    expect(rt).toMatch(/@click="revertAll\(\)"><RotateCcw :size="12" \/> 全部撤销</);
    expect(rt).toMatch(/@click="pendOpen = false; commitPending\(\)"><Send :size="11" \/> 提交全部</);
  });
  it('旧竖排全宽文字动作列表退役(pend-pop-act 列表形态)', () => {
    expect(rt).not.toMatch(/class="pend-pop-act( pri| danger)?"/);
  });
});
