/**
 * ES 错误信息友好化：后端透传的 ES 原始错误通常是一大坨 JSON
 * （ResponseException + root_cause 数组），直接弹给用户可读性极差。
 * 这里统一提取核心 reason、映射常见场景为中文说明、控制长度。
 */

/* 常见 ES 错误 → 人话（命中子串即翻译，保留原因短句） */
const KNOWN: Array<{ match: string; friendly: string }> = [
  /* 网络层错误——浏览器原生文案（Failed to fetch 等）对用户零信息量，
 实测服务重启/连接池阻塞时整面刷这个，必须给出原因方向与行动指引 */
  { match: 'Failed to fetch', friendly: '网络请求失败——服务不可达或正在重启，稍后点「刷新」重试；持续失败请检查服务状态与网络' },
  { match: 'NetworkError when attempting', friendly: '网络请求失败——服务不可达或正在重启，稍后点「刷新」重试；持续失败请检查服务状态与网络' },
  { match: 'Load failed', friendly: '网络请求失败——服务不可达或正在重启，稍后点「刷新」重试；持续失败请检查服务状态与网络' },
  { match: 'unable to find any unassigned shards to explain', friendly: '当前没有未分配的分片——集群分片分配健康，无需诊断' },
  { match: 'index_not_found_exception', friendly: '索引不存在（index_not_found）' },
  { match: 'resource_already_exists_exception', friendly: '资源已存在（同名索引/别名冲突）' },
  /* 三场景扩容。位置约定：必须列在 search_phase_execution_exception /
 parsing_exception 这类**包装型**异常之前——真实报错原文里包装 type
 （SearchPhaseExecutionException、mapper_parsing_exception…）与叶子原因
 （closed / PIT 过期 / No handler for type）常同串共存，indexOf 顺序先命中者赢，
 叶子原因先列才能给出可行动指引，不被「查询执行失败（DSL 语法或字段类型不匹配）」
 这类泛文案吞掉（索引关闭/PIT 过期时用户 DSL 根本没有错）。 */
  { match: 'index_closed_exception', friendly: '索引已关闭——先在索引设置中开启该索引，或改查其他索引' },
  { match: 'search_context_missing_exception', friendly: 'PIT 已过期——请重新创建 PIT 后再翻页（PIT 有存活期限制）' },
  { match: 'No handler for type', friendly: 'mapping 字段类型不识别——检查字段 type 拼写（如 text/keyword/long/date）' },
  /* 高频错误码四条扩容。位置约定同 ：叶子原因必须列在包装型
 （search_phase_execution_exception / parsing_exception）之前——真实报错原文里包装
 type 与叶子原因常同串共存，indexOf 顺序先命中者赢。
 ⚠ mapper_parsing_exception / document_parsing_exception 两码不在本表：与泛
 'parsing_exception' 子串互斥（进表必把裸异常串的泛翻译顶掉——jobTracker 把
 裸串 'mapper_parsing_exception: …' → 'DSL 解析失败' 钉死），改走 friendlyEsError
 顶部的结构化 "type":"…" 检查（explainDocMissing 同款「结构化先于子串」位），见下。 */
  { match: 'query_shard_exception', friendly: '查询构建错误（分片执行失败）——常见于查询字段/排序/聚合与 mapping 不匹配' },
  { match: 'action_request_validation_exception', friendly: '请求校验失败——必填参数缺失或取值非法，请检查请求体' },
  { match: 'es_rejected_execution_exception', friendly: '线程池拒绝——写入/查询队列已满（集群过载），请稍后重试或降低并发' },
  { match: 'too_many_buckets_exception', friendly: '聚合桶数超限——请缩小聚合范围或加大间隔（减小分桶数）后重试' },
  { match: 'search_phase_execution_exception', friendly: '查询执行失败（DSL 语法或字段类型不匹配）——展开「原始 IO」可看分片级原因' },
  /* SQL 通道最常见的"能力边界"错误：ES SQL 引擎对表达不了的东西统一抛
     verification_exception（nested 字段、数组字段、未知函数、窗口函数边界…）。
     此前该 type 没进表 → 界面原样显示英文 JSON，用户既不知道能不能绕、也不知道该换哪个通道。
     reason 本身已说明"为什么"，这里补的是**行动**。位置：列在 parsing_exception 等包装型之前，
     与文件头注的"叶子原因先于包装型"约定一致。 */
  { match: 'verification_exception', friendly: 'SQL 通道表达不了这个查询——换 DSL / Lucene 通道可完整表达（原因见下）' },
  { match: 'parsing_exception', friendly: 'DSL 解析失败（JSON 语法或查询结构有误）' },
  { match: 'illegal_argument_exception', friendly: '参数不合法' },
  { match: 'circuit_breaking_exception', friendly: '触发熔断（请求内存超限，缩小查询范围重试）' },
  { match: 'cluster_block_exception', friendly: '集群/索引被写保护（block）——常见于磁盘水位超限' },
  { match: 'version_conflict_engine_exception', friendly: '版本冲突（文档已被并发修改）' },
  { match: 'snapshot_missing_exception', friendly: '快照不存在' },
  { match: 'repository_missing_exception', friendly: '快照仓库不存在' },
  { match: 'security_exception', friendly: '权限不足（ES 账号无该操作权限）' },
  /* HTTP 状态兜底映射（401/403/404/409/502）——api.ts 对空 body 错误兜底
 `HTTP ${status}` 裸串、网关/代理层也可能原样回 502 文本，此前全部落「原样限长」分支
 零指引。约定列 KNOWN 尾部：ES error.type 叶子同串共存时先命中先赢（位置约定同 527
 批头注）。ES 透传原文的 status line 形如 `HTTP/1.1 404`（带斜杠）不命中 `HTTP 404`，
 叶子翻译路径零扰动； _explain 结构化判据更在其前，零交集。 */
  { match: 'HTTP 401', friendly: '登录凭证已失效或未登录——请重新登录后再试（通常顶栏已弹出登录框）' },
  { match: 'HTTP 403', friendly: '权限不足——当前账号无权执行该操作，请联系管理员开通权限或切换更高角色账号' },
  { match: 'HTTP 404', friendly: '请求的资源不存在——目标索引/端点可能已被删除或路径有误，请确认后重试' },
  { match: 'HTTP 409', friendly: '请求冲突——资源状态已变化（重复创建/锁占用/状态过期），请刷新后重试' },
  { match: 'HTTP 502', friendly: '上游 ES 集群不可达——控制台后端收到网关错误，请检查目标集群地址/网络连通性后重试' },
  /* HTTP 兜底补 400/500/503（只收 401/403/404/409/502，400 最常见——
 DSL 校验失败经网关透传时 body 为空只剩状态码）。约定同 ：列 KNOWN 尾部，
 ES error.type 叶子同串共存时先命中先赢；ES 透传原文的 status line 形如 `HTTP/1.1 400`
 （带斜杠）不命中裸串，叶子翻译路径零扰动。 */
  { match: 'HTTP 400', friendly: '请求被拒绝（400）——DSL 语法或参数校验未通过，请检查请求体后重试' },
  { match: 'HTTP 500', friendly: '服务内部错误（500）——控制台后端处理失败，请稍后重试或查看服务日志' },
  { match: 'HTTP 503', friendly: '服务暂不可用（503）——后端过载或正在重启，稍后点「刷新」重试' },
];

