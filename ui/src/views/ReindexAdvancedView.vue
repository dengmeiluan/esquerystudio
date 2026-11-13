<template>
  <div class="ra-page">
    <!-- 只读身份的前置说明：写钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps" class="ra-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：高级重建的提交/重试不可用；需要 reindex 写权限。
    </div>
    <div class="ra-hd">
      <PageHeader :icon="Wand2" title="Reindex 高级自定义" subtitle="跨集群 / 自由 body / 全参数开放 — 高级用户模式，不强制幂等">
      <template #actions>
<!-- 草稿恢复徽标（DraftBadge 统一件，接入形态同 AdhocRebuildView）——挂载时恢复非默认表单稿才显示 -->
<DraftBadge v-if="draftRestored" @clear="formDraft.clear" />
<button class="btn ghost sm" @click="showBody = !showBody">
  <Code2 :size="12" /> {{ showBody ? '收起 body' : '展开原始 body' }}
</button>
<button class="btn ghost sm" @click="favorite" title="收藏当前配置">
  <Star :size="12" /> 收藏
</button>
      </template>
      </PageHeader>
</div>

    <!-- 单卡连体：Source / Dest / Script / 全局参数 / body 预览 / footer 一卡分区（分组标题+边框分隔，消灭卡缝）；
 Power Mode 警示降为卡头行 inline 提示，不再独占一整幅警条 -->
    <div class="ra-card">
      <div class="ra-top">
        <span class="ra-warn-inline" title="Power Mode — 请谨慎操作：这是不设幂等/自动校验的原生入口。目标索引可自定义，remote source 可指向异地集群，dest.op_type / conflicts / version_type 完全交由用户控制。">
          <AlertTriangle :size="12" />
          <b>Power Mode — 请谨慎操作</b>
          <i>这是不设幂等/自动校验的原生入口。目标索引可自定义，remote source 可指向异地集群，dest.op_type / conflicts / version_type 完全交由用户控制。</i>
        </span>
      </div>

      <!-- Source -->
      <div class="ra-sec">
        <div class="card-t"><Database :size="14" /> Source</div>
      <div class="ra-grid">
        <div class="ra-f">
          <label>集群位置</label>
          <!-- 位置组容器语义+双钮 pressed（G142/G154 族三行刀） -->
          <div class="ra-tabs" role="group" aria-label="源集群位置">
            <button class="ra-tab" :class="{ act: srcRemote === '' }" :aria-pressed="srcRemote === ''" @click="srcRemote = ''">本地</button>
            <button class="ra-tab" :class="{ act: srcRemote !== '' }" :aria-pressed="srcRemote !== ''" @click="srcRemote = srcRemote || 'https://remote-host:9200'">远程集群</button>
          </div>
        </div>
        <!-- 远程源三框合并 RemoteSourceFields 统一件（hostRaw：host 串含 scheme:port，组件内拆/拼）；
 srcRemote/srcRemoteUser/srcRemotePwd 状态与 buildBody 的 source.remote 拼接口径原地不动 -->
        <RemoteSourceFields v-if="srcRemote !== ''" class="ra-remote" hostRaw :conn="raRemoteConn" @update:conn="raRemoteConn = $event" />
        <div class="ra-f wide">
          <label>索引名（可 逗号/*）</label>
          <IndexPicker v-model="srcIndex" placeholder="orders,logs-*" allow-wildcard width="100%" />
        </div>
        <div class="ra-f">
          <label>size（每批）</label>
          <input class="ra-i" v-model="srcSize" placeholder="1000" />
        </div>
        <div class="ra-f wide">
          <label class="ra-qh">query（可选 JSON，留空即全量）
 <!-- query 编辑框高度三档循环钮（本页 ra-script-h 同款形态；script 面既有档零改动） -->
            <button class="btn ghost xs" style="margin-left:auto" data-test="ra-query-h"
              :title="'query 编辑框高度档：' + queryH + ' 行'" @click="cycleQueryH">高</button>
          </label>
 <!-- dsl-assist 字段智能补全（useIndexFields 全站字段源标准）。
 @submit（Ctrl+Enter）接既有 submit（确认门在 submit 内不绕过）。
 rows=4 定高 → 三档行数循环（JsonArea 既有 rows 写法；默认档 4 行不变，
 保持 rawBody fill 弹性 '100%' 的 stub 特征唯一——rebuildThreeState A1/A2 锁定） -->
          <JsonArea ref="raQueryJaRef" v-model="srcQueryStr" :rows="queryH" :dsl-assist="raQueryAssist" placeholder="{&quot;match_all&quot;:{}}" @submit="submit" />
 <!-- G3-A2：非法 query 不再静默剔除（会退化为全量 reindex）——后果前置 + submit 阻断 -->
          <div v-if="srcQueryErr" class="ra-qerr">{{ srcQueryErr }}</div>
 <!-- lintDsl 静态体检提示条（SearchSandboxView join 串形态同款，随输入实时重估，
 零阻塞不拦执行；不用 v-for——表单页无列表空态，不进三态契约判定面）；
 error 红条单列（结构必错 ES 直接拒绝），warning/hint 黄条并列；JSON 非法静默
 （srcQueryErr 红字已报） -->
          <div v-if="raQueryLintErrors.length" role="alert" class="lint-bar lint-bar-err">
            <span>DSL 检查（错误）：{{ raQueryLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
          </div>
          <div v-else-if="raQueryLintWarns.length" role="status" class="lint-bar lint-bar-warn">
            <span>DSL 检查：{{ raQueryLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
          </div>
        </div>
      </div>
      </div>

 <!-- Dest -->
      <div class="ra-sec">
        <div class="card-t"><Target :size="14" /> Dest</div>
      <div class="ra-grid">
        <div class="ra-f wide">
          <label>目标索引</label>
          <IndexPicker v-model="destIndex" placeholder="orders-v2（可选已有或手输新名）" allow-wildcard width="100%" />
          <div class="ra-hint">不预检、不校验存在性，允许写入已有索引或新索引；若使用别名请自行确认</div>
 <!-- sem-rm 智能纠错：目标索引名硬规则即时红字（非法字符/大写）+ 本地源=目标同名校验（同 Xmigrate idxNameProblem 人话口径） -->
          <div v-if="destIndexErr" role="alert" class="ra-derr">{{ destIndexErr }}</div>
        </div>
 <!-- 五 select label 补 :title 中文释义——对齐同页 slices 等 口径，一页两标准归一 -->
        <div class="ra-f">
          <label title="op_type：写入方式——create 仅新增（同 ID 已存在即冲突报错），index 存在则覆盖（默认）">op_type</label>
          <select class="ra-i" v-model="destOpType">
            <option value="">（默认 index）</option>
            <option value="create">create（仅新增，冲突报错）</option>
            <option value="index">index（存在则覆盖）</option>
          </select>
        </div>
        <div class="ra-f">
          <label title="version_type：版本控制——internal 用 dest 内部自增版本（默认）；external 系以源文档 _version 为准，external_gt 仅源版本更大才写入，external_gte 更大或相等才写入">version_type</label>
          <select class="ra-i" v-model="destVersionType">
            <option value="">（默认 internal）</option>
            <option value="internal">internal</option>
            <option value="external">external（保留源版本）</option>
            <option value="external_gt">external_gt（仅源版本更大才写入）</option>
            <option value="external_gte">external_gte（更大或相等才写入）</option>
          </select>
        </div>
        <div class="ra-f">
          <label>pipeline（可选）</label>
 <!-- placeholder 中文化（BulkEditorView 同款先例） -->
          <input class="ra-i" v-model="destPipeline" placeholder="ingest pipeline ID（可选）" />
        </div>
      </div>
      </div>

 <!-- Script -->
      <div class="ra-sec">
        <div class="card-t"><Terminal :size="14" /> Script（可选）
 <!-- 脚本面高度档循环钮（SqlConsoleView codeH「高」钮同款形态，
 editorTiers 族口径：st.editorH/qx.taH 先例） -->
          <button class="btn ghost xs" style="margin-left:auto" data-test="ra-script-h"
            :title="'脚本编辑器高度档：' + scriptH" @click="cycleScriptH">高</button>
        </div>
      <div class="ra-grid">
        <div class="ra-f">
          <label>语言</label>
          <select class="ra-i" v-model="scriptLang">
            <option value="">（不使用脚本）</option>
            <option value="painless">painless</option>
          </select>
        </div>
        <div class="ra-f wide">
          <label>source</label>
 <!-- 28vh → 42vh 弹性档 + usePref 记忆（SqlConsole codeH 三档循环同款） -->
 <!-- painless 面接 assist（raQueryAssist 同源 src 字段——脚本里 doc['f']
 hover 与四骨架补全共享源索引字段源）。
 @execute（Ctrl+Enter）接既有 submit（确认门在 submit 内不绕过） -->
          <MonacoEditor v-model="scriptSource" language="painless" :height="scriptH" :dsl-assist="raQueryAssist" @execute="submit" />
        </div>
      </div>
      </div>

 <!-- Global params -->
      <div class="ra-sec">
        <div class="card-t"><SlidersHorizontal :size="14" /> 全局参数</div>
      <div class="ra-grid">
        <div class="ra-f">
          <label title="conflicts：版本冲突策略——abort 遇冲突中止（默认），proceed 跳过冲突文档继续">conflicts</label>
          <select class="ra-i" v-model="conflicts">
            <option value="">（默认 abort）</option>
            <option value="abort">abort（版本冲突时中止）</option>
            <option value="proceed">proceed（跳过并继续）</option>
          </select>
        </div>
        <div class="ra-f">
          <label title="slices：并行切片数——auto 交 ES 自定，或正整数">slices</label>
 <!-- 五参数裸 input 接 useInputLint 既有正则（UpdateByQueryView :52/:68 姊妹面
 先例）——@blur 失焦校验出 .il-hint 行内提示，输入即清防旧 hint 滞留；
 label/input :title 中文释义口径随 UBQ 同参数；placeholder 文案保形 -->
          <input class="ra-i" v-model="slices" placeholder="auto / 数字 / 留空" title="slices：并行切片数——auto 交 ES 自定，或正整数" @blur="slicesCheck(slices)" />
          <div v-if="slicesHint" class="il-hint" :class="'il-' + slicesLevel">{{ slicesHint }}</div>
        </div>
        <div class="ra-f">
          <label title="refresh：完成后刷新——不刷新（默认）/ true 立即可搜 / wait_for 等待下次自动刷新">refresh</label>
          <select class="ra-i" v-model="refresh">
            <option value="">（不刷新）</option>
            <option value="true">true</option>
            <option value="wait_for">wait_for</option>
          </select>
        </div>
        <div class="ra-f">
          <label title="wait_for_completion：false 立即返回 taskId 异步执行、到任务树查进度（默认）；true 同步等到完成返回统计">wait_for_completion</label>
          <select class="ra-i" v-model="waitForCompletion">
            <option value="false">false（异步返回 taskId）</option>
            <option value="true">true（同步等到完成）</option>
          </select>
        </div>
        <div class="ra-f">
          <label title="requests_per_second：每秒限流——-1 不限，或数字（可小数）">requests_per_second</label>
          <input class="ra-i" v-model="requestsPerSecond" placeholder="-1（不限） / 1000" title="requests_per_second：每秒限流——-1 不限，或数字（可小数）" @blur="rpsCheck(requestsPerSecond)" />
          <div v-if="rpsHint" class="il-hint" :class="'il-' + rpsLevel">{{ rpsHint }}</div>
        </div>
        <div class="ra-f">
          <label title="scroll：滚动快照保活时长——数字+单位（ms/s/m/h/d），如 5m">scroll</label>
          <input class="ra-i" v-model="scroll" placeholder="5m" title="scroll：滚动快照保活时长——数字+单位（ms/s/m/h/d），如 5m" @blur="scrollCheck(scroll)" />
          <div v-if="scrollHint" class="il-hint" :class="'il-' + scrollLevel">{{ scrollHint }}</div>
        </div>
        <div class="ra-f">
          <label title="timeout：请求超时时长——数字+单位（ms/s/m/h/d），如 1m">timeout</label>
          <input class="ra-i" v-model="timeout" placeholder="1m" title="timeout：请求超时时长——数字+单位（ms/s/m/h/d），如 1m" @blur="timeoutCheck(timeout)" />
          <div v-if="timeoutHint" class="il-hint" :class="'il-' + timeoutLevel">{{ timeoutHint }}</div>
        </div>
        <div class="ra-f">
          <label title="wait_for_active_shards：执行前须活跃的分片数——all 或整数，如 1">wait_for_active_shards</label>
 <!-- wait_for_active_shards 无既有正则，patternRule 内联 all/整数（placeholder 口径 1 / all / 数字） -->
          <input class="ra-i" v-model="waitForActiveShards" placeholder="1 / all / 数字" title="wait_for_active_shards：执行前须活跃的分片数——all 或整数，如 1" @blur="wfasCheck(waitForActiveShards)" />
          <div v-if="wfasHint" class="il-hint" :class="'il-' + wfasLevel">{{ wfasHint }}</div>
        </div>
      </div>
      </div>

 <!-- Body preview（并入单卡分区；「由表单重建」入口删卡头重复项，统一 footer 一处） -->
      <div class="ra-sec ra-body" v-if="showBody">
 <!-- .ra-body-tt 400 弱标分节升档全局 .card-t.sm 分节档（原无字重，
 随升档获得 600/12px；本地规则删） -->
        <div class="card-t sm">
          <Code2 :size="12" /> 实际提交 body（可编辑）
 <!-- sem-rm 智能纠错：手编 body JSON 非法前置提示（JsonArea 红点在编辑器内，这里给全宽 err 红字；submit 一并阻断） -->
          <span v-if="bodyJsonErr" role="alert" class="ra-berr">{{ bodyJsonErr }}</span>
        </div>
 <!-- G3-A1：手编置 bodyTouched——v-model 与事件同名属性不能重复写，拆为 :model-value + onBodyEdit；
 dsl-assist 透传 src 字段（raBodyAssist，与 srcQuery 同源）。
 W4c：rows=14 定高 → fill 弹性（AdhocRebuild 手编区同款），.ra-body 限高承接。
 @submit（Ctrl+Enter）接既有 submit（确认门在 submit 内不绕过） -->
        <JsonArea ref="raBodyJaRef" :model-value="rawBody" fill :dsl-assist="raBodyAssist" @update:model-value="onBodyEdit" @submit="submit" />
 <!-- 手编 body 的 lintDsl 静态体检提示条（join 串形态，随输入实时重估，
 零阻塞不拦执行；手编坏 JSON 由 bodyJsonErr 红字 + submit 阻断承担，lint 条只管结构语义） -->
        <div v-if="raBodyLintErrors.length" role="alert" class="lint-bar lint-bar-err">
          <span>DSL 检查（错误）：{{ raBodyLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
        </div>
        <div v-else-if="raBodyLintWarns.length" role="status" class="lint-bar lint-bar-warn">
          <span>DSL 检查：{{ raBodyLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
        </div>
      </div>

      <div class="ra-sec ra-footer">
        <div class="ra-url">URL：<code>POST /cluster/reindex-advanced?{{ finalQs }}</code></div>
        <div class="ra-btns">
 <!-- 原始 IO 快查——本页最近一次 reindex-advanced 请求/响应原文（ioRecorder 记录环） -->
          <button class="btn ghost" data-test="raw-io" aria-label="查看原始 IO（Reindex 高级）" title="最近一次 Reindex 请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
          <button class="btn ghost" @click="rebuildFromForm"><RefreshCcw :size="12" /> 预览 body</button>
          <button v-if="canOps" class="btn pri" @click="submit" :disabled="running">
            <Play :size="12" :class="{ spinning: running }" /> {{ running ? '提交中…' : '开始 Reindex' }}
          </button>
        </div>
      </div>
    </div>

 <!-- 双色横幅分档单源化——err 档挂 theme.css .err-bar（role=alert，558b 红壳合并
 同范式），ok 档留 .ra-result 素底（ok-soft，去 border/radius 双写保语义绿）；
 单节点 class 三元改用，DOM 结构与子元素零变动 -->
    <div v-if="result" :class="result?.error ? 'err-bar' : 'ra-result'" :role="result?.error ? 'alert' : undefined">
      <div class="ra-result-tt">
        <CheckCircle2 v-if="!result.error" :size="14" />
        <XCircle v-else :size="14" />
        {{ result.error ? '失败' : '已提交' }}
      </div>
 <!-- G3-B4：失败全文内联（friendlyEsError，限高可滚）——不再埋进折叠 details、不再仅 toast -->
      <div v-if="result.error" class="ra-err-full mono">{{ errText }}</div>
      <div class="ra-result-b">
        <span v-if="result.taskId">taskId：<code>{{ result.taskId }}</code>
 <!-- 死 API 激活——api.progress(taskId) 一次性拉取（InternalEsIndexRebuildController
 /progress 端点现成，Java 零改）；行内三态中文（进行中 x/y / 已完成 / 查不到降级）。
 UpdateByQueryView StatusPill 旁同款钮，两侧 data-test 各自独立 -->
          <button class="btn ghost sm" data-test="ra-progress" :disabled="progressLoading"
            title="拉取该任务当前进度（一次性查询，不挂轮询）" @click="queryTaskProgress">查进度</button>
          <span v-if="progressLoading || progressText" role="status" class="ra-prog">{{ progressLoading ? '进度查询中…' : progressText }}</span>
        </span>
 <!-- took 裸 ms → TookBadge 四档语义徽标（BulkEditorView 同款）；
 total/created/updated → MetaStrip 值亮标签暗（taskId/path 保留 code 形态不进 items） -->
        <span v-if="typeof result.took === 'number'">took：<TookBadge :ms="result.took" /></span>
        <MetaStrip v-if="raResultMeta.length" :items="raResultMeta" />
        <span v-if="result.finalPath">path：<code>{{ result.finalPath }}</code></span>
      </div>
      <details class="ra-result-raw"><summary>原始响应</summary><pre class="json-view" v-html="prettyResultHtml"></pre></details><!-- ：裸 pre → highlightJson 高亮 -->
      <div class="ra-result-jump" v-if="result.error || result.taskId || typeof result.total === 'number'">
        <button v-if="result.error && canOps" class="btn ghost sm" :disabled="running" @click="submit"><RotateCcw :size="12" /> 重试</button>
        <button v-if="result.taskId" class="btn ghost sm" @click="goTasks"><ArrowRight :size="12" /> 到任务树查看进度</button>
 <!-- 写类视图验证去處收口——同步完成（total 在场）时立即可查；异步场景建议到任务树确认完成后再来 -->
        <button v-if="destIndex && (typeof result.total === 'number' || !result.taskId)" class="btn ghost sm"
          @click="router.push({ path: '/search', query: { mode: 'dsl', idx: destIndex } })">
          <Search :size="12" /> 去查询验证
        </button>
      </div>
    </div>

 <!-- 原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 reindex-advanced 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { fmtNum } from '../utils/format';
import { useRouter } from 'vue-router';
import { Shield, Wand2, Database, Target, Terminal, SlidersHorizontal, Code2, RefreshCcw, Play, Star, AlertTriangle, CheckCircle2, XCircle, ArrowRight, RotateCcw, Search } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth'; /* ：权限写门真源 */
import { useQueryHistoryStore } from '../stores/queryHistory'; /* ：执行留痕（写操作入跨模式历史） */
import { friendlyEsError } from '../utils/esError';
import { permDeniedAdvice } from '../utils/esErrorAdvice'; /* W4c：三视图同构 403 建议收敛单一出处（文案逐字等价） */
import { useIdxState } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle'; /* ：ra.scriptH/queryH 三件套合并 */
import { useScopedDraftState } from '../composables/useScopedDraft';
import IndexPicker from '../components/IndexPicker.vue';
import RemoteSourceFields from '../components/RemoteSourceFields.vue'; /* 远程源表单统一件（Xmigrate 同款合并） */
import { indexNameProblem } from '../utils/indexNameRule'; /* 索引名硬规则共享口径（Adhoc 同源） */
import { askConfirm } from '../composables/confirm';
import JsonArea from '../components/JsonArea.vue';
import MonacoEditor from '../components/MonacoEditor.vue';
import { useIndexFields } from '../composables/useIndexFields'; /* ：dsl-assist 字段源 */
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（661 范式） */
import { useDebounceFn } from '../composables/useDebounceFn'; /* ：lint 划线防抖统一件 */
import { lintDsl } from '../utils/dslLint'; /* ：DSL 静态体检 */
import { useInputLint, patternRule, SLICES_RE, RPS_RE, TIME_RE } from '../composables/useInputLint'; /* ：五参数结构化校验正则单源 */
import DraftBadge from '../components/DraftBadge.vue'; /* ：草稿恢复徽标统一件 */
import { highlightJson } from '../utils/jsonc'; /* ：原始响应高亮 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* ：结果指标串统一件 */
import TookBadge from '../components/TookBadge.vue'; /* ：took 四档语义徽标 */
import { removeStoredRaw } from '../utils/safeJson';

