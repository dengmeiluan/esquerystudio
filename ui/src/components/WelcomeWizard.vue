<template>
  <n-modal
    :show="show && !auth.showLogin"
    preset="card"
    :bordered="false"
    :closable="false"
    :mask-closable="false"
    :trap-focus="false"
    style="width:640px;max-width:94vw"
    class="wz-card"
  >
    <template #header>
      <div class="wz-hd">
        <Sparkles :size="18" />
        <span>欢迎使用 {{ ui.product.name }} <span class="wz-hd-sub">· 傻瓜化 30 秒上手</span></span>
      </div>
    </template>

    <!-- 步进条 -->
    <div class="wz-steps">
      <div v-for="(s, i) in steps" :key="s.title"
           class="wz-step" :class="{ on: step === i, done: step > i }">
        <span class="wz-num">{{ i + 1 }}</span>
        <span class="wz-tt">{{ s.title }}</span>
      </div>
    </div>

    <!-- 步骤内容 -->
    <div class="wz-body">
      <!-- 1. 选索引 -->
      <div v-if="step === 0" class="wz-panel">
        <div class="wz-lead">选一个默认索引作为查询/浏览的起点。可随时通过命令面板切换。</div>
        <div class="wz-idx-list">
          <div v-for="idx in idxList" :key="idx"
               class="wz-idx" :class="{ on: chosenIdx === idx }"
               @click="chosenIdx = idx" role="button" tabindex="0" @keydown.enter.prevent="pickIdx(idx)" @keydown.space.prevent="pickIdx(idx)">
            <Database :size="12" />
            <span>{{ idx }}</span>
            <Check :size="14" v-if="chosenIdx === idx" class="wz-idx-ck" />
          </div>
          <div v-if="idxList.length === 0" class="wz-empty">
            未加载到索引，可稍后在集群连接恢复后重来
          </div>
        </div>
      </div>

      <!-- 2. 试跑样例 -->
      <div v-else-if="step === 1" class="wz-panel">
        <div class="wz-lead">选一个动作立刻上手：</div>
        <div class="wz-actions">
          <!-- 快捷入口键盘可达（role/tabindex/Enter， Overview 同口径） -->
          <div class="wz-act" role="button" tabindex="0" aria-label="集群概览：健康/节点/热索引" @click="go('/overview', '概览')" @keydown.enter.prevent="go('/overview', '概览')" @keydown.space.prevent="go('/overview', '概览')">
            <LayoutDashboard :size="16" /><b>集群概览</b>
            <span>健康/节点/热索引</span>
          </div>
          <div class="wz-act" role="button" tabindex="0" aria-label="一键体检：10 秒诊断报告" @click="go('/health-report', '一键体检')" @keydown.enter.prevent="go('/health-report', '一键体检')" @keydown.space.prevent="go('/health-report', '一键体检')">
            <HeartPulse :size="16" /><b>一键体检</b>
            <span>10 秒诊断报告</span>
          </div>
          <div class="wz-act" role="button" tabindex="0" aria-label="DSL 模板画廊：20+ 即插即用" @click="go('/templates-gallery', '模板画廊')" @keydown.enter.prevent="go('/templates-gallery', '模板画廊')" @keydown.space.prevent="go('/templates-gallery', '模板画廊')">
            <BookOpen :size="16" /><b>DSL 模板画廊</b>
            <span>20+ 即插即用</span>
          </div>
          <div class="wz-act" role="button" tabindex="0" aria-label="查询工作台：DSL/SQL/Lucene 六模式" @click="go('/search', '查询工作台')" @keydown.enter.prevent="go('/search', '查询工作台')" @keydown.space.prevent="go('/search', '查询工作台')">
            <TerminalSquare :size="16" /><b>查询工作台</b>
            <span>DSL/SQL/Lucene 六模式</span>
          </div>
        </div>
      </div>

      <!-- 3. 快捷键速览 -->
      <div v-else class="wz-panel">
        <div class="wz-lead">3 个必会快捷键，能秒切一切：</div>
        <div class="wz-hkl">
          <div class="wz-hk">
            <span><span class="kbd">Ctrl</span>+<span class="kbd">K</span></span>
            <b>命令面板</b>
            <span>跳转 / 动作 / 切索引，全能入口</span>
          </div>
          <div class="wz-hk">
            <span><span class="kbd">g</span> +字母</span>
            <b>Vim 风跳转</b>
            <span>{{ gotoHint }}</span>
          </div>
          <div class="wz-hk">
            <span><span class="kbd">?</span></span>
            <b>快捷键帮助</b>
            <span>随时打开完整键位</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="wz-ft">
        <label class="wz-skip">
          <input type="checkbox" v-model="dontShow" />
          <span>本设备不再显示</span>
        </label>
        <div class="wz-ft-r">
          <button class="btn sm ghost" v-if="step > 0" @click="step--">上一步</button>
          <button class="btn sm ghost" @click="finish(true)">跳过</button>
          <button v-if="step < steps.length - 1" class="btn sm pri" @click="next">下一步</button>
          <button v-else class="btn sm pri" @click="finish(false)">
            <PartyPopper :size="13" /> 开始使用
          </button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { NModal } from 'naive-ui';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useUiConfigStore } from '../stores/uiConfig';
