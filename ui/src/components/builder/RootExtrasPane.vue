<template>
  <div class="rx">
    <!-- v4 参数条：横向 chips（点击 chip 切换展开），展开内容全宽显示在条下方——
 参数区从左树底部上移为横贯参数条，与编辑器/结果区纵向分层不再割裂 -->
    <!-- chips 键盘导航——←→/Home/End 在 chips 间移动焦点（W3C APG roving），
 Enter/Space 原生触发 toggle（chip=button）；Tab 逐个可达不变，导航是纯增强 -->
    <div class="rx-chips" @keydown="onChipsKeydown">
      <!-- 1338：只列「已配置」的参数（+ 正在展开编辑的）；其余收进末尾「更多参数」。
 此前 14 个 chips 平铺两行 96px，默认状态下 13 个都是「未设置」占位，
 把结果表推到 y=812 / 视口 900 —— 每次查完都要滚动才看得到结果。 -->
      <button v-for="c in pinnedChips" :key="c.k" type="button" class="rx-chip"
        :class="{ on: open.has(c.k) }" :title="CHIP_TIP[c.k] || undefined" @click="toggle(c.k)">
        <span class="rx-cn">{{ c.cn }}</span><code class="rx-key">{{ c.key }}</code>
        <span class="rx-state" :class="{ on: isSet[c.k] }">{{ chipState(c.k) }}</span>
      </button>
    </div>

    <!-- 分页展开表单随胶囊退役（size/from 无效控制，见上注释） -->

    <!-- 排序 -->
    <div v-if="open.has('sort')" class="rx-open">
      <div v-if="tree.sort === null" class="rx-none">未设置 <button class="btn sm ghost rx-sort-add" @click="addSort">+ 加排序</button></div>
      <div v-for="(s, i) in tree.sort || []" :key="s.id" class="rx-sort-row" tabindex="0"
           @contextmenu.prevent="openSortMenu($event, s, i)" @keydown.self="onSortMenuKey($event, s, i)">
        <!-- 排序行字段选择器只出可排序类型（ES doc_values 口径，含 boolean）；
 【W3b】候选内 date/数值族置顶（typePriority 只重排分组，候选集不变）
 998：多键排序项（{a:'asc',b:'desc'} 合并写法）不拆行——原样保留整项，用参数表编辑 -->
        <span v-if="s.form === 'multi'" class="rx-lb" title="该排序项含多个键，DSL 原样保留；可点右侧参数编辑">多键排序项</span>
        <FieldSelect v-else :model-value="s.field" :fields="fields" :types="types" :type-filter="SORTABLE_TYPES" :type-priority="SORT_PRIO_TYPES" @update:model-value="v => patchSort(s.id, { field: v })" />
        <select v-if="s.form !== 'multi'" class="inp rx-sort-order" :value="String(s.params.order ?? 'asc')"
                @change="patchSort(s.id, { params: { ...s.params, order: ($event.target as HTMLSelectElement).value } })">
          <option value="asc">asc</option>
          <option value="desc">desc</option>
        </select>
        <button aria-label="参数（missing/unmapped_type…）" class="btn sm ghost" title="参数（missing/unmapped_type…）" @click="sortParamsId = sortParamsId === s.id ? null : s.id"><Settings2 :size="12" /></button>
        <button aria-label="上移" class="btn sm ghost" title="上移" :disabled="i === 0" @click="moveSort(i, -1)"><ChevronUp :size="12" /></button>
        <button aria-label="下移" class="btn sm ghost" title="下移" :disabled="i === (tree.sort?.length || 1) - 1" @click="moveSort(i, 1)"><ChevronDown :size="12" /></button>
        <button aria-label="删除" class="btn sm ghost danger" title="删除" @click="delSort(s.id)"><X :size="12" /></button>
        <div v-if="sortParamsId === s.id" class="rx-sub">
          <GenericParams :value="s.params" path-prefix="" @update="v => onSortParams(s.id, v)" />
        </div>
      </div>
      <!-- 空数组态也要有加排序入口——删光排序行/DSL 带空 sort 后此前无任何入口（通病修复） -->
      <div v-if="tree.sort !== null && !tree.sort.length" class="rx-none">
排序列表为空（DSL 保留 sort: []）
        <button class="btn sm ghost rx-sort-add" @click="addSort">+ 加排序</button>
      </div>
    </div>

    <!-- 字段裁剪 _source -->
    <div v-if="open.has('src')" class="rx-open">
      <div v-if="!tree.source" class="rx-none">
ES 默认返回全部字段
        <button class="btn sm ghost rx-src-set" @click="setSource('list')">裁剪</button>
      </div>
      <template v-else>
        <div class="rx-row">
          <select class="inp rx-src-mode" :value="tree.source.mode"
                  @change="setSource(($event.target as HTMLSelectElement).value as SourceSpec['mode'])">
            <option value="all">全部</option>
            <option value="none">不返回</option>
            <option value="one">单字段</option>
            <option value="list">字段列表</option>
            <option value="pattern">includes/excludes</option>
          </select>
          <button aria-label="移除 _source 键" class="btn sm ghost danger" title="移除 _source 键" @click="patch({ source: null })"><X :size="12" /></button>
        </div>
        <FieldPicker v-if="tree.source.mode === 'one'" class="rx-src-fields" width="100%"
               :model-value="tree.source.fields[0] || ''" :index="index || ''" placeholder="字段名"
               @update:model-value="(v: string) => setSrcFields([v])" />
        <FieldPicker v-if="tree.source.mode === 'list'" class="rx-src-fields" width="100%" multi
               :model-value="tree.source.fields.join(', ')" :index="index || ''" placeholder="逗号分隔字段"
               @update:model-value="(v: string) => setSrcFields(csv(v))" />
        <template v-if="tree.source.mode === 'pattern'">
          <input class="inp mono" :value="tree.source.includes.join(', ')" placeholder="includes 通配，逗号分隔"
                 @input="setSrcPattern('includes', ($event.target as HTMLInputElement).value)" />
          <input class="inp mono" :value="tree.source.excludes.join(', ')" placeholder="excludes 通配，逗号分隔"
                 @input="setSrcPattern('excludes', ($event.target as HTMLInputElement).value)" />
        </template>
      </template>
    </div>

    <!-- 高亮 -->
    <div v-if="open.has('hl')" class="rx-open">
      <div v-if="!tree.highlight" class="rx-none">
命中字段不加颜色
        <button class="btn sm ghost rx-hl-set" @click="hlSet">启用</button>
      </div>
      <template v-else>
        <div v-for="(f, i) in tree.highlight.fields" :key="i" class="rx-hl-row" tabindex="0"
             @contextmenu.prevent="openHlMenu($event, f, i)" @keydown.self="onHlMenuKey($event, i)">
          <!-- 高亮行只出可分词高亮的文本类字段（text/keyword）；
 【W3b】候选内 text 置顶（全文高亮主场景是分词字段） -->
          <FieldSelect :model-value="f.name" :fields="hlFields" :types="types" :type-filter="HL_TYPES" :type-priority="HL_PRIO_TYPES" @update:model-value="v => hlPatchField(i, { name: v })" />
          <button aria-label="字段参数（fragment_size…）" class="btn sm ghost" title="字段参数（fragment_size…）" @click="hlParamsIdx = hlParamsIdx === i ? null : i"><Settings2 :size="12" /></button>
          <button aria-label="删除" class="btn sm ghost danger" title="删除" @click="hlDelField(i)"><X :size="12" /></button>
          <div v-if="hlParamsIdx === i" class="rx-sub">
            <!-- 1021：字段级参数 schema 化——fragment_size/number_of_fragments/fragment_offset/
                 no_match_size 数值档 + type 三档枚举（plain/postings/fvh）；未登记键
                 （matched_fields/highlight_query/pre_tags 覆盖等）自由表加键零丢失 -->
            <GenericParams :value="f.params" :schema="HL_FIELD_PARAMS" path-prefix="" @update="v => onHlFieldParams(i, v)" />
          </div>
        </div>
        <div v-if="highlightRuntime" class="rx-rt-warn" role="status">运行时字段不支持高亮（ES 限制，elastic/elasticsearch#65556）；请改用 mapping 字段</div>
        <div class="rx-row">
          <button class="btn sm ghost rx-hl-add" @click="hlAddField"><Plus :size="12" /> 高亮字段</button>
          <button aria-label="全局参数（pre_tags/post_tags…）" class="btn sm ghost" :class="{ on: hlGlobal }" title="全局参数（pre_tags/post_tags…）" @click="hlGlobal = !hlGlobal"><Settings2 :size="12" /></button>
          <span style="flex:1"></span>
          <button aria-label="移除 highlight 键" class="btn sm ghost danger" title="移除 highlight 键" @click="patch({ highlight: null })"><X :size="12" /></button>
        </div>
        <div v-if="hlGlobal" class="rx-sub">
          <GenericParams :value="tree.highlight.params" path-prefix="" @update="onHlGlobalParams" />
        </div>
      </template>
    </div>

    <!-- 聚合 -->
    <div v-if="open.has('aggs')" class="rx-open">
      <div v-if="tree.aggs === null" class="rx-none">
未设置
        <button class="btn sm ghost rx-agg-set" @click="aggAdd">添加聚合</button>
      </div>
      <template v-else>
        <AggTreeNode
          v-for="a in tree.aggs" :key="a.id" :node="a" :fields="fields" :types="types"
          @update:node="n => aggPatch(a.id, n)" @remove="aggDel(a.id)"
        />
        <div class="rx-row">
          <button class="btn sm ghost rx-agg-add" @click="aggAdd"><Plus :size="12" /> 顶层聚合</button>
          <span style="flex:1"></span>
          <button aria-label="移除聚合键" class="btn sm ghost danger" title="移除聚合键" @click="patch({ aggs: null })"><X :size="12" /></button>
        </div>
      </template>
    </div>

    <!-- 987：后置过滤 post_filter（QueryNode 树编辑，MiniTreeEditor 承载） -->
    <div v-if="open.has('pf')" class="rx-open">
      <div v-if="!tree.postFilter" class="rx-none">
