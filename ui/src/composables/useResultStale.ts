import { computed, ref } from 'vue';

/**
 * 「结果已过期」判据（SQL 控制台 resultStale 的跨页面同源件）。
 *
 * 判定：有结果 + 记过一次实际执行的输入 + 当前输入与那次不同。
 * 快照在「发送时」取、记账在「成功时」落——
 * 发送时取：await 期间继续改稿，结果回来后仍必须标过期；
 * 成功时落：执行失败或取消时旧结果还是旧结果，芯片不能被提前灭掉。
 * lastRun 用 null 作「从未执行」哨兵，不能用空串——索引工作区「空词=浏览全部」
 * 的签名本身就是空串。
 */
export function staleOf(current: string, lastRun: string | null, hasResult: boolean): boolean {
  return hasResult && lastRun !== null && current !== lastRun;
}

export function useResultStale(sig: () => string, hasResult: () => boolean) {
  const lastRun = ref<string | null>(null);
  const stale = computed(() => staleOf(sig(), lastRun.value, hasResult()));
  function markRun(executed?: string) {
    lastRun.value = executed ?? sig();
  }
  return { stale, lastRun, markRun };
}
