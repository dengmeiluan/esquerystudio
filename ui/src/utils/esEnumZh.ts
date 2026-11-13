/**
 * ES 内部枚举 → 人话/语义档 的跨页单一出处（天罗 W6 P1 枚举收口）。
 * 此前同一枚举的消费页各写一份（DiagView/HealthReportView 的 allocation reason、
 * LiveDashboardView 的节点角色分档），口径各自漂移；本文件收口后各页 import 同一事实源。
 * 纯函数、零依赖——不引 Vue/组件，方便单测与复用。
 */

/* ═══ ① ES unassigned_info.reason 枚举 → 人话 ═══
 诊断结论可读，不再裸甩内部标识。未知代码原样返回（不猜不编）。 */
export const ALLOC_REASON_ZH: Record<string, string> = {
  INDEX_CREATED: '索引刚创建，分片待分配',
  CLUSTER_RECOVERED: '集群恢复后待重新分配',
  INDEX_REOPENED: '索引重新打开后待分配',
  DANGLING_INDEX_IMPORTED: '悬空索引导入待分配',
  NEW_INDEX_RESTORED: '快照恢复的新索引待分配',
  EXISTING_INDEX_RESTORED: '快照恢复的已有索引待分配',
  REPLICA_ADDED: '新增副本待分配',
  ALLOCATION_FAILED: '分配失败（详见 Node decisions）',
  NODE_LEFT: '原节点离开，分片待重新分配',
  REROUTE_CANCELLED: 'reroute 被取消',
  REINITIALIZED: '分片重新初始化',
  REALLOCATED_REPLICA: '副本重新分配',
  PRIMARY_FAILED: '主分片失败',
  FORCED_EMPTY_PRIMARY: '强制空主分片',
  MANUAL_ALLOCATION: '手动分配待执行',
};
export function reasonZh(reason: string): string { return ALLOC_REASON_ZH[reason] || reason; }

/* ═══ ② allocation explain can_allocate 三档 → 全局语义档类 ═══
 口径对齐 HealthReportView 既有三档：yes→meta-ok / no→meta-err / 其余（THRESHOLD 等
 中间态）→meta-warn。消费方（DiagView/HealthReportView）直接 :class 绑定。 */
export function canAllocateCls(v: string | null | undefined): string {
  return v === 'yes' ? 'meta-ok' : v === 'no' ? 'meta-err' : 'meta-warn';
}

/* ═══ ③ 节点角色分档（data=蓝 / master=紫，LiveDashboard 节点卡同款）═══
 data 节点优先——角色徽标语义：能存数据的节点排第一叙事；纯 master 次之；
 其余（ingest-only 等）无专属色，label 回落全量角色串。 */
export const isDataNode = (n: { roles?: string[] }): boolean => (n.roles || []).includes('data');
export function nodeRoleLabel(n: { roles?: string[] }): string {
  return isDataNode(n) ? 'data' : (n.roles || []).includes('master') ? 'master' : (n.roles || []).join('/') || 'node';
}
export function nodeRoleClass(n: { roles?: string[] }): string {
  return isDataNode(n) ? 'data' : (n.roles || []).includes('master') ? 'master' : '';
}

/* ═══ ④ 迁移作业阶段枚举 → 中文（ W4，XmigrateView statusZh 迁入）═══
 纯显示层；数据/排序/导出仍用原枚举。未收录枚举回退空串 → 消费方回显原英文
 （新枚举出现不丢信息）。 */
export const XM_STATUS_ZH: Record<string, string> = {
  RUNNING: '运行中', DONE: '已完成', FAILED: '失败', ABORTED: '已中止', INTERRUPTED: '已中断',
};
export function xmStatusZh(s: any): string {
  return XM_STATUS_ZH[String(s || '').toUpperCase()] || '';
}

/* ═══ ⑤ 校验/建议 severity → 中文 + pill 档（ W4 三套口径收口）═══
 退役并收口：AdhocRebuildView sevPill（r/y/b）、ConfigValidatorView cvSevPill
 （err/warn/info 别名档）、IndexOptimizerView svLabel（中文）。
 pill 档统一 theme.css .pill 五主档单字母——err/warn/info 别名档与 r/y/b 同
 token（--err/--warn/--info），展示等价。sevZh 回落「建议」与 svLabel 口径逐字
 一致：critical→严重 / warn→警告 / 其余（info 等）=改进建议档。 */
