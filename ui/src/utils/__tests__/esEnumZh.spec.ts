/**
 * 天罗W6 P1：ES 枚举跨页收口 utils/esEnumZh。
 * 锁定：
 * ① ALLOC_REASON_ZH/reasonZh（DiagView 迁出）：已知枚举出人话、未知原样不猜；
 * ② canAllocateCls 三档：yes→meta-ok / no→meta-err / 其余（THRESHOLD 等中间态）→meta-warn，
 *    口径对齐 HealthReportView 既有内联三元（现等价迁移共享件）；
 * ③ nodeRole roleClass/roleLabel（LiveDashboardView 迁出）：data 优先、master 次之、其余回落全量串；
 * ④ 三视图消费接线（源码级）：DiagView/HealthReportView/LiveDashboardView 均从单一出处 import，
 *    本地重复实现不回潮。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOC_REASON_ZH, reasonZh, canAllocateCls, isDataNode, nodeRoleLabel, nodeRoleClass, XM_STATUS_ZH, xmStatusZh, sevZh, sevPill, shardStateZh, shardStateTone, stageZh, roundZh, slmOpModeZh, slmOpModeTone, watcherStateZh, watcherStateTone } from '../esEnumZh';

describe('esEnumZh ①：allocation reason 人话', () => {
  it('已知枚举映射中文；未知代码原样返回', () => {
    expect(reasonZh('NODE_LEFT')).toBe('原节点离开，分片待重新分配');
    expect(reasonZh('INDEX_CREATED')).toBe('索引刚创建，分片待分配');
    expect(reasonZh('ALLOCATION_FAILED')).toContain('分配失败');
    expect(reasonZh('SOME_FUTURE_CODE')).toBe('SOME_FUTURE_CODE');
    expect(Object.keys(ALLOC_REASON_ZH).length).toBeGreaterThanOrEqual(15);
  });
});

describe('esEnumZh ②：can_allocate 三档语义类', () => {
  it('yes→meta-ok / no→meta-err / 其余→meta-warn', () => {
    expect(canAllocateCls('yes')).toBe('meta-ok');
    expect(canAllocateCls('no')).toBe('meta-err');
    expect(canAllocateCls('THRESHOLD')).toBe('meta-warn');
    expect(canAllocateCls('deciders-warn')).toBe('meta-warn');
    expect(canAllocateCls(undefined)).toBe('meta-warn');
  });
});

describe('esEnumZh ③：节点角色分档（data=蓝档/master=紫档）', () => {
  it('data 节点优先；纯 master 次之；ingest-only 无档全量串；空 roles 回落 node', () => {
    const data = { roles: ['master', 'data', 'ingest'] };
    expect(isDataNode(data)).toBe(true);
    expect(nodeRoleClass(data)).toBe('data');
    expect(nodeRoleLabel(data)).toBe('data');
    const master = { roles: ['master'] };
    expect(nodeRoleClass(master)).toBe('master');
    expect(nodeRoleLabel(master)).toBe('master');
    const ingest = { roles: ['ingest'] };
    expect(nodeRoleClass(ingest)).toBe('');
    expect(nodeRoleLabel(ingest)).toBe('ingest');
    const multi = { roles: ['ingest', 'transform'] };
    expect(nodeRoleLabel(multi)).toBe('ingest/transform');
    expect(nodeRoleLabel({ roles: [] })).toBe('node');
  });
});

/* 五百二十五批 W4：④⑤ 扩容锁定——xmStatusZh（XmigrateView statusZh 迁入）与
   sevZh/sevPill（AdhocRebuild sevPill / ConfigValidator cvSevPill / IndexOptimizer
   svLabel 三套口径收口）。pill 档统一 .pill 五主档单字母，中文回落「建议」与
   旧 svLabel 口径逐字一致。 */
describe('esEnumZh ④+：迁移作业阶段中文（W4 迁入）', () => {
  it('已知枚举出中文；未知/空回退空串（消费方回显原英文）', () => {
    expect(xmStatusZh('RUNNING')).toBe('运行中');
    expect(xmStatusZh('DONE')).toBe('已完成');
    expect(xmStatusZh('FAILED')).toBe('失败');
    expect(xmStatusZh('ABORTED')).toBe('已中止');
    expect(xmStatusZh('INTERRUPTED')).toBe('已中断');
    expect(xmStatusZh('SOME_FUTURE_STAGE')).toBe('');
    expect(xmStatusZh('')).toBe('');
    expect(Object.keys(XM_STATUS_ZH).length).toBe(5);
  });
});