const store = useAppStore();
const router = useRouter();
/* 权限写门——reindex-advanced 同步升 rank3 归 ops 档，VIEWER 不显示执行/重试入口 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/reindex-advanced', store.target));

/* source */
const srcRemote = ref('');
const srcRemoteUser = ref('');
const srcRemotePwd = ref('');
/* 远程源三框合并 RemoteSourceFields 的桥：三 ref 仍是真相（buildBody/草稿排除/destIndexErr
 判定零改动），组件编辑经此回写。hostRaw 模式 scheme/port 都编码在 srcRemote 单串里，
 get 侧仅给占位默认（组件内拆/拼自洽）。 */
const raRemoteConn = computed<any>({
  get: () => ({ scheme: '', host: srcRemote.value, port: '', username: srcRemoteUser.value, password: srcRemotePwd.value }),
  set: (v) => { srcRemote.value = v.host; srcRemoteUser.value = v.username || ''; srcRemotePwd.value = v.password || ''; },
});
/* →：源索引并轨 useIdxState——深链 ?src= 归并为全站统一 ?idx=，上下行顶栏。
 本页是写类视图（ 本不入 follow 白名单），但源索引只是执行引用、写副作用落在
 dest，故开跟随并加条件 guard：destIndex 已有手填/草稿恢复值时冻结跟随——
 src 在 dest 定好后被悄悄换掉，会变成「为 A 配的目标搬 B 的数据」。
 guard 闭包迟引用下方声明的 destIndex：仅由 pickedIdx 变更触发、setup 完成后才求值，无 TDZ。
 ·三范式差异（有意并存，勿后续误统一）：索引引用 = 只读 chip（查询类页
 CurrentIdxChip）/ 回填钮（写类页手填 IndexPicker）/ 条件 follow（本页独有——执行引用
 跟随 pickedIdx，写副作用落在 dest 才需冻结 guard）。 */
