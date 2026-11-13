/* 托管重建「粘贴导入」解析器 —— 用户手里的一串原始 JSON 形态各异：
 — Mapping 页「原始 JSON」复制的完整配置：{ mappings, settings }
 — GET {index}/_mapping 响应（索引名包裹）：{ "idx": { mappings: {...} } }
 — GET {index}/_settings 响应（索引名包裹）：{ "idx": { settings: {...} } }
 — 纯 mapping 片段：{ properties: {...} } 或 { mappings: {...} }
 — 纯 settings：{ settings: {...} } / { index: {...} } / "index.*" 扁平键
 本函数只做**识别与拆分**，值原样透传不重写——粘贴进来的配置必须与源严格一致（校准铁律）。 */

export interface ParsedEsConfig {
  ok: boolean;
  error?: string;
  settings?: Record<string, unknown>;
  mappings?: Record<string, unknown>;
  /** 人话识别说明（notify 正文），让用户知道向导替他理解了什么 */
  notes?: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 顶层 key 是否全是扁平化 settings 键（"index.number_of_shards" / "analysis.analyzer.x" 风格） */
function looksFlatSettings(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o);
  return keys.length > 0 && keys.every(k => /^index\./.test(k) || /^analysis\./.test(k));
}

/* 索引名单键壳剥离——Mapping 页 rawJson 的 settings/mappings 段本身带索引名壳
 （inspect 保留索引名维度：settings={idx:{"index.*"平铺}}、mappings={idx:{properties}}），
 GET _mapping/_settings 粘贴的内层 {idx:{properties}} 同构。唯一键+值是对象+键非结构键才剥。 */
const STRUCT_KEYS = ['index', 'settings', 'mappings', 'properties', '_doc', 'doc'];
function stripIndexShell(node: Record<string, unknown>): { body: Record<string, unknown>; shell?: string } {
  const keys = Object.keys(node);
  const only = keys[0];
  if (keys.length === 1 && isPlainObject(node[only]) && !STRUCT_KEYS.includes(only)) {
    return { body: node[only] as Record<string, unknown>, shell: only };
  }
  return { body: node };
}

/** 数 mapping 顶层字段数（properties 计；没有 properties 就数 key 数） */
function fieldCount(m: Record<string, unknown>): number {
  const p = m.properties;
  return isPlainObject(p) ? Object.keys(p).length : Object.keys(m).length;
}

