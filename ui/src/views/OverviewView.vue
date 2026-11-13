<template>
  <div class="ov">
    <!-- 统一页头：图标 + 标题 + 副标题 + 右侧操作区 -->
    <!-- KPI 4 卡墙退役（IndexHubView ih-meta 同款范式）：4 项指标改为页头副标题区的
 inline 元信息串，点击仍可下钻，全量文本（副文案/精确值/趋势说明）走 :title 兜底 -->
    <PageHeader :icon="Gauge" title="集群概览">
      <template #subtitle>
        <span>健康 · 预警 · 拓扑 · 作业一屏总览</span>
        <div v-if="!loaded" style="margin-top:5px"><span class="sk" style="display:block;width:340px;height:12px"></span></div>
        <MetaStrip v-else class="ov-strip" :items="kpiMeta" />
      </template>
<template #actions>
<span style="flex:1"></span>
      <button class="btn sm ghost" :disabled="ovLoading" @click="load"><RotateCw :size="11" /> 刷新</button>
      </template>
    </PageHeader>

    <!-- 接口失败不再静默——页面级错误条，可重试。
 手写红壳合并 err-bar 单源（558b 三面先例同语言：role=alert + theme.css
 .err-bar 档；本地 bg/border/radius 私造三件套退役；err-bar word-break 承接全文不断链） -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      部分数据加载失败：{{ loadErr }}
      <button class="btn xs" :disabled="ovLoading" @click="load">重试</button>
    </div>

    <!-- 集群实时预警条（red/yellow/pending/unassigned 任一命中则显示） -->
    <transition name="pop">
      <div v-if="alerts.length" class="ov-alerts" :class="'sev-' + alertSev">
        <AlertOctagon :size="14" class="ov-alerts-ic" />
        <div class="ov-alerts-body">
          <div class="ov-alerts-hd">
            <b>集群预警</b>
            <span class="ov-alerts-cnt">{{ alerts.length }} 项</span>
          </div>
          <div class="ov-alerts-list">
            <span v-for="a in alerts" :key="a.k" class="ov-alerts-i" :class="'sev-' + a.s">
              <span class="ov-alerts-dot"></span>{{ a.t }}
            </span>
          </div>
        </div>
        <div class="ov-alerts-act">
          <button class="btn xs" @click="router.push('/diag')">去诊断</button>
          <button class="btn xs ghost" @click="router.push('/task-tree')">任务树</button>
        </div>
      </div>
    </transition>

    <!-- stuck 提醒。：警示条合并 err-bar 基座（role=alert）——warn 语义档视图侧
 覆写换色（err 红→warn 黄 token），布局节奏对齐现行，本地只留 tone 换色 -->
    <transition name="pop">
      <div v-if="stuckJobs.length" role="alert" class="err-bar ov-stuck">
        <span><b>{{ stuckJobs.length }}</b> 个作业疑似卡死（>30m 无进展）</span>
        <button class="btn sm" @click="router.push('/adhoc-rebuild')">查看作业</button>
      </div>
    </transition>

    <!-- 迷你分布式拓扑条 -->
    <!-- 下钻卡键盘可达（role/tabindex/Enter——纯 click 绑定对键盘用户不可达；焦点环走全局 :focus-visible） -->
    <!-- （ 差距，本次解锁）：节点条横向溢出时右缘渐隐暗示可横滚——判定纯函数
 evalTopoClip（spec 直采单源），topoClip 消费为真元素 v-if fade（勿 ::after，可测性优先）。
 fade 锚在 nodes-wrap：.ov-topo 直挂 right:0 会压住 .ov-topo-r KPI（ 语义=暗示可滚，
 不是遮数据），故 .ov-topo 无需 position:relative、由 wrapper 承接（检查结论） -->
    <div class="ov-topo" role="button" tabindex="0" aria-label="进入完整分布式拓扑视图" @click="router.push('/topology')" @keydown.enter.prevent="router.push('/topology')" @keydown.space.prevent="router.push('/topology')" title="查看完整分布式拓扑">
      <div class="ov-topo-l">
        <span class="ov-topo-title"><Network :size="13" /> 分布式拓扑</span>
        <span class="ov-topo-sub">点击进入完整视图 →</span>
      </div>
      <div class="ov-topo-nodes-wrap">
        <div class="ov-topo-nodes" ref="topoNodesEl" v-if="topoNodes.length">
          <div v-for="n in topoNodes" :key="n.node" class="ov-topo-node" :title="n.node + ' · ' + n.shards + ' 分片'">
            <span class="ov-topo-node-name mono">{{ shortName(n.node) }}</span>
            <div class="ov-topo-bar">
              <div v-for="(seg, si) in n.segs" :key="si" class="ov-topo-seg"
                :style="{ width: seg.pct + '%', background: seg.color }" />
            </div>
            <span class="ov-topo-node-cnt mono">{{ n.shards }}</span>
          </div>
        </div>
        <div v-else-if="topoLoading" class="ov-topo-empty">
          <!-- W8：手写 .sk 胶囊合并 SkeletonBox round 档（骨架统一走组件，shimmer/降级单点维护） -->
          <SkeletonBox v-for="i in 3" :key="i" height="22px" width="120px" round />
        </div>
        <EmptyState v-else compact :icon="Network" text="暂无分片信息" hint="选择有数据的索引后展示" />
        <span v-if="topoClip" class="ov-topo-fade" aria-hidden="true"></span>
      </div>
      <div class="ov-topo-r">
        <div class="ov-topo-kpi meta-num"><span class="ov-topo-kpi-l">节点</span><b class="mono">{{ topoNodes.length }}</b></div>
        <div class="ov-topo-kpi meta-num"><span class="ov-topo-kpi-l">分片</span><b class="mono">{{ topoTotalShards }}</b></div>
        <div class="ov-topo-kpi meta-num" :class="{ alert: topoUaAbnormal }"><span class="ov-topo-kpi-l">未分配</span><b class="mono" :style="topoUaAbnormal ? 'color:var(--err)' : topoUnassigned ? 'color:var(--tx2)' : ''" :title="topoUnassigned && !topoUaAbnormal ? '单数据节点副本无处放置，常态' : ''">{{ topoUnassigned }}</b></div>
        <div class="ov-topo-kpi meta-num" :class="{ alert: topoRelocating }"><span class="ov-topo-kpi-l">迁移中</span><b class="mono" :style="topoRelocating ? 'color:var(--warn)' : ''">{{ topoRelocating }}</b></div>
      </div>
    </div>

    <div class="ov-grid">
      <!-- 大小 Top10。：顶层 .card 壳退役（约定④）→ border-top 分节（SecurityView 同步同语言） -->
      <div class="ov-cell">
        <div class="card-t"><HardDrive :size="13" /> 存储 Top 10</div>
        <div v-for="idx in topBySize" :key="idx.index" class="ov-bar-row" role="button" tabindex="0" :aria-label="'查看索引 ' + idx.index" @click="goIndex(idx.index)" @contextmenu.prevent="openOvMenu($event, 'idx', idx)" @keydown="onOvKey($event, 'idx', idx)" data-row-nav @keydown.self="rowArrowNav">
          <span class="ov-bar-name mono" :title="idx.index">{{ idx.index }}</span>
          <div class="ov-bar-track">
            <div class="ov-bar-fill" :style="{ width: (idx._sizeN / topBySize[0]._sizeN * 100) + '%' }"></div>
          </div>
          <!-- store.size 裸 ES 串 → semFormat bytes 单源（parseBytes 先归一字节数——
 semFormat 只吃数字；解析失败回落原串；title 保 raw 原值，右对齐 .ov-bar-val 既有
 数值列对齐口径不变） -->
          <span class="ov-bar-val mono" :title="idx['store.size']">{{ storeSizeText(idx['store.size']) }}</span>
        </div>
        <EmptyState v-if="!topBySize.length" compact :icon="HardDrive" text="暂无索引" hint="按存储占用排序需集群内有索引" />
      </div>

      <!-- 文档数 Top10。：同上款 .card 壳退役 → border-top 分节 -->
      <div class="ov-cell">
        <div class="card-t"><FileText :size="13" /> 文档数 Top 10</div>
        <div v-for="idx in topByDocs" :key="idx.index" class="ov-bar-row" role="button" tabindex="0" :aria-label="'查看索引 ' + idx.index" @click="goIndex(idx.index)" @contextmenu.prevent="openOvMenu($event, 'idx', idx)" @keydown="onOvKey($event, 'idx', idx)" data-row-nav @keydown.self="rowArrowNav">
          <span class="ov-bar-name mono" :title="idx.index">{{ idx.index }}</span>
          <div class="ov-bar-track">
            <div class="ov-bar-fill docs" :style="{ width: (Number(idx['docs.count']) / Number(topByDocs[0]['docs.count'] || 1) * 100) + '%' }"></div>
          </div>
          <span class="ov-bar-val mono">{{ fmtNum(idx['docs.count']) }}</span>
        </div>
        <EmptyState v-if="!topByDocs.length" compact :icon="FileText" text="暂无索引" hint="按文档数排序需集群内有索引" />
      </div>

      <!-- 健康分布。：同上款 .card 壳退役 → border-top 分节。
 ：原与「最近作业」同胞—— 差距 实锚「1600 档四列约定下
 3 胞令第 4 列整列空置」；拆胞后四列满编（两病同治=第 4 列空置 + 作业列被压 1/3 宽拥挤） -->
      <div class="ov-cell">
        <div class="card-t"><Activity :size="13" /> 健康分布</div>
        <div class="ov-health">
          <div v-for="h in healthDist" :key="h.name" class="ov-h-item" role="button" tabindex="0" :aria-label="'查看 ' + h.name + ' 索引清单'" @click="goHealth(h.name)" @contextmenu.prevent="openOvMenu($event, 'health', h)" @keydown="onOvKey($event, 'health', h)" data-row-nav @keydown.self="rowArrowNav" :title="'查看 ' + h.name + ' 索引清单'">
            <!-- 健康分布色点改用 MetaStrip dot 形态单源（DiagView dgMeta 先例）——
 .ov-h-dot 私造圆点退役，8px 圆点形态归组件 .ms-dot 单源（色值 h.color 直传） -->
            <MetaStrip :items="[{ dot: h.color }]" />
            <!-- ：裸英文（green/yellow/red）→ CLUSTER_HEALTH_ZH 单源中文主显
 （HealthReportView #cell-health 同源）；raw 枚举键仍在下钻与 title 内可检索 -->
            <span class="ov-h-name">{{ clusterHealthZh(h.name) || h.name }}</span>
            <span class="ov-h-n mono">{{ h.count }}</span>
          </div>
        </div>
        <div class="ov-health-bar">
          <div v-for="h in healthDist" :key="h.name" :style="{ width: h.pct + '%', background: h.color }"></div>
        </div>
      </div>

      <!-- 最近作业。 ：独立成胞（原为健康分布胞内的分节）——1600 四列第 4 胞满编；
 3 列区间（1101~1599）由 .ov-jobs 档整行横跨，避拆胞后孤悬次行左侧 -->
      <div class="ov-cell ov-jobs">
        <!-- W-F 口径同步更新：胞内分节档 .card-t.sm 升为胞头档 .card-t（与另三胞同语言） -->
        <div class="card-t"><History :size="13" /> 最近作业</div>
        <div v-if="!loaded">
          <div v-for="i in 3" :key="i" class="sk" style="height:28px;margin-bottom:var(--sp-2);border-radius:var(--r-m)"></div>
        </div>
        <div v-else-if="recentJobs.length">
          <!-- key 禁用 jobId——19 位雪花 long 曾被 JSON.parse 截断成重复值，keyed diff 失效导致
 每轮 5s 轮询整块重挂 + rise 动画重放（布局抖动）；indexKey 每索引一条、天然唯一且稳定 -->
          <div v-for="(j, i) in recentJobs" :key="j.indexKey" class="ov-job rise" :style="{ animationDelay: i * 45 + 'ms' }" role="button" tabindex="0" aria-label="前往托管重建" @click="goJob(j)" @contextmenu.prevent="openOvMenu($event, 'job', j)" @keydown="onOvKey($event, 'job', j)" data-row-nav @keydown.self="rowArrowNav" :title="j.indexKey">
            <!-- 状态徽标改用 StatusPill（中文主显 jobStatusZh + en 英文小字档组件化，
 英文小字类同步更新退役）。dot-pulse 呼吸点保留本地：StatusPill 无插槽不硬塞，
 点以兄弟元素随行渲染（） -->
            <span class="ov-job-st">
              <span v-if="j.status === 'RUNNING' || isActiveStage(j.stage)" class="dot-pulse"></span>
              <StatusPill :tone="jobTone(j.status)" :label="jobStatusZh(j.status) || j.status || '-'" :en="jobStatusZh(j.status) ? j.status : undefined" />
            </span>
            <span class="ov-job-key mono">{{ j.indexKey }}</span>
            <!-- 手写「:title=fmtTime + relTime(…, now)」合并 TimeCell 统一件
 （ 列内相对+悬浮绝对同构五处合并续账）；ov-job-time 锚类同步更新，孤儿 import
 （fmtTime/relTime/useNow/now）同步更新退役，相对时间心跳归组件内 useNow 单例 -->
            <TimeCell class="ov-job-time" :ts="j.updateTime || j.createTime" />
          </div>
        </div>
        <EmptyState v-else compact :icon="History" text="暂无作业记录" hint="作业由查询任务/重建等操作产生，执行后在此追踪" />
      </div>
    </div>

    <!-- 监控快照落库批④:多集群监控历史。服务端定时任务=唯一写入方(每分钟全集群探活快照落
 控制集群 ES esquerystudio_monitor 日期索引,双闸 90 天/30GB 环形),本区纯只读——页面轮询永不入库。
 筛选全量下推(集群/状态/时间范围),消费 /monitor-history(overview 页 apiPrefixes,VIEWER 只读) -->
    <div class="ov-cell ov-mh">
      <div class="card-t"><Activity :size="13" /> 集群监控历史
        <span class="ov-mh-sub">服务端定时快照 · 环形保留</span>
        <!-- 「上次自动」置于弹性占位条之前：提示出现/消失/变宽全部由占位条吸收，
 右侧动作组（实时监控/自动刷新/TSV/MD/刷新）钉在右缘零位移——占位条之后的行尾放置
 会被占位条放大成整组平移（真机量尺实测） -->
        <span v-if="mhMs > 0 && mhAutoAt" class="dim sm-txt" style="white-space:nowrap" title="上次自动刷新时间">上次自动 {{ fmtTime(mhAutoAt) }}</span>
        <span style="flex:1"></span>
        <!-- ③ 复盘收口（ Phase 0 最后一项活口）：运行时指标**入口**缺位补入口——
 两页分工约定定案：概览=历史回看+探活（/monitor-history），实时监控页=运行时指标（/live）；
 指标本体不搬防重复建设（G16「全站单源一致性」同族裁决） -->
        <button class="btn sm ghost" title="进入实时监控大屏：QPS / 写入 / Heap / CPU / 磁盘实时走势、节点对比、挂墙模式" @click="router.push('/live')"><Gauge :size="11" /> 实时监控</button>
        <!-- 自动刷新换档位统一件（原「自动」checkbox+写死 60s 退役）：关/10s/30s/60s 可选 -->
        <AutoRefreshSelect v-model:ms="mhMs" label="自动刷新（监控历史）" />
        <!-- 导出：TSV/MD 复制走 QRT getCsvBlock 单源（表头自动继承列名，所见即所复） -->
        <button class="btn sm ghost" :disabled="!mhRows.length" title="复制当前筛选结果为 TSV（Excel/飞书直贴）" @click="copyMonitorTsv">TSV</button>
        <button class="btn sm ghost" :disabled="!mhRows.length" title="复制当前筛选结果为 Markdown（群聊/工单直贴）" @click="copyMonitorMd">MD</button>
        <button class="btn sm ghost" :disabled="mhLoading" @click="loadHistory"><RotateCw :size="11" :class="{ spinning: mhLoading }" /> 刷新</button>
      </div>
      <div class="ov-mh-filters">
        <select v-model="mhConn" class="inp sm" aria-label="筛选集群" title="筛选集群">
          <option value="">全部集群</option>
          <option v-for="c in visibleConns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="mhStatus" class="inp sm" aria-label="筛选状态" title="筛选状态">
          <option value="">全部状态</option>
          <option v-for="o in MH_STATUS_OPTS" :key="o.v" :value="o.v">{{ o.label }}</option>
        </select>
        <select v-model="mhRange" class="inp sm" aria-label="时间范围" title="时间范围">
          <option value="1h">最近 1 小时</option>
          <option value="6h">最近 6 小时</option>
          <option value="24h">最近 24 小时</option>
          <option value="3d">最近 3 天</option>
          <option value="7d">最近 7 天</option>
          <option value="14d">最近 14 天</option>
        </select>
      </div>
      <div v-if="mhErr" role="alert" class="err-bar">
        监控历史加载失败：{{ mhErr }}
        <button class="btn xs" :disabled="mhLoading" @click="loadHistory">重试</button>
      </div>
      <!-- 健康摘要条：窗口内每集群采样数/RED 次数一眼可见（probeDigest 单源） -->
      <div v-if="mhDigest.length" class="ov-mh-digest">
        <span v-for="d in mhDigest" :key="d.name" class="ov-mh-digest-i"
          :title="`${d.name}：采样 ${d.total} 条 · RED ${d.reds} 次 · 最慢 ${d.worstMs ?? '-'} ms`">
          <b class="mono">{{ d.name }}</b>
          <span class="mono">{{ d.total }}</span>
          <span v-if="d.reds" class="ov-mh-red">RED {{ d.reds }}</span>
          <span v-if="d.worstMs != null" class="mono dim">{{ d.worstMs }}ms</span>
        </span>
      </div>
      <div v-if="mhLoading && !mhRows.length" class="sk" style="height:64px;border-radius:var(--r-m)"></div>
      <!-- 导出：TSV/MD 复制走 QRT getCsvBlock 单源（表头自动继承列名，所见即所复） -->
      <QueryResultTable v-if="mhRows.length" ref="mhQrt" :cols="MH_COLS" :rows="mhMatrix" sortable
        storage-key="overview:monitor-history" export-name="overview-monitor-history"
        max-height="380px">
        <template #cell-时间="{ value }"><TimeCell :ts="value" /></template>
        <template #cell-集群="{ value }"><span class="mono">{{ value }}</span></template>
        <template #cell-状态="{ value }"><StatusPill :tone="mhTone(String(value))" :label="clusterHealthZh(value) || String(value)" :title="String(value)" /></template>
        <template #cell-时延(ms)="{ value }"><span class="mono">{{ value === '-' ? '-' : value + ' ms' }}</span></template>
      </QueryResultTable>
      <EmptyState v-else-if="!mhLoading && !mhErr" compact :icon="History" text="暂无监控快照"
        hint="服务端定时任务每分钟落一轮全集群探活快照，产生后在此回看" />
    </div>
  </div>
  <CellContextMenu v-if="ovMenu" :x="ovMenu.x" :y="ovMenu.y" :title="ovMenuTitle"
    :items="ovMenuItems" @close="ovMenu = null" />