import {
  Sparkles, Database, Check, LayoutDashboard, HeartPulse, BookOpen,
  TerminalSquare, PartyPopper,
} from 'lucide-vue-next';
import { GOTO_TARGETS } from '../utils/hotkeys';
import { writeStoredRaw } from '../utils/safeJson';

const ui = useUiConfigStore();
/* -13：首启引导里的 goto 示例原是硬编码「g h = 历史」——HistoryView 已退役，
 属于和速查面板同一类的「撒谎的界面」。改为从登记表取前三条，不再手工维护。
 功能包裁剪后只展示当前启用的页面，避免引导里宣传停用模块。 */
const gotoHint = computed(() => {
  const sample = Object.entries(GOTO_TARGETS)
    .filter(([k, t]) => k !== 'g' && ui.routeEnabled(t.path))
    .slice(0, 3);
  return sample.length
    ? sample.map(([k, t]) => `g ${k} = ${t.label}`).join('、') + '…'
    : '当前功能包未包含快捷键示例';
});

const store = useAppStore();
/* 登录遮罩弹出时收起引导：n-modal 的焦点陷阱会和登录框抢焦点，导致账号密码输不了字 */
const auth = useAuthStore();
const router = useRouter();
const LS_KEY = 'esquerystudio.wizard.done';

const show = ref(false);
const step = ref(0);
const dontShow = ref(true);
const chosenIdx = ref<string>('');

const steps = [
  { title: '选默认索引' },
  { title: '试跑样例' },
  { title: '快捷键速览' },
];

const idxList = computed(() => (store.indices || []).slice(0, 12).map((x: any) => (typeof x === 'string' ? x : x?.index || x?.name)).filter(Boolean));

function next() {
  if (step.value === 0 && chosenIdx.value) {
    store.pick(chosenIdx.value);
  }
  step.value = Math.min(step.value + 1, steps.length - 1);
}
/* W10：步 1 键盘连续性——Enter 此前只选中，「下一步」只能鼠标点。
 现按 Enter=选中并前进（store.pick 经 next() 同路生效）。鼠标点击仍仅选中：
 先比较几个索引再点「下一步」的挑选流不被 auto-advance 打断。 */
function pickIdx(idx: string) {
  chosenIdx.value = idx;
  next();
}
function go(path: string, _label: string) {
  if (chosenIdx.value) store.pick(chosenIdx.value);
  finish(false);
  router.push(path);
}
function finish(skipped: boolean) {
  /* 显式选择也落盘：勾选=不再自动弹（1），取消勾选=下次仍弹（0）。
     只在取消勾选时什么都不写，会让「回访用户抑制」把用户刚表达的重看意图吞掉。 */
  writeStoredRaw(localStorage, LS_KEY, dontShow.value ? '1' : '0');
  show.value = false;
  if (!skipped) store.notify?.('success', '欢迎面板已关闭，可通过 ⌘K → “重看引导” 再次呼出');
}

onMounted(() => {
  const done = localStorage.getItem(LS_KEY);
  if (done === '1') return;
  /* 回访用户不再自动弹：done 标志可能因换域名/存储分区/清站点数据而丢失，
     但「已有身份记录」说明引导早就看过——继续自动弹只会每次进页挡一层。
     done === '0' 是用户主动取消「本设备不再显示」，须尊重其重看意图。 */
  if (done !== '0' && localStorage.getItem('esquerystudio.last-user')) return;
  // .2：等真加载到索引再弹——connections-only 未选连接/集群不通时，
  // 第一步「选默认索引」是空态死胡同，弹了反而挡住选集群的引导横幅
  let fired = false;
  const ready = () => (store.indices || []).length > 0 && (auth.authDisabled || auth.me != null);
  watch(ready, (ok) => {
    if (!ok || fired || localStorage.getItem(LS_KEY) === '1') return;
    fired = true;
    setTimeout(() => {
      if (localStorage.getItem(LS_KEY) !== '1') show.value = true;
    }, 400);
  }, { immediate: true });
});