聚合后过滤（命中统计含全部文档，仅返回结果被过滤）
        <button class="btn sm ghost rx-pf-add" @click="pfAdd">+ 加后置过滤</button>
      </div>
      <template v-else>
        <MiniTreeEditor :node="tree.postFilter" :fields="fields" :types="types" @update:node="pfUpdate" />
        <div class="rx-row">
          <span style="flex:1"></span>
          <button aria-label="移除 post_filter 键" class="btn sm ghost danger" title="移除 post_filter 键" @click="patch({ postFilter: null })"><X :size="12" /></button>
        </div>
      </template>
    </div>

    <!-- 987：字段折叠 collapse（路由字段 + 其余参数） -->
    <div v-if="open.has('col')" class="rx-open">
      <div v-if="!tree.collapse" class="rx-none">
按字段值收敛命中（每组只返回代表文档）
        <button class="btn sm ghost rx-col-add" @click="colAdd">+ 加折叠</button>
      </div>
      <template v-else>
        <div class="rx-row">
          <FieldSelect :model-value="tree.collapse.field" :fields="colFields" :types="types" :type-filter="COLLAPSE_TYPES" @update:model-value="v => colPatch({ field: v })" />
          <button aria-label="折叠参数（inner_hits…）" class="btn sm ghost" :class="{ on: colParams }" title="折叠参数（inner_hits…）" @click="colParams = !colParams"><Settings2 :size="12" /></button>
          <span style="flex:1"></span>
          <button aria-label="移除 collapse 键" class="btn sm ghost danger" title="移除 collapse 键" @click="patch({ collapse: null })"><X :size="12" /></button>
          <span v-if="collapseRuntime" class="rx-rt-warn" role="status">运行时字段不能用于 collapse（ES 需要索引字段的 doc_values）；请改用 mapping 字段</span>
        </div>
        <div v-if="colParams" class="rx-sub">
          <GenericParams :value="tree.collapse.params" :schema="COLLAPSE_PARAMS" path-prefix="" @update="onColParams" />
        </div>
      </template>
    </div>

    <!-- 987：向量近邻 knn（路由字段 + 向量 JSON + 其余参数） -->
    <div v-if="open.has('knn')" class="rx-open">
      <div v-if="!tree.knn" class="rx-none">
向量近邻检索（dense_vector 字段）
        <button class="btn sm ghost rx-knn-add" @click="knnAdd">+ 加向量检索</button>
      </div>
      <template v-else>
        <div class="rx-row">
          <FieldSelect :model-value="tree.knn.field || ''" :fields="fields" :types="types" :type-filter="KNN_TYPES" @update:model-value="v => knnPatch({ field: v || null })" />
          <button aria-label="kNN 参数（k/num_candidates/filter…）" class="btn sm ghost" :class="{ on: knnParams }" title="kNN 参数（k/num_candidates/filter…）" @click="knnParams = !knnParams"><Settings2 :size="12" /></button>
          <span style="flex:1"></span>
          <button aria-label="移除 knn 键" class="btn sm ghost danger" title="移除 knn 键" @click="knnClear"><X :size="12" /></button>
        </div>
        <div class="rx-row">
          <span class="rx-lb">query_vector</span>
          <input class="inp mono rx-knn-vec" :class="{ warn: knnVecBad }" :value="knnVecText"
                 placeholder='向量 JSON 数组，如 [0.1, 0.2, 0.3]'
                 @input="onKnnVec(($event.target as HTMLInputElement).value)" />
        </div>
        <div v-if="knnParams" class="rx-sub">
          <GenericParams :value="tree.knn.params" path-prefix="" @update="onKnnParams" />
        </div>
        <!-- 998：多向量混合检索（knn 数组形态）——额外向量逐条紧凑编辑 -->
        <div v-for="(k, i) in tree.knnExtra || []" :key="'kx' + i" class="rx-knn-x">
          <div class="rx-row">
            <span class="rx-lb">向量 {{ i + 2 }}</span>
            <FieldSelect :model-value="k.field || ''" :fields="fields" :types="types" :type-filter="KNN_TYPES"
                         @update:model-value="v => knnPatchExtra(i, { field: v || null })" />
            <input class="inp mono rx-knn-vec" :value="JSON.stringify(k.vector ?? null)"
                   placeholder="query_vector JSON" @change="onKnnVecExtra(i, ($event.target as HTMLInputElement).value)" />
            <button aria-label="额外向量参数" class="btn sm ghost" :class="{ on: knnXIdx === i }"
                    title="k / num_candidates / filter…" @click="knnXIdx = knnXIdx === i ? null : i"><Settings2 :size="12" /></button>
            <button aria-label="删除该向量" class="btn sm ghost danger" title="删除该向量" @click="knnDelExtra(i)"><X :size="12" /></button>
          </div>
          <div v-if="knnXIdx === i" class="rx-sub">
            <GenericParams :value="k.params" path-prefix="" @update="v => { if (!Array.isArray(v)) knnPatchExtra(i, { params: v }); }" />
          </div>
        </div>
        <div class="rx-row">
          <button class="btn sm ghost rx-knn-add2" title="再加一路向量查询（knn 写成数组，ES 8.7+ 混合检索）"
                  @click="knnAddExtra"><Plus :size="12" /> 加一路向量（数组形态）</button>
          <span v-if="tree.knnArray" class="rx-knn-tag mono">knn: [ ]</span>
          <span style="flex:1"></span>
          <button v-if="tree.knnArray" class="btn sm ghost rx-knn-fold" title="收回对象形态（仅保留第一路向量）"
                  @click="knnFoldToObject">收回单对象</button>
        </div>
      </template>
    </div>

    <!-- 989：搜索建议 suggest（项级结构化：名称 + text + suggester 类型体 rest） -->
    <div v-if="open.has('sug')" class="rx-open">
      <div v-if="!tree.suggest" class="rx-none">
搜索建议调试（term 纠错 / phrase 短语 / completion 补全）
        <button class="btn sm ghost rx-sug-add" @click="sugAdd">+ 加建议</button>
      </div>
      <template v-else>
        <div v-for="(s, i) in tree.suggest.items" :key="i" class="rx-sug-row">
          <input class="inp mono rx-sug-name" :value="s.name" placeholder="建议名" title="建议项名称（DSL 顶层键名）"
                 @input="sugPatch(i, { name: ($event.target as HTMLInputElement).value })" />
          <input class="inp rx-sug-text" :value="s.hasText ? String(s.text ?? '') : ''" placeholder="text（待纠错文本）"
                 @input="onSugText(i, ($event.target as HTMLInputElement).value)" />
          <button aria-label="建议参数（suggester 体）" class="btn sm ghost" :class="{ on: sugIdx === i }" title="建议参数（term/phrase/completion 体）" @click="sugIdx = sugIdx === i ? null : i"><Settings2 :size="12" /></button>
          <button aria-label="删除建议" class="btn sm ghost danger" title="删除建议" @click="sugDel(i)"><X :size="12" /></button>
          <div v-if="sugIdx === i" class="rx-sub">
            <SuggesterEditor :rest="s.rest" :fields="fields" :types="types"
                             @update="v => onSugRest(i, v)" />
          </div>
        </div>
        <div class="rx-row">
          <button class="btn sm ghost rx-sug-add2" @click="sugAdd"><Plus :size="12" /> 加建议</button>
          <button v-if="!tree.suggest.hasGlobalText" class="btn sm ghost rx-sug-gtext" title="全局 text：所有建议项共享的待纠错文本" @click="sugGlobalText">+ 全局 text</button>
          <span style="flex:1"></span>
          <button aria-label="移除 suggest 键" class="btn sm ghost danger" title="移除 suggest 键" @click="patch({ suggest: null })"><X :size="12" /></button>
        </div>
        <div v-if="tree.suggest.hasGlobalText" class="rx-row">
          <span class="rx-lb">全局 text</span>
          <input class="inp rx-sug-text" :value="String(tree.suggest.globalText ?? '')" placeholder="所有建议项共享"
                 @input="sugPatchGlobal(($event.target as HTMLInputElement).value)" />
        </div>
      </template>
    </div>

    <!-- 1000：检索器 retriever（六变体递归编辑；未注册变体/畸形体不进面板——留在「其他顶层键」零丢失） -->
    <div v-if="open.has('rt')" class="rx-open">
      <div v-if="!tree.retriever" class="rx-none">
检索器（8.14+）：多路召回组合检索面（与 query 二选一）
        <button class="btn sm ghost" @click="rtAdd">+ 加检索器</button>
      </div>
      <RetrieverEditor v-else :node="tree.retriever" :fields="fields" :types="types"
                       @update:node="rtUpdate" @remove="rtClear" />
    </div>

    <!-- 991：重打分 rescore（window_size + 重打分查询树编辑 + query 权重参数） -->
    <div v-if="open.has('rc')" class="rx-open">
      <div v-if="!tree.rescore" class="rx-none">