</template>

<script lang="ts">
/* ：溢出判定纯函数单源（+1 容差——亚像素取整抖动不误报「可滚」判定）。
 <script setup> 不能具名导出，按 SFC 双块惯例单列——spec 直采单源，不经组件实例
 （happy-dom 布局宽度恒 0，纯函数 + 类绑定才可测） */
export function evalTopoClip(sw: number, cw: number): boolean {
  return sw > cw + 1;
}
</script>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { useRouter } from 'vue-router';
import { HardDrive, FileText, Activity, History, Network, AlertOctagon, Gauge, RotateCw, Copy, Link2, ExternalLink } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：状态徽标统一件 */
import { api } from '../api';
import { probeDigest } from '../utils/monitorSeries';
import { useAppStore } from '../stores/app';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { useAuthStore } from '../stores/auth';
import { useLiveMonitorStore } from '../stores/liveMonitor';
import SkeletonBox from '../components/SkeletonBox.vue';
import TimeCell from '../components/TimeCell.vue'; /* ：作业时间列统一件合并 */
/* fmtTime/relTime 随 ov-job-time 改用 TimeCell 退役（本页再无直接消费） */
import { fmtTime, fmtNum, fmtNumCompact, statusColor, healthColor, splitSize, parseBytes, copyText } from '../utils/format';
import { matrixText } from '../utils/copyMatrix';
/* bytes 档位单源（Top10 存储值展示） */
import { semFormat } from '../composables/useSemFormat';
/* 最近作业状态枚举中文接线； ：健康词汇（KPI/健康分布/
 状态 pill/状态 option 四处）接 CLUSTER_HEALTH_ZH 单源，裸英文三形态归位（esEnumZh 只消费） */