const srcIndex = useIdxState({ follow: () => !destIndex.value.trim() });
const srcSize = ref('1000');
const srcQueryStr = ref('');

/* 源 query 编辑器接字段智能补全（dsl-assist 全站字段源标准，三行写法参照
 AdhocRebuildView arSettingsAssist）。本地源索引变化时预载字段（幂等+缓存）；远程源与
 pattern 形态 mappingDetail 失败零降级（fields 空＝无候选，不影响手输）。bodyKind 缺省
 即 'search'（MonacoEditor 分派缺省），query 体语义正好。 */
const { fields: raSrcFields, ensure: ensureRaFields } = useIndexFields(() => srcIndex.value);
/* 值位动态候选接线（661 范式照抄）——useTermsSuggest 实例+terms 闭包双件同源，索引源与 fields 同源现调现读 */
const raTerms = useTermsSuggest(() => srcIndex.value);
const raQueryAssist = { fields: () => raSrcFields.value, terms: (f: string, p: string) => raTerms.suggestAsync(f, p) };
/* 手编整身 body 编辑器同源透传 src 字段（raQueryAssist 同构；bodyKind 缺省 search 档，
 source.query 段结构内出字段候选——手写 body 不再全凭记忆敲字段名） */
const raBodyAssist = { fields: () => raSrcFields.value, terms: (f: string, p: string) => raTerms.suggestAsync(f, p) };
watch(srcIndex, () => { if (!srcRemote.value) void ensureRaFields(); }, { immediate: true });

