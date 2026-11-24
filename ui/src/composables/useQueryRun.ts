import { ref } from 'vue';

/**
 * 长查询「读秒 + 取消」范式（ 抽离）：此前只有 DSL 通道有，其余通道骨架屏干等。
 * 用法：const { running, elapsedMs, begin, cancel, finish } = useQueryRun();
 * const signal = begin(); try { await api.xxx(..., signal); } finally { finish(); }
 */
export function useQueryRun() {
  const running = ref(false);
  const elapsedMs = ref(0);
  let elapsedTimer = 0;
  let abortCtl: AbortController | null = null;

  function begin(): AbortSignal {
    /* 新查询即作废旧查询——此前旧 AbortController 被直接覆盖，旧请求
 在网络上继续跑且响应照常返回，后到即覆盖新结果（连查/改参快查竞态）；
 abort 后旧 fetch 以 AbortError reject，视图 catch 分支丢弃，不写状态 */
    abortCtl?.abort();
    /* 连查形态下旧计时器句柄先清再起新表：句柄被覆盖即泄漏，泄漏表会在
 finish 后继续用旧起点覆写 elapsedMs（finish 只清最新句柄） */
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = 0; }
    abortCtl = new AbortController();
    elapsedMs.value = 0;
    running.value = true;
    const t0 = Date.now();
    elapsedTimer = window.setInterval(() => {
      if (document.hidden) return; // ：后台标签页跳过 tick（ useNow 先例：读秒不可见，空转唤醒纯属浪费；回前台下个 tick 自动续上）
      elapsedMs.value = Date.now() - t0;
    }, 100);
    return abortCtl.signal;
  }

  function cancel() { abortCtl?.abort(); }

  function finish() {
    running.value = false;
    abortCtl = null;
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = 0; }
  }

  return { running, elapsedMs, begin, cancel, finish };
}
