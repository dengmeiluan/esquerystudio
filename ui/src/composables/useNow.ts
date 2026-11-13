import { ref } from 'vue';

/* 全站「Xm 前」相对时间的共享心跳。
 病灶：relTime 只在渲染瞬间计算一次，页面停留期间文案永远冻结——
 通知面板开着十分钟仍显示「4m 前」，时间线成了假时间线。
 模块级单例 30s 心跳，全部组件共享一个定时器；SPA 生命周期内常驻，成本可忽略。
 补 document.hidden 短路——后台标签页里相对时间不可见，tick 纯属
 空转唤醒；30s 频率约定不动（仅隐藏页跳过刷新，回前台下个 tick 自动续上。 */
const now = ref(Date.now());
let started = false;

export function useNow() {
  if (!started) {
    started = true;
    setInterval(() => {
      if (document.hidden) return; // ：后台标签页跳过 tick（见头注）
      now.value = Date.now();
    }, 30000);
  }
  return now;
}