/* dest */
const destIndex = ref('');
const destOpType = ref('');
const destVersionType = ref('');
const destPipeline = ref('');

/* script */
const scriptLang = ref('');
const scriptSource = ref('');
/* painless 脚本面 28vh → 42vh 弹性档 + usePref 跨会话记忆
 （SqlConsoleView codeH「高」钮三档循环同款，editorTiers 族口径：st.editorH/qx.taH 先例） */
const SCRIPT_H_TIERS = ['max(110px, 42vh)', 'max(150px, 56vh)', 'max(220px, 72vh)'];
/* usePref+手写 cycle 合并 useTierCycle 单源（ra.scriptH 键不变=零迁移；
 默认档=首位，defVal 缺省；cycle 语义等值） */
const { v: scriptH, cycle: cycleScriptH } = useTierCycle('ra.scriptH', SCRIPT_H_TIERS);
/* src query 编辑框三档行数循环 + 跨会话记忆（script 面既有档零改动；
 走 JsonArea 既有 rows 写法而非 fill 容器——默认档 4 行 92px 不变，rawBody fill '100%'
 stub 特征保持唯一，rebuildThreeState A1/A2 黑名单锁不破）。
 合并 useTierCycle 单源（ra.queryH 键不变；默认档=首位，defVal 缺省） */
const QUERY_H_TIERS = [4, 10, 18];
const { v: queryH, cycle: cycleQueryH } = useTierCycle('ra.queryH', QUERY_H_TIERS);

/* params */
const conflicts = ref('');
const slices = ref('auto');
const refresh = ref('');
const waitForCompletion = ref('false');
const requestsPerSecond = ref('');
const scroll = ref('');
const timeout = ref('');
const waitForActiveShards = ref('');
/* 五参数裸 input 接 useInputLint 既有正则出校验提示（UpdateByQueryView :52/:68
 姊妹面先例同款）——@blur 失焦校验、输入即清防旧 hint 滞留；hint msg 与 :title 释义口径随
 UBQ 同参数。slices/requests_per_second/scroll/timeout 走既有 SLICES_RE/RPS_RE/TIME_RE；
 wait_for_active_shards 无既有正则，patternRule 内联 all/整数 */