import { jobStatusZh, clusterHealthZh } from '../utils/esEnumZh';
import { friendlyEsError } from '../utils/esError';
import { rowArrowNav } from '../utils/rowNav'; /* ：err-bar 三源 reason 裸拼人话化 */
import QueryResultTable from '../components/QueryResultTable.vue'; /* 监控历史表格内核 */
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue'; /* ：自动刷新档位统一件（监控历史） */
import { usePref } from '../composables/urlState'; /* 监控历史时间范围偏好 */
import { normalizePrefEnum } from '../utils/prefEnum';
import type { MonitorRow } from '../api'; /* 监控快照落库批④:读侧行类型 */

const router = useRouter();
const store = useAppStore();
const auth = useAuthStore();
/* 监控筛选只列授权连接：conn 模型下未授权连接名/host 不外泄（与 ClusterSwitcher 同源） */
const visibleConns = computed(() => store.conns.filter(c => auth.canSeeConn(c.id)));
const mon = useLiveMonitorStore(); // -D4：趋势序列来自全局常驻采样器

const overview = ref<any>(null);
const healthData = ref<any>(null);
const clusterHealth = ref<any>(null);
const loaded = ref(false);
const loadErr = ref('');
/* 巡查：主 load 在途 ref（err-bar 重试钮守卫；713 G51/748 G170 在途反馈族） */
const ovLoading = ref(false);

/* 非终态 stage 视为活动任务（终态含 DONE/FAIL/CANCEL/SUCCESS 等） */
const isActiveStage = (s: string) => !!s && !/DONE|FAIL|CANCEL|SUCCESS|COMPLETE/i.test(s);
/* 5s 进度轮询合并 useAutoRefresh（ Xmigrate 同款）——
 此前裸 setInterval 只挂 onBeforeUnmount，后台标签页/KeepAlive 失活照跑 */
