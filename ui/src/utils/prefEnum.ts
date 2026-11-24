/** 持久化枚举偏好校验：非法旧值不得让「隐藏表格但无替代视图」的空白态出现。 */
export function normalizePrefEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