describe('esEnumZh ⑤：severity 中文 + pill 档收口（W4 三套口径退役）', () => {
  it('sevZh：critical→严重 / warn→警告 / 其余（info 等）→建议（逐字同旧 svLabel）', () => {
    expect(sevZh('critical')).toBe('严重');
    expect(sevZh('warn')).toBe('警告');
    expect(sevZh('info')).toBe('建议');
    expect(sevZh('whatever')).toBe('建议');
  });
  it('sevZh 五百三十一批补 error 档：ERROR→错误（ES 校验报告词汇系，与红档对位；旧三档不回归）', () => {
    expect(sevZh('ERROR')).toBe('错误');
    expect(sevZh('error')).toBe('错误');
    expect(sevZh('critical')).toBe('严重');
    expect(sevZh('warn')).toBe('警告');
    expect(sevZh('info')).toBe('建议');
  });
  it('sevPill：error/critical→r / warn/warning→y / info→b / 兜底 n（五主档单字母）', () => {
    expect(sevPill('ERROR')).toBe('r');
    expect(sevPill('critical')).toBe('r');
    expect(sevPill('warn')).toBe('y');
    expect(sevPill('warning')).toBe('y');
    expect(sevPill('info')).toBe('b');
    expect(sevPill('mystery')).toBe('n');
  });
  it('三视图消费接线（源码级防回潮）：本地三套实现退役、import 收口件', () => {
    const read = (p: string) => readFileSync(join(__dirname, '../../views', p), 'utf-8');
    const adhoc = read('AdhocRebuildView.vue');
    expect(adhoc).toContain("import { sevPill } from '../utils/esEnumZh'");
    expect(adhoc).not.toMatch(/function sevPill\(/);
    const cv = read('ConfigValidatorView.vue');
    expect(cv).toContain("import { sevPill as cvSevPill, sevZh as cvSevZh } from '../utils/esEnumZh'");
    expect(cv).not.toMatch(/function cvSevPill\(/);
    const io = read('IndexOptimizerView.vue');
    expect(io).toContain("import { sevZh as svLabel, sevPill as ioSevPill } from '../utils/esEnumZh'");
    expect(io).not.toContain("const svLabel = (s: string)");
    const xm = read('XmigrateView.vue');
    expect(xm).toContain("import { xmStatusZh as statusZh } from '../utils/esEnumZh'");
    expect(xm).not.toContain('const XM_STATUS_ZH');
  });
});

describe('esEnumZh ④：三视图消费接线（源码级防回潮）', () => {
  const read = (p: string) => readFileSync(join(__dirname, '../../views', p), 'utf-8');

  it('DiagView：import 收口件，本地 ALLOC_REASON_ZH 实体不回潮；can_allocate 走收口函数', () => {
    /* 五百二十五批 W5 随迁：节点表换 QRT rows 型，角色 chip（nodeRoleClass/nodeRoleLabel
       消费点）随纯文本壳退役——角色列改全量角色串（roles.join('/')，信息保全优先）；
       reason/can_allocate 收口消费不变。nodeRoleClass/nodeRoleLabel 仍由 LiveDashboard
       消费（本 describe 第三用例锁守），esEnumZh 收口单一真源不变。 */
    const src = read('DiagView.vue');
    expect(src).toContain("from '../utils/esEnumZh'");
    expect(src).toMatch(/import \{ reasonZh, canAllocateCls \} from '\.\.\/utils\/esEnumZh'/);
    expect(src).not.toContain('const ALLOC_REASON_ZH');
    expect(src).toContain('canAllocateCls(allocation.can_allocate)');
  });

  it('HealthReportView：reason 接 reasonZh + meta-warn 档；can_allocate 走 canAllocateCls', () => {
    const src = read('HealthReportView.vue');
    /* 五百三十三批：#cell-health 接 clusterHealthZh，import 形状锁改「守卫项在场」不冻结全列表
       （锚随换装迁移，531 先例；DiagView 同款精确锁因其 import 未扩容暂保持原样） */
    expect(src).toMatch(/import \{[^}]*reasonZh[^}]*canAllocateCls[^}]*\} from '\.\.\/utils\/esEnumZh'/);
    expect(src).toContain('reasonZh(data.allocationExplain.unassigned_info.reason)');
    expect(src).toMatch(/<span class="mono meta-warn">\{\{ data\.allocationExplain\.unassigned_info\.reason \}\}<\/span>/);
    expect(src).toContain(':class="canAllocateCls(data.allocationExplain.can_allocate)"');
    /* 旧内联三元退役，不得双轨 */
    expect(src).not.toContain("? 'meta-ok' : data.allocationExplain.can_allocate === 'no'");
  });

  it('LiveDashboardView：角色分档 import（行为等价迁移），本地箭头实现不回潮', () => {
    const src = read('LiveDashboardView.vue');
    expect(src).toMatch(/import \{ isDataNode, nodeRoleLabel, nodeRoleClass, jobKindTone \} from '\.\.\/utils\/esEnumZh'/);
    expect(src).not.toContain('const roleLabel = (n: any)');
    expect(src).not.toContain('includes(\'data\')');
  });
});

/* ═══ 五百三十一批 Lead 先行/收口导出（⑪分片 ⑫重建 stage ⑭轮次 phase）═══
   契约：跨工蚁共享内核——IndexHubView/TopologyView 消费 shardState*，
   AdhocRebuildView 消费 stageZh/roundZh。枚举值实地核自 Java 打点。 */
