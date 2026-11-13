/* P1-7：_shards 部分失败提示文案（Kibana「partial results」对位）。
 ES 搜索响应 _shards.failed/timed_out > 0 时结果可能不完整——诚实呈现而不是装作全量。
 纯函数便于锁定文案与判定口径（shards 缺失/全成功返回 null=不提示）。 */

export function shardsHint(shards: { total?: number; failed?: number; timed_out?: number } | null | undefined): string | null {
  if (!shards) return null;
  const failed = shards.failed ?? 0;
  const timedOut = shards.timed_out ?? 0;
  if (failed <= 0 && timedOut <= 0) return null;
  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} 个失败`);
  if (timedOut > 0) parts.push(`${timedOut} 个超时`);
  const total = shards.total != null ? `（共 ${shards.total} 个分片）` : '';
  return `部分分片未完成：${parts.join('、')}${total}——当前结果可能不完整`;
}
