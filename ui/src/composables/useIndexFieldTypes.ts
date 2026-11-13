import { ref, watch, type Ref } from 'vue';
import { api } from '../api';
import { flattenSubFieldTypes } from '../utils/mappingTypes';

/* 索引字段类型映射（列名→ES 类型，顶层叶子）——QRT 双层列头类型徽标数据源。
 IndexHubView 的 fieldTypesMap（逻辑合并为可复用 composable（Lucene/PIT 结果表同款徽标）；
 取值链照抄 mpProps：mapping-detail 响应 {index,tree,raw,stats}，raw 是 unwrap type 层后的
 mappings，兼容旧形态（直接 _mapping 响应）多级回退，取不到给空表（单层列头零增量）。
 只取顶层叶子字段（与 docs 检索返回的 _source 扁平键一致）；object 容器不进。
 1376：multi-field 子域（title.keyword）一并入表——内核远端排序预检按子域判断
 「text 列可排」，漏登记会把可排序的 text 列误拦（IndexHub fieldTypesMap 同口径）。 */
export function useIndexFieldTypes(index: Ref<string>) {
  const fieldTypes = ref<Record<string, string>>({});
  let seq = 0;
  async function load(idx: string) {
    const my = ++seq;
    if (!idx) { fieldTypes.value = {}; return; }
    try {
      const m: any = await api.mappingDetail(idx);
      if (my !== seq) return; /* 切索引竞态：丢弃过期响应（ IndexHub 同纪律） */
      let props: Record<string, any> | null = null;
      if (m?.raw?.properties) props = m.raw.properties;
      else {
        const body = m?.[idx]?.mappings || m?.mappings || m;
        if (body?.properties) props = body.properties;
        else for (const v of Object.values<any>(body || {})) if (v && v.properties) { props = v.properties; break; }
      }
      const out: Record<string, string> = {};
      for (const [name, def] of Object.entries<any>(props ?? {})) if (def?.type) out[name] = def.type;
      Object.assign(out, flattenSubFieldTypes(props));
      fieldTypes.value = out;
    } catch {
      if (my === seq) fieldTypes.value = {}; /* 拉不到（权限/通配）静默回退单层列头 */
    }
  }
  watch(index, load, { immediate: true });
  return fieldTypes;
}
