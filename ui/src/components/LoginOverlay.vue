<template>
  <Teleport to="body">
    <!-- 不用 <transition>：类名推进依赖 rAF，Monaco 初始化等重任务阻塞主线程时
 过渡会卡死在 enter-from，留下 opacity:0 的透明遮罩永久拦截整页点击。
 改 CSS animation（样式系统驱动，不依赖 rAF 回调），离场直接卸载。 -->
    <div v-if="auth.showLogin" class="lo-mask">
        <div class="lo-card">
          <div class="lo-brand">
            <ShieldCheck :size="26" class="lo-ic" />
            <div>
              <div class="lo-title">{{ ui.product.name }}</div>
              <div class="lo-sub">请登录后继续操作</div>
            </div>
          </div>
          <div v-if="auth.builtinLogin === false" class="lo-host">
            <ShieldAlert :size="18" class="lo-host-ic" />
            <div>
              <div class="lo-host-t">由宿主鉴权接管</div>
              <div class="lo-host-d">当前部署使用自定义授权器/宿主委托，控制台不提供本地账号登录。请在宿主侧完成认证后重新检测，或刷新页面重试。</div>
            </div>
            <button class="btn sm" type="button" @click="retryHost">重新检测</button>
          </div>
          <form v-else @submit.prevent="doLogin">
            <label class="lo-label">用户名</label>
            <input v-model.trim="username" class="ipt lo-ipt" autocomplete="username" placeholder="admin" autofocus />
            <label class="lo-label">密码</label>
            <input v-model="password" type="password" class="ipt lo-ipt" autocomplete="current-password" placeholder="••••••••" />
            <div v-if="error" class="lo-err">{{ error }}</div>
            <button class="btn primary lo-btn" type="submit" :disabled="loading || !username || !password">
              <Loader2 v-if="loading" :size="13" class="spinning" />
              <LogIn v-else :size="13" />
              登录
            </button>
          </form>
          <div class="lo-hint">
            <Info :size="12" />
            <span>首次使用（尚未创建任何账号）可用默认账号 <code class="mono">admin / esquerystudio</code> 登录，登录后请尽快在「安全中心」修改密码。</span>
          </div>
        </div>
      </div>
  </Teleport>
</template>

<script setup lang="ts">
/* 全屏登录遮罩 —— 监听 api.ts 广播的 401 事件，任何请求未授权即弹出 */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { ShieldCheck, ShieldAlert, LogIn, Loader2, Info } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';
import { useUiConfigStore } from '../stores/uiConfig';
import { friendlyEsError } from '../utils/esError'; /* ：登录错误一行收口 */

const auth = useAuthStore();
const store = useAppStore();
const ui = useUiConfigStore();
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function doLogin() {
  loading.value = true;
  error.value = '';
  try {
    const r = await auth.login(username.value, password.value);
    password.value = '';
    // 登录成功后补拉连接列表+索引列表，修复首次未登录 401 导致的「尚无集群连接」/空列表残留态
    await store.loadConns().catch(() => {});
    store.loadIndices();
    if (r.fallback) {
      // 兜底账号登录成功：提醒建号（store 里 notify 由各视图消费，这里轻提示即可）
    }
  } catch (e: any) {
    /* 裸 e.message → friendlyEsError 一行收口（与全站错误面板同口径；
 friendly 未命中时回落原文，再兜底「登录失败」） */
    error.value = friendlyEsError(String(e?.message ?? e)) || '登录失败';
  } finally {
    loading.value = false;
  }
}

function onUnauthorized() {
  auth.requireLogin();
}

function retryHost() {
  auth.requireLogin();
  void auth.probe();
}

onMounted(() => window.addEventListener('esquerystudio:unauthorized', onUnauthorized));
onBeforeUnmount(() => window.removeEventListener('esquerystudio:unauthorized', onUnauthorized));
</script>

<style scoped>
.lo-mask {
  /* W8：z 收 --z-fullscreen 档（全屏门禁，等价旧裸值 10000） */
  position: fixed; inset: 0; z-index: var(--z-fullscreen); display: flex; align-items: center; justify-content: center;
  background: var(--mask-heavy); backdrop-filter: blur(6px);
  animation: lo-in .18s ease;
}
@keyframes lo-in { from { opacity: 0; } }
.lo-host { display: flex; align-items: flex-start; gap: var(--sp-2); padding: var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); }
.lo-host-ic { flex: none; color: var(--warn); margin-top: 1px; }
.lo-host-t { color: var(--tx1); font-weight: 650; margin-bottom: var(--sp-1); }
.lo-host-d { line-height: 1.5; }
.lo-host .btn { margin-left: auto; flex: none; }
.lo-card {
  width: 360px; max-width: 90vw; padding: 28px 28px 22px; border-radius: var(--r-l);
  background: var(--bg1); border: 1px solid var(--line); box-shadow: var(--shadow-pop);
}
.lo-brand { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: 20px; }
.lo-ic { color: var(--ac-hi); }
.lo-title { font-size: var(--fs-xl); font-weight: 650; color: var(--tx0); letter-spacing: .3px; }
.lo-sub { font-size: var(--fs-sm); color: var(--tx2); margin-top: var(--sp-0); }
.lo-label { display: block; font-size: var(--fs-xs); color: var(--tx2); margin: var(--sp-2h) 0 var(--sp-1); }
.lo-ipt { width: 100%; }
.lo-err { margin-top: var(--sp-2h); font-size: var(--fs-sm); color: var(--err); }
.lo-btn { width: 100%; margin-top: var(--sp-4); justify-content: center; }
.lo-hint {
  display: flex; gap: var(--sp-1h); align-items: flex-start; margin-top: var(--sp-4); padding-top: 14px;
  border-top: 1px dashed var(--line); font-size: var(--fs-xs); color: var(--tx2); line-height: 1.6;
}
.lo-hint svg { flex-shrink: 0; margin-top: var(--sp-0); }
.lo-hint code { color: var(--tx1); }
/* 本地 .spin 旋转档（自造 keyframes）退役，统一走 theme.css 全局 .spinning（svg 适用） */
</style>