/**
 * `_explain` 打到不存在的文档：ES 返回 **HTTP 404 + 正常 body**，body 里根本没有
 * `error` 字段，只有 `{"_index":...,"_id":"1","matched":false}`。
 *
 * 于是 KNOWN 里所有 `*_exception` 子串都不命中、extractReason 也取不到 reason，
 * 最终把整坨 `ResponseException: method [POST], host [http://x.x.x.x:9200], URI [...]`
 * 原文摔到界面上 —— 用户看不出真正的事实是「doc id 不存在」。
 *
 * 实测（ES 7.10.1）：
 * POST /idx/_explain/1 -> 404 {"_id":"1","matched":false} 无 error 字段
 * POST /idx/_explain/<真实id> -> 200 {"matched":true,"explanation":…}
 *
 * 判据取三者同时成立，而不是只看 `"matched":false` —— 后者太弱，正常的
 * 「查询未命中该文档」响应（HTTP 200 + matched:false）也长这样，会被误判成错误。
 */
function explainDocMissing(raw: string): string | null {
  if (!raw.includes('/_explain/')) return null;
  if (!/\b404\b/.test(raw)) return null;
  if (!/"matched"\s*:\s*false/.test(raw)) return null;
  const id = raw.match(/"_id"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const idx = raw.match(/"_index"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const who = id ? `文档 _id="${id[1]}"` : '该文档';
  const where = idx ? `索引 ${idx[1]}` : '目标索引';
  return `${who} 在 ${where} 中不存在——_explain 只能解释已存在的文档，请先确认 doc _id（可在「数据浏览器」里查一个真实 id）`;
}

/** 从 ES 错误串中尽力提取第一个 reason 短句。
 *  1150：包装型异常没有叶子原因时（典型 `search_phase_execution_exception` +
 *  reason `all shards failed`），原逻辑把「all shards failed」当原因显示——用户看不出
 *  是哪个字段/哪个 shard 出的问题。现在沿 root_cause[] 与 caused_by 链继续下潜，
 *  取第一个有信息量的 reason；全都只是包装词时返回 null（由上层给人话兜底）。 */
const WRAPPER_REASONS = new Set(['all shards failed', 'all shards failed: search_phase_execution_exception']);
function isWrapperReason(r: string): boolean {
  const s = r.trim().toLowerCase();
  return WRAPPER_REASONS.has(s) || /^all shards failed/.test(s);
}
function digReason(err: any, depth = 0): string | null {
  if (!err || typeof err !== 'object' || depth > 6) return null;
  const own = err.reason;
  if (typeof own === 'string' && own && !isWrapperReason(own)) return own;
  const rc = Array.isArray(err.root_cause) ? err.root_cause : [];
  for (const c of rc) {
    const r = digReason(c, depth + 1);
    if (r) return r;
  }
  if (err.caused_by) return digReason(err.caused_by, depth + 1);
  return null;
}
function extractReason(raw: string): string | null {
  /* 优先 JSON 解析（root_cause → caused_by 逐层下潜，跳过包装词） */
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const obj = JSON.parse(raw.slice(jsonStart));
      const deep = digReason(obj?.error);
      if (deep) return deep;
    } catch { /* 非完整 JSON，退化到正则 */ }
  }
  /* 正则兜底：取第一条「有信息量」的 reason（不取 all shards failed） */
  const re = /"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const val = m[1].replace(/\\"/g, '"');
    if (!isWrapperReason(val)) return val;
  }
  return null;
}