首屏排序后再对前 N 条二次打分（相关性调优）
        <button class="btn sm ghost rx-rc-add" @click="rcAdd">+ 加重打分</button>
      </div>
      <template v-else>
        <div class="rx-row">
          <label class="rx-lb" for="rc-ws">window_size</label>
          <input id="rc-ws" class="inp mono rx-num" :value="tree.rescore.hasWindowSize ? String(tree.rescore.windowSize ?? '') : ''"
                 placeholder="如 10" title="参与重打分的首屏条数（可留空 = ES 默认）"
                 @input="onRcWindow(($event.target as HTMLInputElement).value)" />
          <button aria-label="重打分参数（query_weight/rescore_query_weight…）" class="btn sm ghost" :class="{ on: rcParams }" title="重打分参数（query_weight/rescore_query_weight…）" @click="rcParams = !rcParams"><Settings2 :size="12" /></button>
          <span style="flex:1"></span>
          <button aria-label="移除 rescore 键" class="btn sm ghost danger" title="移除 rescore 键" @click="rcClear"><X :size="12" /></button>
        </div>
        <div class="rx-row">
          <span class="rx-lb">重打分查询</span>
        </div>
        <MiniTreeEditor v-if="tree.rescore.rescoreQuery" :node="tree.rescore.rescoreQuery" :fields="fields" :types="types" @update:node="rcUpdate" />
        <div v-if="rcParams" class="rx-sub">
          <GenericParams :value="tree.rescore.params" path-prefix="" @update="onRcParams" />
        </div>
        <!-- 998：多段重打分（rescore 数组形态）——第 2 段起逐段编辑 -->
        <div v-for="(rs, i) in tree.rescoreExtra || []" :key="'rcx' + i" class="rx-rc-x">
          <div class="rx-row">
            <span class="rx-lb">第 {{ i + 2 }} 段</span>
            <label class="rx-lb" :for="'rcx-ws' + i">window_size</label>
            <input :id="'rcx-ws' + i" class="inp mono rx-num" :value="rs.hasWindowSize ? String(rs.windowSize ?? '') : ''"
                   placeholder="如 10" @input="onRcWindowExtra(i, ($event.target as HTMLInputElement).value)" />
            <button aria-label="该段权重参数" class="btn sm ghost" :class="{ on: rcXIdx === i }"
                    title="query_weight / rescore_query_weight…" @click="rcXIdx = rcXIdx === i ? null : i"><Settings2 :size="12" /></button>
            <button aria-label="删除该段重打分" class="btn sm ghost danger" title="删除该段" @click="rcDelExtra(i)"><X :size="12" /></button>
          </div>
          <MiniTreeEditor v-if="rs.rescoreQuery" :node="rs.rescoreQuery" :fields="fields" :types="types"
                          @update:node="n => rcUpdateExtra(i, n)" />
          <div v-if="rcXIdx === i" class="rx-sub">
            <GenericParams :value="rs.params" path-prefix="" @update="v => { if (!Array.isArray(v)) rcPatchExtra(i, { params: v }); }" />
          </div>
        </div>
        <div class="rx-row">
          <button class="btn sm ghost rx-rc-add2" title="再加一段重打分（rescore 写成数组，多阶段重排）"
                  @click="rcAddExtra"><Plus :size="12" /> 加一段重打分</button>
          <span v-if="tree.rescoreArray" class="rx-knn-tag mono">rescore: [ ]</span>
          <span style="flex:1"></span>
          <button v-if="tree.rescoreArray" class="btn sm ghost rx-rc-fold" title="收回单对象形态（仅保留第一段）"
                  @click="rcFoldToObject">收回单段</button>
        </div>
      </template>
    </div>

    <!-- 996：脚本字段 / 运行时字段（命名键+体 同构项列表） -->
    <div v-if="open.has('sf')" class="rx-open">
      <div v-if="!tree.scriptFields" class="rx-none">
返回面追加脚本计算字段
        <button class="btn sm ghost rx-sf-add" @click="sfAdd">+ 加脚本字段</button>
      </div>
      <template v-else>
        <div v-for="(it, i) in tree.scriptFields.items" :key="i" class="rx-named-row">
          <input class="inp mono rx-sug-name" :value="it.name" placeholder="字段名" title="返回文档里的新字段名"
                 @input="sfPatch(i, ($event.target as HTMLInputElement).value)" />
          <button aria-label="脚本字段参数" class="btn sm ghost" :class="{ on: sfIdx === i }" title="脚本体（source/params…）" @click="sfIdx = sfIdx === i ? null : i"><Settings2 :size="12" /></button>
          <button aria-label="删除脚本字段" class="btn sm ghost danger" title="删除脚本字段" @click="sfDel(i)"><X :size="12" /></button>
          <div v-if="sfIdx === i" class="rx-sub">
            <GenericParams :value="it.body" path-prefix="" @update="v => { if (!Array.isArray(v)) sfPatchBody(i, v); }" />
          </div>
        </div>
        <div class="rx-row">
          <button class="btn sm ghost rx-sf-add2" @click="sfAdd"><Plus :size="12" /> 加脚本字段</button>
          <span style="flex:1"></span>
          <button aria-label="移除 script_fields 键" class="btn sm ghost danger" title="移除 script_fields 键" @click="patch({ scriptFields: null })"><X :size="12" /></button>
        </div>
      </template>
    </div>

    <div v-if="open.has('rm')" class="rx-open">
      <div v-if="!tree.runtimeMappings" class="rx-none">
查询期动态定义字段（可与查询/聚合/脚本字段共用）
        <button class="btn sm ghost rx-rm-add" @click="rmAdd">+ 加运行时字段</button>
      </div>
      <template v-else>
        <div v-for="(it, i) in tree.runtimeMappings.items" :key="i" class="rx-named-row">
          <input class="inp mono rx-sug-name" :value="it.name" placeholder="字段名" title="运行时字段名"
                 @input="rmPatch(i, ($event.target as HTMLInputElement).value)" />
          <button aria-label="运行时字段参数" class="btn sm ghost" :class="{ on: rmIdx === i }" title="字段体（type/script/format…）" @click="rmIdx = rmIdx === i ? null : i"><Settings2 :size="12" /></button>
          <button aria-label="删除运行时字段" class="btn sm ghost danger" title="删除运行时字段" @click="rmDel(i)"><X :size="12" /></button>
          <div v-if="rmIdx === i" class="rx-sub">
            <GenericParams :value="it.body" path-prefix="" @update="v => { if (!Array.isArray(v)) rmPatchBody(i, v); }" />
          </div>
        </div>
        <div class="rx-row">
          <button class="btn sm ghost rx-rm-add2" @click="rmAdd"><Plus :size="12" /> 加运行时字段</button>
          <span style="flex:1"></span>
          <button aria-label="移除 runtime_mappings 键" class="btn sm ghost danger" title="移除 runtime_mappings 键" @click="patch({ runtimeMappings: null })"><X :size="12" /></button>
        </div>
      </template>
    </div>

    <!-- 998：查询参数（searchParams）——schema 驱动表单。
         只列已设置的键（列表随加随减），未设置的从「+ 添加参数」菜单按族挑选；
         JSON 类键用单行 JSON 输入 + 即时校验（非法只标红不写树，避免半截 JSON 打断查询）。 -->
    <div v-if="open.has('qp')" class="rx-open rx-qp">
      <div v-if="!qpKeys.length" class="rx-none">
        未设置检索级参数（游标翻页 / 精确总数 / 返回字段 / 最低评分 / PIT…）
      </div>
      <div v-for="k in qpKeys" :key="k" class="rx-qp-row">
        <span class="rx-qp-head">
          <span class="rx-lb">{{ SEARCH_PARAM_META[k]?.label || k }}</span>
          <code class="rx-qp-key">{{ k }}</code>
        </span>
        <!-- boolean：真/假 双态开关 -->
        <select v-if="SEARCH_PARAM_META[k]?.kind === 'boolean'" class="inp rx-qp-ctl" :value="String(tree.searchParams[k])"
                @change="qpPatch(k, ($event.target as HTMLSelectElement).value === 'true')">
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        <!-- number / booleanNumber（track_total_hits 允许 true + 数字上限）：文本输入 + 容错解析 -->
        <input v-else-if="SEARCH_PARAM_META[k]?.kind === 'number' || SEARCH_PARAM_META[k]?.kind === 'booleanNumber'"
               class="inp mono rx-qp-ctl" :value="qpText(k)" :placeholder="SEARCH_PARAM_META[k]?.placeholder || '数字'"
               @change="onQpScalar(k, ($event.target as HTMLInputElement).value)" />
        <!-- string -->
        <input v-else-if="SEARCH_PARAM_META[k]?.kind === 'string'" class="inp mono rx-qp-ctl" :value="qpText(k)"
               :placeholder="SEARCH_PARAM_META[k]?.placeholder || ''"
               @input="qpPatch(k, ($event.target as HTMLInputElement).value)" />
        <!-- json：单行 JSON，非法标红不写树 -->
        <input v-else class="inp mono rx-qp-ctl rx-qp-json" :class="{ bad: qpJsonBad(k) }" :value="qpJsonText(k)"
               :placeholder="SEARCH_PARAM_META[k]?.placeholder || '[…]'"
               :title="qpJsonBad(k) ? 'JSON 语法错误：修正后自动生效，当前未写入树' : '合法 JSON：数组或对象'"
               @input="onQpJson(k, ($event.target as HTMLInputElement).value)"
               @blur="qpDraftClear(k)" />
        <button aria-label="移除该查询参数" class="btn sm ghost danger" title="移除该参数" @click="qpDel(k)"><X :size="12" /></button>
        <div class="rx-qp-hint">{{ SEARCH_PARAM_META[k]?.hint }}</div>
      </div>
      <div class="rx-row">
        <button class="btn sm ghost rx-qp-add" :aria-expanded="qpMenu" title="添加检索级参数（按族分组）" @click="qpMenu = !qpMenu">
          <Plus :size="12" /> 添加参数
        </button>
      </div>
      <div v-if="qpMenu" class="rx-qp-menu">
        <div v-for="g in SEARCH_PARAM_GROUPS" :key="g.group" class="rx-qp-grp">
          <div class="rx-qp-g">{{ g.group }}</div>
          <button v-for="it in g.items" :key="it.key" type="button" class="rx-qp-mi"
                  :disabled="it.key in tree.searchParams" :title="it.hint" @click="qpAdd(it.key)">
            <span>{{ it.label }}</span><code class="mono">{{ it.key }}</code>
          </button>
        </div>
      </div>
    </div>

    <!-- extras：其余顶层键 -->
    <div v-if="open.has('ex')" class="rx-open rx-ex">
      <div v-if="!Object.keys(tree.extras).length" class="rx-none">无（未登记的顶层键会出现在这里，原样保留）</div>
      <GenericParams :value="tree.extras" path-prefix="" @update="onExtras" />
    </div>
    <!-- 1352：排序行右键——每行 4 个图标钮（参数/上移/下移/删除）平铺，窄栏里逐个点准成本高 -->
    <CellContextMenu v-if="sortMenu" :x="sortMenu.x" :y="sortMenu.y" :title="sortMenuTitle"
      :items="sortMenuItems" @close="sortMenu = null" />
    <!-- 1352b：高亮字段行右键（同一模式——每行 2 个图标钮同样在输入框旁） -->
    <CellContextMenu v-if="hlMenu" :x="hlMenu.x" :y="hlMenu.y" :title="hlMenuTitle"
      :items="hlMenuItems" @close="hlMenu = null" />
  </div>
