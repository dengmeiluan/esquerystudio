/**
 * settings 呈现统一层的纯函数（视图无关，可单测）。
 *
 * 背景：全站 6 处 settings 呈现各自为政（KPI 卡 + JsonTree / kv 行 / 表格 / pre），
 * 长 dot-key（如 index.search.slowlog.threshold.query.info 可达 50+ 字符）在
 * word-break:break-all 下词中撕裂。本文件收敛「嵌套→扁平」「dot-key 断点分段」
 * 两个口径，供 SettingsGrid / DotKey 及各视图复用。
 */

export interface SettingRow {
  k: string;
  v: string;
  /** true = 集群默认值（未显式设置），呈现层灰显 */
  def?: boolean;
}

/** 值统一转展示文本：数组拼逗号、对象转 JSON、null/undefined 给空串 */
export function settingValueText(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(settingValueText).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * 嵌套 settings 拍平成 dot-key 行。兼容两种返回形态：
 * - flat：{ "index.number_of_replicas": "1" }（inspect 端点）
 * - 嵌套：{ index: { number_of_replicas: "1" } }（GET _settings 端点）
 * 数组是叶子（如 analysis filter 列表），不再往下钻。
 */
export function flattenSettings(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out[prefix] = settingValueText(obj);
    return out;
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  if (!entries.length && prefix) { out[prefix] = '{}'; return out; }
  for (const [k, v] of entries) {
    const key = prefix ? prefix + '.' + k : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flattenSettings(v, key));
    else out[key] = settingValueText(v);
  }
  return out;
}

/** 拍平结果转排序好的行数组（settings 常规按字典序，index.* 天然聚拢） */
export function toSettingRows(obj: unknown, opts?: { def?: boolean }): SettingRow[] {
  return Object.entries(flattenSettings(obj))
    .map(([k, v]) => ({ k, v, def: opts?.def || false }))
    .sort((a, b) => a.k.localeCompare(b.k));
}

/**
 * 显式行 + 默认值行合并：默认值只补显式没有的 key，合并后整体重排。
 * MappingView「含默认值」开关与 IndexHub Settings Tab 共用此口径。
 */
export function mergeDefaultRows(explicit: SettingRow[], defaults: SettingRow[]): SettingRow[] {
  const seen = new Set(explicit.map(r => r.k));
  const out = [...explicit];
  for (const d of defaults) if (!seen.has(d.k)) out.push({ ...d, def: true });
  return out.sort((a, b) => a.k.localeCompare(b.k));
}

/**
 * dot-key 分段：断行只允许发生在「段边界（点后）」，根治 break-all 的词中撕裂。
 * "a.b.c" → ["a.", "b.", "c"]，呈现层在段间插 <wbr>。
 */
export function dotKeySegments(k: string): string[] {
  const parts = String(k ?? '').split('.');
  return parts.map((p, i) => (i < parts.length - 1 ? p + '.' : p));
}

/** 行过滤：key / value 任一命中（大小写不敏感），空关键字原样返回 */
export function filterSettingRows(rows: SettingRow[], kw: string): SettingRow[] {
  const q = kw.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => r.k.toLowerCase().includes(q) || r.v.toLowerCase().includes(q));
}

/* ═══ ：静态键判定单源 ═══
 ES 静态 index settings 清单（建索引后不可改，改了要么被拒要么需重建生效）。
 动态键（number_of_replicas/refresh_interval 等）不入列。匹配口径：全 key 相等，
 或剥掉 index. 前缀后相等——带前缀（IndexHub）与不带（部分调用方）两种行口径都命中。
 自 SettingsGrid 合并（行内「静态」徽标）+ MappingView 折叠节头「静态 M」摘要共用，
 防两处清单漂移。 */
const STATIC_KEYS = new Set([
  'number_of_shards', 'number_of_routing_shards', 'routing_partition_size',
  'codec', 'codec_compression_level', 'check_on_startup', 'store.type',
  'soft_deletes.enabled', 'sort.field', 'sort.order', 'sort.mode', 'sort.missing',
  'final_pipeline',
]);
export function isStaticSettingKey(k: string): boolean {
  return STATIC_KEYS.has(k) || (k.startsWith('index.') && STATIC_KEYS.has(k.slice('index.'.length)));
}