export function parseEsConfigPaste(text: string): ParsedEsConfig {
  const t = (text || '').trim();
  if (!t) return { ok: false, error: '粘贴内容为空' };
  let obj: unknown;
  try { obj = JSON.parse(t); } catch (e) {
    return { ok: false, error: 'JSON 解析失败：' + (e instanceof Error ? e.message : String(e)) };
  }
  if (!isPlainObject(obj)) return { ok: false, error: '不是 JSON 对象（数组/标量无法作为索引配置）' };

  /* GET _mapping/_settings 响应：单键（或少数索引名键）包裹，内层才有 mappings/settings —— 剥壳 */
  let body = obj;
  let shell = '';
  const topKeys = Object.keys(obj);
  const hasDirect = 'mappings' in obj || 'settings' in obj;
  if (!hasDirect && topKeys.length >= 1 && topKeys.every(k => isPlainObject(obj[k]))) {
    const first = obj[topKeys[0]] as Record<string, unknown>;
    if (isPlainObject(first) && ('mappings' in first || 'settings' in first)) {
      body = first;
      shell = topKeys[0];
    } else if (isPlainObject(first) && !STRUCT_KEYS.includes(topKeys[0])) {
      /* 内层无 mappings/settings 键（inspect 形态 {idx:{properties}}）——同样剥壳；
 键本身是结构键（{properties}/{index} 裸形态）时不是壳，照旧透传 */
      body = first;
      shell = topKeys[0];
    }
  }

  const notes: string[] = [];
  /* 段内索引名壳剥离——settings/mappings 拆出后各自可能还套着一层索引名 */
  let settings = isPlainObject(body.settings) ? body.settings : undefined;
  let mappings = isPlainObject(body.mappings) ? body.mappings : undefined;
  if (settings) {
    const s = stripIndexShell(settings);
    if (s.shell) { settings = s.body; notes.push(`settings 已剥去索引名「${s.shell}」外壳`); }
  }
  if (mappings) {
    const m = stripIndexShell(mappings);
    if (m.shell) { mappings = m.body; notes.push(`mapping 已剥去索引名「${m.shell}」外壳`); }
  }

  if (shell) notes.push(`识别为 API 响应，已剥去索引名「${shell}」外壳`);
  if (settings && mappings) {
    notes.push(`完整配置：mapping ${fieldCount(mappings)} 字段 + settings ${Object.keys(settings).length} 项，已分别填入两侧`);
  } else if (mappings) {
    notes.push(`识别为 mapping（${fieldCount(mappings)} 字段），已填入右侧 mapping 框`);
  } else if (settings) {
    notes.push(`识别为 settings（${Object.keys(settings).length} 项），已填入左侧 settings 框`);
  } else if (isPlainObject(body.properties)) {
    notes.push(`识别为纯 mapping 片段（${Object.keys(body.properties).length} 字段），已填入 mapping 框`);
    return { ok: true, mappings: body, notes };
  } else if (looksFlatSettings(body) || Object.keys(body).length === 1 && isPlainObject(body.index)) {
    /* {"index":{...}} 是 PUT _settings 的原生 body 形态，整体即 settings */
    notes.push(`识别为 settings（${Object.keys(body).length} 项），已填入 settings 框`);
    return { ok: true, settings: body, notes };
  } else {
    /* 兜底：{idx:{properties}} / {idx:{"index.*"平铺}} / {idx:{"index":{...}}}——壳内才是正文 */
    const b = stripIndexShell(body);
    const inner = b.body as Record<string, unknown>;
    if (isPlainObject(inner.properties)) {
      if (b.shell) notes.push(`已剥去索引名「${b.shell}」外壳`);
      notes.push(`识别为纯 mapping 片段（${Object.keys(inner.properties).length} 字段），已填入 mapping 框`);
      return { ok: true, mappings: inner, notes };
    }
    if (looksFlatSettings(inner) || Object.keys(inner).length === 1 && isPlainObject(inner.index)) {
      if (b.shell) notes.push(`settings 已剥去索引名「${b.shell}」外壳`);
      notes.push(`识别为 settings（${Object.keys(inner).length} 项），已填入 settings 框`);
      return { ok: true, settings: inner, notes };
    }
    return { ok: false, error: '未识别出 mappings / settings 结构——请粘贴索引配置类 JSON（Mapping 页「原始 JSON」、GET _mapping / _settings 响应均可）' };
  }
  return { ok: true, settings, mappings, notes };
}

/* 粘贴预览行——弹窗内联实时回显识别结果（不必点「解析并填入」才知道
 认成了什么）；ok=false 时返回单行错误。口径与 notes/字段计数一致 */
export function pastePreviewLines(r: ParsedEsConfig): string[] {
  if (!r.ok) return [r.error || '无法识别粘贴内容'];
  const lines: string[] = [...(r.notes || [])];
  if (r.settings) lines.push(`settings：${Object.keys(r.settings).length} 个顶级键`);
  if (r.mappings) {
    const m = r.mappings as Record<string, unknown>;
    lines.push(`mapping：${fieldCount(m)} 个顶层字段`);
    /* 字段级回显——预览前 5 个顶层字段名（多则省略号），贴入前即可目检校准 */
    const props = isPlainObject(m.properties) ? Object.keys(m.properties) : [];
    if (props.length) {
      const head = props.slice(0, 5).join('、') + (props.length > 5 ? ` 等 ${props.length} 个` : '');
      lines.push(`字段：${head}`);
    }
  }
  if (!lines.length) lines.push('未识别出 settings / mapping 内容');
  return lines;
}