/**
 * 友好化入口：返回适合弹窗展示的短消息。
 * 原始信息不丢——调用方可把 raw 放入可复制详情。
 */
export function friendlyEsError(raw: string, maxLen = 260): string {
  const s = String(raw ?? '');
  /* 结构化规则先行：这一态没有任何 *_exception 子串可供 KNOWN 命中，
 不先判就会掉到末尾把原始 ResponseException 全文摔出来。 */
  const docMissing = explainDocMissing(s);
  if (docMissing) return docMissing;
  /* mapper_parsing_exception / document_parsing_exception 结构化映射——
 两码含泛 'parsing_exception' 子串，进 KNOWN 子串表会把裸异常串的泛翻译（jobTracker
 锁：裸串 → 'DSL 解析失败'）顶掉，故按 error.type 的 JSON 形态在此先于 KNOWN
 精确翻译（explainDocMissing 同款「结构化先于子串」位，527 叶子先于包装型约定同源）；
 裸异常串（后端透传 'xxx: reason' 形态）不匹配维持泛翻译零回归。
 让位条款：body 内含更具体叶子 'No handler for type'（「specific 压过
 mapper_parsing 泛载体」约定，esError.spec 同名锁）时不接手，仍由 KNOWN 叶子赢。 */
  const leafType = /"type"\s*:\s*"(mapper_parsing_exception|document_parsing_exception)"/.exec(s)?.[1];
  if (leafType && !s.includes('No handler for type')) {
    const friendly = leafType === 'mapper_parsing_exception'
      ? 'mapping 解析失败——文档字段值与 mapping 类型不匹配'
      : '文档解析失败——字段值与 mapping 类型不匹配，请检查写入数据';
    const leafReason = extractReason(s);
    return leafReason && !friendly.includes(leafReason) && leafReason.length < 160
      ? `${friendly}：${leafReason}`
      : friendly;
  }
  for (const k of KNOWN) {
    const at = s.indexOf(k.match);
    if (at >= 0) {
      /* 调用方的操作上下文前缀（如「inspect 失败: 」）不能被翻译吞掉——
 短前缀保留，用户才知道是哪个操作出的错；ES JSON 大块前缀被长度门槛挡掉。
 重拼分隔符恒全角「：」（esError.spec 锁：'inspect 失败：' 全角形态钉死；
 组装态消息里 'id: ' 类 ASCII 结构不受此影响——命中点在异常词中时前缀
 剥离到不了 id 的冒号，结构自然保留，commitFailReason 约定同源）。 */
      const prefix = s.slice(0, at).replace(/[\s:：-]+$/, '').trim();
      const noise = /^(Type|Range|Syntax|Reference)?Error$/i.test(prefix); // String(e) 带出的 JS 异常名不是上下文
      const ctx = prefix && !noise && prefix.length <= 40 && !prefix.includes('{') ? prefix + '：' : '';
      const reason = extractReason(s);
      /* 已知场景：人话 + 原始 reason 短句（若与人话不同且有增量信息） */
      return ctx + (reason && !k.friendly.includes(reason) && reason.length < 160
        ? `${k.friendly}：${reason}`
        : k.friendly);
    }
  }
  const reason = extractReason(s);
  const out = reason || s;
  return out.length > maxLen ? out.slice(0, maxLen) + ' …' : out;
}