</template>

<script setup lang="ts">
/* W2：周边子句表单区。折叠分区有内容默认展开；size/from 非数字原样保留标黄（零降级）；
 aggs 区由 挂载（本组件模板预留位置见 补丁）。 */
import { ref, computed, watch, provide, nextTick } from 'vue';
import { Plus, X, ChevronUp, ChevronDown, Settings2, Copy, Braces } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import FieldPicker from '../FieldPicker.vue';
import GenericParams from './GenericParams.vue';
import CellContextMenu, { type CcmItem } from '../CellContextMenu.vue'; /* 1352：排序行右键 */
import { copyText } from '../../utils/format';
import { useAppStore } from '../../stores/app';
import SuggesterEditor from './SuggesterEditor.vue';
import AggTreeNode from './AggTreeNode.vue';
import MiniTreeEditor from './MiniTreeEditor.vue';
import RetrieverEditor from './RetrieverEditor.vue';
import { nid, makeRetrieverByOp, type QueryTree, type SortItem, type SourceSpec, type AggNode, type QueryNode, type CollapseSpec, type KnnSpec, type SuggestItem, type SuggestSpec, type RescoreSpec, type NamedSpecItem, type RetrieverNode } from '../../utils/queryAst';
import { runtimeScriptMissing } from '../../utils/runtimeFields';
import { RUNTIME_FIELD_CTX } from './runtimeFieldContext';
import { SEARCH_PARAM_META, SEARCH_PARAM_GROUPS } from '../../utils/queryBodyParams';
import { setFieldSearchIndex } from '../../utils/fieldSearch';
import { isMenuKey, menuKeyAnchor } from '../../utils/menuKey';
import { SORTABLE_FIELD_TYPES, NUMERIC_FIELD_TYPES } from '../../utils/queryAstOps';

const props = defineProps<{ tree: QueryTree; fields: string[]; types: Record<string, string>; index?: string }>();
const emit = defineEmits<{ (e: 'update:tree', t: QueryTree): void }>();

/* 排序/高亮行 FieldSelect 的类型过滤口径——
 可排序=有 doc_values 的类型（keyword/date/数值族/boolean）；高亮=text/keyword 文本类。
 数组经 props 透传 searchFields.typeFilter，mapping 缺失类型时仍可清空输入框自由手输 */
const SORTABLE_TYPES = SORTABLE_FIELD_TYPES;
const HL_TYPES = ['text', 'keyword'];
/* 1021：高亮字段级参数 schema（GenericParams 消费——常用五参数升类型化控件：
   type 三档枚举 plain/postings/fvh，fragment 系/size 数值档；未登记键
   matched_fields/highlight_query/pre_tags 覆盖等维持自由表加键零丢失） */
const HL_FIELD_PARAMS: Array<{ key: string; kind: 'number' | 'text' | 'boolean' | 'enum'; options?: string[] }> = [
  { key: 'fragment_size', kind: 'number' },
  { key: 'number_of_fragments', kind: 'number' },
  { key: 'fragment_offset', kind: 'number' },
  { key: 'no_match_size', kind: 'number' },
  { key: 'type', kind: 'enum', options: ['plain', 'postings', 'fvh'] },
];
/* 1096：collapse 的 inner_hits（返回被折叠掉的代表文档）用 JSON 文本位；
   并发组搜索上限给数值控件。未登记键仍可自由添加。 */
const COLLAPSE_PARAMS: Array<{ key: string; kind: 'number' | 'text' | 'boolean' | 'enum' | 'json'; options?: string[] }> = [
  { key: 'inner_hits', kind: 'json' },
  { key: 'max_concurrent_group_searches', kind: 'number' },
];
/* 【W3b】排序/高亮行的候选类型置顶（typePriority 只调候选分组排序，不改候选集）：
 排序行 date 打头、数值族紧随（时间/数值范围排序是主场景，keyword 字典序排序殿后）；
 高亮行 text 置顶（全文命中高亮主场景），keyword 次之 */
const NUMERIC_PRIO = NUMERIC_FIELD_TYPES;
const SORT_PRIO_TYPES = ['date', ...NUMERIC_PRIO];
const HL_PRIO_TYPES = ['text'];

/* FieldSelect 换代适配：写入 fieldSearch 当前索引上下文——排序/高亮行的字段选择器
 按 per-index 记忆「最近使用」（与 QueryTreePane 同一上下文，谁挂载谁写，值同源） */
watch(() => props.index, i => setFieldSearchIndex(i || ''), { immediate: true });

const patch = (p: Partial<QueryTree>) => emit('update:tree', { ...props.tree, ...p });
const csv = (raw: string) => raw.split(',').map(x => x.trim()).filter(Boolean);

/* ═══ 998：查询参数（searchParams）═══
   检索级顶层键的 schema 驱动编辑。三条取舍：
   ① 只渲染「已设置」的键（列表即当前检索面，不用在 18 个空控件里找）；
   ② JSON 类键走单行文本 + 即时校验：非法只标红、不写树（半截 JSON 会让整条查询失效）；
   ③ 初始值按语义给：布尔 false / 数字 0 / 数组 [] / slice·pit 对象 {}（用户点一下就能改）。 */
const qpMenu = ref(false);
const qpKeys = computed(() => Object.keys(props.tree.searchParams || {}));
const qpDraft = ref<Record<string, string>>({});
function qpPatch(k: string, v: unknown) {
  patch({ searchParams: { ...props.tree.searchParams, [k]: v } });
}
function qpDraftClear(k: string) {
  if (!(k in qpDraft.value)) return;
  const d = { ...qpDraft.value };
  delete d[k];
  qpDraft.value = d;
}
function qpDel(k: string) {
  const next = { ...props.tree.searchParams };
  delete next[k];
  qpDraftClear(k);
  patch({ searchParams: next });
}
function qpAdd(k: string) {
  qpMenu.value = false;
  if (k in props.tree.searchParams) return;
  const kind = SEARCH_PARAM_META[k]?.kind;
  const init = kind === 'boolean' ? false
    : kind === 'number' ? 0
    : kind === 'booleanNumber' ? true
    : kind === 'json' ? ((k === 'slice' || k === 'pit') ? {} : [])
    : '';
  qpPatch(k, init);
}
function qpText(k: string): string {
  const v = props.tree.searchParams[k];
  if (v === undefined) return '';
  return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
}
/* number / booleanNumber 容错解析：true/false 直转布尔，数字转数值，其余原样存字符串
   （交给 ES 报错——不在客户端静默改写用户意图） */
function onQpScalar(k: string, raw: string) {
  const t = raw.trim();
  if (!t) { qpDel(k); return; }
  if (t === 'true') { qpPatch(k, true); return; }
  if (t === 'false') { qpPatch(k, false); return; }
  const n = Number(t);
  qpPatch(k, Number.isFinite(n) ? n : t);
}
function qpJsonText(k: string): string {
  if (k in qpDraft.value) return qpDraft.value[k];
  const v = props.tree.searchParams[k];
  return v === undefined ? '' : JSON.stringify(v);
}
function qpJsonBad(k: string): boolean {
  const d = qpDraft.value[k];
  if (d === undefined) return false;
  try { JSON.parse(d); return false; } catch { return true; }
}
function onQpJson(k: string, raw: string) {
  qpDraft.value = { ...qpDraft.value, [k]: raw };
  try { qpPatch(k, JSON.parse(raw)); } catch { /* 半截 JSON：只留草稿，不写树 */ }
}
watch(() => props.tree.searchParams, s => {
  if (!Object.keys(s || {}).length) qpMenu.value = false;
});

/* 分区折叠：有内容的默认展开 */
const open = ref<Set<string>>(new Set([
  'page',
  ...(props.tree.sort?.length ? ['sort'] : []),
  ...(props.tree.source ? ['src'] : []),
  ...(props.tree.highlight ? ['hl'] : []),
  ...(props.tree.aggs?.length ? ['aggs'] : []),
  ...(props.tree.postFilter ? ['pf'] : []),
  ...(props.tree.collapse ? ['col'] : []),
  ...(props.tree.knn ? ['knn'] : []),
  ...(props.tree.retriever ? ['rt'] : []),
  ...(props.tree.suggest ? ['sug'] : []),
  ...(props.tree.rescore ? ['rc'] : []),
  ...(props.tree.scriptFields ? ['sf'] : []),
  ...(props.tree.runtimeMappings ? ['rm'] : []),
  ...(Object.keys(props.tree.searchParams || {}).length ? ['qp'] : []),
  ...(Object.keys(props.tree.extras).length ? ['ex'] : []),
]));
/* 1338：参数条从「14 个 chips 平铺」改成「已设置常驻 + 其余收纳」。
   真机量化（1440×900，查询工作台执行后）：结果表工具行在 y=812，视口 900 ——
   只剩 88px 可见，用户每次查完都得滚动才能看到结果。其中 .rx-chips 独占 96px（两行），
   而默认状态下这 14 个里有 13 个都是「未设置/未启用/无」的占位。
   规则：**配过的参数常驻**（用户要能一眼看到自己动了什么），没配过的收进「更多参数」。
   收纳项一旦被配置就自动出现在常驻区（已设置判定与 open 初始化同源）。 */
