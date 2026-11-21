<!-- ·轨2：原始请求/响应快查弹窗（IndexHub/SqlConsole/Adhoc/Xmigrate 四页「原始 IO」钮共用）。
 数据源=api.ts ioRecorder 记录环（宿主传 rec，本组件零请求）；请求/响应两分节 Monaco 只读——
 json/ndjson 语言档吃 es-dark/es-light 既有主题 token 规则（键/串值/数字/标点语义分档高亮免费获得，
 ndjson 多根不挂 JSON LS 无误报红线）；每分节复制钮走 format.copyText 三层管线（全站唯一复制出口）；
 无记录空态 EmptyState 统一件。扁平化约定：弹窗内不套卡，Monaco 直贴，分节 border-top 承接；
 Monaco 定高 min(38vh,360px) 不随内容增长（弹窗内定高先例=doc 弹窗 min(60vh,Npx) 同口径降档），
 超小屏整体滚动由 .rim 兜底。壳=ModalShell 共享件（ConfirmModal 同源），Esc/遮罩关闭语义随壳。
 头部补字号三档 seg（rim.font 独立落盘——本弹层四页共用不挂页面键；
 dq/dt/ih 同源 EDITOR_FONT_TIERS 单源；请求/响应两 Monaco 同键 :font-size 接线）。 -->
<template>
  <ModalShell :show="show" label="原始 IO" width="960px" @close="close">
    <div v-if="rec" class="rim">
      <div class="rim-hd">
        <span class="rim-method">{{ rec.method }}</span>
        <span class="rim-url mono" :title="rec.url">{{ rec.url }}</span>
        <span class="rim-status" :class="statusCls" :title="statusText">{{ statusText }}</span>
        <!-- 字号三档 seg（rim.font 落盘；跨页独立弹层不挂页面键，
 dq/dt/ih 同源 EDITOR_FONT_TIERS 单源；请求/响应两 Monaco 同键同档） -->
        <span class="seg rim-font-seg" role="group" aria-label="编辑器字号档">
          <button v-for="f in EDITOR_FONT_TIERS" :key="f" type="button" :class="{ on: rimFont === f }"
            :title="'编辑器字号 ' + f + 'px'" @click="rimFont = f">{{ f }}</button>
        </span>
        <button class="btn ghost sm rim-close" aria-label="关闭原始 IO" title="关闭" @click="close"><X :size="13" /></button>
      </div>

      <section class="rim-sec">
        <div class="rim-sec-hd">
          <span class="rim-sec-t">原始请求</span>
          <span class="rim-meta">{{ reqMeta }}</span>
          <div class="rim-acts">
            <button class="btn ghost xs" aria-label="复制请求 JSON" title="复制请求体原文" @click="copyReq"><Copy :size="11" /> 复制 JSON</button>
            <button class="btn ghost xs" aria-label="复制为 curl" title="复制为可回放的 curl 命令（origin 取当前页面地址，不猜集群真名）" @click="copyCurl"><Terminal :size="11" /> 复制为 curl</button>
          </div>
        </div>
        <MonacoEditor :model-value="rec.requestBody" :language="reqLang" :readonly="true" height="min(38vh,360px)" :font-size="rimFont" />
      </section>

      <section class="rim-sec">
        <div class="rim-sec-hd">
          <span class="rim-sec-t">原始响应</span>
          <span class="rim-meta">{{ respMeta }}</span>
          <span v-if="rec.truncated" class="rim-trunc" title="原文超 200KB 记录上限，已截断保前段">已截断</span>
          <div class="rim-acts">
            <button class="btn ghost xs" aria-label="复制响应 JSON" title="复制响应原文（截断记录复制所得与展示一致）" @click="copyResp"><Copy :size="11" /> 复制 JSON</button>
          </div>
        </div>
        <MonacoEditor :model-value="rec.responseRaw" :language="respLang" :readonly="true" height="min(38vh,360px)" :font-size="rimFont" />
      </section>
    </div>
    <!-- 无记录空态：引导回页面先执行一次动作（不留死空白） -->
    <EmptyState v-else :icon="FileQuestion" text="暂无原始 IO 记录"
      hint="先在该页执行一次查询/操作（记录环近 30 条），再点「原始 IO」查看请求与响应原文" />
  </ModalShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Copy, Terminal, X, FileQuestion } from 'lucide-vue-next';
import ModalShell from './ModalShell.vue';
import MonacoEditor from './MonacoEditor.vue';
import EmptyState from './EmptyState.vue';
import { copyText, fmtSize } from '../utils/format';
import { usePref } from '../composables/urlState';
import { EDITOR_FONT_TIERS } from '../utils/editorTiers';
import { useAppStore } from '../stores/app';
import type { RawIoRec } from '../api';

const props = defineProps<{ show: boolean; rec: RawIoRec | null }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();
const store = useAppStore();

/* 字号三档落盘（rim.font，缺省=EDITOR_FONT_TIERS 首档=MonacoEditor 组件
 既有默认零漂移）——RawIoModal 跨四页共用，属独立弹层面，不挂任何页面键（dq/dt/ih 同形） */
const rimFont = usePref<number>('rim.font', EDITOR_FONT_TIERS[0]);

function close() { emit('update:show', false); }

