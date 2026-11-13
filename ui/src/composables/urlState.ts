import { ref, watch, onActivated, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '../stores/app';
import { writeStoredRaw } from '../utils/safeJson';

/* 横切设施——URL 状态同步 + 偏好持久化。
 useUrlState：把视图关键状态写进 hash query，刷新/分享后现场可复原；
 usePref：用户偏好落 localStorage（命名空间 esquerystudio.pref.*），跨会话记忆。 */

export function readHashQuery(): URLSearchParams {
  return new URLSearchParams(location.hash.split('?')[1] || '');
}

function writeHashQuery(usp: URLSearchParams) {
  const base = location.hash.split('?')[0] || '#/';
  const qs = usp.toString();
  const next = qs ? base + '?' + qs : base;
  if (next !== location.hash) history.replaceState(null, '', next);
}

/** 单个字符串状态 ↔ URL hash query 双向同步（进入视图读回，变更写回，默认值不占 URL） */
export function useUrlState(key: string, defVal = ''): Ref<string> {
  const init = readHashQuery().get(key);
  const state = ref(init != null ? init : defVal);
  /* 视图可能被 keep-alive 缓存在后台——所有 URL 读写锚定创建时的路由：
 缓存期不把状态写进他页 URL，也不被他页 query 变化打回默认值（否则跨页现场保留形同虚设） */
  const route = useRoute();
  const ownPath = route.path;
  const onOwnPage = () => route.path === ownPath;
  const writeBack = (v: string) => {
    const usp = readHashQuery();
    if (v && v !== defVal) usp.set(key, v);
    else usp.delete(key);
    writeHashQuery(usp);
  };
  watch(state, v => { if (onOwnPage()) writeBack(v); });
  /* 修复：同页 router.push 深链（如命令面板「新建索引」→ ?create=1）也要读回，
 否则视图已挂载时 URL 变了状态不动、弹窗不开。写回走 replaceState 不经 router，无回环。 */
  watch(() => route.query[key], v => {
    if (!onOwnPage()) return;
    const nv = v == null ? defVal : String(v);
    if (nv !== state.value) state.value = nv;
  });
  /* keep-alive 回页首拍以组件现场为准写回 URL——裸路径返回时刷新/分享不丢现场；
 显式深链（query 带值）在上面的 watcher 先行覆盖 state，这里写回的就是深链值，两不冲突 */
  onActivated(() => { writeBack(state.value); });
  return state;
}

/* 全局工作索引单一真相——顶栏选中（store.pickedIdx）是当前工作索引的唯一口径。
 此前 20 个「目标索引」语义视图各自拿 useUrlState('idx')，深链打开时顶栏不同步、
 视图内切换也不上行，跨页后目标丢失。统一收敛到本组合式：
 — 深链 ?idx= 显式指定 → 上行 store.pick（分享链接打开即全站就位）；
 — 视图内切索引 → 上行 store.pick（顶栏即时跟随，跳页免二次选择）；
 — 不做无条件下行强同步（避免已加载表单/结果与新索引错配）；
 新增 follow 白名单 opt-in 下行跟随——只读/显式执行类视图顶栏切索引即跟随
 （URL 同步重写）；表单/写类视图不开启，防「A 的表单保存到 B」；
 guard 函数返回 false 时暂停跟随（如 PIT 会话进行中，目标已与 pit_id 绑定）。
 仅适用「目标索引」语义；「过滤」语义（如拓扑页 ?idx=）继续用 useUrlState。 */
export function useIdxState(opts?: { follow?: boolean | (() => boolean) }): Ref<string> {
  const store = useAppStore();
  const state = useUrlState('idx', store.pickedIdx || '');
  if (state.value && state.value !== store.pickedIdx) store.pick(state.value);
  watch(state, v => { if (v && v !== store.pickedIdx) store.pick(v); });
  const follow = opts?.follow;
  if (follow) {
    watch(() => store.pickedIdx, v => {
      if (!v || v === state.value) return;
      if (typeof follow === 'function' && !follow()) return;
      state.value = v;
    });
  }
  return state;
}

/** 用户偏好：localStorage 持久化，JSON 序列化，坏值静默回落默认（容错型静默，允许） */
export function usePref<T>(key: string, defVal: T): Ref<T> {
  const lsKey = 'esquerystudio.pref.' + key;
  let init = defVal;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw != null) init = JSON.parse(raw) as T;
  } catch { /* 坏值回落默认 */ }
  const state = ref(init) as Ref<T>;
  watch(state, v => {
    writeStoredRaw(localStorage, lsKey, JSON.stringify(v));
  }, { deep: true });
  return state;
}

/* 旧 useDraft（esquerystudio.draft.* 命名空间）已删除——全站零调用
 （草稿全面迁移 useScopedDraft/esquerystudio.draft2:*），AdhocRebuildView 注释
 引用同步更正。历史遗留的 esquerystudio.draft.* sessionStorage 键不主动清除（用户可
 自行清理，或下次同 key 写入时自然覆盖）。 */