const CHIP_META = [
  { k: 'sort', cn: '排序', key: 'sort' },
  { k: 'src', cn: '字段裁剪', key: '_source' },
  { k: 'hl', cn: '高亮', key: 'highlight' },
  { k: 'aggs', cn: '聚合', key: 'aggs' },
  { k: 'pf', cn: '后置过滤', key: 'post_filter' },
  { k: 'col', cn: '折叠', key: 'collapse' },
  { k: 'knn', cn: '向量检索', key: 'knn' },
  { k: 'rt', cn: '检索器', key: 'retriever' },
  { k: 'sug', cn: '搜索建议', key: 'suggest' },
  { k: 'rc', cn: '重打分', key: 'rescore' },
  { k: 'sf', cn: '脚本字段', key: 'script_fields' },
  { k: 'rm', cn: '运行时字段', key: 'runtime_mappings' },
  { k: 'qp', cn: '查询参数', key: 'search body' },
  { k: 'ex', cn: '其他顶层键', key: 'extras' },
] as const;
/* 是否已配置——与 open 初始化那串条件逐条同源（别在这里另起一套判定） */
const isSet = computed<Record<string, boolean>>(() => ({
  sort: !!props.tree.sort?.length,
  src: !!props.tree.source,
  hl: !!props.tree.highlight,
  aggs: !!props.tree.aggs?.length,
  pf: !!props.tree.postFilter,
  col: !!props.tree.collapse,
  knn: !!props.tree.knn,
  rt: !!props.tree.retriever,
  sug: !!props.tree.suggest,
  rc: !!props.tree.rescore,
  sf: !!props.tree.scriptFields,
  rm: !!props.tree.runtimeMappings,
  qp: qpKeys.value.length > 0,
  ex: Object.keys(props.tree.extras).length > 0,
}));
/* 常驻 chips：已设置的；展开态中的也算（用户正在编辑它，不能因未设置而消失） */
/* 1338：全部 chip 常驻（既有契约：chip 化 + ≥5 颗可键盘导航，见 fullsiteGuard ⑥ / rootExtras 176）。
   高度问题改由**单行横向滚动**解决——.rx-chips 不再 flex-wrap，超宽时横向滑动，
   真机实测 96px 两行 → 39px 单行，结果表可见高度 88px → 158px。 */
const pinnedChips = computed(() => CHIP_META);

/* 每个 chip 的中文提示（原先是逐个写在模板 title 上，1338 收成一表） */
const CHIP_TIP: Record<string, string> = {
  pf: '聚合后过滤：命中统计含全部文档，返回结果按此过滤（post_filter）',
  col: '字段折叠：按字段值收敛命中（collapse）',
  knn: '向量近邻检索（knn）',
  rt: '检索器（8.14+）：多路召回组合——BM25 / 向量 / RRF 融合 / 文本重排 / 规则路由 / 线性加权（与 query 二选一的声明式检索面）',
  sug: '搜索建议（suggest：term/phrase/completion）',
  rc: '重打分：首屏按 query 相关性排序，再对前 N 条用 rescore_query 二次打分（rescore）',
  sf: '脚本字段：返回面追加脚本计算字段（script_fields）',
  rm: '运行时字段：查询期动态定义字段（runtime_mappings，可与查询/聚合/脚本字段共用）',
  qp: '检索级参数：游标翻页 / 精确总数 / 返回字段 / 最低评分 / PIT / 超时…（query 之外的检索键）',
};
/* chip 右侧的状态文案——与改造前逐条同源，不另立判定 */
function chipState(k: string): string {
  const t = props.tree;
  switch (k) {
    case 'sort': return t.sort?.length ? t.sort.length + ' 项' : '未设置';
    case 'src': return t.source ? SRC_LABEL[t.source.mode] : '默认全部';
    case 'hl': return t.highlight?.fields.length ? t.highlight.fields.length + ' 项' : '未启用';
    case 'aggs': return t.aggs?.length ? t.aggs.length + ' 项' : '未设置';
    case 'pf': return t.postFilter ? '已设置' : '未设置';
    case 'col': return t.collapse?.field || '未设置';
    case 'knn': return t.knn?.field || '未设置';
    case 'rt': return t.retriever ? '已设置' : '未设置';
    case 'sug': return t.suggest?.items.length ? t.suggest.items.length + ' 项' : '未设置';
    case 'rc': return t.rescore ? '已设置' : '未设置';
    case 'sf': return t.scriptFields?.items.length ? t.scriptFields.items.length + ' 项' : '未设置';
    case 'rm': return t.runtimeMappings?.items.length ? t.runtimeMappings.items.length + ' 项' : '未设置';
    case 'qp': return qpKeys.value.length ? qpKeys.value.length + ' 项' : '未设置';
    case 'ex': return Object.keys(t.extras).length ? Object.keys(t.extras).length + ' 个键' : '无';
    default: return '';
  }
}

function toggle(k: string) {
  const n = new Set(open.value);
  if (n.has(k)) n.delete(k); else n.add(k);
  open.value = n;
}
/* chips 键盘导航——←→ 环绕移动焦点、Home/End 跳首尾（W3C APG roving 焦点）。
 chip 是原生 button，Enter/Space=toggle（展开即「编辑入口」）已免费获得；
 其余键直接放行，Tab 逐个可达的既有路径不受影响 */
function onChipsKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  const chips = [...((e.currentTarget as HTMLElement).querySelectorAll('.rx-chip'))] as HTMLButtonElement[];
  const i = chips.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0
    : e.key === 'End' ? chips.length - 1
    : e.key === 'ArrowLeft' ? (i - 1 + chips.length) % chips.length
    : (i + 1) % chips.length;
  chips[next]?.focus();
}
/* DSL 侧空→非空跳变时自动展开对应分区；已展开/用户手折的稳定态不打扰 */
function autoOpen(k: string) { if (!open.value.has(k)) { const n = new Set(open.value); n.add(k); open.value = n; } }
watch(() => props.tree.sort?.length, (n, o) => { if (n && !o) autoOpen('sort'); });
watch(() => props.tree.source, (n, o) => { if (n && !o) autoOpen('src'); });
watch(() => props.tree.highlight, (n, o) => { if (n && !o) autoOpen('hl'); });
watch(() => Object.keys(props.tree.extras).length, (n, o) => { if (n && !o) autoOpen('ex'); });
/* 【预授权偏差C】aggs 空→非空跳变自动展开（与既有 4 条同风格） */
watch(() => props.tree.aggs?.length, (n, o) => { if (n && !o) autoOpen('aggs'); });
/* 987：post_filter/collapse/knn 同风格三跳变 */
watch(() => props.tree.postFilter, (n, o) => { if (n && !o) autoOpen('pf'); });
watch(() => props.tree.collapse, (n, o) => { if (n && !o) autoOpen('col'); });
watch(() => props.tree.knn, (n, o) => { if (n && !o) autoOpen('knn'); });
/* 989：suggest 同风格跳变 */
watch(() => props.tree.suggest, (n, o) => { if (n && !o) autoOpen('sug'); });
/* 991：rescore 同风格跳变 */
watch(() => props.tree.rescore, (n, o) => { if (n && !o) autoOpen('rc'); });
/* 996：script_fields/runtime_mappings 同风格跳变 */
watch(() => props.tree.scriptFields, (n, o) => { if (n && !o) autoOpen('sf'); });
watch(() => props.tree.runtimeMappings, (n, o) => { if (n && !o) autoOpen('rm'); });
/* 998：查询参数同风格跳变（DSL 里出现 search_after/pit 等键时自动展开） */
watch(() => Object.keys(props.tree.searchParams || {}).length, (n, o) => { if (n && !o) autoOpen('qp'); });

/* size/from 控制链随分页节退役（numText/numPatch 曾为其专用）——
 tree 上残留的 size/from 键序列化直通（旧草稿兼容，执行链 562 联动语义接管） */

/* sort */
const sortParamsId = ref<string | null>(null);
/* 1100：加排序的默认字段——只在可排序类型里选（此前取 fields[0]，text 字段会直接报
   fielddata 错），date 优先且时间词根优先（最新时间是最常见排序心智）。 */
function defaultSortField(): string {
  const sortable = props.fields.filter(f => SORTABLE_TYPES.includes(props.types[f] || ''));
  const dates = sortable.filter(f => props.types[f] === 'date' || props.types[f] === 'date_nanos');
  if (dates.length) {
    return dates.find(f => /(publish|created|updated|time|date|_at|_on)/i.test(f)) || dates[0];
  }
  return sortable[0] || props.fields[0] || '';
}
function addSort() {
  const item: SortItem = { id: nid(), field: defaultSortField(), form: 'short', params: { order: 'desc' } };
  patch({ sort: [...(props.tree.sort || []), item] });
  if (!open.value.has('sort')) toggle('sort');
}
function patchSort(id: string, p: Partial<SortItem>) {
  patch({ sort: (props.tree.sort || []).map(s => s.id === id ? { ...s, ...p } : s) });
}
function delSort(id: string) { patch({ sort: (props.tree.sort || []).filter(s => s.id !== id) }); }
function moveSort(i: number, d: number) {
  const arr = [...(props.tree.sort || [])];
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  patch({ sort: arr });
}

/* ═══ 1352：排序行右键 ═══
 排序行行尾 4 个 22px 图标钮（参数 / 上移 / 下移 / 删除）平铺——正是「表格/列表里一排小图标
 逐个点准」的老问题在周边子句区的翻版。右键把「作用在这一排序项」的动作收成一级，
 并补一条此前无入口的只读导出（这一项的 DSL 片段，排查多键排序项时不用手抄）。 */
