/**
 * DevTools 请求文件的导出 / 导入（对标 Kibana Console 的 Export / Import requests）。
 *
 * Kibana 的语义是「保存编辑器内容为文本，再原样导回」——**保留注释、每个请求、载荷与排版**。
 * 我们此前只有「从 curl 导入」与「历史 JSON 导出」，用户无法把自己的多请求脚本整份带走或
 * 拿到同事发来的脚本文件里直接跑，这是交互上最后一处明显偏离。
 *
 * 设计取舍：
 *  - 导出文件是**纯文本**（与 Kibana 一致），人可以直接读、可以直接改、可以进版本库；
 *    不用 JSON 包一层，避免注释与排版在往返中被吃掉。
 *  - 导入时把整份文本切成请求段，每段成为一个 tab 草稿（方法 / 路径 / 请求体），
 *    段与段之间以空行分隔；`//` 与 `#` 开头的行按注释保留在段内文本里。
 *  - 解析必须在客户端完成且**不允许猜**：认不出方法行就跳过并报告，不能把陌生文本
 *    当成路径塞进请求，导致用户点执行时发出一个自己没写过的请求。
 */

export interface DtFileRequest {
  method: string;
  path: string;
  /** 请求体原文（含注释；可为空串） */
  body: string;
  /** 段首的注释行（用于 tab 标题提示，不参与发送） */
  comment?: string;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH', 'OPTIONS'];
const METHOD_LINE = /^\s*([A-Za-z]+)\s+(\/\S*)\s*$/;

/** 导出：把每个 tab 还原成「METHOD path\nbody」，段间空行分隔。 */
export function exportRequests(tabs: Array<{ method: string; path: string; body?: string }>): string {
  const parts: string[] = [];
  for (const t of tabs) {
    const method = String(t.method || 'GET').toUpperCase();
    const path = String(t.path || '/').trim() || '/';
    const head = method + ' ' + path;
    const body = String(t.body ?? '').replace(/\s+$/, '');
    parts.push(body ? head + '\n' + body : head);
  }
  return parts.join('\n\n') + '\n';
}

/**
 * 导入：按空行切段，每段首个「METHOD /path」行作为请求头，其余为请求体。
 *
 * 容错策略：
 *  - 段内找不到合法方法行 → 记入 `skipped`（附原因），不猜测、不生成请求；
 *  - 方法名不在白名单 → 同上（`FOO /x` 不是请求）；
 *  - 全空文件 → `requests` 与 `skipped` 都为空，由调用方提示「文件里没有请求」。
 */
export function parseRequests(text: string): { requests: DtFileRequest[]; skipped: string[] } {
  const requests: DtFileRequest[] = [];
  const skipped: string[] = [];
  const raw = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return { requests, skipped };

  /* 切段：连续空行视为段界；仅含注释的段并入下一段（注释是下一请求的说明） */
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') {
      if (cur.length) { blocks.push(cur); cur = []; }
    } else {
      cur.push(line);
    }
  }
  if (cur.length) blocks.push(cur);

  for (const block of blocks) {
    let i = 0;
    const comments: string[] = [];
    while (i < block.length && /^\s*(\/\/|#)/.test(block[i])) { comments.push(block[i].trim()); i++; }
    if (i >= block.length) continue; /* 纯注释段：没有请求，也不是错误 */
    const m = METHOD_LINE.exec(block[i]);
    if (!m) {
      skipped.push(block[i].trim().slice(0, 60) || '(空行)');
      continue;
    }
    const method = m[1].toUpperCase();
    if (!METHODS.includes(method)) {
      skipped.push(m[1] + ' ' + m[2]);
      continue;
    }
    const body = block.slice(i + 1).join('\n').replace(/\s+$/, '');
    requests.push({ method, path: m[2], body, comment: comments.length ? comments.join(' ') : undefined });
  }
  return { requests, skipped };
}

/** 导入后的 tab 标题：优先用注释首个有意义的短语，否则「METHOD 路径」。 */
export function requestTitle(r: DtFileRequest): string {
  const c = (r.comment || '').replace(/^(\/\/|#)\s*/, '').trim();
  if (c) return c.length > 24 ? c.slice(0, 24) + '…' : c;
  const p = r.path.length > 22 ? r.path.slice(0, 22) + '…' : r.path;
  return r.method + ' ' + p;
}

/**
 * 请求边界跳转（Kibana Console `Ctrl+↑/↓` = previous/next request end 的对位）。
 *
 * 在 Kibana 里一个编辑器可写多条请求，跳转落在「下一条请求的最后一行」；我们的每个
 * Tab 只承载一条请求，于是语义收敛为「跳去相邻请求的起始行」——按同样的心智模型，
 * 上下键在请求之间移动，而不是逐行移动。
 *
 * @param line 当前行号（1-based）
 * @returns 目标行号（1-based）；没有相邻请求时返回 -1（调用方保持光标不动）
 */
function requestStartLines(text: string): number[] {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: number[] = [];
  let sawBlank = true; /* 文件开头视作段界 */
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') { sawBlank = true; continue; }
    if (!sawBlank) continue; /* 段内后续行（请求体）不是起点 */
    /** 纯注释行是下一条请求的说明，本身不算请求起点 */
    const isComment = /^\s*(\/\/|#)/.test(line);
    if (!isComment && METHOD_LINE.test(line)) out.push(i + 1);
    /* 注释之后紧接的方法行仍算起点，所以这里不把 sawBlank 置回 false */
    if (!isComment) sawBlank = false;
  }
  return out;
}

export function nextRequestLine(text: string, currentLine: number): number {
  const starts = requestStartLines(text);
  for (const ln of starts) if (ln > currentLine) return ln;
  return -1;
}

export function prevRequestLine(text: string, currentLine: number): number {
  const starts = requestStartLines(text);
  let best = -1;
  for (const ln of starts) if (ln < currentLine) best = ln;
  return best;
}