const hasActiveJob = computed(() => (overview.value?.indices || [] as any[]).some((i: any) => i?.job && isActiveStage(i.job.stage)));
async function load() {
  /* 在途互斥闸：闸读收本体首行（执行闸族既有形态）——头部刷新钮与 5s 轮询
 tick 在慢拍在途窗内的叠加拍被闸挡（useAutoRefresh「跳过不补跑」契约语义），双拍
 并发回包交错落笔与进度位早熄（首拍 finally 复位次拍仍在途）随之消除 */
  if (ovLoading.value) return;
  /* 禁止静默吞错——失败记入错误条，轮询时不重复 toast 轰炸。
 三接口并行——此前串行 await，一个慢接口全体骨架陪跪；配合 api 层 60s 超时兜底，
 骨架屏最长停留 = 最慢单接口，永挂路径封死 */
  ovLoading.value = true;
  try {
    const errs: string[] = [];
    /* 权限类失败（403 或带 page/denied 归因）不参与首错 toast：无授权身份开屏时
       概览/健康/集群健康会一齐 403，逐条弹=轰炸（产线实报），而禁用屏与侧栏
       指引已在讲同一件事。真实故障（网络/超时/ES 错误）保持必弹。 */
    const toastErrs: string[] = [];
    const pushErr = (label: string, reason: unknown, gated: boolean) => {
      if (!gated) return;
      const r = reason as { status?: number; denied?: string; page?: string; message?: unknown } | null | undefined;
      const text = label + '：' + friendlyEsError(String(r?.message ?? reason));
      errs.push(text);
      const perm = r != null && (r.status === 403 || r.denied != null || r.page != null);
      if (!perm) toastErrs.push(text);
    };
    /* /overview 与 /health 恒定宿主：按宿主页授权逐接口判定，
       混合静态+连接授权时不再因 canSeeConn('host') 为真而误发 403。
       探测完成前照常发起——否则独立部署首屏会永远错过宿主概览。 */
    const canOverview = !auth.probed
      || auth.canEndpoint('write', 'GET', '/internal/es/index/overview', store.target);
    const canHealth = !auth.probed
      || auth.canEndpoint('write', 'GET', '/internal/es/index/health', store.target);
    /* 集群健康同门槛：无页面授权身份不发这段必 CONN_FORBIDDEN 的探测（空集=全拒
       时 canEndpoint 恒 false），有任意授权的连接用户照常探测 */
    const canClusterHealth = !auth.probed
      || auth.canEndpoint('write', 'GET', '/internal/es/index/cluster/health', store.target);
    const [ov, hd, ch] = await Promise.allSettled([
      canOverview ? api.overview() : Promise.resolve(null),
      canHealth ? api.health() : Promise.resolve(null),
      canClusterHealth ? api.clusterHealth() : Promise.resolve(null),
    ]);
    /* 三源 reason.message 裸拼 → friendlyEsError 单源翻译（前缀「概览接口/健康接口/
 集群健康」保留；obsWave560 BoostTuner w80 先例口径） */
    if (ov.status === 'fulfilled') overview.value = ov.value;
    else pushErr('概览接口', ov.reason, canOverview);
    if (hd.status === 'fulfilled') healthData.value = hd.value;
    else pushErr('健康接口', hd.reason, canHealth);
    if (ch.status === 'fulfilled') clusterHealth.value = ch.value; else pushErr('集群健康', ch.reason, canClusterHealth);
    const msg = errs.join('；');
    if (toastErrs.length && !loadErr.value && loaded.value === false) store.notify('error', '概览部分数据加载失败：' + toastErrs[0]);
    loadErr.value = msg;
    loaded.value = true;
    // 有活动任务时 5s 自动轮询，便于盯重建进度（ms getter 逐轮重估，任务终态即自然停）
    ovRefresher.restart();
  } finally {
    /* 巡查：allSettled 不抛也走 finally 复位（err-bar 重试钮守卫语义） */
    ovLoading.value = false;
  }
}
const ovRefresher = useAutoRefresh(load, {
  ms: () => (hasActiveJob.value ? 5000 : 0),
  guard: () => hasActiveJob.value,
});
ovRefresher.setOn(true);
onMounted(() => {
  if (!store.indices.length) store.loadIndices();
  load();
});
/* 卸载清理由 useAutoRefresh 内部 onBeforeUnmount 承担 */

const totalDocs = computed(() => store.indices.reduce((s, i) => s + (Number(i['docs.count']) || 0), 0));
const totalSize = computed(() => {
  // store.size 是文本（如 12.3mb），粗略累加 mb
  return store.indices.reduce((s, i) => s + parseSize(i['store.size']), 0);
});
function parseSize(s: string): number {
  const m = String(s || '').match(/^([\d.]+)(b|kb|mb|gb|tb)$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12 };
  return n * (mult[unit] || 0);
}
/* store.size 裸 ES 串（'12.3mb'）→ 单源 bytes 档（semFormat 只吃数字，
 parseBytes 先归一；不可解析回落原串不丢信息）；title 侧调用方保 raw */
function storeSizeText(v: any): string {
  return semFormat(parseBytes(v), 'bytes')?.text ?? String(v ?? '-');
}
function fmtBytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + ' ' + u[i];
}
/* 规则B 数字单一语言：存储值拆 num+unit 渲染，单位独立弱化（对齐 IndexHub splitSize 范式） */
const storeSizeFmt = computed(() => splitSize(fmtBytes(totalSize.value)));

