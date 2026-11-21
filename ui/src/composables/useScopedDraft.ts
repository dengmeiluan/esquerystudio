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

/** 凭据样键（大小写不敏感）命中即掩埋其值，防误粘贴的连接串/配置带密码落盘。
 token 项带负向前瞻：tokenizer/token_chars/token_count/tokens 是 ES settings 域的
 常规键（键名含 "token" 子串≠凭据），掩埋它们会把恢复的草稿变成携带 "***" 的损坏配置 */
const CREDENTIAL_KEY_RE = /("(?:[^"]*(?:password|passwd|secret|token(?!izer|_count|_chars|s)|api[_-]?key|authorization|auth)[^"]*)"\s*:\s*")([^"]*)(")/gi;

/** 凭据样键名判定（对象遍历路径）：与上方文本正则的键名段同口径（同一交替与负向前瞻） */
const CREDENTIAL_KEY_NAME_RE = /password|passwd|secret|token(?!izer|_count|_chars|s)|api[_-]?key|authorization|auth/i;

/** 深遍历掩埋：凭据样键的值无论什么类型（对象/数组/数字/布尔）一律替换为 "***" 字符串
 哨兵。文本正则只命中「键名 + 冒号 + 开引号」的字符串值形态，对象值（冒号后是 "{"）整个
 漏掩埋——嵌在对象里的明文凭据照样落盘；而若直接在文本上掩埋对象值又会产出损坏 JSON
 （读回失败）。parse 产物即深拷贝，替换不触碰调用方对象，stringify 后输出恒可 JSON.parse */
function redactParsed(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redactParsed);
  if (v !== null && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src)) out[k] = CREDENTIAL_KEY_NAME_RE.test(k) ? '***' : redactParsed(src[k]);
    return out;
  }
  return v;
}

/** 凭据样键是否持有非字符串值（对象/数组/数字/布尔）——文本正则只命中字符串值形态，
 此类值需要结构重写才能掩埋 */
function hasNonStringCredential(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasNonStringCredential);
  if (v !== null && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    for (const k of Object.keys(src)) {
      if (CREDENTIAL_KEY_NAME_RE.test(k) && typeof src[k] !== 'string') return true;
      if (hasNonStringCredential(src[k])) return true;
    }
  }
  return false;
}

/** 掩埋 JSON 文本里的凭据值：常规（凭据样键持字符串值）走原文正则替换——保留用户的
 pretty 缩进/空格（编辑框内容格式不变）；仅当存在非字符串值的凭据样键才结构重写
 （深拷贝掩埋，输出恒可 JSON.parse，代价是该次格式紧凑化）。非 JSON 松散文本回落
 文本正则尽力而为（只掩埋字符串值形态，不保证语法安全） */
export function redactDraft(raw: string): string {
  if (!raw) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (!hasNonStringCredential(parsed)) {
      return raw.replace(CREDENTIAL_KEY_RE, (_m, head, _v, tail) => head + '***' + tail);
    }
    return JSON.stringify(redactParsed(parsed));
  } catch {
    return raw.replace(CREDENTIAL_KEY_RE, (_m, head, _v, tail) => head + '***' + tail);
  }
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
