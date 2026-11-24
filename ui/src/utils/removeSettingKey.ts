/* 「一键移除」共享内核——校验 issue.fix(REMOVE_SETTING) 的前端执行体。
 *
 * 服务端/浏览器端校验都会对「未知 settings 键」产出 {action: REMOVE_SETTING,
 * key: 相对键}（L1 UNKNOWN_SETTING_KEY 与 L2 dry-run unknown setting [index.xxx]
 * 两产生点）。本函数把确认后的动作落到审编框 settings JSON 上：兼容三种合法
 * 书写形态（顶层平铺相对键 / index. 前缀平铺 / index 嵌套逐段），删嵌套叶后
 * 清理空父对象；找不到键或 JSON 语法错误时 ok:false 原文不动——执行结果必须
 * 可感知，不静默改写。 */

export interface RemoveSettingResult {
  ok: boolean;
  /** 成功时的新 settings JSON（2 空格缩进，与审编框 prettyJson 同口径） */
  json?: string;
  error?: string;
}

export function removeSettingKey(settingsJson: string, relKey: string): RemoveSettingResult {
  const key = String(relKey || '').trim();
  if (!key) return { ok: false, error: '空键' };
  let root: any;
  try {
    root = JSON.parse(settingsJson);
  } catch (e) {
    return { ok: false, error: 'settings 不是合法 JSON：' + (e instanceof Error ? e.message : String(e)) };
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    return { ok: false, error: 'settings 顶层必须是对象' };
  }
  const flatKey = 'index.' + key;
  // 形态②：顶层 index. 前缀平铺键
  if (Object.prototype.hasOwnProperty.call(root, flatKey)) {
    delete root[flatKey];
    return { ok: true, json: JSON.stringify(root, null, 2) };
  }
  // 形态①：顶层平铺相对键
  if (Object.prototype.hasOwnProperty.call(root, key)) {
    delete root[key];
    return { ok: true, json: JSON.stringify(root, null, 2) };
  }
  // 形态③：index 嵌套逐段下钻（settings 壳宽容剥一层）
  const holder = root.index && typeof root.index === 'object' && !Array.isArray(root.index)
    ? root.index
    : (root.settings && typeof root.settings === 'object' ? root.settings : root);
  const segs = key.split('.');
  let cur: any = holder;
  const trail: Array<{ parent: any; seg: string }> = [];
  for (const seg of segs) {
    if (cur == null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, seg)) {
      return { ok: false, error: 'settings 中找不到键 "' + key + '"（可能已被移除，请重新校验）' };
    }
    trail.push({ parent: cur, seg });
    cur = cur[seg];
  }
  for (let i = trail.length - 1; i >= 0; i--) {
    const { parent, seg } = trail[i];
    delete parent[seg];
    if (i > 0 && Object.keys(parent).length > 0) break; // 父对象还有兄弟键，停止清理
  }
  return { ok: true, json: JSON.stringify(root, null, 2) };
}