/* KPI 数字滚动动画 */
function useCountUp(target: () => number, dur = 700) {
  const display = ref(0);
  let raf = 0;
  watch(target, (v) => {
    cancelAnimationFrame(raf);
    const from = display.value;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      display.value = Math.round(from + (v - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }, { immediate: true });
  onUnmounted(() => { cancelAnimationFrame(raf); });
  return display;
}
const idxCountAnim = useCountUp(() => store.indices.length);
const docCountAnim = useCountUp(() => totalDocs.value);

const kpis = computed(() => [
  /* to=下钻目标（联动轴）——索引数→索引工作区、总文档→数据浏览器、
 总存储→拓扑（节点存储分布）、集群状态→一键体检 */
  { label: '索引数', value: fmtNum(idxCountAnim.value), sub: '非系统索引', tip: '', trend: [] as number[], trendColor: '', trendTip: '', to: '/indices' },
  /* 亿级文档数千分位在 866px iframe 的 KPI 卡里必被裁（实测 cw112/sw158）——
 主值用量级一眼可读，精确值下沉到副文案 + title */
  { label: '总文档', value: fmtNumCompact(docCountAnim.value), sub: fmtNum(totalDocs.value) + ' docs', tip: fmtNum(totalDocs.value), trend: mon.indexRateSeries, trendColor: 'var(--ac)', trendTip: '写入速率趋势（全局采样窗口）', to: '/browser' },
  { label: '总存储', value: storeSizeFmt.value.num, unit: storeSizeFmt.value.unit, sub: 'store.size 合计', tip: '', trend: [] as number[], trendColor: '', trendTip: '', to: '/topology' },
  /* ：KPI 集群状态裸英文（小写 green）→ CLUSTER_HEALTH_ZH 单源中文主显；
 raw 枚举（大写）下沉 tip 保检索（MetaStrip tip 兜底，信息不丢） */
  { label: '集群状态', value: clusterHealthZh(clusterHealth.value?.status) || clusterHealth.value?.status || '-', color: healthColor(clusterHealth.value?.status || ''), sub: `${clusterHealth.value?.number_of_nodes ?? '-'} 节点`, tip: String(clusterHealth.value?.status || '').toUpperCase(), trend: mon.heapSeries, trendColor: 'var(--dv-violet)', trendTip: '节点平均堆使用率趋势', to: '/health-report' },
]);

/* KPI 元信息串（MetaStrip 统一件）：原 color 直涂值色映射 tone 三档（healthColor 语义），
 副文案/精确值/趋势说明/下钻提示全量组装进 item tip 兜底（原 :title 拼装保留），to 仍可点击下钻 */
const kpiMeta = computed<MetaStripItem[]>(() => kpis.value.map(k => ({
  label: k.label,
  value: k.value,
  unit: k.unit,
  tone: k.color === 'var(--ok)' ? 'ok' : k.color === 'var(--warn)' ? 'warn' : k.color === 'var(--err)' ? 'err' : undefined,
  tip: k.label + ' ' + k.value + (k.sub ? ' · ' + k.sub : '') + (k.tip ? ' · ' + k.tip : '') + (k.trendTip ? ' · ' + k.trendTip : '') + (k.to ? ' · 查看' + k.label + '详情（' + k.to + '）' : ''),
  to: k.to,
})));

const topBySize = computed(() =>
  store.indices.map(i => ({ ...i, _sizeN: parseSize(i['store.size']) }))
    .sort((a, b) => b._sizeN - a._sizeN).slice(0, 10)
);
const topByDocs = computed(() =>
  [...store.indices].sort((a, b) => Number(b['docs.count'] || 0) - Number(a['docs.count'] || 0)).slice(0, 10)
);

const healthDist = computed(() => {
  const c = { green: 0, yellow: 0, red: 0 };
  store.indices.forEach(i => { const h = (i.health || 'green') as keyof typeof c; if (h in c) c[h]++; });
  const total = Math.max(1, store.indices.length);
  return [
    { name: 'green', count: c.green, color: 'var(--ok)', pct: (c.green / total) * 100 },
    { name: 'yellow', count: c.yellow, color: 'var(--warn)', pct: (c.yellow / total) * 100 },
    { name: 'red', count: c.red, color: 'var(--err)', pct: (c.red / total) * 100 },
  ];
});

const stuckJobs = computed(() => healthData.value?.stuckJobs || []);

/* statusColor 档名直传 StatusPill——其返回域即 pill 五主档，本包装仅做
 类型窄化（utils/format 不归文件面，不改其签名），逻辑零重复 */
function jobTone(s: any): 'g' | 'y' | 'r' | 'b' | 'n' {
  return statusColor(s) as 'g' | 'y' | 'r' | 'b' | 'n';
}
/* 实时预警集合（集群状态 / pending tasks / unassigned shards / stuck jobs）
 sev 档名统一——原自造 w（info 级）档退役并入 y，对齐全站 pill 五主档档名；
 初始化/重定位分片原 w 档随之走黄档（色值 --wn 同 token，展示等价）*/
interface Alert { k: string; t: string; s: 'r' | 'y' }
const alerts = computed<Alert[]>(() => {
  const out: Alert[] = [];
  const ch: any = clusterHealth.value;
  if (ch) {
    /* 信噪比：red=主分片不可用（事故）；yellow 仅多数据节点才告警（单节点副本
 无处放置属拓扑常态，不进预警条）；未分配数并入对应状态条目的严重度，不再一律标红 */
    const multiData = (ch.number_of_data_nodes ?? 0) > 1;
    /* ：预警条主体裸英文（RED/YELLOW 大写形态）→ CLUSTER_HEALTH_ZH 单源中文
 主体 + 原枚举括注（「待处理任务 N（pending tasks）」同语言约定） */
    if (ch.status === 'red') out.push({ k: 'st', t: `集群状态 ${clusterHealthZh('red')}（RED）· 未分配分片 ${ch.unassigned_shards ?? 0}`, s: 'r' });
    else if (ch.status === 'yellow' && multiData) out.push({ k: 'st', t: `集群状态 ${clusterHealthZh('yellow')}（YELLOW）· 副本未分配 ${ch.unassigned_shards ?? 0}`, s: 'y' });
    if ((ch.initializing_shards ?? 0) > 0) out.push({ k: 'in', t: `初始化分片 ${ch.initializing_shards}`, s: 'y' });
    if ((ch.relocating_shards ?? 0) > 0) out.push({ k: 're', t: `重定位分片 ${ch.relocating_shards}`, s: 'y' });
    /* 'Pending Tasks N' → 中文主体 + 原词汇括注（显示层改用，枚举词汇不丢） */
    if ((ch.number_of_pending_tasks ?? 0) > 0) out.push({ k: 'pt', t: `待处理任务 ${ch.number_of_pending_tasks}（pending tasks）`, s: 'y' });
    /* 队列等待裸 ms → semFormat duration 单源人话化（异常回落原 toFixed 秒档） */
    if ((ch.task_max_waiting_in_queue_millis ?? 0) > 30_000) out.push({ k: 'wq', t: `任务队列等待 ${semFormat(ch.task_max_waiting_in_queue_millis, 'duration')?.text ?? ((ch.task_max_waiting_in_queue_millis / 1000).toFixed(0) + 's')}`, s: 'y' });
  }
  if (stuckJobs.value.length) out.push({ k: 'sj', t: `卡死作业 ${stuckJobs.value.length}`, s: 'r' });
  return out;
});
const alertSev = computed(() => {
  if (alerts.value.some(a => a.s === 'r')) return 'r';
  return 'y';
});

/* 迷你拓扑：抽样加载 shards 分布 */
const topoShards = ref<any[]>([]);
const topoLoading = ref(false);
async function loadTopo() {
  topoLoading.value = true;
  try {
    const list = await api.shards();
    topoShards.value = Array.isArray(list) ? list : [];
  } catch { topoShards.value = []; }
  finally { topoLoading.value = false; }
}
onMounted(loadTopo);

const topoNodes = computed(() => {
  const byNode = new Map<string, { node: string; shards: number; primary: number; replica: number; unassigned: number }>();
  for (const s of topoShards.value) {
    const key = s.state === 'UNASSIGNED' ? '__UNASSIGNED__' : (s.node || '__UNASSIGNED__');
    let g = byNode.get(key);
    if (!g) { g = { node: key, shards: 0, primary: 0, replica: 0, unassigned: 0 }; byNode.set(key, g); }
    g.shards++;
    if (s.state === 'UNASSIGNED') g.unassigned++;
    else if (s.prirep === 'p') g.primary++;
    else g.replica++;
  }
  return Array.from(byNode.values())
    .filter(g => g.node !== '__UNASSIGNED__')
    .sort((a, b) => b.shards - a.shards)
    .slice(0, 6)
    .map(g => {
      const t = Math.max(1, g.shards);
      return { ...g, segs: [
        { pct: (g.primary / t) * 100, color: 'var(--ac)' },
        { pct: (g.replica / t) * 100, color: 'var(--ac)' },
        { pct: (g.unassigned / t) * 100, color: 'var(--err)' },
      ] };
    });
});
const topoTotalShards = computed(() => topoShards.value.length);
const topoUnassigned = computed(() => topoShards.value.filter(s => s.state === 'UNASSIGNED').length);
/* 未分配是否异常——red 恒异常；否则仅多数据节点异常（单节点副本无处放置为常态） */
const topoUaAbnormal = computed(() => {
  if (!topoUnassigned.value) return false;
  const ch: any = clusterHealth.value;
  return ch?.status === 'red' || (ch?.number_of_data_nodes ?? 0) > 1;
});
const topoRelocating = computed(() => topoShards.value.filter(s => s.state === 'RELOCATING').length);
/* ：节点条横向溢出（放不下）→ topoClip 亮出右缘渐隐「可横滚」暗示（渐变只压最右 40px）。
 检测时点三路：onMounted 同步首检 / watch(topoNodesEl)——shards 异步到达晚于 onMounted，
 v-if 挂绑即补检（否则首屏判定恒 false）/ window resize 伸缩重判（onUnmounted 清理） */
const topoNodesEl = ref<HTMLElement | null>(null);
const topoClip = ref(false);
function syncTopoClip() {
  const el = topoNodesEl.value;
  topoClip.value = !!el && evalTopoClip(el.scrollWidth, el.clientWidth);
}
watch(topoNodesEl, syncTopoClip);
onMounted(() => {
  syncTopoClip();
  window.addEventListener('resize', syncTopoClip);
});
onUnmounted(() => { window.removeEventListener('resize', syncTopoClip); });
function shortName(n: string): string {
  if (!n) return '?';
  return n.length > 14 ? n.slice(0, 12) + '…' : n;
}
/* overview.indices[] 每项是 status() 快照（含最新 job map），按 updateTime 倒序取 6 */
const recentJobs = computed(() => {
  const items: any[] = overview.value?.indices || [];
  return items
    .filter(i => i && i.job)
    .map(i => ({ indexKey: i.indexKey, ...i.job }))
    .sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0))
    .slice(0, 6);
});