export function sevZh(s: string): string {
  const v = String(s || '').toLowerCase();
  /* 补 error 档：ES 校验报告 severity 用 ERROR（非 critical 词汇系），
 落「建议」与红档错位；critical/warn/其余三档旧口径（svLabel 逐字）不变 */
  if (v === 'critical') return '严重';
  if (v === 'error') return '错误';
  if (v === 'warn') return '警告';
  /* 补 warning 别名：date 兼容风险行 level 用 warning（warn 的变体词汇，
 sevPill 侧 warning→y 早已有档），原先落「建议」与黄档错位 */
  if (v === 'warning') return '警告';
  return '建议';
}
/* 返回域类型化（'r'|'y'|'b'|'n' 五主档子集）——StatusPill tone prop 是
 五主档联合，string 直传 vue-tsc 报错；返回域收窄对既有 class 串消费方零影响 */
type SevTone = 'r' | 'y' | 'b' | 'n';
export function sevPill(s: any): SevTone {
  const v = String(s || '').toLowerCase();
  if (v === 'error' || v === 'critical') return 'r';
  if (v === 'warn' || v === 'warning') return 'y';
  if (v === 'info') return 'b';
  return 'n';
}

/* ═══ ⑥ 重建/迁移族作业状态 → 中文（ Lead 先行公共依赖）═══
 AdhocRebuildView 作业表（原 :390 裸英文）与 OverviewView 最近作业（原 :136）接线消费。
 与 XM_STATUS_ZH 并存：xmigrate 族文案口径历史既有不动，rebuild 族在此扩容。
 纯显示层；数据/排序/导出仍用原枚举（permGating 锁条件行，展示插值才换）。 */
const JOB_STATUS_ZH: Record<string, string> = {
  RUNNING: '运行中', SUCCEEDED: '已成功', DONE: '已完成', COMPLETED: '已完成', SUCCESS: '成功',
  FAILED: '失败', ABORTED: '已中止', INTERRUPTED: '已中断', PENDING: '排队中', PAUSED: '已暂停',
  WAITING: '等待中', IN_PROGRESS: '进行中', INIT: '初始化',
};
export function jobStatusZh(s: any): string {
  return JOB_STATUS_ZH[String(s || '').toUpperCase()] || '';
}

/* ═══ ⑦ 快照 state → 中文（SnapshotsView chip 接线）═══ */
const SNAPSHOT_STATE_ZH: Record<string, string> = {
  SUCCESS: '成功', PARTIAL: '部分成功', FAILED: '失败', IN_PROGRESS: '进行中', INCOMPATIBLE: '不兼容',
};
export function snapshotStateZh(s: any): string {
  return SNAPSHOT_STATE_ZH[String(s || '').toUpperCase()] || '';
}

/* ═══ ⑧ ILM phase → 中文（IlmView 生命周期阶段接线）═══ */
export const ILM_PHASE_ZH: Record<string, string> = {
  hot: '热', warm: '温', cold: '冷', frozen: '冻结', delete: '删除',
};
export function phaseZh(s: any): string {
  const v = String(s || '').toLowerCase();
  return ILM_PHASE_ZH[v] || '';
}

/* ═══ ⑱b ILM action → 中文释义（LifecycleView move 弹窗 datalist 候选域）═══
 九键核实自 ES 官方 ILM actions 全集（ILM action 是闭词汇域，固定九值）：
 forcemerge（warm 合并段降段数）/ shrink（缩减主分片数）/ allocate（调副本数与分配规则）/
 delete（删除索引）/ rollover（别名滚动到新索引）/ set_priority（设节点重启后恢复优先级）/
 unfollow（CCR follower 解除跟随转普通索引）/ searchable_snapshot（cold/frozen 挂可搜索快照）/
 downsample（时序指标降采样，8.5+）。释义只进 datalist 候选 label 与 :title（纯候选域），
 不参与任何判等/数据语义；未收录值（未来新 action）不猜不编。 */
export const ILM_ACTION_ZH: Record<string, string> = {
  forcemerge: '强制合并段', shrink: '收缩分片', allocate: '调整副本分配',
  delete: '删除索引', rollover: '滚动到新索引', set_priority: '设置恢复优先级',
  unfollow: '解除跟随', searchable_snapshot: '可搜索快照', downsample: '降采样',
};

/* ═══ ⑨ 索引 open/close → 中文（BrowserView 列表接线；跨工蚁契约导出）═══ */
export function indexStatusZh(s: any): string {
  const v = String(s || '').toLowerCase();
  return v === 'open' ? '已打开' : v === 'close' ? '已关闭' : '';
}

/* ═══ ⑩ ES 任务 action → 短标签 + pill 色档（TasksView 原本地 actionShort/
 actionColor 迁入收口；taskActionZh 契约签名 (a: string): string 预定死，色档拆
 taskActionTone 独立导出）。纯显示层；过滤/复制等数据语义不受影响。
 色档口径同步更新：bulk 归写类 warn 档——任务全部处于运行中，绿档会被误读为「已成功」 */
