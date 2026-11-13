/* P2-7：待提交批量变更 → bulk NDJSON（Beekeeper「Copy To SQL」的 ES 对位）。
 编辑链的 pending 更改一键导出为 bulk API 请求体——审计/复现/在别处重放三合一。
 格式：动作行 + 文档行成对，符合 ES _bulk 规范（ndjson，末尾换行）。
 ⚠ 文档行只含变更字段（部分更新语义，与 api.updatePartial 同口径），不是全量 _source。 */

interface BulkChange { id: string; fields: Record<string, any> }

export function buildBulkNdjson(index: string, changes: BulkChange[]): string {
  if (!changes.length) return '';
  const lines: string[] = [];
  for (const c of changes) {
    lines.push(JSON.stringify({ update: { _index: index, _id: c.id } }));
    lines.push(JSON.stringify({ doc: c.fields }));
  }
  return lines.join('\n') + '\n';
}

/* NDJSON 配对即时校验抽为纯函数（427 内联 computed 不可单测）——
 bulk 执行最高频失败源（配对错/非法 JSON 行）执行前拦截。
 动作行（index/create/update/delete 开头的单行 JSON）与文档行配对：
 index/create/update 需要一行文档，delete 自带不需要；非动作行均视为文档行。 */

type NdjsonLint = { level: 'ok' | 'warn'; msg: string } | null;

const BULK_OPS = ['index', 'create', 'update', 'delete'];

export function ndjsonLint(text: string, mode: 'bulk' | 'msearch' | 'msearch-template' = 'bulk'): NdjsonLint {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  if (mode !== 'bulk') {
    let badJson = 0;
    for (const l of lines) {
      try { JSON.parse(l); } catch { badJson++; }
    }
    if (badJson) return { level: 'warn', msg: `${badJson} 行不是合法 JSON（头行/查询体行都必须是单行 JSON）` };
    if (lines.length % 2 !== 0) {
      const heads = Math.ceil(lines.length / 2);
      const bodies = Math.floor(lines.length / 2);
      return {
        level: 'warn',
        msg: `头行 ${heads} 行、查询体行 ${bodies} 行——数量不匹配（缺少${lines.length % 2 === 1 ? '查询体行' : '头行'}），执行会失败`,
      };
    }
    return { level: 'ok', msg: `配对正常：头行 ${lines.length / 2} · 查询体行 ${lines.length / 2}` };
  }
  let actions = 0, docs = 0, deletes = 0, badJson = 0;
  let expectDoc = false;
  for (const l of lines) {
    let obj: any = null;
    try { obj = JSON.parse(l); } catch { badJson++; expectDoc = false; continue; }
    if (expectDoc) { docs++; expectDoc = false; continue; }
    actions++;
    const op = obj && typeof obj === 'object' ? BULK_OPS.find(k => k in obj) : undefined;
    if (op === 'delete') deletes++;
    else expectDoc = true; /* 未知动作键也按动作行处理并期待文档行——避免整行被误计成文档 */
  }
  const needDoc = actions - deletes;
  if (badJson) return { level: 'warn', msg: `${badJson} 行不是合法 JSON（动作/文档行都必须是单行 JSON）` };
  if (needDoc !== docs) return { level: 'warn', msg: `动作 ${actions} 行（其中 delete ${deletes} 行）需要 ${needDoc} 行文档，当前文档行 ${docs} 行——数量不匹配，执行会部分失败` };
  return { level: 'ok', msg: `配对正常：动作 ${actions} 行（delete ${deletes}）· 文档 ${docs} 行` };
}