const { hint: slicesHint, level: slicesLevel, check: slicesCheck, clear: slicesClear } = useInputLint([
  patternRule(SLICES_RE, 'slices：auto 或整数'),
]);
const { hint: rpsHint, level: rpsLevel, check: rpsCheck, clear: rpsClear } = useInputLint([
  patternRule(RPS_RE, 'requests_per_second：-1 不限，或数字（可小数）'),
]);
const { hint: scrollHint, level: scrollLevel, check: scrollCheck, clear: scrollClear } = useInputLint([
  patternRule(TIME_RE, 'scroll：数字+单位（ms/s/m/h/d），如 5m'),
]);
const { hint: timeoutHint, level: timeoutLevel, check: timeoutCheck, clear: timeoutClear } = useInputLint([
  patternRule(TIME_RE, 'timeout：数字+单位（ms/s/m/h/d），如 1m'),
]);
const { hint: wfasHint, level: wfasLevel, check: wfasCheck, clear: wfasClear } = useInputLint([
  patternRule(/^all$|^\d+$/, 'wait_for_active_shards：all 或整数'),
]);
watch(slices, () => slicesClear());
watch(requestsPerSecond, () => rpsClear());
watch(scroll, () => scrollClear());
watch(timeout, () => timeoutClear());
watch(waitForActiveShards, () => wfasClear());

const showBody = ref(false);
const rawBody = ref('');
/* 表单现场(除 remote 凭据三字段——凭据永不落盘)进会话草稿，切页/刷新可复原；
 挂载时草稿有非默认稿才回填，防覆盖深链 ?src= 的初值 */
const FORM_DEF = { srcSize: '1000', srcQueryStr: '', destIndex: '', destOpType: '', destVersionType: '', destPipeline: '', scriptLang: '', scriptSource: '', conflicts: '', slices: 'auto', refresh: '', waitForCompletion: 'false', requestsPerSecond: '', scroll: '', timeout: '', waitForActiveShards: '', rawBody: '' };
const formDraft = useScopedDraftState('form', { route: 'reindex-advanced' }, FORM_DEF);
/* 草稿恢复徽标——顶层 ref 接出供模板自动解包（DraftBadge 统一件接入形态同 AdhocRebuildView） */
const draftRestored = formDraft.restored;
/* 挂载初始化期守卫——草稿恢复回填与挂载首拍 body 快照都是程序化写，若经下方
 watch 深写草稿对象会把 restored 在首渲染前翻 false，DraftBadge 恒不可见（AdhocRebuild
 单字段范式 init 即还原值无回写翻转=范式差异）。守卫至 onMounted 首拍 flush 完成后解除，
 用户真实编辑才落稿+翻徽标 */
const initPhase = ref(true);
watch([srcSize, srcQueryStr, destIndex, destOpType, destVersionType, destPipeline, scriptLang, scriptSource,
       conflicts, slices, refresh, waitForCompletion, requestsPerSecond, scroll, timeout, waitForActiveShards, rawBody],
  () => {
    if (initPhase.value) return;
    formDraft.state.value = { srcSize: srcSize.value, srcQueryStr: srcQueryStr.value, destIndex: destIndex.value, destOpType: destOpType.value, destVersionType: destVersionType.value, destPipeline: destPipeline.value, scriptLang: scriptLang.value, scriptSource: scriptSource.value, conflicts: conflicts.value, slices: slices.value, refresh: refresh.value, waitForCompletion: waitForCompletion.value, requestsPerSecond: requestsPerSecond.value, scroll: scroll.value, timeout: timeout.value, waitForActiveShards: waitForActiveShards.value, rawBody: rawBody.value };
  });
if (formDraft.restored.value) {
  const d = formDraft.state.value;
  srcSize.value = d.srcSize; srcQueryStr.value = d.srcQueryStr; destIndex.value = d.destIndex;
  destOpType.value = d.destOpType; destVersionType.value = d.destVersionType; destPipeline.value = d.destPipeline;
  scriptLang.value = d.scriptLang; scriptSource.value = d.scriptSource; conflicts.value = d.conflicts;
  slices.value = d.slices; refresh.value = d.refresh; waitForCompletion.value = d.waitForCompletion;
  requestsPerSecond.value = d.requestsPerSecond; scroll.value = d.scroll; timeout.value = d.timeout;
  waitForActiveShards.value = d.waitForActiveShards; rawBody.value = d.rawBody;
}
/* G3-A1：bodyTouched 脏标记——未手编时 rawBody 恒随表单同步（含收起态），
 手编/carry 注入后表单改动不再覆写 body；submit 按此取舍，杜绝提交挂载时刻的陈旧快照 */
const bodyTouched = ref(false);
/* 草稿恢复了手编 body → 同步脏标记（bodyTouched 声明在其后，单独回填） */
if (formDraft.restored.value) bodyTouched.value = !!formDraft.state.value.rawBody;
const running = ref(false);
const result = ref<any>(null);

/* 原始 IO 快查（546 六页同款三件套）——/cluster/reindex-advanced 全站独占；
 判空 rec=null（本页还没执行过操作）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/reindex-advanced');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* G3-A2：query JSON 非法探测——buildBody 的 catch 静默剔除会退化为全量 reindex，
 这里把后果前置显示，并在 submit 阻断 */
const srcQueryErr = computed(() => {
  const s = srcQueryStr.value.trim();
  if (!s) return '';
  try { JSON.parse(s); return ''; } catch { return 'query JSON 解析失败——提交时该 query 会被忽略（退化为全量 reindex）；请修正或清空'; }
});
/* sem-rm 智能纠错：目标索引名即时校验——非法字符/大写（utils/indexNameRule 共享口径，
 AdhocRebuild destNameErr 同源）；本页第三支：本地模式下源=目标同名会被 ES 拒绝
 （remote source 时同名是合法的跨集群回写，不拦） */
const destIndexErr = computed(() => {
  const name = destIndex.value.trim();
  if (!name) return '';
  const base = indexNameProblem(name);
  if (base) return base;
  if (!srcRemote.value && name === srcIndex.value.trim()) return '目标索引与源索引同名——本地 reindex 源=目标会被 ES 拒绝，请换名（如加 -v2 后缀）';
  return '';
});
/* sem-rm 智能纠错：手编 body JSON 非法前置提示。未手编时 rawBody 恒由表单生成（恒合法）不提示；
 手编坏 JSON 目前只有 JsonArea 圆点（在编辑器内不显眼）且提交必被后端 400——卡头红字 + submit 阻断 */