/* -13：Ops 操作台已退役，改进「托管重建」。这里只有 indexKey，而 AdhocRebuildView 收的
 ?index= 是索引名/别名 —— 语义不同，硬塞会预填出一个查不到的名字，故不带参进页。 */
function goJob(_j: any) {
  router.push('/adhoc-rebuild');
}

/* IA：索引名点击统一进索引工作区（原跳 /browser 已降为工作区内的一个动作） */
function goIndex(idx: string) {
  store.pick(idx);
  router.push({ path: '/indices', query: { idx } });
}

/* 健康分布计数可点——跳索引工作区并带上 health 过滤（工作区侧 healthF 是 URL 状态） */
function goHealth(name: string) {
  router.push({ path: '/indices', query: { health: name } });
}

/* 概览行右键/菜单键：索引排行、健康分布、最近作业各自的高频动作 + 复制；
   Enter/Space 仍走原主操作，菜单键/右键开共享菜单。 */
type OvKind = 'idx' | 'health' | 'job';
const ovMenu = ref<{ x: number; y: number; kind: OvKind; data: any } | null>(null);
const ovMenuTitle = computed(() => {
  const m = ovMenu.value;
  if (!m) return '';
  if (m.kind === 'idx') return `索引 · ${m.data.index}`;
  if (m.kind === 'health') return `健康分布 · ${clusterHealthZh(m.data.name) || m.data.name}`;
  return `最近作业 · ${m.data.indexKey}`;
});
const ovMenuItems = computed<CcmItem[]>(() => {
  const m = ovMenu.value;
  if (!m) return [];
  const origin = window.location.origin + window.location.pathname;
  if (m.kind === 'idx') {
    return [
      { key: 'ov-open-idx', label: '打开索引工作区', icon: ExternalLink, run: () => goIndex(m.data.index) },
      {
        key: 'ov-copy-idx', label: '复制…', icon: Copy, children: [
          { key: 'ov-copy-idx-name', label: '复制索引名', icon: Copy, run: () => copyOv(m.data.index, '索引名') },
          { key: 'ov-copy-idx-link', label: '复制深链', icon: Link2, run: () => copyOv(origin + '#/indices?idx=' + encodeURIComponent(m.data.index), '深链') },
        ],
      },
      { key: 'ov-open-browser', label: '在数据浏览器打开', icon: ExternalLink, run: () => { void router.push({ path: '/browser', query: { idx: m.data.index } }); } },
    ];
  }
  if (m.kind === 'health') {
    return [
      { key: 'ov-open-health', label: '查看该健康索引清单', icon: ExternalLink, run: () => goHealth(m.data.name) },
      {
        key: 'ov-copy-health', label: '复制…', icon: Copy, children: [
          { key: 'ov-copy-health-name', label: '复制健康状态', icon: Copy, run: () => copyOv(m.data.name, '健康状态') },
          { key: 'ov-copy-health-link', label: '复制深链', icon: Link2, run: () => copyOv(origin + '#/indices?health=' + encodeURIComponent(m.data.name), '深链') },
        ],
      },
    ];
  }
  const statusItems: CcmItem[] = m.data.status
    ? [{ key: 'ov-copy-job-status', label: '复制状态', icon: Copy, run: () => copyOv(m.data.status, '状态') }]
    : [];
  return [
    { key: 'ov-open-job', label: '去托管重建', icon: ExternalLink, run: () => goJob(m.data) },
    {
      key: 'ov-copy-job', label: '复制…', icon: Copy, children: [
        { key: 'ov-copy-job-key', label: '复制 indexKey', icon: Copy, run: () => copyOv(m.data.indexKey, 'indexKey') },
        ...statusItems,
      ],
    },
  ];
});
function copyOv(text: string, label: string) {
  void copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? `已复制${label}` : '复制失败'));
}
function openOvMenu(e: MouseEvent, kind: OvKind, data: any) {
  ovMenu.value = { x: e.clientX, y: e.clientY, kind, data };
}
function onOvKey(e: KeyboardEvent, kind: OvKind, data: any) {
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    ovMenu.value = { x: r.left + 12, y: r.bottom, kind, data };
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (kind === 'idx') goIndex(data.index);
    else if (kind === 'health') goHealth(data.name);
    else goJob(data);
  }
}

/* ═══ 监控快照落库批④：集群监控历史（本区纯只读——服务端定时任务是唯一写入方） ═══ */
const MH_COLS = ['时间', '集群', '环境', '状态', '时延(ms)', '版本', '错误'];
/* ：状态筛选选项文案走 CLUSTER_HEALTH_ZH 单源（中文主显 + 原枚举括注，
 「待处理任务 N（pending tasks）」同语言约定）；option value 仍是服务端枚举契约 */
const MH_STATUS_OPTS = ['GREEN', 'RED'].map(v => ({ v, label: `${clusterHealthZh(v)}（${v}）` }));
/* 观察口径按集群——监控历史默认筛选当前所选集群（可切换/清空看全部）。
 纠错：`mhConn` 的语义是**连接 id**——option 是 `:value="c.id"`，同一个值又下推
 `api.monitorHistory({ connId })`；原初始化却写 `?.name`，于是选中远程集群时没有任何 option 命中，
 原生 select 渲染为**空白**（实报「这个不显示选中」），同时把实名当 connId 下推服务端。
 现改 id 语义；并补「target 须在连接档案内」守卫——已删/失联的 target 不再落回同一空白坑
 （回落「全部集群」）；连接档案异步到达时跟随（与 LiveDashboardView 同律：切换器换集群
 重新跟随，同 target 内用户手改不回弹）。 */
const mhConn = ref('');
const mhConnOfTarget = computed(() => (visibleConns.value.some(c => c.id === store.target) ? store.target : ''));
watch(mhConnOfTarget, (id) => { if (id) mhConn.value = id; }, { immediate: true });
const mhStatus = ref('');
/* 大盘联动：与 LiveDashboardView 历史趋势共享同一偏好键——一处改档两处同步 */
/* 2.1.4：存量非法档归一——坏值不再原样作为 range 参数请求监控历史 */
const MH_RANGE_KEYS = ['1h', '6h', '24h', '3d', '7d', '14d'] as const;
const mhRangePref = usePref<string>('live.histRange', '24h');
const mhRange = computed<typeof MH_RANGE_KEYS[number]>({
  get: () => normalizePrefEnum(mhRangePref.value, MH_RANGE_KEYS, '24h'),
  set: v => { mhRangePref.value = v; },
});
/* 自动刷新换 AutoRefreshSelect 档位统一件：间隔走 usePref 落盘（关/10s/30s/60s，重进页面还原）；
 旧布尔键一次性迁移（true→60s），旧键退役不清除（urlState 历史遗留键同口径） */