export function taskActionZh(a: string): string {
  if (!a) return '?';
  const s = String(a);
  if (s.includes('reindex')) return 'reindex';
  if (s.includes('bulk')) return 'bulk';
  if (s.includes('search')) return 'search';
  if (s.includes('delete/byquery') || s.includes('delete_by_query')) return 'delete-by-q';
  if (s.includes('update/byquery') || s.includes('update_by_query')) return 'update-by-q';
  if (s.startsWith('cluster:')) return s.slice(8);
  if (s.startsWith('indices:')) return s.slice(8);
  return s;
}
type TaskActionTone = 'y' | 'b' | 'r' | 'n';
export function taskActionTone(a: string): TaskActionTone {
  const s = taskActionZh(a);
  if (s === 'reindex' || s === 'bulk' || s === 'update') return 'y';
  if (s === 'search') return 'b';
  if (s.startsWith('delete')) return 'r';
  return 'n';
}

/* ═══ ⑪ 分片 state → 中文 + pill 档（ Lead 先行跨工蚁契约）═══
 IndexHubView 分片统计原四枚举内联三元（STARTED 裸英文，其余三项已中文）收口；
 TopologyView shard tooltip 手配色同源消费。档位口径同步更新原视图：STARTED=绿 /
 RELOCATING·INITIALIZING=黄 / UNASSIGNED=红。纯显示层。 */
const SHARD_STATE_ZH: Record<string, string> = {
  STARTED: '已启动', RELOCATING: '迁移中', INITIALIZING: '初始化', UNASSIGNED: '未分配',
};
export function shardStateZh(s: any): string {
  return SHARD_STATE_ZH[String(s || '').toUpperCase()] || '';
}
export function shardStateTone(s: any): 'g' | 'y' | 'r' | 'n' {
  const v = String(s || '').toUpperCase();
  if (v === 'STARTED') return 'g';
  if (v === 'RELOCATING' || v === 'INITIALIZING') return 'y';
  if (v === 'UNASSIGNED') return 'r';
  return 'n';
}

/* ═══ ⑫ 重建作业 stage → 中文（ Lead 先行跨工蚁契约）═══
 枚举值实地核自 AdhocRebuildService setStage 全部打点（PENDING..DONE 十值）。
 AdhocRebuildView job.stage / 轮次 r.phase 原裸英文接线消费。未收录值回退空串
 → 消费方回显原英文（新 stage 出现不丢信息）。 */
const ADHOC_STAGE_ZH: Record<string, string> = {
  PENDING: '排队中', REJECTED: '已拒绝', CREATE_DEST: '创建目标索引', WRITE_BLOCK: '写阻断',
  FULL_REINDEX: '全量重建', CATCHUP: '增量追赶', SWITCH: '别名切换', FINAL_CATCHUP: '切换前追赶',
  FINALIZE: '收尾', DONE: '完成', AWAIT_CONFIRM: '待人工确认',
};
export function stageZh(s: any): string {
  return ADHOC_STAGE_ZH[String(s || '').toUpperCase()] || '';
}

/* ═══ ⑭ 重建轮次 phase → 中文（ Lead 收口，实地核自 AdhocRebuildService
 addRound 全部打点四值）。与 job.stage 不同词汇域独立映射；AdhocRebuildView 轮次表
 r.phase 消费（原 phaseZh 误挂 ILM 词汇域，轮次枚举全数回退英文，本件收口）。 */
const ADHOC_ROUND_ZH: Record<string, string> = {
  FULL: '全量', CATCHUP: '追赶', CATCHUP_BLOCKED: '阻断追赶', FINAL: '终轮追平',
};
export function roundZh(s: any): string {
  return ADHOC_ROUND_ZH[String(s || '').toUpperCase()] || '';
}

/* ═══ ⑬ 托管作业种类 → pill 色档（LiveDashboardView :187 jobTone 本地
 字典逐字迁入收口；LiveDashboardView 第四卡「运行中任务」行首徽标消费）═══
 口径同步更新原视图：Reindex 是写类走 y（与 taskActionTone 同口径——写类黄档避免被误读为
 「已成功」）、快照中性 n、其余（托管重建/跨集群迁移）信息蓝 b。
 与 taskActionTone 的口径差异：taskActionTone 输入是 ES action 串（delete 族出红档 r），
 本函数输入是 TrackedJob.kindName 展示名（托管重建/跨集群迁移/Reindex 任务/快照，见
 stores/jobTracker.ts），无 delete 语义故无红档。纯显示层。 */