const sortMenu = ref<{ x: number; y: number; id: string; i: number } | null>(null);
const sortMenuTitle = computed(() => {
  const m = sortMenu.value;
  const s = m ? (props.tree.sort || []).find(x => x.id === m.id) : null;
  if (!s) return '排序项';
  const order = String(s.params?.order ?? 'asc');
  return `排序 · ${s.field || '(多键排序项)'} · ${order}`;
});
function openSortMenu(e: MouseEvent, s: SortItem, i: number) {
  /* 下拉/输入框内右键留给浏览器原生（与条件行/树节点同口径） */
  const t = e.target as HTMLElement | null;
  if (t?.closest('input, textarea, select, .monaco-editor')) return;
  sortMenu.value = { x: e.clientX, y: e.clientY, id: s.id, i };
}
function onSortMenuKey(e: KeyboardEvent, s: SortItem, i: number) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  sortMenu.value = { ...menuKeyAnchor(e), id: s.id, i };
}
async function copySortJson() {
  const m = sortMenu.value;
  const s = m ? (props.tree.sort || []).find(x => x.id === m.id) : null;
  if (!s) return;
  const ok = await copyText(JSON.stringify({ [s.field || 'multi']: { ...s.params } }, null, 2));
  useAppStore().notify(ok ? 'success' : 'error', ok ? '已复制排序项 JSON' : '复制失败');
}
const sortMenuItems = computed<CcmItem[]>(() => {
  const m = sortMenu.value;
  const s = m ? (props.tree.sort || []).find(x => x.id === m.id) : null;
  if (!m || !s) return [];
  const len = props.tree.sort?.length || 0;
  const cur = String(s.params?.order ?? 'asc');
  return [
    { key: 'sort-order', label: cur === 'asc' ? '改为降序 desc' : '改为升序 asc', icon: ChevronDown,
      run: () => patchSort(s.id, { params: { ...s.params, order: cur === 'asc' ? 'desc' : 'asc' } }) },
    {
      key: 'sort-more', label: '位置与复制…', icon: Copy, sep: true, children: [
        ...(m.i > 0 ? [{ key: 'sort-up', label: '上移一位（排序优先级）', icon: ChevronUp, run: () => moveSort(m.i, -1) }] : []),
        ...(m.i < len - 1 ? [{ key: 'sort-down', label: '下移一位', icon: ChevronDown, run: () => moveSort(m.i, 1) }] : []),
        { key: 'sort-json', label: '复制排序项 JSON', icon: Braces, run: () => void copySortJson() },
      ],
    },
    { key: 'sort-del', label: '删除此排序项', icon: X, danger: true, sep: true, run: () => delSort(s.id) },
  ];
});

/* _source */
const SRC_LABEL: Record<SourceSpec['mode'], string> = { all: '全部', none: '不返回', one: '单字段', list: '字段列表', pattern: '通配裁剪' };
function setSource(mode: SourceSpec['mode']) {
  const cur = props.tree.source;
  patch({ source: { mode, fields: cur?.fields || [], includes: cur?.includes || [], excludes: cur?.excludes || [] } });
  if (!open.value.has('src')) toggle('src');
}
function setSrcFields(fields: string[]) { if (props.tree.source) patch({ source: { ...props.tree.source, fields } }); }
function setSrcPattern(key: 'includes' | 'excludes', raw: string) {
  const s = props.tree.source;
  if (!s) return;
  const arr = csv(raw);
  /* 编辑即声明存在：用户输入过该侧就置 presence=true，防 parse 记忆的显式 false 吞掉输入；
 清空为空数组时保留原 presence（显式空保键 / 显式缺席语义不变） */
  const hasKey = key === 'includes' ? 'hasIncludes' : 'hasExcludes';
  patch({ source: { ...s, [key]: arr, [hasKey]: arr.length ? true : s[hasKey] } });
}

/* highlight */
const hlParamsIdx = ref<number | null>(null);
const hlGlobal = ref(false);
function hlSet() { patch({ highlight: { fields: [], params: {} } }); if (!open.value.has('hl')) toggle('hl'); }
function hlAddField() {
  if (!props.tree.highlight) return;
  patch({ highlight: { ...props.tree.highlight, fields: [...props.tree.highlight.fields, { name: props.fields[0] || '', params: {} }] } });
}
function hlPatchField(i: number, p: Partial<{ name: string; params: Record<string, unknown> }>) {
  if (!props.tree.highlight) return;
  patch({ highlight: { ...props.tree.highlight, fields: props.tree.highlight.fields.map((f, j) => j === i ? { ...f, ...p } : f) } });
}
function hlDelField(i: number) {
  if (!props.tree.highlight) return;
  patch({ highlight: { ...props.tree.highlight, fields: props.tree.highlight.fields.filter((_, j) => j !== i) } });
}

/* ═══ 1352b：高亮字段行右键 ═══
 与排序行同源的缺口：高亮字段行也只有输入框旁 2 个图标钮（参数 / 删除），
 且这里的「参数」是面板切换而非字段本身的信息——右键把「作用在这一高危字段」的动作列全，
 并补一条此前无入口的只读导出（这一字段的高亮配置 JSON，排查 fragment/type 组合时不用手抄）。 */
const hlMenu = ref<{ x: number; y: number; i: number } | null>(null);
const hlMenuField = computed(() => {
  const m = hlMenu.value;
  return m ? props.tree.highlight?.fields[m.i] ?? null : null;
});
const hlMenuTitle = computed(() => {
  const f = hlMenuField.value;
  return f ? `高亮字段 · ${f.name || '(未选)'}` : '高亮字段';
});
function openHlMenu(e: MouseEvent, _f: { name: string }, i: number) {
  const t = e.target as HTMLElement | null;
  if (t?.closest('input, textarea, select, .monaco-editor')) return;
  hlMenu.value = { x: e.clientX, y: e.clientY, i };
}
function onHlMenuKey(e: KeyboardEvent, i: number) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  hlMenu.value = { ...menuKeyAnchor(e), i };
}
async function copyHlJson() {
  const f = hlMenuField.value;
  if (!f) return;
  const ok = await copyText(JSON.stringify({ fields: [{ [f.name]: Object.keys(f.params).length ? f.params : {} }] }, null, 2));
  useAppStore().notify(ok ? 'success' : 'error', ok ? '已复制高亮字段配置' : '复制失败');
}
const hlMenuItems = computed<CcmItem[]>(() => {
  const m = hlMenu.value;
  const f = hlMenuField.value;
  if (!m || !f) return [];
  return [
    { key: 'hl-params', label: '字段参数（fragment_size…）', icon: Settings2,
      run: () => { hlParamsIdx.value = hlParamsIdx.value === m.i ? null : m.i; } },
    { key: 'hl-more', label: '复制…', icon: Copy, sep: true, children: [
      { key: 'hl-name', label: '复制字段名', icon: Copy, run: () => {
        copyText(f.name).then(ok => useAppStore().notify(ok ? 'success' : 'error', ok ? `已复制「${f.name}」` : '复制失败'));
      } },
      { key: 'hl-json', label: '复制此字段的高亮配置 JSON', icon: Braces, run: () => void copyHlJson() },
    ] },
    { key: 'hl-del', label: '删除此高亮字段', icon: X, danger: true, sep: true, run: () => hlDelField(m.i) },
  ];
});

/* aggs */
function aggAdd() {
  const sibs = props.tree.aggs || [];
  let i = sibs.length + 1;
  while (sibs.some(a => a.name === 'agg_' + i)) i++;   // 跳过已占用名：删中间项后再加不撞名（同名序列化会静默覆盖）
  const a: AggNode = {
    id: nid(), name: 'agg_' + i, op: 'terms',
    body: { field: props.fields[0] || '' }, children: [], meta: {}, aggKey: 'aggs',
  };
  patch({ aggs: [...(props.tree.aggs || []), a] });
  if (!open.value.has('aggs')) toggle('aggs');
}
function aggPatch(id: string, n: AggNode) { patch({ aggs: (props.tree.aggs || []).map(a => a.id === id ? n : a) }); }
function aggDel(id: string) { patch({ aggs: (props.tree.aggs || []).filter(a => a.id !== id) }); }

/* ═══ 987：post_filter / collapse / knn 三键结构化编辑 ═══ */
/* post_filter：默认给 bool must 组带一条可编辑的空 term（比裸 match_all 立即可上手） */
function pfAdd() {
  const leaf: QueryNode = { id: nid(), type: 'leaf', op: 'term', field: props.fields[0] || '', value: '', params: {}, raw: null };
  patch({ postFilter: { id: nid(), type: 'bool', children: [{ occur: 'must', node: leaf }], params: {}, arrForm: { must: true } } });
  if (!open.value.has('pf')) toggle('pf');
}
function pfUpdate(n: QueryNode) { patch({ postFilter: n }); }

/* 1000：检索器三口——新建给 bm25 可用初值；编辑直通；删除整键收回 */
function rtAdd() { patch({ retriever: makeRetrieverByOp('standard') }); }
function rtUpdate(n: RetrieverNode) { patch({ retriever: n }); }
function rtClear() { patch({ retriever: null }); }

/* collapse：路由字段折叠 + 其余参数（inner_hits 等）走递归表 */
const COLLAPSE_TYPES = ['keyword', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'boolean', 'date'];
const KNN_TYPES = ['dense_vector'];
const colParams = ref(false);
function colAdd() {
  patch({ collapse: { field: props.fields[0] || '', params: {} } });
  if (!open.value.has('col')) toggle('col');
}
function colPatch(p: Partial<CollapseSpec>) { if (props.tree.collapse) patch({ collapse: { ...props.tree.collapse, ...p } }); }
function onColParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v) && props.tree.collapse) patch({ collapse: { ...props.tree.collapse, params: v } });
}

/* knn：向量走 JSON 文本框（768 维手填不现实，chip/递归表均不可用）——
   合法 JSON 写树、非法只本地标黄不写（不触发树→文本回写循环） */
const knnParams = ref(false);
const knnVecText = ref('[]');
const knnVecBad = ref(false);
watch(() => props.tree.knn, k => {
  const next = k?.hasVector ? JSON.stringify(k.vector) : '[]';
  /* 本地文本与树等值（parse 深度相等）时不回写——防合法输入被 JSON.stringify
   规范化改写（空格折叠/键序），光标跳尾是输入侧事故 */
  let same = false;
  if (!knnVecBad.value) {
    try { same = JSON.stringify(JSON.parse(knnVecText.value)) === next; } catch { same = false; }
  }
  knnVecText.value = same ? knnVecText.value : next;
  knnVecBad.value = false;
}, { immediate: true });
function knnAdd() {
  patch({ knn: { field: props.fields[0] || null, vector: [], params: { k: 10, num_candidates: 100 }, hasVector: true } });
  if (!open.value.has('knn')) toggle('knn');
}
function knnPatch(p: Partial<KnnSpec>) { if (props.tree.knn) patch({ knn: { ...props.tree.knn, ...p } }); }
function onKnnVec(text: string) {
  knnVecText.value = text;
  try {
    const v = JSON.parse(text);
    if (typeof v !== 'object' || v === null) { knnVecBad.value = true; return; }
    knnVecBad.value = false;
    knnPatch({ vector: v, hasVector: true });
  } catch {
    knnVecBad.value = true;   // 编辑中间态不写树（向量半输完是常态）
  }
}
function onKnnParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v) && props.tree.knn) patch({ knn: { ...props.tree.knn, params: v } });
}
/* ═══ 998：多向量（knn 数组形态） ═══
   knn 恒为第一路，knnExtra 为第 2..n 路，knnArray 记忆原 DSL 是否数组形态。
   加一路 = 升为数组形态；删空 = 自动收回对象形态（不留 `knn: [x]` 这种无意义包装）。 */