const legacyAuto = usePref<boolean>('overview.mhAuto', false);
const mhMs = usePref<number>('overview.mhAutoMs', legacyAuto.value ? 60000 : 0);
const mhAutoAt = ref<number | null>(null); /* ：自动刷新 tick 时间戳（可视反馈） */
const mhRows = ref<MonitorRow[]>([]);
const mhQrt = ref<InstanceType<typeof QueryResultTable> | null>(null);
const mhLoading = ref(false);
const mhErr = ref('');
const MH_RANGE_MS: Record<string, number> = { '1h': 3.6e6, '6h': 2.16e7, '24h': 8.64e7, '3d': 2.592e8, '7d': 6.048e8, '14d': 1.2096e9 };
async function loadHistory() {
  /* 筛选源快照比对——watch 直调与自动刷新双触发源可并发，旧筛选迟到回包
 不得顶掉新筛选数据（失败支 err 位与 finally 复位同口径） */
  const conn = mhConn.value, status = mhStatus.value, range = mhRange.value;
  mhLoading.value = true; mhErr.value = '';
  try {
    const fromMs = Date.now() - (MH_RANGE_MS[range] ?? MH_RANGE_MS['24h']);
    const res = await api.monitorHistory({
      connId: conn || undefined, status: status || undefined,
      fromMs, size: 200,
    });
    if (conn !== mhConn.value || status !== mhStatus.value || range !== mhRange.value) return;
    /* 连接隔离由后端行级完成（含只有 connName 的历史行）；前端仅在行带 connId 时复核，
       不能把缺失 connId 的行一律当宿主——那会误删已授权连接的记录。 */
    mhRows.value = (res.records || []).filter((r: any) => !r.connId || auth.canSeeConn(r.connId));
  } catch (e: any) {
    if (conn !== mhConn.value || status !== mhStatus.value || range !== mhRange.value) return;
    /* 权限类失败（403/带 page·denied 归因）走区块空态而非错误条：无授权身份进概览时
       监控历史必 403，「加载失败+重试」是对着拒绝屏再喊一遍（产线实报）；真实故障照常报错 */
    const perm = e != null && (e.status === 403 || e.denied != null || e.page != null);
    mhErr.value = perm ? '' : friendlyEsError(String(e?.message ?? e));
  } finally {
    if (conn === mhConn.value && status === mhStatus.value && range === mhRange.value) {
      mhLoading.value = false;
    }
  }
}

/* 导出：TSV/MD 复制走 QRT getCsvBlock 单源（表头自动继承列名，所见即所复） */
async function copyMonitorTsv() {
  const blk = mhQrt.value?.getCsvBlock();
  if (!blk || !blk.rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const head = blk.head;
  const ok = await copyText(matrixText({ rows: blk.rows, cols: head, getVal: (row: any[], c: string) => row[head.indexOf(c)] }, 'tsv'));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${blk.rows.length} 条监控快照（TSV）` : '复制失败');
}

async function copyMonitorMd() {
  const blk = mhQrt.value?.getCsvBlock();
  if (!blk || !blk.rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const head = blk.head;
  const md = [
    '| ' + head.join(' | ') + ' |',
    '| ' + head.map(() => '---').join(' | ') + ' |',
    ...blk.rows.map(r => '| ' + head.map(c => String(r[head.indexOf(c)] ?? '')).join(' | ') + ' |'),
  ].join('\n');
  const ok = await copyText(md);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${blk.rows.length} 条监控快照（Markdown）` : '复制失败');
}

/* 健康摘要条：窗口内每集群 RED 次数/采样总数/最慢时延一眼可见（probeDigest 单源） */
const mhDigest = computed(() => probeDigest(mhRows.value as any));
const mhMatrix = computed(() => mhRows.value.map(r => [
  r.timestamp, r.connName || r.connId || '-', r.env || '-', r.status || 'UNKNOWN',
  r.latencyMs ?? '-', r.esVersion || '-', r.error || '',
]));
function mhTone(s: string): 'g' | 'r' | 'n' { return s === 'GREEN' ? 'g' : s === 'RED' ? 'r' : 'n'; }
/* 筛选变化即重查；自动刷新档位（AutoRefreshSelect 统一件，useAutoRefresh 统一停续：
 后台标签页/KeepAlive 失活不空转）。refresher 捕获 + setOn 接线（DiagView diagRefresher
 同型）——实例被丢弃时内部 on 恒 false，interval 永不创建，档位选择成空摆设。
 间隔=档位值（0=关）：切换→即刷+重启（restart 通道 DiagView 同型），选关→停表 */
watch([mhConn, mhStatus, mhRange], () => { void loadHistory(); });
const mhRefresher = useAutoRefresh(() => { mhAutoAt.value = Date.now(); void loadHistory(); }, { ms: () => mhMs.value });
watch(mhMs, (v) => { if (v) void loadHistory(); mhRefresher.restart(); });
mhRefresher.setOn(true);
onMounted(loadHistory);
</script>

<style scoped>
.ov { display: flex; flex-direction: column; gap: var(--sp-4); }

/* KPI 大卡墙退役后的 inline 元信息串（MetaStrip 统一件；本视图只承担落位间距） */
.ov-strip { margin-top: 5px; }

/* 页面级加载错误条。：ov-loaderr/ov-stuck 手写红壳退役合并 err-bar
 单源（theme.css .err-bar 档：bg/border/radius/word-break 全归基座）；ov-stuck warn 语义档
 视图侧覆写（红→黄 token 换色，err-bar 基座布局零动） */
.ov-stuck { background: var(--warn-soft); border-color: var(--warn-line); color: var(--warn); }

/* 预警条。：摘全局 .card 类（约定④）——sev 色带（语义边框豁免）由本类
 自持：bg/border 本就自带，card 供出的 radius 补记回本类（视觉零变动） */
.ov-alerts {
  display: flex; gap: var(--sp-3); align-items: center; padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--bd); border-radius: var(--r-l);
}
/* 预警条 w 档三条死规则随档名统一退役（并入 y 黄档，--wn 同 token 展示等价） */
.ov-alerts.sev-r { border-color: color-mix(in oklab, var(--err) 55%, var(--bd)); background: color-mix(in oklab, var(--err) 6%, var(--bg1)); }
.ov-alerts.sev-y { border-color: color-mix(in oklab, var(--wn) 55%, var(--bd)); background: color-mix(in oklab, var(--wn) 6%, var(--bg1)); }
.ov-alerts-ic { flex-shrink: 0; }
.ov-alerts.sev-r .ov-alerts-ic { color: var(--err); }
.ov-alerts.sev-y .ov-alerts-ic { color: var(--wn); }
.ov-alerts-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-1); }
.ov-alerts-hd { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); color: var(--tx0); }
.ov-alerts-cnt { color: var(--tx2); font-size: var(--fs-xs); }
.ov-alerts-list { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-3); }
.ov-alerts-i { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx1); }
.ov-alerts-i .ov-alerts-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--tx2); }
/* W8：严重告警点辉光收 --glow-m 档（几何 token + 语义色追加，theme.css glow 段注释） */
.ov-alerts-i.sev-r .ov-alerts-dot { background: var(--err); box-shadow: var(--glow-m) var(--err); animation: pulseDot 1.4s ease-in-out infinite; }
.ov-alerts-i.sev-y .ov-alerts-dot { background: var(--wn); }
.ov-alerts-act { display: flex; gap: var(--sp-2); flex-shrink: 0; }
@keyframes pulseDot { 0%,100% { opacity: .55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.4); } }

/* minmax(0,1fr) 防 grid 子项 min-content 撑爆容器（窄窗口右列被裁切+横向滚动） */
.ov-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); align-items: start; }
/* 三张顶层 .card 壳退役 → border-top 分节（约定④；原卡 padding 14px var(--sp-4)
 等值迁入，盒模型零变动）；空态 EmptyState 直贴不留整块空框 */
.ov-cell { border-top: 1px solid var(--border); padding: 14px var(--sp-4); }

/* 监控快照落库批④：集群监控历史分区（border-top 分节同 ov-cell 语言；标题行/筛选行两行制——
 单行混排曾把 card-t 标题挤成竖排列，筛选独占一行后标题恒有自然宽度） */
