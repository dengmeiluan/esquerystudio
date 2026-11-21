<template>
  <Teleport to="body">
    <transition name="sw-fade">
      <div v-if="show" class="sw-mask">
        <div class="sw-card">
          <div class="sw-brand">
            <DatabaseZap :size="26" class="sw-ic" />
            <div>
              <div class="sw-title">连接控制集群</div>
              <div class="sw-sub">首次使用：控制台需要一个 Elasticsearch 集群存放用户、连接与审计数据</div>
            </div>
          </div>
          <form @submit.prevent="onSubmit">
            <label class="sw-label">集群地址 <span class="sw-req">*</span></label>
            <input v-model.trim="url" class="ipt sw-ipt mono" placeholder="http://es-host:9200" autofocus @keydown.enter.prevent="onSubmit" />
            <div class="sw-row">
              <div class="sw-col">
                <label class="sw-label">用户名（可选）</label>
                <input v-model.trim="username" class="ipt sw-ipt" autocomplete="off" placeholder="elastic" @keydown.enter.prevent="onSubmit" />
              </div>
              <div class="sw-col">
                <label class="sw-label">密码（可选）</label>
                <input v-model="password" type="password" class="ipt sw-ipt" autocomplete="new-password" placeholder="••••••••" @keydown.enter.prevent="onSubmit" />
              </div>
            </div>

            <template v-if="tokenRequired">
              <label class="sw-label">初始化令牌 <span class="sw-req">*</span></label>
              <input v-model.trim="setupToken" type="password" class="ipt sw-ipt mono"
                autocomplete="off" placeholder="X-Setup-Token（服务端 esquerystudio.elasticsearch.console.setup-token）"
                @keydown.enter.prevent="onSubmit" />
            </template>

            <div v-if="testResult" class="sw-test" :class="testResult.ok ? 'ok' : 'err'">
              <template v-if="testResult.ok">
                <CheckCircle2 :size="13" />
                <span>连通成功：<b class="mono">{{ testResult.clusterName }}</b>
                  · v{{ testResult.version }}
                  <!-- status 裸 GREEN/YELLOW/RED 换 StatusPill（中文主显 + en 英文小字；
 tone 走 healthPill——全等小写匹配，后端大写枚举先归一） -->
                  <template v-if="testResult.status"> · <StatusPill :tone="healthPill(testResult.status.toLowerCase())" :label="clusterHealthZh(testResult.status) || testResult.status" :en="testResult.status" /> · {{ testResult.nodes }} 节点</template>
                </span>
              </template>
              <template v-else>
                <XCircle :size="13" />
                <span>连接失败：{{ testResult.message }}</span>
              </template>
            </div>
            <div v-if="error" class="sw-err">{{ error }}</div>

            <div class="sw-actions">
              <button class="btn ghost" type="button" :disabled="testing || !url" @click="doTest">
                <Loader2 v-if="testing" :size="13" class="spinning" />
                <PlugZap v-else :size="13" />
                测试连接
              </button>
              <button class="btn primary" type="submit" :disabled="applying || !url || !testResult?.ok">
                <Loader2 v-if="applying" :size="13" class="spinning" />
                <Link2 v-else :size="13" />
                绑定并初始化
              </button>
            </div>
          </form>
          <div class="sw-hint">
            <Info :size="12" />
            <span>绑定后将在目标集群上幂等创建控制索引（用户/连接档案/操作审计），并把连接档案落在服务器本地
              <code class="mono">~/.esquerystudio/{{ appName }}/</code>；重绑需 ADMIN 在「安全中心」操作。绑定动作只允许执行一次，请先测试连接。</span>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
/* 控制集群首连向导 —— 监听 api.ts 广播的 409 SETUP_REQUIRED 事件 + 启动时主动查 status */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { DatabaseZap, PlugZap, Link2, Loader2, Info, CheckCircle2, XCircle } from 'lucide-vue-next';
import { api } from '../api';
import { friendlyEsError } from '../utils/esError';
import StatusPill from './StatusPill.vue';
/* 连通成功 status 改用 StatusPill——healthPill tone 档 + clusterHealthZh 中文
 （esEnumZh 单源），与 ClusterSwitcher 连通测试结果同口径 */
import { healthPill } from '../utils/format';
import { clusterHealthZh } from '../utils/esEnumZh';

const show = ref(false);
const appName = ref('default');
const url = ref('');
const username = ref('');
const password = ref('');
const testing = ref(false);
const applying = ref(false);
const testResult = ref<{ ok: boolean; clusterName?: string; version?: string; status?: string; nodes?: number; message?: string } | null>(null);
const error = ref('');
/* 服务端配置 setup-token 时（/setup/status.setupTokenRequired）显示令牌输入并随 test/apply 发送。 */
const tokenRequired = ref(false);
const setupToken = ref('');

async function doTest() {
  testing.value = true;
  error.value = '';
  testResult.value = null;
  try {
    testResult.value = await api.setup.test(
      { url: url.value, username: username.value || undefined, password: password.value || undefined },
      setupToken.value || undefined);
  } catch (e: any) {
    // 403 ALREADY_BOUND（并发绑定）等：直接展示并建议刷新
    /* A：ES 错误友好化——裸 message 换全站 friendlyEsError 口径 */
    error.value = '测试失败：' + friendlyEsError(String(e?.message ?? e));
  } finally {
    testing.value = false;
  }
}