const knnXIdx = ref<number | null>(null);
function knnPatchExtra(i: number, p: Partial<KnnSpec>) {
  const list = [...(props.tree.knnExtra || [])];
  if (!list[i]) return;
  list[i] = { ...list[i], ...p };
  patch({ knnExtra: list, knnArray: true });
}
function knnAddExtra() {
  const item: KnnSpec = { field: null, vector: [], params: { k: 10, num_candidates: 100 }, hasVector: true };
  patch({ knnExtra: [...(props.tree.knnExtra || []), item], knnArray: true });
  if (!open.value.has('knn')) toggle('knn');
}
function knnDelExtra(i: number) {
  const list = (props.tree.knnExtra || []).filter((_, j) => j !== i);
  patch({ knnExtra: list, knnArray: list.length > 0 });
  knnXIdx.value = null;
}
function knnFoldToObject() { patch({ knnExtra: [], knnArray: false }); }
/* 移除整个 knn 键：数组形态的额外项与形态记忆一并清掉——
   否则 serialize 会把 knnExtra 当作「数组剩下的项」重新写回 knn 键（删不掉的鬼键） */
function knnClear() { patch({ knn: null, knnExtra: [], knnArray: false }); }
function onKnnVecExtra(i: number, text: string) {
  try {
    const v = JSON.parse(text);
    if (typeof v !== 'object' || v === null) return;
    knnPatchExtra(i, { vector: v, hasVector: true });
  } catch { /* 半截 JSON 不写树 */ }
}

/* ═══ 989：suggest 项级编辑（名称/text/类型体 rest/全局 text） ═══ */
const sugIdx = ref<number | null>(null);
function sugAdd() {
  /* 默认 completion 形态（补全是最常用调试入口）：rest 给可用的 suggester 体而非空对象 */
  const base = props.tree.suggest || { items: [] as SuggestItem[], globalText: null, hasGlobalText: false };
  let i = base.items.length + 1;
  while (base.items.some(s => s.name === 'my-suggest_' + i)) i++;
  patch({
    suggest: {
      ...base,
      items: [...base.items, { name: 'my-suggest_' + i, text: '', hasText: true, rest: { completion: { field: props.fields[0] || '', prefix: '' } } }],
    },
  });
  if (!open.value.has('sug')) toggle('sug');
}
function sugPatch(i: number, p: Partial<SuggestItem>) {
  if (!props.tree.suggest) return;
  patch({ suggest: { ...props.tree.suggest, items: props.tree.suggest.items.map((s, j) => (j === i ? { ...s, ...p } : s)) } });
}
function onSugText(i: number, v: string) { sugPatch(i, { text: v, hasText: true }); }
function onSugRest(i: number, v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) sugPatch(i, { rest: v });
}
function sugDel(i: number) {
  if (!props.tree.suggest) return;
  patch({ suggest: { ...props.tree.suggest, items: props.tree.suggest.items.filter((_, j) => j !== i) } });
}
function sugPatchGlobal(v: string) {
  if (!props.tree.suggest) return;
  patch({ suggest: { ...props.tree.suggest, globalText: v, hasGlobalText: true } });
}
function sugGlobalText() {
  if (!props.tree.suggest) return;
  patch({ suggest: { ...props.tree.suggest, globalText: '', hasGlobalText: true } });
}

/* ═══ 991：rescore 编辑（window_size 数字容错 + 重打分查询树编辑 + query 权重递归表） ═══ */
const rcParams = ref(false);
function rcAdd() {
  const leaf: QueryNode = { id: nid(), type: 'leaf', op: 'match_phrase', field: props.fields[0] || '', value: '', params: {}, raw: null };
  patch({ rescore: { windowSize: 10, hasWindowSize: true, rescoreQuery: leaf, params: {} } });
  if (!open.value.has('rc')) toggle('rc');
}
function rcUpdate(n: QueryNode) { if (props.tree.rescore) patch({ rescore: { ...props.tree.rescore, rescoreQuery: n } }); }
/* window_size 编辑：数字写回、空串退役键、非数字中间态不写（knn 向量等值守卫同语言） */
function onRcWindow(raw: string) {
  if (!props.tree.rescore) return;
  const n = Number(raw);
  if (raw === '') patch({ rescore: { ...props.tree.rescore, windowSize: '', hasWindowSize: false } });
  else if (Number.isFinite(n)) patch({ rescore: { ...props.tree.rescore, windowSize: n, hasWindowSize: true } });
}
function onRcParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v) && props.tree.rescore) patch({ rescore: { ...props.tree.rescore, params: v } });
}
/* ═══ 998：多段重打分（rescore 数组形态）——rescore 恒为第一段，rescoreExtra 为第 2..n 段 ═══ */
const rcXIdx = ref<number | null>(null);
function rcPatchExtra(i: number, p: Partial<RescoreSpec>) {
  const list = [...(props.tree.rescoreExtra || [])];
  if (!list[i]) return;
  list[i] = { ...list[i], ...p };
  patch({ rescoreExtra: list, rescoreArray: true });
}
function rcAddExtra() {
  const leaf: QueryNode = { id: nid(), type: 'leaf', op: 'match_phrase', field: props.fields[0] || '', value: '', params: {}, raw: null };
  const seg: RescoreSpec = { windowSize: 50, hasWindowSize: true, rescoreQuery: leaf, params: {} };
  patch({ rescoreExtra: [...(props.tree.rescoreExtra || []), seg], rescoreArray: true });
}
function rcDelExtra(i: number) {
  const list = (props.tree.rescoreExtra || []).filter((_, j) => j !== i);
  patch({ rescoreExtra: list, rescoreArray: list.length > 0 });
  rcXIdx.value = null;
}
function rcFoldToObject() { patch({ rescoreExtra: [], rescoreArray: false }); }
/* 移除整个 rescore 键：同 knnClear，额外段与形态记忆一并清（防鬼键复活） */
function rcClear() { patch({ rescore: null, rescoreExtra: [], rescoreArray: false }); }
function rcUpdateExtra(i: number, n: QueryNode) { rcPatchExtra(i, { rescoreQuery: n }); }
function onRcWindowExtra(i: number, raw: string) {
  const cur = (props.tree.rescoreExtra || [])[i];
  if (!cur) return;
  const n = Number(raw);
  if (raw === '') rcPatchExtra(i, { windowSize: '', hasWindowSize: false });
  else if (Number.isFinite(n)) rcPatchExtra(i, { windowSize: n, hasWindowSize: true });
}

/* ═══ 996：script_fields / runtime_mappings 项级编辑（同构双键） ═══ */
const sfIdx = ref<number | null>(null);
const rmIdx = ref<number | null>(null);
/* 1069 续：当前树里缺 script 的运行时字段——排序/高亮/折叠/聚合等字段位共享同一提示 */
const runtimeFieldNames = computed<ReadonlySet<string>>(() => new Set(
  (props.tree.runtimeMappings?.items || []).map(it => it.name).filter(Boolean),
));
const runtimeNoScriptNames = computed<ReadonlySet<string>>(() => new Set(
  (props.tree.runtimeMappings?.items || [])
    .filter(it => runtimeScriptMissing(it.body))
    .map(it => it.name)
    .filter(Boolean),
));
/* collapse 要求单值 keyword/数值且有 doc_values（ES 文档口径）；运行时字段没有索引
   doc_values，ES 不支持据此折叠（elastic/elasticsearch#66459）——候选集剔除，已有 DSL 给提示。 */
const colFields = computed(() => props.fields.filter(f => !runtimeFieldNames.value.has(f)));
const collapseRuntime = computed(() => !!props.tree.collapse && runtimeFieldNames.value.has(props.tree.collapse.field));
/* highlight 同样不支持运行时字段（ES#65556）：候选剔除；已有 DSL 给提示 */
const hlFields = computed(() => props.fields.filter(f => !runtimeFieldNames.value.has(f)));
const highlightRuntime = computed(() =>
  !!props.tree.highlight && props.tree.highlight.fields.some(f => runtimeFieldNames.value.has(f.name)));
function editRuntimeByName(name: string) {
  autoOpen('rm');
  const items = props.tree.runtimeMappings?.items || [];
  const i = items.findIndex(x => x.name === name);
  if (i >= 0) rmIdx.value = i; // 直接展开该字段的 type/script 编辑
  nextTick(() => {
    const rows = document.querySelectorAll('.rx-named-row');
    rows[i >= 0 ? i : 0]?.scrollIntoView({ block: 'nearest' });
  });
}
provide(RUNTIME_FIELD_CTX, { noScript: runtimeNoScriptNames, edit: editRuntimeByName });
function namedAdd(cur: { items: NamedSpecItem[] } | null, name: string, body: Record<string, unknown>) {
  const items = cur ? [...cur.items] : [];
  let i = items.length + 1;
  while (items.some(x => x.name === name + i)) i++;
  return [...items, { name: name + i, body }];
}
function sfAdd() {
  patch({ scriptFields: { items: namedAdd(props.tree.scriptFields, 'script_field_', { script: { source: '' } }) } });
  if (!open.value.has('sf')) toggle('sf');
}
function sfPatch(i: number, name: string) {
  if (!props.tree.scriptFields) return;
  patch({ scriptFields: { items: props.tree.scriptFields.items.map((x, j) => (j === i ? { ...x, name } : x)) } });
}
function sfPatchBody(i: number, body: Record<string, unknown>) {
  if (!props.tree.scriptFields) return;
  patch({ scriptFields: { items: props.tree.scriptFields.items.map((x, j) => (j === i ? { ...x, body } : x)) } });
}
function sfDel(i: number) {
  if (!props.tree.scriptFields) return;
  patch({ scriptFields: { items: props.tree.scriptFields.items.filter((_, j) => j !== i) } });
}
function rmAdd() {
  patch({ runtimeMappings: { items: namedAdd(props.tree.runtimeMappings, 'runtime_field_', { type: 'keyword' }) } });
  if (!open.value.has('rm')) toggle('rm');
}
function rmPatch(i: number, name: string) {
  if (!props.tree.runtimeMappings) return;
  patch({ runtimeMappings: { items: props.tree.runtimeMappings.items.map((x, j) => (j === i ? { ...x, name } : x)) } });
}
function rmPatchBody(i: number, body: Record<string, unknown>) {
  if (!props.tree.runtimeMappings) return;
  patch({ runtimeMappings: { items: props.tree.runtimeMappings.items.map((x, j) => (j === i ? { ...x, body } : x)) } });
}
function rmDel(i: number) {
  if (!props.tree.runtimeMappings) return;
  patch({ runtimeMappings: { items: props.tree.runtimeMappings.items.filter((_, j) => j !== i) } });
}

