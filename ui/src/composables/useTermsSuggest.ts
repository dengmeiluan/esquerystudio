import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';

/* W2 值建议：keyword 字段 terms agg top 20（searchRaw 出口，D2 首选分支成立）。
 300ms 防抖 + 序号守卫（in-flight 切换丢弃旧响应）+ TTL 5min 缓存（上限 200 条：超限时先清过期、再逐最旧）；失败静默（不打断输入流）。
 prefix 按 Lucene RegExp 元字符转义后拼 include；空前缀整体省略 include（语义=top 20 by doc_count，省高基数字段的正则求值）。
 raw.aggregations 兜底是防御性死代码（后端原样透传顶层 aggregations），留作形态漂移保险。
 stale 响应不写缓存（序号守卫在 cache.set 之前）：旧前缀回退 5min 内会多一次请求——有意取舍。
 suggestions 只读消费约定（与 useIndexFields 对齐）：消费方 filter/computed 链使用，禁止原地改。
 首轮时延形态：同步候选即刻回填（同 key 缓存命中升级为同步完成不进防抖 / 548 A2 宽前缀
 本地滤上移同步段 / 新增 localStorage 词项持久档 stash 按前缀同步回填），词项请求 fire-and-forget
 到达后 merge 刷新（网络 top20 在前 + 持久档匹配补后去重，随响应滚动更新）——
 首轮（缓存全空）不再等防抖+ES 往返才出候选。 */
import { onScopeDispose, ref, watch } from 'vue';
import { api } from '../api';
import { useAppStore } from '../stores/app';
/* 类型感知精化排序单源（fieldSearch 同步新增，展示层消费） */
import { rankTermsByType } from '../utils/fieldSearch';

type CacheEntry = { at: number; values: string[] };
const cache = new Map<string, CacheEntry>();
/* 换号代际：清理后旧请求的响应不得再写回 cache/stash/suggestions（否则新账号
   聚焦同 target+index+field 时零网络回填上一账号读出的业务值）。 */
let epoch = 0;
const TTL = 5 * 60 * 1000;
const MAX_CACHE = 200;
/* 缓存上界：先删过期项，仍超则按 Map 插入序逐最旧，直至回到上限内 */
function pruneCache() {
  const now = Date.now();
  for (const [k, v] of cache) { if (now - v.at >= TTL) cache.delete(k); }
  while (cache.size > MAX_CACHE) {
    const first = cache.keys().next();
    if (first.done) break;
    cache.delete(first.value);
  }
}
/** 测试专用：清空缓存 */
export function __clearSuggestCache() { epoch++; cache.clear(); }
/* ═══ ：词项持久档（localStorage）═══
 TTL 内存缓存之外的「上次 top20」快照：跨会话/缓存过期后的首轮 suggest 同步候选来源
 （零网络零防抖即刻回填，权威词项到达后 merge 刷新）。key 前三段与内存缓存同构；
 读写 try/catch（隐私模式/存储满静默，不影响主流程）。 */
const STASH_KEY = 'esquerystudio_terms_stash';
const STASH_CAP = 20;
function stashKeyOf(target: string, idx: string, field: string) {
  return STASH_KEY + '::' + [target, idx, field].join('|');
}
function readStash(key: string): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, STASH_CAP) : [];
  } catch { return []; }
}
function writeStash(key: string, values: string[]) {
  writeStoredRaw(localStorage, key, JSON.stringify(values.slice(0, STASH_CAP)));
}
/** 换号清理：词项持久档是上一身份从目标集群读出的业务值（邮箱/ID），不能跨账号同步回填。 */
export function clearTermsStash() {
  epoch++;
  cache.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STASH_KEY)) keys.push(k);
    }
    for (const k of keys) removeStoredRaw(localStorage, k);
  } catch { /* 存储不可用：无残留可清 */ }
}

/* 工厂可选第二参 types——字段类型表读源（消费方持有字段表时传入，
 候选展示值按 rankTermsByType 类型精化排序：date 字段 ISO 形态排前、数值字段数值
 形态排前）。可选参默认零行为：不传既有序零变（「响应=suggestions 精确值」
 契约不回退）；五消费面接线：三处（LuceneInput/BoostTuner/sqlCompletion）+
 两处（FieldSelect/ClauseNode）至此全接。
 精化只作用展示 ref——缓存/stash 仍写 ES 权威序（排序纯展示语义，读出后再排，
 不污染排序基准）；suggestAsync resolve 传 ES 权威序（与缓存语义一致，展示精化
 属视觉层，程序消费面拿原始值），差异。 */
