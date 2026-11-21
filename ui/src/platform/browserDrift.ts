/* 纯浏览器模式的配置漂移：没有代码 provider，就把第一次检测到的线上配置
 * 存成本机基线（IndexedDB meta），之后逐键对比基线 vs 线上。页面明确标注这是
 * 本机基线，不冒充服务端 @Setting/@Mapping。 */
import { metaGet, metaSet } from './browserStore';

export type HostCall = (path: string, method?: string, body?: string) => Promise<any>;
const BASELINE_PREFIX = 'drift:';

function enc(v: string): string { return encodeURIComponent(v); }
function strip(k: string): string { return k.replace(/^index\./, ''); }
function isSystem(k: string): boolean {
  return /^(uuid|creation_date|provided_name|version\.|resize\.|history\.|verified_before_close)/.test(k);
}
function flatten(node: any, prefix: string, out: Record<string, string>): void {
  for (const [k, v] of Object.entries<any>(node || {})) {
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (v !== undefined && v !== null) out[strip(key)] = String(v);
  }
}
function normalizeSettings(raw: any): Record<string, string> {
  let settings: any = {};
  for (const v of Object.values<any>(raw || {})) { settings = v?.settings || {}; break; }
  const flat: Record<string, string> = {};
  flatten(settings, '', flat);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) if (!isSystem(k)) out[k] = v;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
function mappingOf(raw: any): any {
  for (const v of Object.values<any>(raw || {})) return v?.mappings || {};
  return {};
}
function sortedJson(value: any): any {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortedJson(v)]));
  }
  return value;
}
function pretty(value: any): string { return JSON.stringify(sortedJson(value), null, 2); }

export async function driftKeys(host: HostCall): Promise<any[]> {
  const rows = await host('/_cat/indices?format=json&h=index');
  return (rows || [])
    .filter((r: any) => !String(r.index || '').startsWith('.'))
    .sort((a: any, b: any) => String(a.index).localeCompare(String(b.index)))
    .map((r: any) => ({ indexKey: r.index, alias: r.index, hasMapping: true }));
}

export async function drift(host: HostCall, indexKey: string): Promise<any> {
  let liveMappingRaw: any, liveSettingsRaw: any;
  try {
    [liveMappingRaw, liveSettingsRaw] = await Promise.all([
      host('/' + enc(indexKey) + '/_mapping'),
      host('/' + enc(indexKey) + '/_settings?flat_settings=true&include_defaults=false'),
    ]);
  } catch {
    return { indexKey, alias: indexKey, physicalIndex: indexKey, liveExists: false };
  }
  const liveMapping = mappingOf(liveMappingRaw);
  const liveSettings = normalizeSettings(liveSettingsRaw);
  const key = BASELINE_PREFIX + indexKey;
  let baseline: any = await metaGet(key);
  let baselineCreated = false;
  if (!baseline) {
    baseline = { at: Date.now(), mapping: liveMapping, settings: liveSettings };
    await metaSet(key, baseline);
    baselineCreated = true;
  }
  const baseSettings: Record<string, string> = baseline.settings || {};
  const baseMapping = baseline.mapping || {};
  const different: any[] = [];
  const onlyInCode: string[] = [];
  const onlyInLive: string[] = [];
  for (const k of Object.keys(baseSettings)) {
    if (!(k in liveSettings)) onlyInCode.push(k);
    else if (baseSettings[k] !== liveSettings[k]) different.push({ key: k, code: baseSettings[k], live: liveSettings[k] });
  }
  for (const k of Object.keys(liveSettings)) if (!(k in baseSettings)) onlyInLive.push(k);
  different.sort((a, b) => a.key.localeCompare(b.key));
  onlyInCode.sort(); onlyInLive.sort();
  const codeMapping = pretty(baseMapping);
  const liveMappingText = pretty(liveMapping);
  return {
    indexKey, alias: indexKey, physicalIndex: indexKey, liveExists: true, baselineCreated, baselineAt: baseline.at,
    codeSettings: pretty(baseSettings), liveSettings: pretty(liveSettings),
    settingsDiff: {
      clean: different.length === 0 && onlyInCode.length === 0 && onlyInLive.length === 0,
      different, onlyInCode, onlyInLive,
    },
    codeMapping, liveMapping: liveMappingText, mappingEqual: codeMapping === liveMappingText,
  };
}

export async function resetBaseline(indexKey: string): Promise<any> {
  await metaSet(BASELINE_PREFIX + indexKey, null);
  return { ok: true, indexKey };
}
