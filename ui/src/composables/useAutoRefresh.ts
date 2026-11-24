import { ref, onActivated, onDeactivated, onBeforeUnmount, type Ref } from 'vue';

/* P1-4：结果自动刷新（dbx auto-refresh 对位——档位关/10s/30s/60s，不默认开）。
 生命周期收口：KeepAlive onActivated/onDeactivated + 页面 visibilitychange + onBeforeUnmount
 全链停/续（QueryHub 二级 KeepAlive 会双触发 activated——start 幂等：先 stop 再排新表）；
 tick 时再验 guard（dbx 同款「触发时再验 canRefresh」）——调用方把「保存中/加载中/有
 待提交编辑」挂进 guard，被跳过不补跑（下个周期自然再试）。 */

export function useAutoRefresh(fn: () => void | Promise<void>, opts: {
  /** 间隔 ms 的 getter（0=不启动；变更后由调用方重新 setOn 触发重启） */
  ms: () => number;
  /** 返回 false 跳过（running/挂起编辑互斥） */
  guard?: () => boolean;
  /** 页面隐藏时的降频间隔 ms 的 getter（缺省/0=隐藏全停，既有契约不变；
      >0=隐藏时低频保拍——长作业监控页用它让停门/终态迁移在后台标签页仍可被
      轮询拍捕获并触发 useJobNotify 通知；KeepAlive 失活仍全停（离开页面不保拍）。
      注意：这只是放行间隔的下限——后台标签页的定时器本身会被浏览器节流，
      实际间隔受浏览器后台标签页节流影响（约 ≥ 该档位值，可能明显更久）） */
  hiddenMs?: () => number;
}): {
  /** 用户意图开关（与 ms>0 相与才是实际运行） */
  on: Ref<boolean>;
  /** 设置开关：true 且 ms>0 才真正排定时器 */
  setOn: (v: boolean) => void;
  /** 立即按当前 ms 重启（间隔变更时调） */
  restart: () => void;
  stop: () => void;
} {
  const on = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  /* 初始化盲区收口（533 静默失效类②变体）——此前恒按可见初始化，
 后台标签页首载（document.hidden 已 true）时无 visibilitychange 可听，
 首个 visibilitychange 前轮询照跑；改读实值让 hidden 短路在首轮 tick 前生效 */
  let pageVisible = !document.hidden;
  let compActive = true;
  let lastHiddenTick = 0;

  function hiddenMsVal(): number {
    const v = opts.hiddenMs ? opts.hiddenMs() : 0;
    return v && v > 0 ? v : 0;
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  function start() {
    stop();
    const ms = opts.ms();
    if (!on.value || !ms || ms <= 0) return;
    timer = setInterval(async () => {
      /* tick 时再验：页面隐藏/组件失活/调用方 guard（running、挂起编辑）任一不满足即跳过；
          隐藏但配了降频档（hiddenMs>0）时按降频间隔放行一拍（保通知触达），其余拍丢弃 */
      if (!on.value || !compActive) return;
      const hidden = !pageVisible;
      if (hidden) {
        const h = hiddenMsVal();
        if (!h) return;
        if (Date.now() - lastHiddenTick < h) return;
      }
      if (opts.guard && !opts.guard()) return;
      /* 隐藏拍的放行时刻记在 guard 之后：被 guard 拒绝的拍不算放行，否则下一次节流窗
          会从被拒的那拍起算，真正的放行拍被推迟一整个降频间隔 */
      if (hidden) lastHiddenTick = Date.now();
      await fn();
    }, ms);
  }
  function setOn(v: boolean) {
    on.value = v;
    if (v) start();
    else stop();
  }
  function restart() { if (on.value) start(); }

  onActivated(() => { compActive = true; if (on.value) start(); });
  onDeactivated(() => { compActive = false; stop(); });
  function onVis() {
    pageVisible = !document.hidden;
    if (pageVisible && on.value && compActive) { lastHiddenTick = 0; start(); }
    else if (!pageVisible && !hiddenMsVal()) stop(); /* 无降频档：隐藏全停（既有契约）；有降频档：表保持，tick 内节流 */
  }
  document.addEventListener('visibilitychange', onVis);
  onBeforeUnmount(() => {
    stop();
    document.removeEventListener('visibilitychange', onVis);
  });

  return { on, setOn, restart, stop };
}
