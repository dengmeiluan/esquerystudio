import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAppStore } from './stores/app';
import { useAuthStore } from './stores/auth';
import { setApiWriteGuard } from './api';
import { isDemoMode } from './platform/demoApi';
import { installBrowserMcp } from './platform/browserMcp';
import { isBrowserMode } from './platform/browserApi';
/* 真字体（本地打包，离线 fat jar 可用）：此前 font stack 里的 Inter/JetBrains Mono 从未真正加载，
 Windows 上实际渲染 Segoe UI/雅黑，是与 Linear/Vercel 第一眼差距的最大来源 */
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './theme.css';

/* 静态演示：直接进入控制台，不弹欢迎/设置向导；数据全部来自 demoApi。 */
if (isDemoMode) {
  localStorage.setItem('esquerystudio.wizard.done', '1');
  localStorage.setItem('esquerystudio.last-user', 'demo');
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
/* 写请求客户端硬门：视图/脚本直调 api 时也先按身份×目标判写权，无权限零发出。 */
setApiWriteGuard((method, path, targetId) => useAuthStore().canEmitWrite(method, path, targetId));

/* 全局异常兜底——此前渲染异常/未捕获 Promise 拒绝直接白屏+控制台裸奔。
 完整堆栈进控制台（调试可用）；用户侧经 store.notify 弹一次（自带 风暴抑制，
 轮询炸裂期不轰炸）。errorHandler 在 pinia/router 之后挂，store 已可用。 */
app.config.errorHandler = (err: unknown, _inst, info) => {
  console.error('[esquerystudio] 渲染异常', err, '\n处理链:', info);
  try {
    useAppStore().notify('error', `页面渲染异常：${err instanceof Error ? err.message : String(err)}`);
  } catch { /* store 不可用时不二次炸 */ }
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('[esquerystudio] 未捕获的 Promise 拒绝', e.reason);
  /* 漏 catch 的请求失败此前纯静默（用户点完没反应）。403 已由全局 forbidden 通道提示，
     这里只兜其余错误，避免同一次拒绝弹两条。 */
  try {
    const r: any = e.reason;
    if (r && r.status === 403) return;
    const msg = r instanceof Error ? r.message : String(r ?? '');
    if (!msg) return;
    useAppStore().notify('error', `操作失败：${msg}`);
  } catch { /* store 不可用时不二次炸 */ }
});

if (isBrowserMode) installBrowserMcp();

app.mount('#app');

/* -B2：空闲预取 monaco 大分包（约 2.8MB，gzip 741KB）——首屏不驮，
 等 window load（首屏关键资源全落）后再进空闲队列预热，不和首屏抢带宽；
 首次进 DSL 工作台/Mapping 编辑时 chunk 已在缓存 */
const idlePrefetch = () => { import('./components/MonacoEditor.vue').catch(() => { /* 预取失败不影响主流程，进视图时再正常拉 */ }); };
const schedulePrefetch = () => {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(idlePrefetch, { timeout: 8000 });
  } else {
    setTimeout(idlePrefetch, 3000);
  }
};
if (document.readyState === 'complete') {
  schedulePrefetch();
} else {
  window.addEventListener('load', schedulePrefetch, { once: true });
}
