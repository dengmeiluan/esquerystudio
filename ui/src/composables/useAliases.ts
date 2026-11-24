/* W3：别名共享缓存——TopBar 下拉 / IndexPicker 共用一份集群别名清单。
 模块级缓存 + key（集群目标）失效语义（与旧 IndexPicker __ixpAliasCache 同语义，收敛一处）；
 参数化 key、不引 store，测试零挂载。读取方带 key 校验：不匹配一律返回空，防串集群。 */
import { shallowReactive } from 'vue';
import { api } from '../api';

interface AliasEntry { name: string; to: string[] }

interface Cache { key: string | null; list: AliasEntry[]; inflight: Promise<void> | null }
/* shallowReactive：只代理顶层属性读写——key/list 整体替换触发依赖方重算，
 且 inflight 的 Promise 不被深代理（reactive 深代理 Promise 会让 await 触
 Promise.prototype.then 内部槽检查 TypeError）。list 每次都是整体替换，浅代理足够。 */
const cache: Cache = shallowReactive({ key: null, list: [], inflight: null });

/* 最近一次请求的 key：飞行中切 key 后落地校验用（竞态自愈） */
let lastRequestedKey: string | null = null;
/* 换号代际：清理后在飞请求不得把上一账号的别名清单写回（否则新账号零网络看到旧连接元数据）。 */
let epoch = 0;

/** 拉取并缓存 key 对应的别名清单；同 key 幂等，inflight 去重，失败兜底空清单不阻塞调用方。 */
export function ensureAliases(key: string): Promise<void> {
  lastRequestedKey = key;
  if (cache.key === key) return Promise.resolve();
  if (cache.inflight) return cache.inflight;
  const reqEpoch = epoch;
  cache.inflight = (async () => {
    try {
      const raw = await api.aliases();
      if (reqEpoch !== epoch) return;
      const map = new Map<string, string[]>();
      (raw || []).forEach((r: any) => {
        if (!r?.alias || String(r.alias).startsWith('.')) return;
        const arr = map.get(r.alias) || [];
        arr.push(r.index);
        map.set(r.alias, arr);
      });
      cache.list = [...map.entries()].map(([name, to]) => ({ name, to }));
      cache.key = key;
    } catch {
      if (reqEpoch === epoch) cache.list = []; /* 失败不记 key：下次触发（openPanel/watch）自然重试，瞬时故障可自愈 */
    } finally {
      if (reqEpoch !== epoch) return;
      cache.inflight = null;
      /* 仅当落地的是旧 key 的请求才补拉新 key；本次就是 lastRequestedKey（失败未记 key）时
 交还外部触发重试（openPanel/watch），避免持续失败下的无界重试风暴 */
      if (lastRequestedKey && key !== lastRequestedKey && cache.key !== lastRequestedKey) {
        ensureAliases(lastRequestedKey);
      }
    }
  })();
  return cache.inflight;
}

/** 当前 key 下的别名清单；缓存 key 不匹配返回空。 */
export function aliasEntries(key: string): AliasEntry[] {
  return cache.key === key ? cache.list : [];
}

/** 反查：索引 → 指向它的别名列表。 */
export function aliasesOf(index: string, key: string): string[] {
  return aliasEntries(key).filter(a => a.to.includes(index)).map(a => a.name);
}

/** 换号清理：别名清单是上一身份在目标集群上的元数据观测（连接名/索引名不外泄）。 */
export function __clearAliasCache() {
  epoch++;
  cache.key = null;
  cache.list = [];
  cache.inflight = null;
  lastRequestedKey = null;
}
