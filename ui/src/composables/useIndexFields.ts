/* W1 地基：字段元数据中心——mapping 拉取/拍平/缓存，供 FieldPicker/LuceneInput/Monaco 补全统一消费。
 模块级缓存 key=集群目标|索引（等价 FieldPicker 原窗口级语义）；失败零降级：loadErr 置位、调用方退化手输。
 fields 为缓存共享引用，消费方按只读使用（filter/computed 链），禁止原地 sort/splice。 */
import { ref, watch, type Ref } from 'vue';
import { api } from '../api';
import { useAppStore } from '../stores/app';

export type FieldItem = { path: string; type: string };

const cache = new Map<string, FieldItem[]>();
/* 换号代际：清理后在飞请求不得再写回 cache / 覆盖 fields（否则新账号看到
   上一账号在旧连接读到的字段清单）。 */
let epoch = 0;
/** 测试专用：清空缓存 */
export function __clearFieldCache() { epoch++; cache.clear(); }

export function walkMappingFields(props: any, out: FieldItem[]): void { walkFields(props, '', out); }
function walkFields(props: any, prefix: string, out: FieldItem[]) {
  if (!props) return;
  Object.entries(props).forEach(([name, def]: [string, any]) => {
    const path = prefix ? prefix + '.' + name : name;
    /* 1336：容器字段**保留**在共享字段源里——lint 的 unknown-field 判定、DSL 补全的
       键位上下文都需要知道 `publisher` 是一个合法路径（它是已知字段，只是不能直接当叶子查）。
       「不要在字段选择器里把容器当候选」是**选择器那一层**的裁决，见 FieldSelect 的 container 过滤。
       在此处剔除会连带把 lint/补全的合法路径判成 unknown（真机与 18 条既有契约一起证伪过）。 */
    if (def?.type) out.push({ path, type: def.type });
    else if (def?.properties) out.push({ path, type: 'object' });
    if (def?.fields) Object.entries(def.fields).forEach(([sub, sd]: [string, any]) => {
      out.push({ path: path + '.' + sub, type: sd?.type || '?' });
    });
    if (def?.properties) walkFields(def.properties, path, out);
  });
}

/* ·实报：字段清单加载失败浮层裸怼千字级后端 ResponseException 原文——
 压缩为人话短串：抽 status line 状态码+首个 ES reason；未命中形态退 160 字截断。
 单源在 composable（FieldPicker/补全七消费面白得），导出供行为锁直测。 */
export function compactLoadErr(e: any): string {
  const raw = String(e?.message ?? e);
  const st = raw.match(/status line \[HTTP\/[\d.]+ (\d{3})(?: ([^\]]*))?\]/);
  const reason = raw.match(/"reason":"([^"]{1,120})/);
  if (st) return 'ES ' + st[1] + (st[2] ? ' ' + st[2].trim() : '') + (reason ? ':' + reason[1] : '');
  return raw.length > 160 ? raw.slice(0, 160) + '…' : raw;
}

export function useIndexFields(index: () => string) {
  const store = useAppStore();
  const fields: Ref<FieldItem[]> = ref([]);
  const loading = ref(false);
  const loadErr = ref('');

  async function ensure() {
    const idx = (index() || '').trim();
    if (!idx) {
      /* 无索引：已空时不再写新数组——computed 内 ensure 会因此自激重算（递归更新） */
      if (fields.value.length) fields.value = [];
      if (loadErr.value) loadErr.value = '';
      if (loading.value) loading.value = false;
      return;
    }
    const key = (store.target || '@host') + '|' + idx;
    const hit = cache.get(key);
    if (hit) { fields.value = hit; loadErr.value = ''; return; }
    loading.value = true; loadErr.value = '';
    /* 竞态守卫：请求在飞期间索引/集群目标可能已切换。缓存按各自 key 照写（数据本身没错），
 但 fields/loadErr/loading 仅当本次 reqKey 仍为当前 key 时才回写；已切换则静默丢弃，
 防止过期响应覆盖新索引字段或掐掉新请求的 loading。 */
    const reqKey = key;
    const reqEpoch = epoch;
    const isCurrent = () => reqEpoch === epoch
      && reqKey === (store.target || '@host') + '|' + ((index() || '').trim());
    try {
      const r: any = await api.mappingDetail(idx);
      const out: FieldItem[] = [];
      walkMappingFields(r?.raw?.properties, out);
      out.sort((a, b) => a.path.localeCompare(b.path));
      if (reqEpoch === epoch) cache.set(key, out);
      if (isCurrent()) fields.value = out;
    } catch (e: any) {
      if (isCurrent()) {
        loadErr.value = compactLoadErr(e);
        fields.value = [];
      }
    } finally { if (isCurrent()) loading.value = false; }
  }
  async function reload() {
    const idx = (index() || '').trim();
    cache.delete((store.target || '@host') + '|' + idx);
    await ensure();
  }
  /* 切集群目标：本实例字段清单清空（缓存 key 已含 target，无需清缓存） */
  watch(() => store.target, () => { fields.value = []; loadErr.value = ''; loading.value = false; });
  /* 消费方主动换源（如 SQL 的 FROM 改稿）：清空旧清单后由调用方再 ensure——
     不在此处 watch(index) 自动清，避免依赖 fields 状态的开层逻辑被中间空档二次触发 */
  function reset() { fields.value = []; loadErr.value = ''; loading.value = false; }

  return { fields, loading, loadErr, ensure, reload, reset };
}
