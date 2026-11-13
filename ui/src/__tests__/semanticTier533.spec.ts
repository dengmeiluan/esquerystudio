/**
 * 五百三十三批「语义合并改用」契约看守（工蚁 B）。
 *
 * 五条主契约：
 *  A TasksView action 徽标改用 StatusPill：手写 `class="pill"` 徽标退役（色档/胶囊形态归
 *    组件单源；tone=actionColor、label=actionShort 既有单源不变）；
 *  B TaskTreeView action 词汇单源合并：本地 ttActionShort/ttActionColor（「TasksView 禁改期
 *    逐字复制」的漂移源）退役，换 import taskActionZh/taskActionTone；running 时长
 *    semFormat duration 人话化；树节点 mini 进度（detailed status 同源，无 total 不出，
 *    禁逐行打 task-detail 成本裁定在档）；
 *  C Lifecycle/Ilm phase 中文主显：甘特条/图例与策略卡色块 phaseZh 接线；
 *    Lifecycle roLint 划线接线（JsonArea ref + 防抖 setMarkers，info→hint 降级，banner 保留）；
 *  D Overview 预警横幅语义合并：队列等待 ms 人话化、'Pending Tasks N' 中文主体、
 *    自造 sev-'w' 档退役统一 'y'（对齐 pill 五主档档名）、SparkLine 死导入退役；
 *  E HealthReport 双列显示槽 + 视口弹性档：#cell-health（healthZh 本地映射中文 + 色点）/
 *    #cell-size（semFormat bytes）——数据恒 raw 仅显示层加工；.hr-diff-body/.hr-code
 *    max-height max(240px, 42vh)。状态 pill 词汇化明确不做（semanticTier531 字面锁，不碰）。
 *
 * 断言落在源文本上（semanticTier531 同理由：happy-dom 不参与 scoped <style> 计算，
 * 渲染后样式数值断言是死断言）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const readView = (name: string) => read(`views/${name}.vue`);

describe('A TasksView：action 徽标改用 StatusPill', () => {
  it('StatusPill 在場（tone=actionColor / label=actionShort），手写 class="pill" 徽标退役', () => {
    const s = readView('TasksView');
    expect(s).toContain("import StatusPill from '../components/StatusPill.vue';");
    expect(s).toContain('<StatusPill :tone="actionColor(t.action)" :label="actionShort(t.action)" />');
    expect(s, '手写 .pill 徽标退役（色档/胶囊形态归 StatusPill 组件单源）').not.toMatch(/class="pill/);
    /* 底层词汇单源不受改用影响（obsStack530 同锚） */
    expect(s).toContain("import { taskActionZh as actionShort, taskActionTone as actionColor } from '../utils/esEnumZh';");
  });
});