async function doApply() {
  if (!testResult.value?.ok) return;
  /* 2.1.6：执行体防重 */
  if (applying.value) return;
  applying.value = true;
  error.value = '';
  try {
    await api.setup.apply(
      { url: url.value, username: username.value || undefined, password: password.value || undefined },
      setupToken.value || undefined);
    // 绑定成功：整页刷新，让全部存储走新控制集群重新初始化
    window.location.reload();
  } catch (e: any) {
    /* A：ES 错误友好化（同上款口径） */
    error.value = '绑定失败：' + friendlyEsError(String(e?.message ?? e));
    applying.value = false;
  }
}

/* W10：Enter 一键串联——表单内按 Enter 此前被 disabled 提交钮静默吃掉
 （disabled submit 按钮会阻断浏览器隐式提交），用户输完地址必须回头鼠标点「测试连接」。
 分派：无测试结果 → doTest；已 ok → doApply（再按 Enter 即绑定）。提交钮 disabled
 语义保留给鼠标路径；@keydown.enter.prevent 在 input 上显式接管，跨浏览器一致。 */
function onSubmit() {
  if (!url.value || testing.value || applying.value) return;
  if (!testResult.value?.ok) void doTest();
  else void doApply();
}

function onSetupRequired() {
  if (!show.value) {
    show.value = true;
    refreshStatus();
  }
}

async function refreshStatus() {
  try {
    const s = await api.setup.status();
    if (!s || typeof s !== 'object') return;
    appName.value = s.appName || 'default';
    tokenRequired.value = !!s.setupTokenRequired;
    // 防御：已绑定（别处并发绑好 / 误触发事件）就不弹
    if (s.bound) show.value = false;
  } catch {
    // status 免鉴权，失败通常是网络问题——保持当前显隐
  }
}

onMounted(async () => {
  window.addEventListener('esquerystudio:setup-required', onSetupRequired);
  // 启动主动探测：NONE 模式下首屏请求可能被并发 409，主动查更快弹出
  try {
    const s = await api.setup.status();
    /* 非 JSON 响应（context-path 配错时反代回宿主 SPA 的 HTML）不是「未绑定」：
       把 HTML 字符串当状态对象会因 bound 缺失误弹向导（产线实报）。 */
    if (!s || typeof s !== 'object') return;
    appName.value = s.appName || 'default';
    tokenRequired.value = !!s.setupTokenRequired;
    if (s.bound === false) show.value = true;
  } catch {
    // 后端老版本无此端点（404）：静默，永不弹
  }
});
onBeforeUnmount(() => window.removeEventListener('esquerystudio:setup-required', onSetupRequired));
</script>

<style scoped>
.sw-mask {
  /* W8：z 收 --z-fullscreen 档 +1——向导门禁必须盖过登录浮层（同档 10000），故 calc 加一 */
  position: fixed; inset: 0; z-index: calc(var(--z-fullscreen) + 1); display: flex; align-items: center; justify-content: center;
  background: var(--mask-heavy); backdrop-filter: blur(6px);
}
.sw-card {
  width: 460px; max-width: 92vw; padding: 28px 28px 22px; border-radius: var(--r-l);
  background: var(--bg1); border: 1px solid var(--line); box-shadow: var(--shadow-pop);
}
.sw-brand { display: flex; align-items: flex-start; gap: var(--sp-3); margin-bottom: 18px; }
.sw-ic { color: var(--ac-hi); flex-shrink: 0; margin-top: var(--sp-0); }
.sw-title { font-size: var(--fs-xl); font-weight: 650; color: var(--tx0); letter-spacing: .3px; }
.sw-sub { font-size: var(--fs-sm); color: var(--tx2); margin-top: var(--sp-0); line-height: 1.5; }
.sw-label { display: block; font-size: var(--fs-xs); color: var(--tx2); margin: var(--sp-2h) 0 var(--sp-1); }
.sw-req { color: var(--err); }
.sw-ipt { width: 100%; }
.sw-row { display: flex; gap: var(--sp-2h); }
.sw-col { flex: 1; min-width: 0; }
.sw-test {
  display: flex; align-items: center; gap: var(--sp-1h); margin-top: var(--sp-3); padding: var(--sp-2) var(--sp-2h);
  font-size: var(--fs-sm); border-radius: var(--r-s); line-height: 1.35;
}
.sw-test svg { flex-shrink: 0; }
.sw-test.ok { color: var(--ok); background: var(--ok-soft); border: 1px solid var(--ok-line); }
.sw-test.err { color: var(--err); background: var(--err-soft); border: 1px solid var(--err-line); }
.sw-err { margin-top: var(--sp-2h); font-size: var(--fs-sm); color: var(--err); }
.sw-actions { display: flex; gap: var(--sp-2h); margin-top: var(--sp-4); }
.sw-actions .btn { flex: 1; justify-content: center; }
.sw-hint {
  display: flex; gap: var(--sp-1h); align-items: flex-start; margin-top: var(--sp-4); padding-top: 14px;
  border-top: 1px dashed var(--line); font-size: var(--fs-xs); color: var(--tx2); line-height: 1.6;
}
.sw-hint svg { flex-shrink: 0; margin-top: var(--sp-0); }
.sw-hint code { color: var(--tx1); }
.sw-fade-enter-active, .sw-fade-leave-active { transition: opacity .18s ease; }
.sw-fade-leave-active { pointer-events: none; }
.sw-fade-enter-from, .sw-fade-leave-to { opacity: 0; }
</style>
