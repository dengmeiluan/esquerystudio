import { computed, type Ref } from 'vue';
import { usePref } from './urlState';

/* W9：档循环统一件——视图本地「TIERS 数组 + usePref + cycle 函数」三件套的
 最小抽象，示范迁移 IlmView（宽度档 ilm.listW）与 ConfigValidatorView（px 档
 configvalidator.issuesH）。罩住站内既有四形态：行数档（JsonArea rows）、px 档
 （面板 max-height）、vh 档（弹性高）、宽度档（CSS var 注入侧栏宽）。
 落盘沿用 usePref（esquerystudio.pref.* 键、JSON 序列化、坏值回落默认）；
 cycle 语义 = 视图原实现逐字平移：当前档切下一档，末档回首档，越档脏值（indexOf -1）回首档。
 defVal 缺省取 tiers[0]；存量视图默认档不在首位时显式传入（360/380 先例）。 */
export function useTierCycle<T>(key: string, tiers: readonly T[], defVal?: T): { v: Ref<T>; cycle: () => void } {
  const fallback = defVal !== undefined ? defVal : tiers[0];
  const raw = usePref<T>(key, fallback);
  /* 越档脏值不再原样喂给 CSS/请求：读取侧回落默认档（2.1.4 与视图档归一同一原则——
   存量坏值不该让面板高度/请求参数静默失效）。cycle 仍按原始值推进：脏值一拍回 tiers[0]。 */
  const v = computed<T>({
    get: () => (tiers.includes(raw.value) ? raw.value : fallback),
    set: val => { raw.value = val; },
  }) as unknown as Ref<T>;
  function cycle() {
    const i = tiers.indexOf(raw.value);
    raw.value = tiers[(i + 1) % tiers.length];
  }
  return { v, cycle };
}