/* 【预授权偏差A】GenericParams @update 联合类型收窄（Record|unknown[] → Record；数组形态忽略，params/extras 语义必须是对象）——内联箭头会 TS2322 */
function onSortParams(id: string, v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) patchSort(id, { params: v });
}
function onHlFieldParams(i: number, v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) hlPatchField(i, { params: v });
}
function onHlGlobalParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v) && props.tree.highlight) patch({ highlight: { ...props.tree.highlight, params: v } });
}
function onExtras(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) patch({ extras: v });
}
</script>

<style scoped>
/* v4 参数条样式：chips 横向一行 + 展开内容全宽 */
/* 1338：参数条**单行横向滚动**——此前 flex-wrap 让 14 个 chips 折成两行 96px，
 把结果表推到 y=812（视口 900 只剩 88px 可见，每次查完都要滚动）。
 单行后 .rx 39px，结果表可见 158px。窄档仍可横向滑动看到全部（不裁切、不藏项）；
 滚动条细化为 4px 以免自带一条粗横线；末端加渐隐提示「还有更多」。 */
.rx-chips { display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: nowrap;
  margin-bottom: var(--sp-2); justify-content: flex-start;
  overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; padding-bottom: var(--sp-0); }
.rx-chips::-webkit-scrollbar { height: 4px; }
.rx-chips::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 2px; }
.rx-chip { flex: 0 0 auto; }
.rx-chip { display: inline-flex; align-items: center; gap: var(--sp-1h); border: 1px solid var(--line-strong); border-radius: var(--r-m);
  background: transparent; color: var(--tx2); font-size: var(--fs-xs); padding: var(--sp-1) 9px; cursor: pointer;
  transition: border-color var(--tr), background var(--tr), color var(--tr); }
.rx-chip:hover { background: var(--bg2); color: var(--tx0); }
.rx-chip.on { border-color: color-mix(in srgb, var(--ac) 45%, var(--line)); background: var(--ac-soft); color: var(--tx0); }
.rx-cn { font-weight: 600; color: inherit; }
.rx-open { padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-s);
  background: var(--bg2); margin-bottom: var(--sp-2); }

.rx { margin-top: var(--sp-3); border-top: 1px solid var(--line); padding-top: var(--sp-3); }
/* 设置行设计：折叠头整行可点卡片化（32px 高/hover 反馈/状态 pill 右对齐），
 中文名为主、英文 key 降级为 mono badge，状态一眼可读——替代原先文字与按钮堆叠 */
.rx-sec { margin-bottom: var(--sp-2); }
.rx-sec-t { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); padding: 0 var(--sp-2); height: 32px; border-radius: var(--r-s); }
.rx-fold { cursor: pointer; user-select: none; transition: background var(--tr); }
.rx-fold:hover { background: var(--bg2); }
.rx-fold:hover .rx-fold-add { opacity: 1; }
.rx-name { color: var(--tx0); }
.rx-key { font-family: var(--mono, ui-monospace, monospace); font-size: var(--fs-2xs); color: var(--tx2); background: var(--bg3); border-radius: var(--r-xs); padding: 1px 5px; font-weight: 400; }
/* v3.1: 状态 pill 带 5px 圆点，on 品牌绿点亮 */
.rx-state { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; font-size: var(--fs-2xs); font-weight: 400; color: var(--tx2); background: var(--bg3); border-radius: 999px; padding: var(--sp-0) 9px; }
.rx-state::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--tx2); }
.rx-state.on { color: var(--ac-deep, var(--ac)); background: var(--ac-soft); font-weight: 600; }
.rx-state.on::before { background: var(--brand); }
.rx-chev { transition: transform var(--tr); color: var(--tx2); }
.rx-chev.on { transform: rotate(90deg); }
.rx-fold-add { opacity: 0; transition: opacity var(--tr); }
.rx-row { display: flex; align-items: center; gap: var(--sp-2); margin: var(--sp-1) 0; flex-wrap: wrap; }
/* 1069 续：运行时字段用于 collapse 的诚实提示（ES 需要 doc_values） */
.rx-rt-warn { flex-basis: 100%; font-size: var(--fs-2xs); color: var(--warn); }
.rx-lb { font-size: var(--fs-xs); color: var(--tx2); }
.rx-num { width: 80px; height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); }
.rx-num.warn { border-color: var(--warn); }
.rx-none { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1) 0; display: flex; align-items: center; gap: var(--sp-2); }
.rx-sort-row, .rx-hl-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin: var(--sp-1) 0; }
/* 遮挡修复：FieldSelect 在 flex 行内默认只吃内容宽（~170px），排序/高亮行 5 个控件挤一行时
 字段名显示不下——伸展占满剩余空间；按钮与下拉钉死不收缩，窄行整体折行而非互挤 */
.rx-sort-row .fs, .rx-hl-row .fs { flex: 1 1 140px; min-width: 0; }
.rx-sort-row .btn, .rx-hl-row .btn, .rx-sort-row .rx-sort-order { flex: none; }
.rx-sort-order { height: 28px; font-size: var(--fs-sm); width: 76px; }
.rx-src-mode { height: 28px; font-size: var(--fs-sm); }
.rx-sub { flex-basis: 100%; padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
.rx-ex { padding-top: var(--sp-0); }
/* knn 向量 JSON 输入框：mono 长串横向吃满行（dim 向量百千位） */
.rx-knn-vec { flex: 1 1 200px; min-width: 0; font-size: var(--fs-xs); }
.rx-knn-vec.warn { border-color: var(--warn); }
/* suggest 项行：名称/文本双输入吃满剩余空间，按钮钉死不收缩 */
.rx-sug-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin: var(--sp-1) 0; }
.rx-sug-row .btn { flex: none; }
.rx-sug-name { width: 130px; height: 28px; font-size: var(--fs-sm); flex: none; }
.rx-sug-text { flex: 1 1 160px; min-width: 0; height: 28px; font-size: var(--fs-sm); }
/* 996 命名项行（script_fields/runtime_mappings 同款）：名称输入钉宽、按钮不收缩 */
.rx-named-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin: var(--sp-1) 0; }
.rx-named-row .btn { flex: none; }

/* ═══ 998：查询参数分区 ═══
   每行 = 参数名（中文主 + mono 键）+ 控件 + 移除；说明文字独占一行小字弱化。
   控件宽度按类型分档：布尔/数字短、JSON 吃满剩余（游标数组可能很长）。 */
.rx-qp { display: flex; flex-direction: column; gap: var(--sp-1); }
.rx-qp-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; padding: var(--sp-1) 0; border-bottom: 1px dashed var(--line); }
.rx-qp-row:last-of-type { border-bottom: none; }
.rx-qp-head { display: inline-flex; align-items: center; gap: var(--sp-1h); flex: none; min-width: 132px; }
.rx-qp-key { font-family: var(--mono, ui-monospace, monospace); font-size: var(--fs-2xs); color: var(--tx2); background: var(--bg3); border-radius: var(--r-xs); padding: 1px 5px; }
.rx-qp-ctl { height: 28px; font-size: var(--fs-sm); flex: 1 1 160px; min-width: 0; }
select.rx-qp-ctl { flex: 0 0 92px; }
.rx-qp-json { font-size: var(--fs-xs); }
.rx-qp-json.bad { border-color: var(--err); box-shadow: 0 0 0 2px var(--err-soft); }
.rx-qp-hint { flex-basis: 100%; font-size: var(--fs-2xs); color: var(--tx2); line-height: 1.5; }
/* 添加参数菜单：每组独占一行、组内两列（18 键一眼扫完；组头横跨整行） */
.rx-qp-menu { display: grid; grid-template-columns: 1fr; gap: var(--sp-0); padding: var(--sp-2);
  border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg1); margin-top: var(--sp-1);
  max-height: 360px; overflow: auto; }
.rx-qp-grp { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--sp-3); }
.rx-qp-g { grid-column: 1 / -1; font-size: var(--fs-2xs); color: var(--tx2); letter-spacing: var(--ls-wide);
  padding: var(--sp-1) 0 var(--sp-0); border-bottom: 1px solid var(--line); margin-bottom: var(--sp-0); }
.rx-qp-mi { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); width: 100%;
  padding: 3px var(--sp-1); border: none; background: none; border-radius: var(--r-xs);
  font-size: var(--fs-sm); color: var(--tx0); cursor: pointer; text-align: left; }
.rx-qp-mi:hover:not(:disabled) { background: var(--ac-soft); }
.rx-qp-mi:disabled { opacity: .38; cursor: default; }
.rx-qp-mi code { font-size: var(--fs-2xs); color: var(--tx2); }

/* 998：多向量 / 多段重打分——额外项用左侧细引导线分组，与首项视觉分层 */
.rx-knn-x, .rx-rc-x { border-left: 2px solid var(--line); padding-left: var(--sp-2); margin: var(--sp-1) 0; }
.rx-knn-x:hover, .rx-rc-x:hover { border-left-color: var(--ac-line); }
/* 数组形态徽标：mono 小字提示「当前 DSL 是数组写法」 */
.rx-knn-tag { font-size: var(--fs-2xs); color: var(--ac); background: var(--ac-soft); border-radius: 999px; padding: 1px 7px; }
</style>
