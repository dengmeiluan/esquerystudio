/* W2 Task 5：Lucene 光标段判定（luceneSegment）判定表驱动。
   field 段→字段补全；value 段→terms 建议；phrase 段→不出层；op 段→AND/OR/NOT 提示。
   长尾语法（模糊~/正则/boost^/闭合范围）一律兜底 field/value 段，零降级。 */
import { describe, it, expect } from 'vitest';
import { luceneSegment } from '../utils/luceneContext';

const C = (text: string) => luceneSegment(text, text.length); // 光标在尾

describe('luceneSegment', () => {
  it.each([
    ['', { kind: 'field', prefix: '' }],
    ['sta', { kind: 'field', prefix: 'sta' }],
    ['status:ac', { kind: 'value', field: 'status', prefix: 'ac' }],
    ['user.name:张', { kind: 'value', field: 'user.name', prefix: '张' }],
    ['status:ok AND ', { kind: 'field', prefix: '' }],
    ['status:ok AND mes', { kind: 'field', prefix: 'mes' }],
    ['message:"hello wo', { kind: 'phrase', field: 'message', prefix: 'hello wo' }],
    ['message:"closed" AND sta', { kind: 'field', prefix: 'sta' }],
    ['(status:ok OR ', { kind: 'field', prefix: '' }],
    ['age:[10 TO ', { kind: 'value', field: 'age', prefix: '' }],
    ['NOT sta', { kind: 'field', prefix: 'sta' }],
    ['_exists_:us', { kind: 'value', field: '_exists_', prefix: 'us' }],
    ['status:"esc\\"aped', { kind: 'phrase', field: 'status', prefix: 'esc\\"aped' }],
    ['status:ok', { kind: 'value', field: 'status', prefix: 'ok' }],
    /* 转义口径锁定：\\" = 转义反斜杠 + 引号边界（偶数反斜杠run → 引号算数）。
       下例第二个引号关闭短语，尾部 sta 回到 field 段。 */
    ['status:"a\\\\" AND sta', { kind: 'field', prefix: 'sta' }],
    /* F1：引号内 [ 不污染括号栈（引号区跳过） */
    ['msg:"[WARN" AND sta', { kind: 'field', prefix: 'sta' }],
    /* F2：{} 排他范围与 [] 同口径（实测 age:[10 TO 2 → value/age/'2'） */
    ['age:{10 TO ', { kind: 'value', field: 'age', prefix: '' }],
    ['age:{10 TO 2', { kind: 'value', field: 'age', prefix: '2' }],
    /* F4：tab 同样断词（\s 泛化，非仅空格） */
    ['status:ok AND\tmes', { kind: 'field', prefix: 'mes' }],
  ])('%j', (text, want) => expect(C(text)).toMatchObject(want));

  /* F3：中游光标锁定（直传 cursor，不经 C 辅助） */
  it('token 中段光标 → 按左侧已输入部分判段', () => {
    expect(luceneSegment('status:ok AND message:x', 17)).toMatchObject({ kind: 'field', prefix: 'mes' });
  });

  it('光标在短语内部 → phrase 段，前缀取引号至光标', () => {
    expect(luceneSegment('mes:"hello', 7)).toMatchObject({ kind: 'phrase', field: 'mes', prefix: 'he' });
  });

  it('cursor 越界 clamp：负值/超尾均收敛不炸，field 段兜底', () => {
    expect(luceneSegment('sta', -5)).toMatchObject({ kind: 'field', prefix: '' });
    expect(luceneSegment('sta', 99)).toMatchObject({ kind: 'field', prefix: 'sta' });
  });
});