const bodyJsonErr = computed(() => {
  if (!bodyTouched.value) return '';
  const s = rawBody.value.trim();
  if (!s) return '';
  try { JSON.parse(s); return ''; } catch (e: any) { return 'body JSON 无法解析：' + String(e?.message ?? e).slice(0, 90) + '——已阻断提交，请修正或点「预览 body」回到表单权威'; }
});
/* lintDsl 静态体检（UpdateByQueryView 最简接线同款）——srcQuery 与手编 body 各一路，
 fields 同 raQueryAssist 源（raSrcFields）；JSON 解析失败静默（srcQueryErr/bodyJsonErr 红字已报）。
 body lint 出提示的前提是手编态（未手编时 rawBody 恒由表单生成，语义由表单权威兜着） */
const raQueryLint = computed(() => {
  try { return lintDsl(JSON.parse(srcQueryStr.value || ''), { fields: raSrcFields.value }); }
  catch { return []; }
});
const raQueryLintErrors = computed(() => raQueryLint.value.filter(f => f.severity === 'error'));
const raQueryLintWarns = computed(() => raQueryLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));
const raBodyLint = computed(() => {
  if (!bodyTouched.value) return [];
  try { return lintDsl(JSON.parse(rawBody.value || ''), { fields: raSrcFields.value }); }
  catch { return []; }
});
const raBodyLintErrors = computed(() => raBodyLint.value.filter(f => f.severity === 'error'));
const raBodyLintWarns = computed(() => raBodyLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));
/* lint findings 注入编辑器划线（SearchSandboxView 范式：debounce 250ms 防每敲一键
 全量 findMatches；info 降级 hint——MonacoEditor marker 档只收 warning/hint/error；
 banner 提示条保留双通道）——srcQuery 与手编 body 两路各自接各自的 JsonArea 实例 */
const raQueryJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueQueryLintMarkers = useDebounceFn(() => {
  raQueryJaRef.value?.setMarkers?.(raQueryLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(srcQueryStr, () => { queueQueryLintMarkers(); }, { immediate: true });
const raBodyJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueBodyLintMarkers = useDebounceFn(() => {
  raBodyJaRef.value?.setMarkers?.(raBodyLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(rawBody, () => { queueBodyLintMarkers(); }, { immediate: true });
const errText = computed(() => friendlyEsError(String(result.value?.message ?? '')));

/* 结果指标 total/created/updated → MetaStrip items（在场的才渲染；took 走 TookBadge）。
 三段补中文语义 tip（title 悬停+help 档；英文 label 留检索，G133 双语同款） */
const raResultMeta = computed<MetaStripItem[]>(() => {
  const r = result.value;
  if (!r) return [];
  const items: MetaStripItem[] = [];
  if (typeof r.total === 'number') items.push({ value: fmtNum(r.total), label: 'total', tip: 'total：本次 reindex 处理的文档总数' });
  if (typeof r.created === 'number') items.push({ value: fmtNum(r.created), label: 'created', tip: 'created：新写入 dest 的文档数' });
  if (typeof r.updated === 'number') items.push({ value: fmtNum(r.updated), label: 'updated', tip: 'updated：覆盖更新（同 ID 重写）的文档数' });
  return items;
});

function onBodyEdit(v: string) { rawBody.value = v; bodyTouched.value = true; }

function buildBody(): any {
  const b: any = { source: { index: srcIndex.value || '_all' }, dest: { index: destIndex.value } };
  if (srcRemote.value) {
    b.source.remote = { host: srcRemote.value };
    if (srcRemoteUser.value) b.source.remote.username = srcRemoteUser.value;
    if (srcRemotePwd.value) b.source.remote.password = srcRemotePwd.value;
  }
  if (srcSize.value) b.source.size = Number(srcSize.value) || undefined;
  if (srcQueryStr.value.trim()) {
    try { b.source.query = JSON.parse(srcQueryStr.value); } catch { /* leave raw */ }
  }
  if (destOpType.value) b.dest.op_type = destOpType.value;
  if (destVersionType.value) b.dest.version_type = destVersionType.value;
  if (destPipeline.value) b.dest.pipeline = destPipeline.value;
  if (scriptLang.value && scriptSource.value) {
    b.script = { lang: scriptLang.value, source: scriptSource.value };
  }
  if (conflicts.value) b.conflicts = conflicts.value;
  return b;
}

function rebuildFromForm() {
  rawBody.value = JSON.stringify(buildBody(), null, 2);
  bodyTouched.value = false; // G3-A1：回到「表单权威」态
  showBody.value = true;
}

const finalQs = computed(() => {
  const parts: string[] = [];
  if (slices.value) parts.push('slices=' + encodeURIComponent(slices.value));
  if (refresh.value) parts.push('refresh=' + encodeURIComponent(refresh.value));
  if (waitForCompletion.value) parts.push('waitForCompletion=' + encodeURIComponent(waitForCompletion.value));
  if (requestsPerSecond.value) parts.push('requestsPerSecond=' + encodeURIComponent(requestsPerSecond.value));
  if (scroll.value) parts.push('scroll=' + encodeURIComponent(scroll.value));
  if (timeout.value) parts.push('timeout=' + encodeURIComponent(timeout.value));
  if (waitForActiveShards.value) parts.push('waitForActiveShards=' + encodeURIComponent(waitForActiveShards.value));
  return parts.join('&');
});

async function submit() {
  /* 权限执行体首行门（按钮 v-if 之外的键盘/深链/重试通道）：Monaco Ctrl+Enter @submit 同受此门 */
  if (!canOps.value) { store.notify('warning', 'Reindex 需专项或 ADMIN 角色'); return; }
  if (running.value) return; /* 提交防重（INTERACTION 范式）：在途时双击/重试重复下发直接短路 */
  if (!destIndex.value) { store.notify('warning', '请填目标索引 dest.index'); return; }
  /* sem-rm 智能纠错：dest 名硬规则 / 源=目标同名 / 手编 body JSON 非法——与 srcQueryErr 同构的前置阻断（G3-A2 先例） */
  if (destIndexErr.value) { store.notify('warning', '目标索引名有误——已阻断提交：' + destIndexErr.value); return; }
  if (bodyJsonErr.value) { store.notify('warning', '手编 body JSON 无法解析——已阻断提交，请修正后再执行'); return; }
  /* G3-A2：非法 query 会被静默剔除（退化为全量 reindex）——阻断并前置后果，不放行进确认弹层 */
  if (srcQueryErr.value) { store.notify('warning', 'query JSON 无法解析——已阻断提交（防止退化为全量 reindex），请修正或清空'); return; }
  /* G3-A1：未手编时恒以表单为准（rawBody 可能是挂载时刻快照）；手编后尊重用户 body */
  const body = (bodyTouched.value ? rawBody.value.trim() : '') || JSON.stringify(buildBody());
  if (!await askConfirm({
    title: '执行 Reindex',
    message: `将执行 Reindex → dest=「${destIndex.value}」${srcRemote.value ? '（跨集群 remote=' + srcRemote.value + '）' : ''}：目标索引中同 ID 文档会被覆盖，大索引会持续占用集群 IO。\n${body.length > 400 ? body.slice(0, 400) + '…' : body}`,
    okText: '执行 Reindex',
  })) return;
  running.value = true;
  result.value = null;
  try {
    const r = await api.reindexAdvanced(body, {
      slices: slices.value,
      refresh: refresh.value,
      waitForCompletion: waitForCompletion.value,
      requestsPerSecond: requestsPerSecond.value,
      scroll: scroll.value,
      timeout: timeout.value,
      waitForActiveShards: waitForActiveShards.value,
    });
    result.value = r;
    /* 执行留痕入查询历史（526 遗留「写操作无历史不可回溯」）—— 既有
 push 一行落账，不新增 store API；body 是 reindex 结构、非六查询通道之一，mode 落
 'reindex'（历史面板 modeLabel 回退原样显示徽标；回放经查询工作台按 DSL 档兜底打开） */
    useQueryHistoryStore().push('reindex', body, destIndex.value);
    if (r?.taskId) {
      store.notify('success', `已提交 Reindex 任务 ${r.taskId}`, {
        action: { label: '到任务树', onClick: goTasks },
      });
    } else {
      store.notify('success', `Reindex 完成：total=${r?.total || 0}, created=${r?.created || 0}, updated=${r?.updated || 0}`);
    }
  } catch (e: any) {
    result.value = { error: true, message: permDeniedAdvice(e) };
    store.notify('error', 'Reindex 失败：' + result.value.message);
  } finally {
    running.value = false;
  }
}

/* W4c·完成去向链：携带返回体 taskId 深链任务树（TaskTreeView 挂载消费 ?taskId= 直选；
 返回体字段名已实地核后端 EsIndexAdmin.reindexAdvanced——out.put("taskId", …)）。
 无 taskId（同步完成）时兜底仍可进任务树总览 */
function goTasks() {
  if (result.value?.taskId) router.push({ path: '/task-tree', query: { taskId: String(result.value.taskId) } });
  else router.push('/task-tree');
}

/* 死 API 激活——api.progress(taskId) 一次性拉取（后端 ReindexProgress：
 status=RUNNING|COMPLETED|UNKNOWN + total/created/updated/deleted 结构化计数）。
 三态中文：RUNNING=进行中 x/y、COMPLETED=已完成、UNKNOWN/拉取失败=查不到降级
 （任务完成后从 _tasks 消失/过期是常态路径，降级是预期分支不是异常，不 toast 轰炸）。
 仅用户点击时拉取（盯进度走「到任务树」深链），不挂轮询 */
const taskProgress = ref<any>(null);
const progressLoading = ref(false);
const progressFailed = ref(false);
async function queryTaskProgress() {
  const tid = result.value?.taskId;
  if (!tid || progressLoading.value) return;
  progressLoading.value = true;
  progressFailed.value = false;
  try {
    taskProgress.value = await api.progress(String(tid));
  } catch { progressFailed.value = true; }
  finally { progressLoading.value = false; }
}
const progressText = computed(() => {
  const p = taskProgress.value;
  if (progressFailed.value || !p || p.status === 'UNKNOWN') return '查不到进度（任务可能已过期或 taskId 无效）';
  const counts = ` ${p.created ?? 0}/${p.total ?? '?'}`;
  return p.status === 'COMPLETED' ? '已完成' + counts : '进行中' + counts;
});

const prettyResult = computed(() => {
  try { return JSON.stringify(result.value, null, 2); } catch { return String(result.value); }
});
/* 原始响应裸 pre → highlightJson 高亮（输出已转义，v-html 安全） */
const prettyResultHtml = computed(() => highlightJson(prettyResult.value));

function favorite() {
  const b = buildBody();
  store.addFavorite({
    kind: 'rest',
    title: `Reindex → ${destIndex.value || '(unset)'}`,
    subtitle: `${srcRemote.value ? 'REMOTE ' : ''}src=${srcIndex.value || '_all'} dest=${destIndex.value}`,
    payload: { method: 'POST', path: '/_reindex', body: JSON.stringify(b, null, 2) },
    tags: ['reindex', srcRemote.value ? 'remote' : 'local'],
  });
  store.notify('success', '已收藏 Reindex 配置');
}

watch([srcRemote, srcIndex, destIndex, srcQueryStr, destOpType, destVersionType, destPipeline, scriptLang, scriptSource, conflicts, srcSize, srcRemoteUser, srcRemotePwd], () => {
  /* G3-A1：去 showBody 门控改 bodyTouched 门控——未手编时收起态也同步，rawBody 不再是陈旧快照 */
  if (!bodyTouched.value) rawBody.value = JSON.stringify(buildBody(), null, 2);
});

onMounted(async () => {
  /* 若来自 template gallery 或 favorites 携带 body，尝试注入 */
  const carry = sessionStorage.getItem('esquerystudio.reindex-advanced.body');
  if (carry) {
    rawBody.value = carry;
    bodyTouched.value = true; // G3-A1：外部注入 body 是权威内容，表单改动不覆写
    showBody.value = true;
    removeStoredRaw(sessionStorage, 'esquerystudio.reindex-advanced.body');
  } else {
    rawBody.value = JSON.stringify(buildBody(), null, 2);
  }
  /* 守卫窗口覆盖上方首拍程序化写的 watch flush 之后再解除（nextTick 时
 pre-flush 队列已消化），此后用户编辑才落稿 */
  await nextTick();
  initPhase.value = false;
});
</script>

<style scoped>
.ra-page { padding: var(--sp-4) var(--sp-4) var(--sp-5); }
.ra-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); padding-bottom: var(--sp-3); border-bottom: 1px solid var(--border-subtle); }
/* W4c：死 CSS 清理——.ra-hd-l/-ic/-tt/-sub/-r 页头换 PageHeader 后无模板引用，删除；
 .ra-body-t(-focus) 裸 textarea 退役（JsonArea 合并）后同样无引用，删除 */
/* 卡头行：Power Mode inline 警示（原整幅 ra-warn 警条降级，title 兜底全文） */
.ra-top { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4); border-bottom: 1px solid var(--border-subtle); }
.ra-warn-inline { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-xs); color: var(--warn); min-width: 0; }
.ra-warn-inline b { font-weight: 600; }
.ra-warn-inline i { font-style: normal; color: var(--text-muted); }
/* 单卡连体：Source/Dest/Script/全局参数/body/footer 一卡分区（分组标题+边框分隔，消灭卡缝）。
 ra-card 列表行卡壳退役（约定④：panel 底+border-subtle 全框+radius:10px 整块
 消除 → border-top 分节流，xm-res 语言）；ra-top border-bottom 与 ra-sec 间
 border-top 既有内部分节线原样承接分界 */
.ra-card { border-top: 1px solid var(--border-subtle); margin-bottom: var(--sp-3); }
.ra-sec { padding: var(--sp-3) var(--sp-4); }
.ra-sec + .ra-sec { border-top: 1px solid var(--border-subtle); }
/* .ra-card-tt 退役换全局 .card-t（字重 600→650 视觉无感；margin var(--sp-3)→10px、
 gap→8px 随全局档；附带 color/letter-spacing 与 compact 密度档 margin 联动） */
.ra-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sp-3); }
.ra-f { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
.ra-f.wide { grid-column: span 2; }
/* 编辑器外框退役（约定③， sq-editor/be-card-editor 同语言视图侧
 独立追加）；本页仅 source 一处 Monaco（ra-f.wide 独占整行），label 行自承分界 */
.ra-f.wide > :deep(.monaco-host) { border: none; border-radius: 0; }
.ra-f label { font-size: var(--fs-xs); color: var(--text-muted); }
/* query 编辑框高度档 label 行（钮右靠）；行数档走 JsonArea 既有 rows 写法，无容器层 */
.ra-qh { display: flex; align-items: center; gap: var(--sp-1); }
/* RemoteSourceFields 统一件在 4 列栅格中独占一整行（原远程源三框各占一格） */
.ra-remote { grid-column: 1 / -1; }
.ra-qerr { font-size: var(--fs-xs); color: var(--err); }
/* .ra-lint 私有三件套退役 → theme.css 单源 .lint-bar/.lint-bar-warn/.lint-bar-err
 直接消费（模板 class 改用、DOM 结构保形；margin-top 落位随主题档） */
/* sem-rm 智能纠错：dest 名即时红字 + 手编 body JSON 非法卡头红字（err 档） */
.ra-derr { font-size: var(--fs-xs); color: var(--err); line-height: 1.5; }
.ra-berr { flex: 1 1 100%; font-size: var(--fs-xs); color: var(--err); line-height: 1.5; }
/* 裸 textarea 退役（JsonArea 合并）时伴漏删的两条 input 组合规则死半支已剥除，
 活半支成单选择器规则（死名单唯一+模板零引用双实锚；W4c 死 CSS 清理同族下半刀） */
.ra-i { background: var(--bg-alt); border: 1px solid var(--border-subtle); color: var(--text); padding: 5px var(--sp-2); border-radius: 5px; font: inherit; font-size: var(--fs-sm); outline: none; }
.ra-i:focus { border-color: var(--brand); }
.ra-hint { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--sp-0); }
.ra-tabs { display: flex; gap: var(--sp-1); }
.ra-tab { padding: var(--sp-1) var(--sp-2h); background: var(--bg2); border: 1px solid var(--line); color: var(--tx1); border-radius: 5px; cursor: pointer; font-size: var(--fs-xs); transition: all var(--tr); }
.ra-tab:hover { border-color: var(--line-strong); color: var(--tx0); }
/* 选中态统一柔底+品牌描边，告别实心色块白字 */
.ra-tab.act { background: var(--ac-soft); border-color: var(--ac-line); color: var(--ac-hi); font-weight: 600; }
/* ra-body 已并入单卡分区（.ra-sec），原独立卡盒样式删除。
 W4c：body 编辑器 fill 弹性后由本区承接高度——min-height 对齐原 rows=14 定高
 （282px Monaco + JsonArea 工具条），竖向可随内容成长 */