export function useTermsSuggest(index: () => string, types?: () => Record<string, string>) {
  const store = useAppStore();
  const suggestions = ref<string[]>([]);
  const suggesting = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  /* R3 新增出口的挂账表（suggest 本体零变更）：seq → resolver，该 seq 终点兑现。
 五类终点全覆盖：空参早退/缓存命中/序号过期/成功/失败——一律 resolve 不 reject
 （失败静默语义不变，async 消费方拿到 []）。
 548 A1 增第六类终点：防抖窗内/在飞被新 suggest 超越时立即取消兑现 []（原缺陷：被清
 定时器的回调永不执行，挂账条目永久悬挂）。 */
  const seqResolvers = new Map<number, (v: string[]) => void>();
  const resolveSeq = (s: number, v: string[]) => {
    const r = seqResolvers.get(s);
    if (r) { seqResolvers.delete(s); r(v); }
  };
  /* 在飞/挂起定时器对应的 seq——被新 suggest 清掉时其回调永不执行，
 suggestAsync 挂账条目会永久悬挂，clearTimeout 时须立即兑现 [] */
  let timerSeq = 0;
  /* 上次 suggest 的 field——变化即同步清空 suggestions，防旧字段 top20 整列串显 */
  let lastField: string | null = null;
  /* 556：引用稳定赋值——内容逐项相等时不换引用。消费方 watch(suggestions)→refresh→suggest
 链对新引用自激：同步段回填每次 readStash 产新数组、缓存命中回填引用随 cache 漂移，
 换引用即触发递归重估（551 B1 Maximum recursive updates 根因）。 */
  const setSuggestions = (arr: string[]) => {
    const cur = suggestions.value;
    if (cur.length === arr.length && arr.every((v, i) => v === cur[i])) return;
    suggestions.value = arr;
  };
  /* 556：同步终点挂账——同 key 缓存命中升级为同步完成后，suggestAsync 的 seqResolvers
 尚未 set（seq 在 suggest 内部 ++，promise 挂账在其返回之后），需经此表转交兑现值；
 下次 suggest 调用时清上表残留（只服务「suggest 同步返回后同 tick 的 suggestAsync」） */
  let syncSettled: { seq: number; values: string[] } | null = null;

  function suggest(field: string, prefix: string, delay = 300) {
    /* 防抖起步置位（早退/缓存命中路径在定时器回调里复位 false；
 395 spec「防抖窗内未标记」契约随之锁同步更新为「窗内已标记」） */
    suggesting.value = true;
    if (timer) { clearTimeout(timer); resolveSeq(timerSeq, []); } /* 被清旧 seq 立即取消兑现，不悬挂 */
    syncSettled = null;
    /* 跨字段串显防线——field 变化即清（不等防抖/响应）；同字段连打不清（防闪） */
    if (field !== lastField) { suggestions.value = []; lastField = field; }
    const mySeq = ++seq;
    timerSeq = mySeq;
    /* 556：同步候选即刻回填（不等防抖窗）——
 ① 同 key TTL 缓存命中：即回填即完成（suggesting 复位、resolve、不设定时器零请求）；
 ② 更宽前缀缓存本地滤（548 A2 由防抖回调上移同步段，防抖等待期不再白屏）；
 ③ 词项持久档 stash 按前缀滤（内存缓存全空时的首轮唯一候选源，跨会话白得）。
 ②③ 回填后照旧进防抖发网请求取权威 top20（fire-and-forget，到达后 merge 刷新）。 */
    const idx0 = (index() || '').trim();
    if (idx0 && field) {
      const tgt = store.target || '@host';
      const key = [tgt, idx0, field, prefix].join('|');
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL) {
        setSuggestions(rankTermsByType(hit.values, types?.()[field])); suggesting.value = false;
        resolveSeq(mySeq, hit.values); syncSettled = { seq: mySeq, values: hit.values };
        return;
      }
      const lower = prefix.toLowerCase();
      let backfill: string[] | null = null;
      if (prefix) {
        const head = [tgt, idx0, field, ''].join('|');
        let bestLen = -1;
        for (const [k, v] of cache) {
          if (!k.startsWith(head) || Date.now() - v.at >= TTL) continue;
          const cp = k.slice(head.length);
          if (!cp || cp.length >= prefix.length || !prefix.startsWith(cp)) continue;
          const f = v.values.filter(x => x.toLowerCase().startsWith(lower));
          if (f.length && cp.length > bestLen) { backfill = f; bestLen = cp.length; }
        }
      }
      if (!backfill) {
        const stashed = readStash(stashKeyOf(tgt, idx0, field))
          .filter(x => !prefix || x.toLowerCase().startsWith(lower));
        if (stashed.length) backfill = stashed;
      }
      if (backfill) setSuggestions(rankTermsByType(backfill, types?.()[field]));
    }
    timer = setTimeout(async () => {
      const idx = (index() || '').trim();
      /* 空参早退：本次调用即最新 seq（旧定时器已被 suggest 头清掉），天然拥有标志位，直接复位 suggesting */
      if (!idx || !field) { suggestions.value = []; suggesting.value = false; resolveSeq(mySeq, []); return; }
      const key = [store.target || '@host', idx, field, prefix].join('|');
      /* 回调内缓存命中保留：双实例竞态去重（552 B1「FieldSelect 预载恰好一包」机制）——
 FieldSelect/ClauseNode 各持独立 useTermsSuggest 实例，同步段命中拦不住「另一实例
 在本防抖窗内写入缓存」的形态，回调内二次检查兜住（防抖后零网络白得） */
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL) {
        setSuggestions(rankTermsByType(hit.values, types?.()[field])); suggesting.value = false; resolveSeq(mySeq, hit.values); return;
      }
      suggesting.value = true;
      const reqEpoch = epoch;
      try {
        /* prefix 转义 Lucene RegExp 元字符；空前缀省略 include（=top 20 by doc_count，免高基数字段正则求值） */
        const esc = prefix.replace(/[.?*+^$[\]{}()|\\]/g, '\\$&');
        const terms: Record<string, any> = { field, size: 20 };
        if (esc) terms.include = esc + '.*';
        const body = JSON.stringify({ size: 0, aggs: { suggest: { terms } } });
        const r: any = await api.searchRaw(idx, body);
        const buckets = r?.aggregations?.suggest?.buckets ?? r?.raw?.aggregations?.suggest?.buckets ?? [];
        const values = buckets.map((b: any) => String(b.key)).slice(0, 20);
        if (reqEpoch !== epoch) { resolveSeq(mySeq, []); return; } /* 换号代际：旧账号结果丢弃 */
        if (mySeq !== seq) { resolveSeq(mySeq, values); return; } /* 序号守卫：已有更新请求 */
        if (cache.size > MAX_CACHE) pruneCache();
        cache.set(key, { at: Date.now(), values });
        /* 556：词项到达即权威刷新（同步候选只承担防抖等待期：即刻先出、到达退位）——
 补后混入历史候选与既有「响应到达=suggestions 精确值」契约冲突（395 ③⑬/
 A2 反例），词项持久档仅作零网络首轮白得，不进权威结果。
 563：展示值类型精化（缓存仍存 ES 权威序 values，见工厂 types 头注）。 */
        setSuggestions(rankTermsByType(values, types?.()[field]));
        writeStash(stashKeyOf(store.target || '@host', idx, field), values);
        resolveSeq(mySeq, values);
      } catch { if (mySeq === seq && suggestions.value.length) suggestions.value = []; /* 静默降级：上次成功这次失败仍清空；连续失败不赋新引用——切断消费侧 watch(suggestions)→refresh→suggest 重试循环 */ resolveSeq(mySeq, []); }
      finally { if (mySeq === seq) suggesting.value = false; }
    }, delay);
  }
  /* R3：async 消费出口——复用 suggest 全部既有机制（防抖/序号守卫/TTL 缓存/失败静默），
 suggest 同步 ++seq 后返回，单线程无插入，此刻 seq 即本次调用序号，据此挂 promise。
 独立新签名（suggest 既有签名零变更，十四用例锁）。
 556：同 key 缓存命中已是同步终点（syncSettled）时 promise 即刻兑现，不经挂账（防悬挂）。 */
  function suggestAsync(field: string, prefix: string, delay = 300): Promise<string[]> {
    suggest(field, prefix, delay);
    const mySeq = seq;
    if (syncSettled && syncSettled.seq === mySeq) {
      const v = syncSettled.values; syncSettled = null;
      return Promise.resolve(v);
    }
    return new Promise<string[]>(resolve => { seqResolvers.set(mySeq, resolve); });
  }
  /* 切集群目标：清本实例建议态（缓存 key 已含 target，无需清缓存） */
  watch(() => store.target, () => { suggestions.value = []; suggesting.value = false; });
  /* 作用域销毁：清未发防抖定时器；seq++ 使在飞响应放弃写 ref（模块级缓存照留）；挂账 resolver 兑现 [] 防悬挂 */
  onScopeDispose(() => { if (timer) clearTimeout(timer); seq++; for (const r of seqResolvers.values()) r([]); seqResolvers.clear(); syncSettled = null; });
  return { suggestions, suggesting, suggest, suggestAsync };
}