/* 暴露给外部（CmdPalette 重看引导） */
defineExpose({ open: () => { step.value = 0; show.value = true; }, });
</script>

<style scoped>
.wz-card :deep(.n-card-header) { padding-bottom: var(--sp-1h); }
.wz-hd { display: flex; align-items: center; gap: var(--sp-2); font-weight: 600; font-size: var(--fs-lg); }
.wz-hd-sub { color: var(--tx2); font-weight: 400; font-size: var(--fs-sm); }

.wz-steps { display: flex; gap: var(--sp-2); padding: var(--sp-0) 0 14px; border-bottom: 1px dashed var(--line); margin-bottom: 14px; }
.wz-step { flex: 1; display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1h) var(--sp-2h); border-radius: var(--r-s); background: var(--bg2); font-size: var(--fs-sm); color: var(--tx2); position: relative; }
.wz-step.on { background: var(--ac-soft); color: var(--ac-hi); box-shadow: 0 0 0 1px var(--ac) inset; }
.wz-step.done { background: var(--ok-soft); color: var(--ok); }
.wz-num { width: 20px; height: 20px; border-radius: 50%; background: var(--bg1); display: flex; align-items: center; justify-content: center; font-weight: 650; font-size: var(--fs-xs); }
.wz-step.on .wz-num, .wz-step.done .wz-num { background: currentColor; color: var(--bg1); }
.wz-tt { font-weight: 400; }

.wz-body { min-height: 220px; }
.wz-panel { display: flex; flex-direction: column; gap: var(--sp-3); }
.wz-lead { font-size: var(--fs-sm); color: var(--tx1); }

.wz-idx-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-1h); max-height: 200px; overflow-y: auto; }
.wz-idx { display: flex; align-items: center; gap: var(--sp-1h); padding: 7px var(--sp-2h); border-radius: var(--r-s); background: var(--bg2); border: 1px solid var(--line); cursor: pointer; font-family: var(--mono); font-size: var(--fs-xs); transition: all var(--tr); }
.wz-idx:hover { background: var(--bg1); border-color: var(--ac); }
.wz-idx.on { background: var(--ac-soft); border-color: var(--ac); color: var(--ac-hi); }
.wz-idx-ck { margin-left: auto; color: var(--ok); }
.wz-empty { padding: 20px; text-align: center; color: var(--tx3); font-size: var(--fs-sm); grid-column: 1 / -1; }

.wz-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2); }
.wz-act { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-1); padding: var(--sp-3) 14px; border-radius: var(--r-m); background: var(--bg2); border: 1px solid var(--line); cursor: pointer; transition: all var(--tr); }
.wz-act:hover { background: var(--ac-soft); border-color: var(--ac); transform: translateY(-1px); }
.wz-act b { font-size: var(--fs-md); }
.wz-act span { font-size: var(--fs-xs); color: var(--tx2); }

.wz-hkl { display: flex; flex-direction: column; gap: var(--sp-1h); }
.wz-hk { display: grid; grid-template-columns: 130px 100px 1fr; gap: var(--sp-3); align-items: center; padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); font-size: var(--fs-sm); }
.wz-hk b { color: var(--ac-hi); }
.wz-hk span:last-child { color: var(--tx2); }
.kbd { font-family: var(--mono); font-size: var(--fs-xs); padding: 1px 5px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: var(--r-xs); background: var(--bg1); color: var(--tx1); }

.wz-ft { display: flex; justify-content: space-between; align-items: center; }
.wz-skip { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-sm); color: var(--tx2); cursor: pointer; }
.wz-ft-r { display: flex; gap: var(--sp-1h); }

/* （轨5）：900 窄档（与 theme.css 900 档/utils/layout.ts BP_NARROW 单源互锚）——
 窄视口下双列卡格与「130px 100px 1fr」三列快捷键行挤压，降单列/竖排；
 纯 CSS 档内声明、模板零结构动，档内零 height/flex 尺寸声明（高度链红线自证） */
@media (max-width: 900px) {
  .wz-idx-list, .wz-actions { grid-template-columns: minmax(0, 1fr); }
  .wz-hk { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-0); }
}
</style>