.ra-body { display: flex; flex-direction: column; min-height: 316px; }
/* .ja 退壳——JsonArea fill 已吃满 .ra-body 分节（RankDebugView:418 等五先例），
 外框 border/圆角随壳退役，与分节卡一体观感 */
.ra-body :deep(.ja) { flex: 1; min-height: 0; border: none; border-radius: 0; }
/* .ra-body-tt 规则随 .card-t.sm 合并退役（升档注释见模板） */
.ra-footer { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); flex-wrap: wrap; }
.ra-url { font-size: var(--fs-xs); color: var(--text-muted); min-width: 0; overflow-x: auto; }
.ra-url code { background: var(--code-bg); padding: var(--sp-0) var(--sp-1h); border-radius: 3px; }
.ra-btns { display: flex; gap: var(--sp-2); }
/* err 档私造双色双写退役（err-soft 底/err-line 边归 theme.css .err-bar 单源，
 role=alert 随挂）；ok 档去 radius/边框保语义绿素底（ok-soft）。margin-top/padding 为本页
 落位节奏保留 */
.ra-result { margin-top: var(--sp-3); padding: var(--sp-3) var(--sp-4); background: var(--ok-soft); color: var(--ok); }
.ra-result-tt { display: flex; align-items: center; gap: var(--sp-2); font-weight: 600; font-size: var(--fs-md); }
/* G3-B4：失败全文面板——限高可滚（ES 长错误不撑版） */
.ra-err-full { max-height: 160px; overflow: auto; margin-top: var(--sp-2); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-all; color: var(--err); }
.ra-result-b { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--text-muted); }
.ra-result-b code { background: var(--code-bg); padding: 1px var(--sp-1h); border-radius: 3px; color: var(--text); }
/* 查进度行内三态文案（进行中 x/y / 已完成 / 查不到降级） */
.ra-prog { color: var(--tx2); }
.ra-result-raw { margin-top: var(--sp-2); font-size: var(--fs-xs); }
.ra-result-raw summary { cursor: pointer; color: var(--text-muted); }
.ra-result-raw pre { background: var(--code-bg); padding: var(--sp-2) var(--sp-3); border-radius: 5px; overflow-x: auto; max-height: 300px; margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--text); }
.ra-result-jump { margin-top: var(--sp-2); }
/* 4 列栅格补响应断点——1100px 降 2 列、900px 降 1 列（ 标准档）；
 单列档 .ra-f.wide 的 span 2 会撑出隐式列，一并回落 auto */
@media (max-width: 1100px) { .ra-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ra-f.wide { grid-column: span 2; } }
@media (max-width: 900px) { .ra-grid { grid-template-columns: minmax(0, 1fr); } .ra-f.wide { grid-column: auto; } }

/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.ra-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
</style>
