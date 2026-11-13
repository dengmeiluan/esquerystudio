import { removeStoredRaw, writeStoredRaw } from '../utils/safeJson';

/**
 * W-D：跨页一次性值携带（link-carry）统一件。
 * 键约定 esquerystudio.link.{key}，sessionStorage 承载，JSON 序列化，取后即焚
 * （receive 读到即 removeItem，二次 receive 恒 null）。所有异常吞掉：
 * send 存储不可用静默失败，receive 存储不可用或非法 JSON 一律返回 null。
 */
export function useLinkCarry<T>(key: string) {
  const K = 'esquerystudio.link.' + key;

  function send(v: T): void {
    writeStoredRaw(sessionStorage, K, JSON.stringify(v));
  }

  function receive(): T | null {
    try {
      const raw = sessionStorage.getItem(K);
      if (raw == null) return null;
      /* 先焚再解：解析失败值也不得残留，防下一次进入误吃陈稿 */
      removeStoredRaw(sessionStorage, K);
      return JSON.parse(raw) as T;
    } catch { return null; }
  }

  return { send, receive };
}