describe('esEnumZh 531：shardState / adhoc stage / adhoc round 收口', () => {
  it('shardStateZh：四枚举中文；未收录回退空串（消费方回显原文）', () => {
    expect(shardStateZh('STARTED')).toBe('已启动');
    expect(shardStateZh('RELOCATING')).toBe('迁移中');
    expect(shardStateZh('INITIALIZING')).toBe('初始化');
    expect(shardStateZh('UNASSIGNED')).toBe('未分配');
    expect(shardStateZh('unassigned')).toBe('未分配');
    expect(shardStateZh('MYSTERY')).toBe('');
    expect(shardStateZh('')).toBe('');
  });
  it('shardStateTone：STARTED=g / RELOCATING·INITIALIZING=y / UNASSIGNED=r / 兜底 n', () => {
    expect(shardStateTone('STARTED')).toBe('g');
    expect(shardStateTone('RELOCATING')).toBe('y');
    expect(shardStateTone('INITIALIZING')).toBe('y');
    expect(shardStateTone('UNASSIGNED')).toBe('r');
    expect(shardStateTone('mystery')).toBe('n');
  });
  it('stageZh：AdhocRebuildService setStage 十一值全收录（含 R93 AWAIT_CONFIRM 待人工确认）', () => {
    expect(stageZh('PENDING')).toBe('排队中');
    expect(stageZh('CREATE_DEST')).toBe('创建目标索引');
    expect(stageZh('WRITE_BLOCK')).toBe('写阻断');
    expect(stageZh('FULL_REINDEX')).toBe('全量重建');
    expect(stageZh('CATCHUP')).toBe('增量追赶');
    expect(stageZh('SWITCH')).toBe('别名切换');
    expect(stageZh('FINAL_CATCHUP')).toBe('切换前追赶');
    expect(stageZh('AWAIT_CONFIRM')).toBe('待人工确认');
    expect(stageZh('FINALIZE')).toBe('收尾');
    expect(stageZh('DONE')).toBe('完成');
    expect(stageZh('SOME_FUTURE_STAGE')).toBe('');
  });
  it('roundZh：addRound 四值（与 job.stage 不同词汇域独立映射）', () => {
    expect(roundZh('FULL')).toBe('全量');
    expect(roundZh('CATCHUP')).toBe('追赶');
    expect(roundZh('CATCHUP_BLOCKED')).toBe('阻断追赶');
    expect(roundZh('FINAL')).toBe('终轮追平');
    expect(roundZh('mystery')).toBe('');
  });
});

/* ═══ 五百三十四批：SLM operation_mode / watcher state 双语域（守卫项在场断言，
   不冻结全列表——§6u 教训：冻结 length 会让后续批次的合法扩容误红）═══ */
describe('esEnumZh 534：slmOpMode / watcherState 收口', () => {
  it('slmOpModeZh：守卫项在场（RUNNING/STARTING/STOPPING/STOPPED）；未收录回退空串', () => {
    expect(slmOpModeZh('RUNNING')).toBe('运行中');
    expect(slmOpModeZh('STARTING')).toBe('启动中');
    expect(slmOpModeZh('STOPPING')).toBe('停止中');
    expect(slmOpModeZh('STOPPED')).toBe('已停止');
    /* 大小写归一 + 未知值回退：新枚举出现不丢信息（消费方回显原英文） */
    expect(slmOpModeZh('running')).toBe('运行中');
    expect(slmOpModeZh('SOME_FUTURE_MODE')).toBe('');
    expect(slmOpModeZh('')).toBe('');
  });
  it('slmOpModeTone：RUNNING→ok / 其余（过渡态与停止、未知）→warn（既有口径）', () => {
    expect(slmOpModeTone('RUNNING')).toBe('ok');
    expect(slmOpModeTone('running')).toBe('ok');
    expect(slmOpModeTone('STARTING')).toBe('warn');
    expect(slmOpModeTone('STOPPED')).toBe('warn');
    expect(slmOpModeTone('UNKNOWN')).toBe('warn');
  });
  it('watcherStateZh：守卫项在场（started/stopping/stopped）；未收录回退空串', () => {
    expect(watcherStateZh('started')).toBe('已启动');
    expect(watcherStateZh('stopping')).toBe('停止中');
    expect(watcherStateZh('stopped')).toBe('已停止');
    /* 小写词汇域大小写归一 + 未知值回退 */
    expect(watcherStateZh('STARTED')).toBe('已启动');
    expect(watcherStateZh('starting')).toBe('');
    expect(watcherStateZh('')).toBe('');
  });
  it('watcherStateTone：started→ok / 其余→warn（既有口径）', () => {
    expect(watcherStateTone('started')).toBe('ok');
    expect(watcherStateTone('STARTED')).toBe('ok');
    expect(watcherStateTone('stopping')).toBe('warn');
    expect(watcherStateTone('stopped')).toBe('warn');
    expect(watcherStateTone('unknown')).toBe('warn');
  });
});
