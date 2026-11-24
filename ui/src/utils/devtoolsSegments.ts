/**
 * （K1）：DevTools 多请求编辑器切段纯函数（Kibana 控制台多请求语义对标）。
 *
 * splitRequests(body)：按「空行」与「// 注释行」分界把请求体切成段——段=连续的非空非注释行
 * （段内换行保留，多行 JSON 不拆散）；分隔行本身不进任何段、连续分隔行不产空段。
 * locateSegment(body, cursorOffset)：光标偏移所在段下标——段内命中该段；段间空隙（含行尾
 * 分隔行）归后段（Kibana caret 语义）；文末尾部空隙归末段；空体 -1。
 *
 * 纯函数零副作用：只服务于发送出参（DevToolsView runSmart/execOneSeg），
 * 草稿持久化/历史/镜像 body 原稿零触。
 */
export interface DtSeg { start: number; end: number; text: string }

function isSepLine(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('//');
}

export function splitRequests(body: string): DtSeg[] {
  const out: DtSeg[] = [];
  if (!body) return out;
  const lines = body.split('\n');
  let offset = 0;
  let segStart = -1;
  let segEnd = 0;
  let segLines: string[] = [];
  const flush = () => {
    if (segStart >= 0 && segLines.length) out.push({ start: segStart, end: segEnd, text: segLines.join('\n') });
    segStart = -1;
    segLines = [];
  };
  for (const line of lines) {
    if (isSepLine(line)) {
      flush();
    } else {
      if (segStart < 0) segStart = offset;
      segLines.push(line);
      segEnd = offset + line.length;
    }
    offset += line.length + 1;
  }
  flush();
  return out;
}

export function locateSegment(body: string, cursorOffset: number): number {
  const segs = splitRequests(body);
  if (!segs.length) return -1;
  for (let i = 0; i < segs.length; i++) {
    if (cursorOffset >= segs[i].start && cursorOffset <= segs[i].end) return i;
  }
  for (let i = 0; i < segs.length; i++) {
    if (cursorOffset < segs[i].start) return i;
  }
  return segs.length - 1;
}