type JobKindTone = 'g' | 'y' | 'r' | 'b' | 'n';
export function jobKindTone(kind: string): JobKindTone {
  if (kind === 'Reindex 任务') return 'y';
  if (kind === '快照') return 'n';
  return 'b';
}

/* ═══ ⑮ 集群健康 GREEN/YELLOW/RED → 中文（═══
 ClusterSwitcher/SetupWizard 连通测试结果 StatusPill 中文主显 + 英文小字（en 档）消费；
 tone 档走 utils/format.healthPill（g/y/r，全等小写匹配——后端给大写枚举，调用方先
 toLowerCase）。纯显示层；条件判断/数据仍用原枚举。 */
const CLUSTER_HEALTH_ZH: Record<string, string> = {
  GREEN: '健康', YELLOW: '亚健康', RED: '异常',
};
export function clusterHealthZh(s: any): string {
  return CLUSTER_HEALTH_ZH[String(s || '').toUpperCase()] || '';
}

/* ═══ ⑯ SLM operation_mode → 中文 + tone（SlmView 页头状态接线）═══
 与 ⑮ 同形：枚举大小写归一 + 未收录回退空串（消费方回显原英文不丢信息）。
 tone 既有口径同步更新：RUNNING→ok / 其余（STARTING/STOPPING 过渡态、STOPPED、UNKNOWN）→warn。
 纯显示层；英文原值由消费方留 tip/title 保检索。 */
const SLM_OP_MODE_ZH: Record<string, string> = {
  RUNNING: '运行中', STARTING: '启动中', STOPPING: '停止中', STOPPED: '已停止',
};
export function slmOpModeZh(s: any): string {
  return SLM_OP_MODE_ZH[String(s || '').toUpperCase()] || '';
}
export function slmOpModeTone(s: any): 'ok' | 'warn' {
  return String(s || '').toUpperCase() === 'RUNNING' ? 'ok' : 'warn';
}

/* ═══ ⑰ Watcher state → 中文 + tone（WatcherView 页头状态接线）═══
 watcher_state 是小写词汇域（started/stopping/stopped），toLowerCase 归一。
 tone 既有口径同步更新：started→ok / 其余→warn。纯显示层。 */
const WATCHER_STATE_ZH: Record<string, string> = {
  started: '已启动', stopping: '停止中', stopped: '已停止',
};
export function watcherStateZh(s: any): string {
  return WATCHER_STATE_ZH[String(s || '').toLowerCase()] || '';
}
export function watcherStateTone(s: any): 'ok' | 'warn' {
  return String(s || '').toLowerCase() === 'started' ? 'ok' : 'warn';
}

/* ═══ ⑱ mapping 字段类型 → 人话（只增收口）═══
 四查询面/ClauseNode/FieldSelect 等消费点的字段类型枚举此前词汇域分散（fieldSearch.GH_LABEL
 组头只收数值族+date，其余类型组头裸英文名——fieldSelectPopup/boostFieldPrioW3b 已锁字面，
 本表不改其行为，作跨页单一出处供消费方渐进接线）。未知代码原样返回（不猜不编）。 */
export const FIELD_TYPE_ZH: Record<string, string> = {
  text: '文本', match_only_text: '仅匹配文本', annotated_text: '标注文本',
  keyword: '精确值', constant_keyword: '常量关键字', wildcard: '通配关键字',
  long: '长整数', integer: '整数', short: '短整数', byte: '字节',
  double: '双精度', float: '单精度', half_float: '半精浮点', scaled_float: '缩放浮点',
  unsigned_long: '无符号长整数', token_count: '词项计数',
  date: '日期', date_nanos: '纳秒日期', boolean: '布尔', binary: '二进制',
  ip: 'IP 地址', geo_point: '地理坐标', geo_shape: '地理形状', point: '点',
  shape: '形状', object: '对象', nested: '嵌套对象', flattened: '扁平对象',
  alias: '字段别名', completion: '补全', search_as_you_type: '输入即搜',
  dense_vector: '稠密向量', sparse_vector: '稀疏向量', rank_feature: '排序特征',
  rank_features: '排序特征集', percolator: '穿透查询', join: '父子关联',
  version: '版本号', histogram: '直方图', aggregate_metric_double: '聚合指标',
  integer_range: '整数区间', float_range: '浮点区间', long_range: '长整数区间',
  double_range: '双精度区间', date_range: '日期区间', ip_range: 'IP 区间',
};
export function fieldTypeZh(t: string): string {
  return FIELD_TYPE_ZH[t] || t;
}
