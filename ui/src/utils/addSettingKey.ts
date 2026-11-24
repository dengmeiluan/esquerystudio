/* 「一键补充」共享内核——校验 issue.fix(ADD_SETTING) 的前端执行体。
 *
 * 服务端/浏览器端校验都会对「ES 指路式限制错误」（ngram diff 超限等，错误文本
 * 自带 This limit can be set by changing the [index.max_ngram_diff]）产出
 * {action: ADD_SETTING, key: 相对键, value: 建议值}。典型成因：粘贴期望配置
 * 整体替换 settings 时源索引的治理键丢失——源索引正是带着该键建成的。
 * 本函数把确认后的动作落到审编框 settings JSON 上：兼容三种合法书写形态
 * （顶层平铺相对键 / index. 前缀平铺 / index 嵌套逐段），已有键按原书写形态
 * 覆盖，新键写入 index 嵌套对象（无壳则建）；JSON 语法错误时 ok:false 原文不动。 */

export interface AddSettingResult {
  ok: boolean;
  /** 成功时的新 settings JSON（2 空格缩进，与审编框 prettyJson 同口径） */
  json?: string;
  error?: string;
}

export function addSettingKey(settingsJson: string, relKey: string, value: string): AddSettingResult {
  const key = String(relKey || '').trim();
  if (!key) return { ok: false, error: '空键' };
  let root: any;
  try {
    root = settingsJson == null || String(settingsJson).trim() === '' ? {} : JSON.parse(settingsJson);
  } catch (e) {
    return { ok: false, error: 'settings 不是合法 JSON：' + (e instanceof Error ? e.message : String(e)) };
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    return { ok: false, error: 'settings 顶层必须是对象' };
  }
  /* 纯数字建议值写成数字（settings 键值主流形态），其余原样字符串 */
  const v = /^[+-]?\d+$/.test(String(value ?? '')) ? Number(value) : String(value ?? '');
  const flatKey = 'index.' + key;
  // 形态②：顶层 index. 前缀平铺键——保持原书写形态覆盖
  if (Object.prototype.hasOwnProperty.call(root, flatKey)) {
    root[flatKey] = v;
    return { ok: true, json: JSON.stringify(root, null, 2) };
  }
  // 形态①：顶层平铺相对键
  if (Object.prototype.hasOwnProperty.call(root, key)) {
    root[key] = v;
    return { ok: true, json: JSON.stringify(root, null, 2) };
  }
  // 形态③：index 嵌套逐段下钻；已有段覆盖叶、缺段建对象。无壳（或 settings 壳内
  // 无 index 节点）时统一建 root.index——新键写进 index 嵌套是审编框主流形态
  let holder: any;
  if (root.index && typeof root.index === 'object' && !Array.isArray(root.index)) {
    holder = root.index;
  } else if (root.settings && typeof root.settings === 'object' && !Array.isArray(root.settings)
    && root.settings.index && typeof root.settings.index === 'object') {
    holder = root.settings.index;
  } else {
    root.index = {};
    holder = root.index;
  }
  const segs = key.split('.');
  let cur: any = holder;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (cur[seg] == null || typeof cur[seg] !== 'object') cur[seg] = {};
    cur = cur[seg];
  }
  cur[segs[segs.length - 1]] = v;
  return { ok: true, json: JSON.stringify(root, null, 2) };
}
