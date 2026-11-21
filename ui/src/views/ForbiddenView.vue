<template>
  <div class="forbidden-wrap">
    <NResult status="403" :title="'暂无「' + pageName + '」功能权限'" :description="reason">
      <template #footer>
        <div class="fb-actions">
          <NButton v-if="showHome" @click="goHome">回到概览</NButton>
          <NButton @click="copyApply">复制申请信息</NButton>
        </div>
      </template>
      <div class="fb-facts" role="status">
        <div class="fb-row"><span>页面</span><b>{{ pageName }}</b><code v-if="pageKey">{{ pageKey }}</code></div>
        <div class="fb-row"><span>当前身份</span><b>{{ role }}</b><code v-if="auth.me?.username">{{ auth.me.username }}</code></div>
        <div class="fb-row"><span>目标连接</span><b>{{ targetLabel }}</b></div>
        <div class="fb-row"><span>拒绝原因</span><b>{{ reasonKind }}</b></div>
        <div class="fb-row"><span>前端版本</span><b class="mono">{{ starterVersion }}</b><span v-if="!auth.probed" style="color:var(--warn)">（身份确认中，自动回迁重试中…）</span></div>
      </div>
    </NResult>
  </div>
</template>

<script setup lang="ts">
/* 2.5.0 菜单 SPI：页面级授权拒绝落地页。
   984：从「只说页面名」升级为可归因、可行动——用户按旧文案找管理员勾菜单，管理员看到菜单
   明明勾了（实为 env 模板收缩 / 目标连接无键 / host-bound），问题原地打转。
   这里给出页面 key、身份、目标连接、真实原因，并提供一键复制申请信息。 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NResult } from 'naive-ui';
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';
import { pageAllowed } from '../router';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useAppStore();
/* 构建期注入的 starter 版本（vite define）：拒绝面板自报版本，缓存旧 bundle 的
   「改了没生效」类报告可一眼定界（用户截图版本号 vs 发版单）。 */
const starterVersion = __STARTER_VERSION__;
const pageName = computed(() => String(route.query.name || '该页面'));
const pageKey = computed(() => String(route.query.page || ''));
const role = computed(() => auth.me?.role || (auth.authDisabled ? '未启用鉴权' : '身份未就绪'));
const targetLabel = computed(() => {
  const t = String(store.target || 'host');
  return t === 'host' ? '宿主集群（host）' : t;
});

/* 归因三态：未启用页面授权（角色档不足）/ 未授予该页 / 已授予但被环境或作用域收窄。
   判定只用前端已有真源（grantedPages 三态 + envAllows），不臆造后端状态。 */
const reasonKind = computed(() => {
  if (!auth.probed) return '身份尚在确认中（稍后自动刷新）';
  if (auth.authDisabled) return '本部署未启用鉴权，403 来自业务规则';
  const gp = auth.grantedPages;
  if (gp === null) return '当前角色不足（本部署未启用页面级授权）';
  if (!pageKey.value) return '当前账号未被授予该功能页面';
  const hasKey = gp.includes(pageKey.value)
    || gp.some(k => k.startsWith('conn:') && (k.endsWith(':' + pageKey.value) || k.endsWith(':w:' + pageKey.value)));
  if (!hasKey) return '当前账号未被授予该功能页面';
  return '页面已授权，但当前目标连接不可见或环境模板未开放该页';
});
const reason = computed(() => {
  const tail = '如需开通，请把下方「申请信息」发给管理员（宿主系统 → 角色权限 → 勾选对应菜单）。';
  if (reasonKind.value === '页面已授权，但当前目标连接不可见或环境模板未开放该页') {
    return '该页面授权存在，但当前目标连接/环境把它收窄了：可先在顶栏切换到有权限的连接，或请管理员检查该连接的环境模板。' + tail;
  }
  return reasonKind.value + '。' + tail;
});

/* 概览页不可达时（全拒 [] / 白名单不含 overview / 当前连接无 overview 键）「回到概览」会被守卫再拦回本页
 （自跳转死胡同）——仅文案引导，不渲染 CTA。963：判定复用 pageAllowed（与守卫/侧栏同一真源，
 兼容 conn:{id}:overview 键——旧裸 includes('overview') 对连接模型恒 false，会误藏可达的回站入口）。 */
const showHome = computed(() => auth.isAdmin() || pageAllowed(auth.grantedPages, '/overview', store.target, auth.envAllows, auth.me?.role));
function goHome() { router.replace('/'); }

async function copyApply() {
  const text = [
    '控制台权限申请',
    `页面：${pageName.value}${pageKey.value ? '（' + pageKey.value + '）' : ''}`,
    `当前身份：${role.value}${auth.me?.username ? ' / ' + auth.me.username : ''}`,
    `目标连接：${targetLabel.value}`,
    `原因判断：${reasonKind.value}`,
    `访问路径：${route.fullPath}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    store.notify('success', '申请信息已复制，可发给管理员');
  } catch {
    store.notify('warning', '浏览器拦截了剪贴板，请手动复制页面上的权限信息');
  }
}
</script>

<style scoped>
.forbidden-wrap { display: flex; align-items: center; justify-content: center; min-height: 60vh; min-width: 0; }
.fb-actions { display: flex; gap: var(--sp-2); justify-content: center; }
.fb-facts { margin-top: var(--sp-3); display: flex; flex-direction: column; gap: 6px; text-align: left;
  border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); padding: var(--sp-3) var(--sp-4); font-size: var(--fs-sm); }
.fb-row { display: flex; align-items: baseline; gap: var(--sp-2); color: var(--tx1); }
.fb-row span { min-width: 72px; color: var(--tx2); }
.fb-row b { color: var(--tx0); font-weight: 600; }
.fb-row code { font-family: var(--mono); font-size: var(--fs-xs); color: var(--tx2); }
</style>