/* 语言分档（与高亮语义分档配套）：单根 JSON → json（JSON LS 校验+键/值/数字四档 token）；
 多根 NDJSON → ndjson（自研 monarch，只高亮不校验——多根对象不被 json worker 整片红线）；
 其余纯文本（hot threads 等）→ plaintext，不产语法噪音。请求体/响应同口径。 */
function detectLang(s: string): string {
  const t = (s || '').trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return 'plaintext';
  return /[\]}]\s*[\r\n]\s*[\{[]/.test(t) ? 'ndjson' : 'json';
}
const reqLang = computed(() => detectLang(props.rec?.requestBody || ''));
const respLang = computed(() => detectLang(props.rec?.responseRaw || ''));

/* 状态语义分档三色：2xx+业务 ok → 绿档；4xx/5xx/业务 error → 红档；status=0（超时/网络/取消）→ 灰档 */
const statusCls = computed(() => {
  const r = props.rec;
  if (!r || r.status === 0) return 's-na';
  return r.ok ? 's-ok' : 's-err';
});
const statusText = computed(() => {
  const r = props.rec;
  if (!r) return '';
  if (r.status === 0) return '未完成（超时/网络/取消）';
  return `HTTP ${r.status} · ${(r.durationMs / 1000).toFixed(r.durationMs < 1000 ? 2 : 1)}s`;
});
const reqMeta = computed(() => fmtSize((props.rec?.requestBody || '').length));
const respMeta = computed(() => {
  const r = props.rec;
  if (!r) return '';
  return fmtSize(r.responseRaw.length) + (r.ok ? '' : ' · 异常响应');
});

/* curl 形态（Lead 预裁）：origin 取 window.location.origin，不猜集群真名；
 单引号体按 POSIX 惯例转义（'\''），无体请求不带 -d。 */
function curlText(): string {
  const r = props.rec!;
  const body = r.requestBody ? ` -d '${r.requestBody.replace(/'/g, `'\\''`)}'` : '';
  return `curl -X${r.method} '${window.location.origin}${r.url}' -H 'content-type: application/json'${body}`;
}

/* 复制统一走 format.copyText（L1 Clipboard API → L2 copy 事件劫持 → L3 焦点门），
   成败都 notify 反馈（DocDiffModal 同范式文案口径） */
async function copyReq() {
  const ok = await copyText(props.rec?.requestBody || '');
  store.notify(ok ? 'success' : 'error', ok ? '请求体已复制' : '复制失败：浏览器拦截了剪贴板');
}
async function copyResp() {
  const ok = await copyText(props.rec?.responseRaw || '');
  store.notify(ok ? 'success' : 'error', ok ? '响应原文已复制' : '复制失败：浏览器拦截了剪贴板');
}
async function copyCurl() {
  const ok = await copyText(curlText());
  store.notify(ok ? 'success' : 'error', ok ? 'curl 已复制' : '复制失败：浏览器拦截了剪贴板');
}
</script>

<style scoped>
/* 扁平化约定：弹窗内不套卡——头部行 + 两分节 border-top 承接，Monaco 直贴。
   token 化（间距/字号/圆角全走 --sp、--fs、--r 系列档位）；rim 整体滚动只作超小屏兜底，Monaco 自身定高不增长 */
/* 编辑器外框退役（约定③）——monaco-host 是 MonacoEditor 根、携本组件
   scope id，本弹窗仅请求/响应两处直挂 Monaco，scoped 裸类规则直接命中（MappingView
   弹窗先例）；rim-sec-hd/border-top 自承分界 */
.monaco-host { border: none; border-radius: 0; }
.rim { display: flex; flex-direction: column; max-height: 86vh; overflow: auto; }
.rim-hd { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); }
.rim-method { flex-shrink: 0; font-size: var(--fs-2xs); font-weight: 650; letter-spacing: .04em; padding: var(--sp-0) var(--sp-1h); border-radius: var(--r-s); background: var(--ac-soft); color: var(--ac-hi); }
.rim-url { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-xs); color: var(--tx1); }
.rim-status { flex-shrink: 0; font-size: var(--fs-2xs); line-height: 1; padding: var(--sp-1) var(--sp-2); border-radius: 999px; white-space: nowrap; }
.rim-status.s-ok { color: var(--ok); background: var(--ok-soft); }
.rim-status.s-err { color: var(--err); background: var(--err-soft); }
.rim-status.s-na { color: var(--tx2); background: var(--bg2); }
.rim-close { flex-shrink: 0; margin-left: var(--sp-1h); }
/* 分节：border-top 承接分界（sq-sec 543 同语言）；分节头行首横排（卡头约定②形态） */
.rim-sec { border-top: 1px solid var(--border); }
.rim-sec-hd { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); font-size: var(--fs-sm); font-weight: 650; }
.rim-sec-t { color: var(--tx0); }
.rim-meta { font-size: var(--fs-xs); font-weight: 400; color: var(--tx2); }
.rim-trunc { font-size: var(--fs-2xs); line-height: 1; padding: var(--sp-1) var(--sp-2); border-radius: 999px; color: var(--warn); background: var(--warn-line); }
.rim-acts { display: flex; gap: var(--sp-1h); margin-left: auto; }
/* 字号 seg 尺寸锚（dt/dq-font-seg 同形——.seg 全局基类+本弹窗档钮压尺寸） */
.rim-font-seg { flex-shrink: 0; }
.rim-font-seg button { padding: 0 var(--sp-1h); font-size: var(--fs-xs); line-height: 1.8; }
</style>
