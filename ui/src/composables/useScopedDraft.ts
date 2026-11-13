import { ref, watch, type Ref } from 'vue';
import { removeStoredRaw, writeStoredRaw } from '../utils/safeJson';

/* 草稿持久化统一机制（全控制台）：
 — 维度隔离：key = route + target + index + mode + field，切集群/索引不串稿；
 — 生命周期：挂载时读一次（防 watcher/异步回填覆盖用户刚粘贴的内容），
 之后只写不读；恢复到默认值等价于清除（不留陈稿），显式 clear() 才清非默认稿；
 — 安全：写入前跑 redactDraft 掩埋凭据样键值，密码/token 永不落盘；
 — 存储：sessionStorage（settings/mapping/query 草稿语义，关标签页即弃）。
 视图只管声明 scope + field，不得再各自手写 storage 逻辑。 */

export interface DraftScope {
  /** 视图路由标识（如 'rest'、'adhoc'），必填 */
  route: string;
  /** 当前集群目标（connId）。可选显式维度：传了才进 key。缺省=跨集群共享——
 * w45 决策：意图类草稿（粘贴的配置/索引名/查询文本）切集群沿用，因「host 态粘贴→
 * 切生产→稿消失→反复重粘」体感最差；写类动作的集群错配风险由执行前护栏兜底 */
  target?: () => string;
  /** 目标索引（表单/写类视图必须带，防 A 索引稿存到 B） */
  index?: () => string;
  /** 页内模式/tab（如 query 的 mode、validator 的页签） */
  mode?: () => string;
}

const PREFIX = 'esquerystudio.draft2';

/** 凭据样键（大小写不敏感）命中即掩埋其值，防误粘贴的连接串/配置带密码落盘 */
const CREDENTIAL_KEY_RE = /("(?:[^"]*(?:password|passwd|secret|token|api[_-]?key|authorization|auth)[^"]*)"\s*:\s*")([^"]*)(")/gi;

/** 掩埋 JSON-ish 文本里的凭据值；非 JSON 原样返回（尽力而为，不保证语法安全） */
export function redactDraft(raw: string): string {
  if (!raw) return raw;
  return raw.replace(CREDENTIAL_KEY_RE, (_m, head, _v, tail) => head + '***' + tail);
}

export function draftStorageKey(scope: DraftScope, field: string): string {
  const t = (scope.target?.() || 'host').trim() || 'host';
  const i = (scope.index?.() || '-').trim() || '-';
  const m = (scope.mode?.() || '-').trim() || '-';
  return `${PREFIX}:${scope.route}:${t}:${i}:${m}:${field}`;
}

function readRaw(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeRaw(key: string, v: string | null): void {
  if (v == null) removeStoredRaw(sessionStorage, key);
  else writeStoredRaw(sessionStorage, key, v);
}

interface ScopedDraft {
  text: Ref<string>;
  /** 挂载时恢复了非默认草稿为 true；用户 clear 后归 false */
  restored: Ref<boolean>;
  clear: () => void;
}

/** 单字段文本草稿（Monaco/JsonArea/textarea 的 model） */
export function useScopedDraft(field: string, scope: DraftScope, defVal = ''): ScopedDraft {
  const key = draftStorageKey(scope, field);
  const raw = readRaw(key);
  const restored = ref(raw != null && raw !== defVal);
  const text = ref(restored.value ? (raw as string) : defVal);
  watch(text, v => {
    restored.value = false; // 用户已开始编辑，恢复提示移除
    writeRaw(key, v && v !== defVal ? redactDraft(v) : null);
  });
  return {
    text,
    restored,
    clear: () => { text.value = defVal; restored.value = false; writeRaw(key, null); },
  };
}

interface ScopedDraftState<T extends object> {
  state: Ref<T>;
  restored: Ref<boolean>;
  clear: () => void;
}

/** 多字段表单对象草稿（deep watch；JSON 相等默认值即清除） */
export function useScopedDraftState<T extends object>(field: string, scope: DraftScope, defVal: T): ScopedDraftState<T> {
  const key = draftStorageKey(scope, field);
  /* 默认值先做快照并克隆初始态：若直接以调用方的 defVal 对象作 state，调用方深改
 state.value 时 defVal 同引用被连带改写，「等于默认」判定恒真 → 草稿永远写不进
 （对象别名坑）。快照还保证 clear() 复位的默认值不带上一轮的残留。 */
  const defSnap = JSON.stringify(defVal);
  const cloneDef = () => JSON.parse(defSnap) as T;
  let init: T = cloneDef();
  let wasRestored = false;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw != null) {
      const parsed = JSON.parse(raw) as T;
      if (parsed && typeof parsed === 'object') { init = parsed; wasRestored = JSON.stringify(parsed) !== defSnap; }
    }
  } catch { /* 坏值回落默认 */ }
  const restored = ref(wasRestored);
  const state = ref(init) as Ref<T>;
  watch(state, v => {
    restored.value = false;
    const s = JSON.stringify(v);
    writeRaw(key, s === defSnap ? null : redactDraft(s));
  }, { deep: true });
  return {
    state,
    restored,
    clear: () => { state.value = cloneDef(); restored.value = false; writeRaw(key, null); },
  };
}
