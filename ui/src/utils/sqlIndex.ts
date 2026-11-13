/* SQL FROM 索引解析——字段补全/错误纠错/字段体检的「当前索引」不再只看顶栏选中：
   SQL 可以写 FROM 另一个索引，字段源必须跟随语句本身，否则补全与列名纠错会拿错 mapping。
   硬约束（开源通用，不做业务假设）：
   ① 带引号/反引号的标识符写完即认（未闭合引号返回空，输入中途不触发换源）；
   ② 裸标识符只认已加载索引清单里的名字——避免边打字边把半截词当索引打 mapping；
   ③ 通配/逗号多表/派生表不猜（返回空，调用方回落顶栏索引）。 */
export function indexFromSql(text: string, known: string[] = []): string {
  const src = String(text || '');
  const m = /\bFROM\s+(?:"([^"]+)"|`([^`]+)`|([\w.\-]+))/i.exec(src);
  if (!m) return '';
  const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim();
  if (!raw || /[*,]/.test(raw) || /\s/.test(raw)) return '';
  /* 逗号多表不做单源猜测（字段可能是并集）——首表后紧跟逗号即放弃 */
  if (src.slice(m.index + m[0].length).trimStart().startsWith(',')) return '';
  if (m[1] != null || m[2] != null) return raw;
  return known.includes(raw) ? raw : '';
}
