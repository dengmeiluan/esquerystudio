/* DevTools / REST 透传的内层只读判定（与后端 ConsoleAuthInterceptor.isReadonlyEsRequest 同源）。
 *
 * 外层永远是 POST（/cluster/devtools/execute、/cluster/raw），真实动作在请求体的 method/path 里。
 * 权限层只能看到外层，所以「只读身份能不能执行」必须由调用方把内层方法传进来判定。
 *
 * 口径与后端逐条对齐（A 方案白名单，fail-closed）：GET/HEAD/OPTIONS 只读；POST 仅放行名单内
 * 明确无副作用的读端点；其余一律判写。名单没覆盖到的读会被拦（可申请权限），名单外的写绝不会
 * 被误放行——宁可误拒，不可误放。
 */

/** 无副作用的 ES 只读 POST 端点（尾匹配，与后端 READONLY_ES_POST_SUFFIXES 同表）。 */
export const READONLY_ES_POST_SUFFIXES: readonly string[] = [
  '_search', '_async_search', '_search/template', '_render/template', '_msearch',
  '_msearch/template', '_count', '_field_caps', '_validate/query', '_explain',
  '_mget', '_get', '_source', '_termvectors', '_mtermvectors', '_analyze',
  '_search_source', '_knn_search', '_rank_eval', '_terms_enum',
  '_sql', '_sql/translate', '_eql/search', '_pit', '_search/point_in_time',
  '_ilm/explain', '_reindex/preview', '_cluster/health', '_cluster/state',
  '_cluster/stats', '_nodes/stats', '_cat', '_resolve/index',
];

/** 内层 ES 请求是否只读。与后端同名判定逐条对齐。 */
export function isReadonlyEsRequest(method: string, path: string): boolean {
  const m = String(method ?? '').trim().toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  if (m !== 'POST') return false;
  let p = String(path ?? '').trim();
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (!p) return false;
  const lower = p.toLowerCase();
  if (READONLY_ES_POST_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  /* _cat/* 全族都是只读观测 */
  return lower.includes('/_cat/') || lower.startsWith('_cat/');
}

/** 该端点是否为 raw / devtools 透传（外层恒 POST，内层方法在体内）。 */
export function isPassthroughPath(path: string): boolean {
  const clean = String(path ?? '').split('?')[0].split('#')[0];
  return clean.endsWith('/cluster/raw') || clean.endsWith('/cluster/devtools/execute');
}