.ov-mh { display: flex; flex-direction: column; gap: var(--sp-3); }
.ov-mh .card-t { display: flex; align-items: center; gap: var(--sp-2); }
.ov-mh .card-t .ov-mh-sub { white-space: nowrap; }
.ov-mh-filters { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
/* 健康摘要条：集群采样/RED 计数 chips（RED>0 挂 --err 暖标） */
.ov-mh-digest { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-2); margin-bottom: var(--sp-2); }
.ov-mh-digest-i { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-2xs); background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-s); padding: var(--sp-0) var(--sp-2); }
.ov-mh-digest-i .mono { color: var(--tx1); }
.ov-mh-digest-i .dim { color: var(--tx2); }
.ov-mh-red { color: var(--err); font-weight: 600; }
/* ：筛选三件此前逐行满宽堆叠（theme.css `.inp` 全局 width:100% + 本容器无
 宽度约束 → 每件独占一行，三件吃 ~430px 纵向）——容器级宽度约束归位：显式宽度档 + 保底
 min-width，同行横排、窄屏随 wrap 自然换行（178px 为刻意值，按 --sp 合并约定豁免） */
.ov-mh-filters .inp { width: auto; flex: 0 1 178px; min-width: 150px; }
.ov-mh-sub { font-weight: 400; font-size: var(--fs-xs); color: var(--tx2); }
/* 大屏 1600 档四列——2K 或带侧栏 1920 宽下卡墙不再留大片空白（小屏断点见文件尾） */
@media (min-width: 1600px) {
  .ov-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
/* ：拆胞后 3 列区间（1101~1599）4 胞会余 1 胞孤悬次行左侧——「最近作业」
 整行横跨（同时治作业列在此区间被压成 1/3 宽的拥挤）。1600 档四列满编 / ≤1100 两列 2×2 /
 ≤900 单列，均不命中本档（1101 为 1100 上限的补集，与既有断点无缝隙无重叠） */
@media (min-width: 1101px) and (max-width: 1599px) {
  .ov-jobs { grid-column: 1 / -1; }
}
.ov-bar-row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-1) 0; cursor: pointer; border-radius: var(--r-xs); }
.ov-bar-row:hover .ov-bar-name { color: var(--ac-hi); }
.ov-bar-name { flex: 0 1 180px; min-width: 60px; font-size: var(--fs-xs); color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-bar-track { flex: 1; height: 6px; background: var(--bg2); border-radius: 3px; overflow: hidden; }
.ov-bar-fill { height: 100%; background: linear-gradient(90deg, var(--ac), var(--dv-violet)); border-radius: 3px; transition: width 400ms ease-out; }
.ov-bar-fill.docs { background: linear-gradient(90deg, var(--info), var(--ac)); }
.ov-bar-val { min-width: 56px; text-align: right; font-size: var(--fs-xs); color: var(--tx1); flex-shrink: 0; }

.ov-health { display: flex; gap: var(--sp-4); margin-bottom: var(--sp-2); }
.ov-h-item { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); cursor: pointer; padding: var(--sp-0) var(--sp-2); margin: 0 calc(-1 * var(--sp-2)); border-radius: var(--r-s); }
.ov-h-item:hover { background: var(--bg2); }
.ov-h-item:hover .ov-h-name { color: var(--ac-hi); }
/* .ov-h-dot 私造圆点随 MetaStrip dot 形态单源退役（bw-hdot 四胞之一，
 DiagView dgMeta 先例；8px 圆点归组件 .ms-dot 单源） */
.ov-h-name { color: var(--tx1); }
.ov-h-n { font-weight: 600; }
.ov-health-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--bg2); }
.ov-health-bar > div { transition: width 400ms ease-out; }

.ov-job { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-1) var(--sp-2); font-size: var(--fs-sm); cursor: pointer; border-radius: var(--r-xs); }
.ov-job:hover { background: var(--bg2); }
.ov-job:hover .ov-job-key { color: var(--ac-hi); }
.ov-job-key { flex: 1; color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 状态枚举英文小字规则随 StatusPill 改用退役（en 档归组件 .sp-en 单源）；
 呼吸点+胶囊同行容器（组件无插槽，dot-pulse 保留本地以兄弟元素渲染——） */
.ov-job-st { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; }
.ov-job-time { font-size: var(--fs-xs); color: var(--tx2); }

/* 迷你分布式拓扑条。：.card 壳退役（约定④）→ border-top 分节 hairline；
 本类 padding（var(--sp-3) var(--sp-4)）原样自持零触 */
.ov-topo { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border); cursor: pointer; transition: transform var(--tr), box-shadow var(--tr); }
.ov-topo:hover { transform: translateY(-1px); box-shadow: var(--shadow-m); }
.ov-topo-l { display: flex; flex-direction: column; gap: var(--sp-0); min-width: 130px; }
.ov-topo-title { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); font-weight: 650; color: var(--tx0); }
.ov-topo-sub { font-size: var(--fs-xs); color: var(--tx2); }
/* ：节点条包裹层——承接原 .ov-topo-nodes 的 flex:1/min-width:0 并作 fade 绝对定位锚
 （检查结论：.ov-topo 直挂 right:0 会压住 .ov-topo-r KPI 违「暗示非遮挡」，.ov-topo 无需
 position:relative，由 wrapper 承接；节点条自身盒模型零触）。fade 右缘 40px 渐变终点色=
 分区所在页面底色 --bg0（554 扁平化后本区无自绘底），pointer-events:none 不挡点击/滚轮 */
.ov-topo-nodes-wrap { position: relative; flex: 1; min-width: 0; }
.ov-topo-nodes { display: flex; gap: var(--sp-2); overflow-x: auto; padding: var(--sp-0) 0; }
.ov-topo-fade {
  position: absolute; top: 0; bottom: 0; right: 0; width: 40px;
  pointer-events: none;
  background: linear-gradient(to right, transparent, var(--bg0));
}
.ov-topo-node { display: flex; align-items: center; gap: var(--sp-2); padding: 3px var(--sp-2); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-l); min-width: 180px; }
.ov-topo-node-name { font-size: var(--fs-xs); color: var(--tx1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px; }
.ov-topo-bar { flex: 1; height: 6px; background: var(--bg1); border-radius: 3px; overflow: hidden; display: flex; }
.ov-topo-seg { height: 100%; transition: width 400ms ease-out; }
.ov-topo-node-cnt { font-size: var(--fs-xs); color: var(--tx2); min-width: 22px; text-align: right; }
.ov-topo-empty { flex: 1; display: flex; gap: var(--sp-2); align-items: center; padding: var(--sp-2) 0; color: var(--tx2); font-size: var(--fs-xs); }
.ov-topo-r { display: flex; gap: var(--sp-3); padding-left: var(--sp-2); border-left: 1px solid var(--line); }
.ov-topo-kpi { display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 40px; }
.ov-topo-kpi-l { font-size: var(--fs-xs); color: var(--tx2); text-transform: uppercase; letter-spacing: .04em; }
/* 13px/650 并档卡头档；mono+tabular 由全局 .meta-num b 承担（模板已挂 meta-num） */
.ov-topo-kpi b { font-size: var(--fs-md); color: var(--tx0); font-weight: 650; }

/* 响应式断点——iframe 实测 866px 下 3 列卡内宽仅 ~160px（Top10 行 cw164/sw180 溢出），
 降列而不是硬挤；900 以下 KPI 也收 2 列，拓扑条副文案让位 */
@media (max-width: 1100px) {
  .ov-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .ov-grid { grid-template-columns: minmax(0, 1fr); }
  .ov-topo-sub { display: none; }
  .ov-topo-l { min-width: 0; }
}
</style>