describe('B TaskTreeView：action 单源合并 + 时长人话化 + mini 进度', () => {
  it('esEnumZh import 在場，本地 ttActionShort/ttActionColor 漂移源退役', () => {
    const s = readView('TaskTreeView');
    expect(s).toContain("import { taskActionZh as actionShort, taskActionTone as actionColor } from '../utils/esEnumZh';");
    expect(s, '本地 ttActionShort 退役').not.toMatch(/function ttActionShort\(/);
    expect(s, '本地 ttActionColor 退役').not.toMatch(/function ttActionColor\(/);
    /* 行内文字色的 tone→token 映射保留本地（非 pill 形态） */
    expect(s).toContain("const TT_ACTION_TONE_CSS: Record<string, string> = { y: 'var(--warn)', b: 'var(--info)', r: 'var(--err)' };");
  });

  it('running 时长 semFormat duration 单源（异常回落原 toFixed 秒档）', () => {
    const s = readView('TaskTreeView');
    expect(s).toContain("import { semFormat } from '../composables/useSemFormat';");
    expect(s).toMatch(/semFormat\(active\.runningTimeNanos \/ 1e6, 'duration'\)\?\.text \?\? \(\(active\.runningTimeNanos \/ 1e9\)\.toFixed\(2\) \+ 's'\)/);
  });

  it('mini 进度：status 数据管道在場 + done=updated+created+deleted/total 口径 + 禁逐行打点备案', () => {
    const s = readView('TaskTreeView');
    expect(s).toContain('status: t.status');
    expect(s).toContain('function miniProg(n: TN)');
    expect(s).toMatch(/numCt\(s\.updated\) \+ numCt\(s\.created\) \+ numCt\(s\.deleted\)/);
    expect(s).toContain('if (total <= 0) return null'); /* 无 total 不出 */
    expect(s, '成本裁定在档：不逐行打 task-detail//progress').toContain('禁逐行打');
    /* 渲染锚：进度条 + 百分比文字（纯 CSS 小条，h() 形态） */
    expect(s).toContain("class: 'tr-prog-bar'");
    expect(s).toContain("class: 'tr-prog-txt mono'");
  });
});

describe('C Lifecycle/Ilm：phase 中文主显 + roLint 划线接线', () => {
  it('phaseZh 行为（esEnumZh 单源）：五枚举全中文、未知回落空串', async () => {
    const { phaseZh } = await import('../utils/esEnumZh');
    expect(phaseZh('hot')).toBe('热');
    expect(phaseZh('warm')).toBe('温');
    expect(phaseZh('cold')).toBe('冷');
    expect(phaseZh('frozen')).toBe('冻结');
    expect(phaseZh('delete')).toBe('删除');
    expect(phaseZh('unknown')).toBe('');
  });

  it('LifecycleView：phaseZh 在場，甘特条与图例中文主显（title 双语兜底），裸英文图例退役', () => {
    const s = readView('LifecycleView');
    /* 六百七十四批同步更新：561 批 move 弹窗 datalist 候选域扩员（ILM_PHASE_ZH/ILM_ACTION_ZH 并入同源导入），
       573 批预判「对方提交后 spec 须按新形态字面同步更新」——658 接管入库后恒红至今，销账；
       phaseZh 仍居首符号，中文主显语义锁不变 */
    expect(s).toContain("import { phaseZh, ILM_PHASE_ZH, ILM_ACTION_ZH } from '../utils/esEnumZh';");
    expect(s, '甘特条内中文主显').toContain('{{ phaseZh(ph.name) || ph.name }}');
    expect(s, 'title 双语兜底').toContain('`${phaseZh(ph.name) || ph.name}（${ph.name}） · min_age: ${ph.minAge}`');
    expect(s, '图例 phaseZh 主显').toContain(`{{ phaseZh('hot') || 'hot' }}`);
    expect(s, '裸英文图例退役').not.toMatch(/<i class="ph-hot"><\/i>hot</);
  });

  it('LifecycleView：roLint 划线接线（JsonArea ref + 防抖 setMarkers，info→hint 降级，banner 保留）', () => {
    const s = readView('LifecycleView');
    expect(s).toContain('ref="roJaRef"');
    expect(s).toMatch(/const roJaRef = ref<InstanceType<typeof JsonArea> \| null>\(null\);/);
    expect(s).toContain('roJaRef.value?.setMarkers?.(');
    expect(s, 'info 降级 hint（MonacoEditor marker 档只收 warning/hint/error）')
      .toContain("f.severity === 'info' ? 'hint'");
    expect(s, '行内提示条 banner 保留双轨').toContain('lc-lint');
  });

  it('IlmView：策略卡 phase 色块 phaseZh 主显 + 英文小字双语（ilm-ph-en 范式）', () => {
    const s = readView('IlmView');
    expect(s).toContain("import { phaseZh } from '../utils/esEnumZh';");
    expect(s).toMatch(/<span class="ilm-ph-name"><template v-if="phaseZh\(ph\.name\)">\{\{ phaseZh\(ph\.name\) \}\}<span class="ilm-ph-en">\{\{ ph\.name \}\}<\/span><\/template><template v-else>\{\{ ph\.name \}\}<\/template><\/span>/);
  });
});

describe('D OverviewView：预警横幅语义合并', () => {
  it('队列等待 ms 走 semFormat duration；Pending Tasks 中文主体 + 原词汇括注', () => {
    const s = readView('OverviewView');
    expect(s).toMatch(/semFormat\(ch\.task_max_waiting_in_queue_millis, 'duration'\)/);
    expect(s).toContain('待处理任务 ${ch.number_of_pending_tasks}（pending tasks）');
    expect(s, '裸 Pending Tasks 文案退役').not.toContain('`Pending Tasks ${');
  });

  it("自造 sev-'w' 档退役（统一 'y' 对齐 pill 五主档），SparkLine 死导入退役", () => {
    const s = readView('OverviewView');
    expect(s, "sev-'w' 值退役").not.toMatch(/'w'/);
    expect(s, '.sev-w 死规则退役').not.toContain('sev-w');
    expect(s, 'Alert 类型收窄 r/y 两档').toContain("interface Alert { k: string; t: string; s: 'r' | 'y' }");
    expect(s, 'SparkLine 死导入退役').not.toContain("import SparkLine from '../components/SparkLine.vue';");
    expect(s, 'semFormat 既有单源仍在（bytes/duration 两档共用）').toContain("import { semFormat } from '../composables/useSemFormat';");
  });
});

describe('E HealthReportView：双列显示槽 + 视口弹性档', () => {
  it('#cell-health 显示槽在場：clusterHealthZh 单源中文主显 + 色点（MetaStrip dot 单源），title 恒 raw', () => {
    const s = readView('HealthReportView');
    /* 五百三十四批锚同步更新：视图本地 HEALTH_ZH 三值映射退役，合并 esEnumZh.clusterHealthZh
       单源（esEnumZh 随 534 批提交，批内自洽）；import 别名 healthZh 模板槽零改动。
       既有 reasonZh/canAllocateCls import 锚（semanticTier531 字面锁）逐字保留。
       五百六十一批锚同步更新：.hr-hdot 私造圆点改用 MetaStrip dot 形态单源（DiagView dgMeta 先例），
       色值走 healthColor 独立 import 行（format import 原行 531 字面锁不动）。 */
    expect(s).toContain("import { reasonZh, canAllocateCls } from '../utils/esEnumZh';");
    expect(s, 'clusterHealthZh 单源 import 在場').toContain("import { clusterHealthZh as healthZh } from '../utils/esEnumZh';");
    expect(s, '视图本地 HEALTH_ZH 映射退役').not.toContain('const HEALTH_ZH');
    expect(s).toContain('<template #cell-health="{ value }">');
    expect(s, '色点改用 MetaStrip dot 形态单源（dot+value 段，文案不变）')
      .toMatch(/<MetaStrip :items="\[\{ dot: healthColor\(String\(value \|\| ''\)\), value: healthZh\(value\) \|\| value \}\]" \/>/);
    expect(s, 'hr-hdot 私造圆点退役（hd-g/y/r 三档同步更新）').not.toContain('hr-hdot');
    expect(s).toMatch(/<span class="hr-cell-health" :title="String\(value \?\? ''\)">/);
  });

  it('#cell-size 显示槽在場：semFormat bytes 单源（parseBytes 先归一，不可解析回落原值）', () => {
    const s = readView('HealthReportView');
    expect(s).toContain('<template #cell-size="{ value }">');
    expect(s).toMatch(/semFormat\(parseBytes\(value\), 'bytes'\)\?\.text \?\? value/);
    expect(s, 'parseBytes 独立 import 行（前一行 format import 被 semanticTier531 字面锁，逐字不动）')
      .toContain("import { parseBytes } from '../utils/format';");
    expect(s).toContain("import { semFormat } from '../composables/useSemFormat';");
  });

  it('.hr-diff-body / .hr-code 视口弹性档 max(240px, 42vh)（240px 定高退役）', () => {
    const s = readView('HealthReportView');
    expect(s).toMatch(/\.hr-diff-body \{[^}]*max-height: max\(240px, 42vh\);/);
    expect(s).toMatch(/\.hr-code \{[^}]*max-height: max\(240px, 42vh\);/);
    expect(s, '240px 定高退役').not.toMatch(/max-height: 240px/);
  });
});
