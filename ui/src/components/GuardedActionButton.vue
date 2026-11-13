<!-- 同构确认弹窗双实现——数值改动必须两边同步(另一半:ConfirmModal.vue) -->
<template>
  <button class="btn pri" :disabled="!can || disabled || phase === 'estimating'" @click="start">
    <Loader2 v-if="phase === 'estimating'" :size="13" class="spinning" />
    {{ label }}
  </button>

  <!-- 影响预估确认卡（护栏协议：未看预估不能执行）。
 mask+box 壳层合并 ModalShell 共享件（同构确认弹窗双实现合流），
 本组件只余业务体；焦点陷阱仍走本组件 boxRef 容器（含 foot，语义逐字不变） -->
  <ModalShell :show="modalOpen" label="影响预估" width="480px" @close="close">
    <div ref="boxRef" class="ga">
      <div class="ga-risk" :class="'risk-' + (riskLevel || 'MEDIUM').toLowerCase()"></div>
      <div class="ga-head">
        <ShieldCheck :size="15" class="ga-icon" />
        <span class="ga-title">影响预估</span>
        <span class="pill n ga-badge" :class="'risk-' + (riskLevel || 'MEDIUM').toLowerCase()">{{ riskText }}</span>
      </div>

      <div class="ga-body">
        <!-- 护栏错误双轨——首行 friendlyEsError 人话，errPreHtml v-html 全文兜底
 （含 { 走 highlightJson 着色、否则转义平文）；.ga-error 布局容器类名契约保留 -->
        <!-- 护栏错误盒合并 err-bar 档（role=alert；bg/border/radius/padding 归
 theme.css .err-bar 单源，.ga-error 类锚保留——guardedBtn499 挂载锁同路径零迁；
 弹层内零高度副作用：ga-body 容器 auto 高无定高链，仅盒模型微差在 theme 档容差内；
 友好行+全文 pre 双轨保留） -->
        <div v-if="error" role="alert" class="err-bar ga-error">
          <div class="ga-error-h">{{ friendlyError }}</div>
          <pre class="ga-error-pre" v-html="errPreHtml(error, errMeta(errorRaw))"></pre>
        </div>
        <template v-if="estimate">
          <div class="ga-summary">{{ estimate.summary }}</div>
          <div v-if="items.length" class="ga-items">
            <div v-for="it in items" :key="it.key" class="ga-item">
              <span class="mono ga-item-key">{{ it.key }}</span>
              <span class="mono ga-item-val">= {{ fmtVal(it.value) }}</span>
              <span class="pill n ga-kind" :class="'k-' + String(it.kind).toLowerCase()">{{ kindText(it.kind) }}</span>
            </div>
          </div>
          <!-- Dry-run 结果内联 -->
          <div v-if="dryRunResult" class="ga-dry" :class="{ ok: dryRunResult.ok }">
            <template v-if="dryRunResult.ok">✓ Dry-run 通过：变更校验无问题</template>
            <template v-else>
              Dry-run 发现 {{ (dryRunResult.issues || []).length }} 个问题：
              <div v-for="(iss, i) in dryRunResult.issues" :key="i" class="ga-dry-issue">
                <b>{{ iss.severity }}</b> {{ iss.message }}
                <span v-if="iss.suggestion" class="ga-dry-sug">{{ iss.suggestion }}</span>
              </div>
            </template>
          </div>
        </template>
      </div>

      <!-- HIGH 风险：输入确认文案解锁 -->
      <div v-if="estimate && riskLevel === 'HIGH' && guardText" class="ga-guard">
        <div class="ga-guard-tip">高危操作，输入 <b class="mono">{{ guardText }}</b> 以解锁执行：</div>
        <input v-model="guardInput" class="inp mono" :placeholder="guardText" />
      </div>

      <div class="ga-foot">
        <button class="btn" @click="close">取消</button>
        <button v-if="estimate && estimate.supportsDryRun" class="btn" :disabled="phase === 'dryRunning' || phase === 'executing'" @click="doDryRun">
          <Loader2 v-if="phase === 'dryRunning'" :size="13" class="spinning" />
          先 Dry-run
        </button>
        <button v-if="estimate" class="btn danger" :disabled="!canExecute" @click="doExecute">
          <Loader2 v-if="phase === 'executing'" :size="13" class="spinning" />
          确认执行
        </button>
      </div>
    </div>
  </ModalShell>

  <!-- 执行回执滑出条（5s 自淡出，审计可按 receiptId 检索） -->
  <teleport to="body">
    <transition name="ga-slide">
      <div v-if="receipt" class="ga-receipt">
        <CheckCircle2 :size="15" class="ga-receipt-icon" />
        <div class="ga-receipt-main">
          <div class="ga-receipt-title">已执行 · 回执 <span class="mono">{{ shortReceipt }}</span></div>
          <div class="ga-receipt-sub">操作已写入审计流水，可按回执号检索</div>
        </div>
        <button class="ga-receipt-close" @click="receipt = null">×</button>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-vue-next';
import { api, ApiError } from '../api';
import { trapTabKey } from '../utils/focusTrap';
/* 护栏错误人话行 + errPreHtml v-html 全文内核 */
import { friendlyEsError } from '../utils/esError';
import { errPreHtml, errMeta } from '../utils/errPre';
/* mask+box 壳层共享件（同构确认弹窗双实现合流） */
import ModalShell from './ModalShell.vue';

/** GuardedActionButton：护栏动作按钮——状态机 idle→estimating→confirming→(dryRunning)→executing→receipt。
 estimate 拿 confirmToken，execute 必须带 token（无/过期/参数篡改后端一律 403）。 */
const props = withDefaults(defineProps<{
  actionId: string;
  params: Record<string, any>;
  label?: string;
  /** HIGH 风险时要求输入的确认文案（如索引名），非 HIGH 忽略 */
  guardText?: string;
  disabled?: boolean;
  /** 执行体权限门（父组件按真实端点判定；缺省 false——新调用点漏传时不得默认放行） */
  can?: boolean;
}>(), {
  label: '执行',
  guardText: '',
  disabled: false,
  can: false,
});

const emit = defineEmits<{ (e: 'executed', receipt: any): void }>();

type Phase = 'idle' | 'estimating' | 'confirming' | 'dryRunning' | 'executing';
const phase = ref<Phase>('idle');
const modalOpen = ref(false);
const boxRef = ref<HTMLElement>();
const estimate = ref<any>(null);
const dryRunResult = ref<any>(null);
const error = ref('');
/* 534 收口波双参改用：原始错误对象旁路留存（catch 压串丢 code/endpoint，喂 errMeta 用） */
const errorRaw = ref<unknown>(null);
/* 错误面板首行人话摘要（pre 仍保全文） */
const friendlyError = computed(() => friendlyEsError(error.value));
const guardInput = ref('');
const receipt = ref<any>(null);
let receiptTimer: number | undefined;

const riskLevel = computed(() => estimate.value?.riskLevel as string | undefined);
const riskText = computed(() =>
  riskLevel.value === 'HIGH' ? '高危' : riskLevel.value === 'LOW' ? '低危' : '中危');
const items = computed(() => (estimate.value?.analysis?.items ?? []) as any[]);
const shortReceipt = computed(() => String(receipt.value?.receiptId || '').slice(0, 8));

const canExecute = computed(() => {
  if (!props.can || !estimate.value || phase.value === 'executing' || phase.value === 'dryRunning') return false;
  if (riskLevel.value === 'HIGH' && props.guardText) return guardInput.value === props.guardText;
  return true;
});

function kindText(kind: string) {
  return kind === 'DYNAMIC' ? '可热更' : kind === 'STATIC' ? '需重建' : '非法';
}
function fmtVal(v: any) {
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

async function start() {
  if (!props.can) return;
  modalOpen.value = true;
  phase.value = 'estimating';
  estimate.value = null;
  dryRunResult.value = null;
  error.value = '';
  errorRaw.value = null;
  guardInput.value = '';
  try {
    estimate.value = await api.insight.estimate(props.actionId, props.params);
    phase.value = 'confirming';
  } catch (e: any) {
    // 错误呈现在弹层内，不弹全局
    error.value = e?.message || '影响预估失败';
    errorRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint） */
    phase.value = 'idle';
  }
}

async function doDryRun() {
  if (!props.can) return;
  phase.value = 'dryRunning';
  error.value = '';
  errorRaw.value = null;
  try {
    dryRunResult.value = await api.insight.dryRun(props.actionId, props.params);
  } catch (e: any) {
    error.value = e?.message || 'Dry-run 失败';
    errorRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint） */
  } finally {
    phase.value = 'confirming';
  }
}

async function doExecute() {
  if (!props.can || !canExecute.value) return;
  phase.value = 'executing';
  error.value = '';
  errorRaw.value = null;
  try {
    const r = await api.insight.execute(props.actionId, props.params, estimate.value.confirmToken);
    modalOpen.value = false;
    phase.value = 'idle';
    receipt.value = r;
    if (receiptTimer) window.clearTimeout(receiptTimer);
    receiptTimer = window.setTimeout(() => { receipt.value = null; }, 5000);
    emit('executed', r);
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 403) {
      // token 过期/失效：回到 estimating 重新预估
      error.value = '预估已过期，请重新查看影响预估';
      errorRaw.value = e; /* 534 收口波：原始对象旁路（403 ApiError 的 code/endpoint 仍可辨） */
      estimate.value = null;
      dryRunResult.value = null;
      phase.value = 'idle';
    } else {
      error.value = e?.message || '执行失败';
      errorRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint） */
      phase.value = 'confirming';
    }
  }
}

function close() {
  if (phase.value === 'executing') return;
  modalOpen.value = false;
  phase.value = 'idle';
}

/* Tab 焦点陷阱（与 ConfirmModal 同基线；close 自带 executing 保护，执行中不会误关）。
 收键已由 ModalShell 壳层 document 捕获级单源承接——本组件 @close 即
 close（executing 保护在函数内不变），与原自持分支语义等价。 */
function onKey(e: KeyboardEvent) {
  if (!modalOpen.value) return;
  if (boxRef.value) trapTabKey(boxRef.value, e);
}
window.addEventListener('keydown', onKey);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
/* 本地 .spin 旋转档（自造 keyframes，0.9s 双速残留）退役，统一走 theme.css 全局 .spinning
 （svg 适用，速度随全局归一 1s——spinSpeed456 的漏网档收口） */

/* mask/box 壳 CSS（.ga-mask/.ga）合并 ModalShell 单源，本地段只余业务体；
 foot（.ga-foot）保留自持（与 ConfirmModal .cf-foot 同值，语义锚不动） */
/* 风险色阶条 */
.ga-risk { height: 3px; }
.ga-risk.risk-low { background: var(--info); }
.ga-risk.risk-medium { background: var(--warn); }
.ga-risk.risk-high { background: var(--err); }
.ga-head { display: flex; align-items: center; gap: var(--sp-2); padding: 14px var(--sp-4) 0; }
.ga-icon { color: var(--ac-hi); flex-shrink: 0; }
.ga-title { font-size: var(--fs-md); font-weight: 650; }
.ga-badge {margin-left: auto;}
.ga-badge.risk-low {color: var(--info);}
.ga-badge.risk-medium {color: var(--warn);}
.ga-badge.risk-high {color: var(--err);}
.ga-body { padding: var(--sp-2h) var(--sp-4) var(--sp-1h); font-size: var(--fs-sm); line-height: 1.6; }
/* .ga-error 本地红壳（err 色/err-soft 底/err-line 边/r-s 圆角/padding）随合并
 err-bar 档退役归 theme.css 单源——类名保留作挂载锁锚，布局容器语义不变 */
/* 护栏错误双轨内件——人话行 + 全文 pre（token 取值，限高防长堆栈撑爆弹层） */
.ga-error-h { font-weight: 400; }
.ga-error-pre { margin: var(--sp-1) 0 0; font-family: var(--mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; color: var(--fg); max-height: 160px; overflow: auto; }
.ga-summary { color: var(--tx0); margin-bottom: var(--sp-2); }
.ga-items { display: flex; flex-direction: column; gap: var(--sp-1); margin-bottom: var(--sp-2); }
.ga-item { display: flex; align-items: center; gap: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); padding: 5px 9px; font-size: var(--fs-sm); }
.ga-item-key { color: var(--tx0); }
.ga-item-val { color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
.ga-kind { margin-left: auto; flex-shrink: 0; }
.ga-kind.k-dynamic {color: var(--ok);}
.ga-kind.k-static {color: var(--warn);}
.ga-kind.k-illegal {color: var(--err);}
.ga-dry { border: 1px solid var(--line); border-radius: var(--r-s); padding: 7px var(--sp-2h); font-size: var(--fs-sm); color: var(--warn); background: var(--warn-soft); }
.ga-dry.ok { color: var(--ok); background: var(--ok-soft); border-color: var(--ok-line); }
.ga-dry-issue { margin-top: var(--sp-1); color: var(--tx0); }
.ga-dry-sug { color: var(--tx1); margin-left: var(--sp-1h); }
.ga-guard { padding: 0 var(--sp-4) var(--sp-2h); }
.ga-guard-tip { font-size: var(--fs-sm); color: var(--tx1); margin-bottom: var(--sp-1h); }
.ga-guard-tip b { color: var(--err); }
.ga-foot { display: flex; justify-content: flex-end; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--line); background: var(--bg0); }

/* 回执滑出条 */
.ga-receipt { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: var(--z-receipt); display: flex; align-items: center; gap: var(--sp-2h); background: var(--bg1); border: 1px solid var(--ok-line); border-radius: var(--r-m); box-shadow: var(--shadow-pop); padding: 9px 14px; max-width: 520px; }
.ga-receipt-icon { color: var(--ok); flex-shrink: 0; }
.ga-receipt-title { font-size: var(--fs-sm); font-weight: 600; color: var(--tx0); }
.ga-receipt-sub { font-size: var(--fs-xs); color: var(--tx1); }
.ga-receipt-close { background: none; border: none; color: var(--tx2); font-size: var(--fs-xl); cursor: pointer; padding: 0 var(--sp-0); }
.ga-receipt-close:hover { color: var(--tx0); }
.ga-slide-enter-active, .ga-slide-leave-active { transition: all .28s cubic-bezier(.2, .7, .3, 1); }
.ga-slide-enter-from, .ga-slide-leave-to { opacity: 0; transform: translateX(-50%) translateY(-14px); }
</style>