/** 判断"错误"实际是无害/健康态（不该红色报错） */
export function isBenignEsError(raw: string): boolean {
  return String(raw ?? '').includes('unable to find any unassigned shards to explain');
}

/* 后端结构化错误码 → 人话。存量 KNOWN 表按 message 子串猜语义，适合
 ES 原始报错体；但后端 advice/interceptor 已给出明确分流码（{code,message} 错误体），
 code 是后端约定语义，命中时优先级恒高于 message 子串猜测（message 可能是与 code
 语义无关的 ES 原始串）。未命中/无 code 降级 friendlyEsError（存量口径零改动）。 */
const API_CODE_FRIENDLY: Record<string, string> = {
  LOCK_CONFLICT: '索引被其他任务锁定,请稍后重试',
  LOCK_LOST: '索引被其他任务锁定,请稍后重试',
  STAGE_GUARD: '当前阶段不允许该操作',
  RULE_REJECTED: '规则校验未通过,请检查配置',
  CONTROL_CLUSTER_DOWN: '管控集群不可达,请稍后重试',
  DEST_INDEX: '目标索引操作失败',
  JOB_STATE: '作业状态不允许该操作',
  REMOTE_CONNECT_FAILED: '远端集群连接失败',
  SETUP_REQUIRED: '连接尚未完成初始化',
  BAD_CREDENTIALS: '凭据校验失败',
  CONN_FORBIDDEN: '无该连接的访问权限',
  CONN_NOT_FOUND: '连接不存在或已删除',
};

/**
 * API 错误对象友好化入口：鸭子类型读 {@code e.code}，命中后端结构化错误码表给约定文案；
 * 未命中或无 code 时降级 {@code friendlyEsError(String(e?.message ?? e))}。
 * 字符串/null 等非对象入参安全落降级路径。
 */
export function friendlyApiError(e: unknown): string {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'string' && API_CODE_FRIENDLY[code]) return API_CODE_FRIENDLY[code];
  const msg = (e as { message?: unknown } | null | undefined)?.message;
  return friendlyEsError(String(msg ?? e));
}
