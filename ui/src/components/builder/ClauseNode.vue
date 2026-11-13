<template>
  <div class="cn" :data-nid="node.id"
       :style="node.disabled ? { opacity: .45 } : undefined"
       tabindex="0" @contextmenu.prevent="openRowMenu" @keydown.self="onRowMenuKey">
    <NodeSelectBox :id="node.id" />
    <button v-if="node.disabled" aria-label="恢复参与匹配" class="btn xs ghost cn-pw on"
            title="该条件已临时停用，点击恢复参与匹配" @click="toggleDisabled(false)">
      <Circle :size="15" />
    </button>
    <button v-else aria-label="临时停用（不参与匹配）" class="btn xs ghost cn-pw"
            title="临时停用该条件（不删除、不参与本次匹配），点击可恢复" @click="toggleDisabled(true)">
      <CircleSlash :size="15" />
    </button>
    <!-- 拖拽源只在 grip 柄：根 draggable 会劫持行内值输入框的文本选择/光标拖划 -->
    <span class="cn-grip" title="拖拽排序（按住拖动）；Alt+↑/↓ 上移/下移" draggable="true" @dragstart.stop="onDragStart" @dragend="endDrag">⋮⋮</span>
    <!-- 字段槽：field/named 形态显示（fields 多字段/none 无字段形态无单字段可选） -->
    <template v-if="hasFieldSlot">
      <FieldSelect
        :model-value="node.field || ''" :fields="fields" :types="types" :type-priority="fieldTypePriority"
        :type-filter="fieldTypeFilter" :role-priority="fieldRolePriority"
        @update:model-value="onField" @picked="onFieldPicked"
      />
      <!-- 字段类型徽标 + 类型提示 tooltip（零结构改动的类型教育）：keyword→term 精确、
 text→match 全文、数值/date→range 范围；mapping 缺失（types 无此字段）不渲染，零降级 -->
      <!-- 类型徽标挂全站色卡 .mft-type（theme.css），删局部三类型撞色规则 -->
      <span v-if="fieldType" class="cn-fty mono mft-type" :data-t="fieldType" :title="typeHint">{{ fieldType }}</span>
      <!-- 1056：text 字段做词项级算子且 mapping 有同名 .keyword 子域 → 一键改打子域。
           text 的倒排是分词词项，term/terms/wildcard/prefix/regexp/fuzzy/terms_set
           拿整串原值大概率查空；入口只给建议，点击才改（不静默改用户 DSL）。 -->
      <button v-if="kwTwin" type="button" class="btn xs ghost cn-kwfix"
              :title="'text 字段的 ' + label(node.op) + ' 按分词词项匹配，整串原值通常查不到；改打 ' + kwTwin + ' 按整串匹配（值不变）'"
              @click="applyKwTwin">打 .keyword</button>
    </template>
    <!-- 算子下拉：推荐（opsForType）+ 常用（单字段形态非推荐）+ 高级分组（ADV_MENU 同源）。
         998：外观升级为「语义族胶囊」——按 opFamilyOf 着色（全文/精确/范围/空间/向量/跨度/脚本），
         原生 select 语义与 change 事件不变（键盘、输入法、无障碍全保留），只把壳做成芯片。 -->
    <select class="inp cn-op" :class="'opf-' + opFamily" :data-op="node.op" :title="'当前算子：' + label(node.op)"
            :value="node.op" @change="onOp(($event.target as HTMLSelectElement).value)">
      <optgroup v-for="g in opGroups" :key="g.label" :label="g.label">
        <option v-for="o in g.ops" :key="o" :value="o">{{ label(o) }}</option>
      </optgroup>
    </select>

    <!-- 1183：主值键缺席的行内说明——紧贴算子下拉、在值控件之前。
         `{percolate:{field,id}}`、`{knn:{field,query_vector_builder}}` 都是合法写法，
         但树里没有 document / query_vector：值位空白不是解析丢失。
         不说清楚，用户要么以为数据没读进来，要么往空位补一个与现有键冲突的主值
         （percolate 同时有 id 与 document，ES 直接拒）。
         位置必须在值控件上方：说明放在行尾会被长体（4 行 textarea）挤到树面板折叠线以下，
         用户看到空值框却看不到解释。 -->
    <div v-if="mainKeyAbsent" class="cn-mainabs-bar" role="status">
      <span class="cn-mainabs">
        该写法未使用 <code>{{ mainKeyName }}</code> 主值键——值位留空是原 DSL 使然
        <template v-if="presentParamKeys.length">（现有键：<code>{{ presentParamKeys.join(', ') }}</code>）</template>；
        在此输入会新增 <code>{{ mainKeyName }}</code> 键
      </span>
    </div>

    <!-- 值控件：按算子形态分派（985：多字段/对象值/数组值分支加入） -->
    <template v-if="node.op === 'exists' || node.op === 'match_all' || node.op === 'match_none'">
      <span class="cn-na">（无值）</span>
    </template>
    <template v-else-if="node.op === 'range'">
      <!-- 【W3b】四操作符齐备（ES range 合法键 gte/gt/lte/lt，与 dslLint RANGE_OPS 同口径）：
 开区间 > gt / < lt 此前打不出来，用户只能去手改 DSL。
 四 input 按字段类型挂 datalist 形态提示（date→date-math、数值→字面、
 ip→CIDR；datalist 只提示不约束输入，keyword 等无形态档字段不挂） -->
      <input class="inp cn-val cn-range mono" :value="rangePart('gte')" placeholder="≥ gte" :list="rangeDlId" @input="setRange('gte', ($event.target as HTMLInputElement).value)" />
      <input class="inp cn-val cn-range mono" :value="rangePart('lte')" placeholder="≤ lte" :list="rangeDlId" @input="setRange('lte', ($event.target as HTMLInputElement).value)" />
      <input class="inp cn-val cn-range mono" :value="rangePart('gt')" placeholder="> gt" :list="rangeDlId" @input="setRange('gt', ($event.target as HTMLInputElement).value)" />
      <input class="inp cn-val cn-range mono" :value="rangePart('lt')" placeholder="< lt" :list="rangeDlId" @input="setRange('lt', ($event.target as HTMLInputElement).value)" />
      <!-- range 形态档 datalist（rangeHints 按字段类型分派；空档不挂零增量） -->
      <datalist v-if="rangeHints.length" :id="rangeDlId">
        <option v-for="h in rangeHints" :key="h" :value="h" />
      </datalist>
      <!-- range 打在 keyword/wildcard 字段=字典序比较（dslLint keyword-range 规则的交互层等价物）：
 值输入旁黄点警示，title 完整说明 -->
      <span v-if="rangeLexWarn" class="cn-rwarn" role="img" aria-label="keyword 字段的 range 按字典序比较"
            title="keyword 字段的 range 按字典序比较（'100' < '20'）；数值/时间范围建议改用对应类型字段" />
      <!-- 1041：日期时间窗快选（公告/研报/舆情查询的最高频手势）——一击成窗 gte=相对锚 + lte=now -->
      <div v-if="isDateRange" class="cn-rchips" role="group" aria-label="时间窗快选">
        <button v-for="c in DATE_CHIPS" :key="c.label" type="button" class="cn-rchip"
                :title="'gte=' + c.gte + '，lte=now'" @click="applyChip(c)">{{ c.label }}</button>
      </div>
    </template>
    <!-- 【985】多字段形态：主值输入 + 字段列表输入（逗号分隔 ↔ string[]）。
         1018：more_like_this 的 like 为对象/数组混合形态时升专用编辑器
         （对象=JSON 文档区、数组=chips+选中项 JSON 区）——此前对象 like 直落
         String() 显示成 [object Object]；字符串 like 维持既有输入 -->
    <template v-else-if="nodeOpForm === 'fields' && node.op === 'more_like_this' && mltRich">
      <MltLikeEditor :value="node.value" @update="v => patch({ value: v })" />
      <input class="inp cn-val mono cn-fields" :value="fieldsText" placeholder="字段列表，逗号分隔"
             @input="onFields(($event.target as HTMLInputElement).value)" />
      <button aria-label="多选字段" class="btn sm ghost" title="多选字段（弹层勾选）" @click.stop="toggleMf($event)"><ListChecks :size="11" /></button>
    </template>
    <template v-else-if="nodeOpForm === 'fields'">
      <!-- 1039：长查询串主值多行编辑（query_string/simple_query_string/combined_fields——
           长布尔串单行挤排痛点；换行在查询串语法里=合法空白分隔） -->
      <textarea v-if="longQueryOp" class="inp cn-val mono cn-qry" rows="2" spellcheck="false"
                :value="valText" :placeholder="mainKeyPlaceholder"
                @input="onValue(($event.target as HTMLTextAreaElement).value)" />
      <input v-else class="inp cn-val mono" :value="valText"
             :placeholder="mainKeyPlaceholder"
             @input="onValue(($event.target as HTMLInputElement).value)" />
      <input class="inp cn-val mono cn-fields" :value="fieldsText" placeholder="字段列表，逗号分隔"
             @input="onFields(($event.target as HTMLInputElement).value)" />
      <button aria-label="多选字段" class="btn sm ghost" title="多选字段（弹层勾选）" @click.stop="toggleMf($event)"><ListChecks :size="11" /></button>
    </template>
    <!-- 1011：intervals 专用递归编辑位——规则可解析（唯一类型键+官方 6 类）即一等编辑：
         类型/主值/_name/参数 schema 表/all_of·any_of 递归子规则/位置过滤关系槽；
         不可解析（畸形/未知形态）落回下方通用对象值键值表零丢失 -->
    <div v-else-if="isIntervals" class="cn-objval">
      <IntervalsEditor :rule="intervalsParsed!" :fields="fields" :types="types" @update="onIntervalsUpdate" />
    </div>
    <!-- 1012：geo_distance / geo_bounding_box 专用坐标编辑位——值形态可解析（{lat,lon}
         对象 / bbox corners·edges）即 distance+经纬度（或四角/四边）数值输入；
         串/geohash/数组坐标等合法 ES 形态保真优先，落回通用键值表 -->
    <div v-else-if="geoEditable" class="cn-objval">
      <GeoValueEditor :op="node.op" :value="node.value" :params="node.params" @patch="onGeoPatch" />
    </div>
    <!-- 1017：percolate document 一等 JSON 文档编辑位——draft/bad/同步三件套
         （RootExtrasPane json 控件同语言）：非法 JSON 或非对象标红不写树（半截输入容忍），
         树外变更经 stringify 同比较守卫回流文本（不打断输入）。field 在行头 FieldSelect，
         name/preference 等参数走既有「更多参数」 -->
    <div v-else-if="node.op === 'percolate'" class="cn-objval">
      <textarea
        class="inp mono cn-perc" :class="{ bad: perc.bad.value }" :value="perc.text.value" rows="4" spellcheck="false"
        placeholder="document 文档体（JSON 对象）——反查：哪些已存查询会命中这份文档"
        title="要反查的文档体；合法 JSON 对象即写回查询（非法半截态标红不写）"
        @input="perc.onInput(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </div>
    <!-- 1019：terms lookup 远程词项形态（值对象键 ⊆ {index,id,path}）→ 三具名输入：
         「从 index 索引的 id 文档取 path 字段值集合当词项」的语义提示带上，
         空串删键（半成品）、未知键/非字符串值退化通用键值表保真 -->
    <!-- 1045：向量值编辑位——knn query_vector 是数组、sparse_vector 是对象；
         旧实现落标量输入 String(array)='0.1,0.2'，回写后类型错误。JSON 草稿三件套
         与 percolate/MLT 同语言：半截/类型不符只标红不写树。 -->
    <div v-else-if="isJsonVec" class="cn-objval">
      <textarea class="inp mono cn-perc" :class="{ bad: vec.bad.value }" :value="vec.text.value" rows="3" spellcheck="false"
        :placeholder="node.op === 'knn' ? 'query_vector JSON 数组，如 [0.1, 0.2, …]' : 'query_vector JSON 对象（词 → 权重）'"
        :title="node.op === 'knn' ? '向量数组（JSON）' : '稀疏向量对象（JSON）'"
        @input="vec.onInput(($event.target as HTMLTextAreaElement).value)"></textarea>
    </div>
    <div v-else-if="termsLookup" class="cn-objval cn-tl">
      <span class="cn-tl-tip" title="远程词项：ES 在查询时从目标文档的 path 字段取值集合作为本条件词项（集群内取数，不回传文档）">
        远程词项 —— 从
        <input class="inp mono cn-tl-in" :value="tlText('index')" placeholder="索引名 index" title="目标索引（要取词项的文档所在索引）" @input="onTl('index', ($event.target as HTMLInputElement).value)" />
        索引的文档
        <input class="inp mono cn-tl-in" :value="tlText('id')" placeholder="文档 _id" title="目标文档 _id" @input="onTl('id', ($event.target as HTMLInputElement).value)" />
        取
        <input class="inp mono cn-tl-in" :value="tlText('path')" placeholder="字段路径 path" title="词项来源字段路径（多值字段取全部值）" @input="onTl('path', ($event.target as HTMLInputElement).value)" />
        字段的值集合
      </span>
    </div>
    <!-- 【985】对象值（geo 系/terms_set/script 等）：常用键快捷 chips +
     递归键值子表（零降级同款语言）——键名不用猜，点 chips 即得骨架再改值 -->
    <div v-else-if="isObjValue" class="cn-objval">
      <div v-if="objKeyHints.length" class="cn-objk" role="group" aria-label="常用键快捷添加">
        <button v-for="k in objKeyHints" :key="k" class="cn-objk-btn" type="button"
                :disabled="k in objVal" :title="'添加常用键 ' + k" @click="addObjKey(k)">+ {{ k }}</button>
      </div>
      <GenericParams :value="objVal" @update="onObjValue" />
    </div>
    <!-- 【W3b】boolean 字段 + term：三态 select（true/false/空）替代裸文本输入——
 true/false 直接可选不再手打，选「（空）」= 删除该条件（无值的 term 无语义） -->
    <select
      v-else-if="isBoolTerm" class="inp cn-val cn-bool mono"
      :value="boolText" title="boolean 字段 term 值三态：true / false；选「（空）」删除该条件"
      @change="onBoolVal(($event.target as HTMLSelectElement).value)"
    >
      <option value="">（空）</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
    <!-- 1005：数组值算子（terms/ids）chip 视觉化——值即标签可删可加，逗号分隔文本退役；
         值候选 datalist（terms-agg top20+历史值双源）与 IME 守卫原样保留；
         非数组形态（如 terms-lookup 对象）不走此分支=保留原输入路径 -->
    <div v-else-if="isArrayVal" class="cn-chips" role="group"
         :aria-label="(OPS_META[props.node.op]?.label || props.node.op) + ' 值列表：回车或逗号添加，空输入退格删末项'">
      <span v-for="(v, i) in arrVals" :key="i" class="cn-chip mono" :title="String(v)">
        <span class="cn-chip-v">{{ v }}</span>
        <button type="button" class="cn-chip-x" :aria-label="'删除值 ' + v" :title="'删除值 ' + v"
                @click="delChip(i)"><X :size="10" /></button>
      </span>
      <input
        class="inp cn-val mono cn-chip-in" v-model="chipDraft"
        :placeholder="arrVals.length ? '' : valPlaceholder"
        :list="valCandidates.length ? valDlId : undefined"
        @focus="primeValAgg"
        @keydown.enter.prevent="onChipEnter($event)"
        @keydown="onChipKey"
        @paste="onChipPaste"
        @blur="commitChip()"
      />
    </div>
    <!-- 1039：长查询串主值多行编辑（named 形态 query_string/simple_query_string——
         长布尔串单行挤排痛点；换行=查询串语法合法空白分隔） -->
    <textarea
      v-else-if="longQueryOp" class="inp cn-val mono cn-qry" rows="2" spellcheck="false"
      :value="valText"
      :placeholder="valPlaceholder"
      @input="onValue(($event.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else class="inp cn-val mono" :value="valText"
      :placeholder="valPlaceholder"
      :list="valCandidates.length ? valDlId : undefined"
      @focus="primeValAgg"
      @input="onValue(($event.target as HTMLInputElement).value)"
      @paste="onValuePaste"
    />
    <!-- （P1-3a）：term/terms/prefix 值输入候选 datalist——
 起候选双源合并：terms-agg top20（useTermsSuggest，值位聚焦 prime，模块级 TTL
 缓存与 FieldSelect 选中预载共享）+ 跨模式查询历史既有条目里该字段的历史出现值
 （内存态零新增请求依赖），去重后喂同一 datalist。
 护栏：本组件存在无 pinia 的裸挂载环境（clauseNode.spec 单测），getActivePinia 判空
 零降级（qhStore/termCtx 双闸）；候选空（mapping 未载/无历史/无索引语境）静默不挂
 datalist，手输行为零变化 -->
    <datalist v-if="valCandidates.length" :id="valDlId">
      <option v-for="v in valCandidates" :key="v" :value="v" />
    </datalist>
    <!-- 算子×类型错配 / 开头通配符黄点（与 range 字典序黄点同形态，
 title 承载完整说明，友好不阻断）。
 span 升级 button——黄点可点，一键切到该类型推荐首算子（exists 是万能
 兜底不作为「推荐」目标；未知类型 opsForType 只有 exists，点击不动作）。 -->
    <button v-if="rowWarn" type="button" class="cn-owarn" aria-label="改用推荐算子" :title="rowWarn" @click="onOwarnClick" />
    <!-- 998：行尾动作收成一组（margin-left:auto 右对齐）——空间不足时整组换行落到下一行右侧，
         不再出现「按钮散落在行首」的断裂感；组内按钮统一 22px 方形，视觉重量低于主控件 -->
    <span class="cn-acts">
      <!-- ⏰ 常驻——此前按字段名正则门控，「不像时间字段」的按钮直接消失，
 placeholder 却承诺「⏰ 转换」，用户找不到入口。常驻后任何字段都可点：
 值能解析成标准时间才转换，解析失败保持原值（title 说明适用面）。 -->
      <!-- ⏰ 低频（1215）：静息隐藏、行悬停/聚焦才浮现——右键盘里已有「复制为 DSL 片段」等全部同类动作，
           常驻 6 个灰图标会把字段/值输入挤到一行不到一半（1440 实测动作簇占行宽 31%、整行折成 76px）。 -->
      <button aria-label="标准时间转时间戳" class="btn sm ghost cn-act cn-act-lo" title="⏰ 把标准时间（YYYY-MM-DD HH:mm[:ss]）转成 epoch 毫秒；值不是标准时间格式时点击不变"
              @click="convertStdTime">
        <Clock :size="12" />
      </button>

      <!-- 具名参数（schema 内）+ 更多参数入口 -->
      <button aria-label="参数（boost/operator…）" v-if="hasParams" class="btn sm ghost cn-act cn-act-lo" title="参数（boost/operator…）" @click="paramsOpen = !paramsOpen">
        <Settings2 :size="12" />
      </button>
      <button aria-label="复制条件" class="btn sm ghost cn-act" title="复制条件（插到本条件之后）" @click="$emit('duplicate', node.id)"><Copy :size="12" /></button>
      <!-- 1036：复制子树入跨查询剪贴（含嵌套，任意条件组可粘贴） -->
      <button aria-label="复制子树（跨查询粘贴用）" class="btn sm ghost cn-act cn-act-lo" title="复制子树（含嵌套，可粘贴到任意条件组）" @click="onCopySubtree"><ClipboardCopy :size="12" /></button>
      <button aria-label="包成 bool 组" class="btn sm ghost cn-act cn-act-lo" title="包成 bool 组" @click="$emit('wrap')"><Group :size="12" /></button>
      <button aria-label="删除" class="btn sm ghost cn-act danger" title="删除" @click="$emit('remove')"><X :size="12" /></button>
    </span>
    <div v-if="fieldUnknown" class="cn-defrt-bar">
      <span class="cn-defrt-hint">字段不在 mapping：</span>
      <!-- 1322：先给「你是不是想找」，再给「造新字段」。顺序有意为之——
           拼错一个字母的人，最该做的是改回已有字段，而不是新建一个空壳字段。 -->
      <button v-if="fieldSuggestion" type="button" class="btn xs cn-suggest"
        :title="`把字段改为最接近的已有字段「${fieldSuggestion}」`" @click="useSuggestion">
        是不是想找 <code class="mono">{{ fieldSuggestion }}</code>？
      </button>
      <button type="button" class="btn xs ghost cn-defrt" :title="runtimeTitle" @click="defineRuntimeField">＋创建 {{ runtimeGuess }} 运行时字段</button>
    </div>
    <div v-else-if="runtimeNoScript" class="cn-defrt-bar" role="status">
      <span class="cn-defrt-hint">运行时字段「{{ node.field }}」尚无 script：查询期不会产出值</span>
      <button type="button" class="btn xs ghost cn-defrt" title="到「检索参数 → 运行时字段」补 script" @click="editRuntimeScript">补 script</button>
    </div>
    <div v-if="paramsOpen" class="cn-params">
      <GenericParams :value="node.params" :schema="paramSchema" @update="onParams" />
    </div>
    <!-- 换字段算子被静默替换时的行内微提示（2.5s 后淡出）——aria-live 播报，不弹全局 toast -->
    <!-- 1042：fields 形态多选字段弹层（两分支触发钮共用一实例；定位锚触发钮下方右缘钳制） -->
    <MultiFieldPicker v-if="mfOpen" :model-value="Array.isArray(node.fields) ? node.fields : []"
                      :fields="fields" :types="types" :style="mfStyle"
                      @update:model-value="v => onFields((v || []).join(','))"
                      @close="mfOpen = false" />
    <span v-if="nudge" class="cn-nudge" :class="{ out: nudgeOut }" role="status" aria-live="polite">{{ nudge }}</span>
    <!-- 1147：条件行右键——行尾 7 个 22px 图标钮在窄栏里仍要点准；右键把同一批动作
     （停用/复制条件/复制子树/包成 bool/删除）按「作用在这一条」的心智一次列全，
     并补两条原本没有入口的读操作：复制条件为 JSON、复制为 DSL 片段。
     全部走既有 emit / 既有工具函数，不新增写路径。 -->
    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowTitle"
      :items="rowMenuItems" @close="rowMenu = null" />
  </div>
</template>

<script setup lang="ts">
/* W1：富表单条件行。不可变更新：所有变更 emit 新 LeafNode，由父级替换——
 同步引擎依赖引用变化触发序列化。 */
import { ref, computed, inject, onBeforeUnmount, watch } from 'vue';
import { Clock, X, Settings2, Group, Circle, CircleSlash, Copy, ClipboardCopy, ListChecks, Braces, Code2 } from 'lucide-vue-next';
import MultiFieldPicker from './MultiFieldPicker.vue';
import { copySubtreeToStash } from '../../utils/queryStash';
import { serQueryNode } from '../../utils/queryAst';
import FieldSelect from './FieldSelect.vue';
import NodeSelectBox from './NodeSelectBox.vue';
import CellContextMenu, { type CcmItem } from '../CellContextMenu.vue'; /* 1147：条件行右键 */
import { copyText } from '../../utils/format';
import GenericParams from './GenericParams.vue';
import IntervalsEditor from './IntervalsEditor.vue';
import GeoValueEditor from './GeoValueEditor.vue';
import { parseIntervalRule, serIntervalRule, type IntervalRule } from '../../utils/intervalsRule';
import { geoPointView, bboxView } from '../../utils/geoForm';
import { useJsonDraft } from '../../composables/useJsonDraft';
import MltLikeEditor from './MltLikeEditor.vue';
import { stdTimeToEpochMs } from '../../utils/format';
import { DRAG_KEY, TREE_BUS, fireDrag } from './treeBus';
import { OPS_META, opsForType, RICH_OPS, ADV_MENU, typePriorityForOp, typeFilterForOp, NUMERIC_VALUE_TYPES, NUMERIC_FIELD_TYPES, opFamilyOf, NAME_PARAM, paramsForOp } from '../../utils/queryAstOps';
import { rolePriorityForOp, defaultOpForField } from '../../utils/fieldRole';
/* 1322：未知字段的「你是不是想找」候选——与 LuceneInput/dslLint 共用同一编辑距离实现 */
import { editDistance } from '../../utils/editDistance';
import { guessRuntimeType, runtimeScriptMissing, type RuntimeFieldType } from '../../utils/runtimeFields';
import type { LeafNode } from '../../utils/queryAst';

const props = defineProps<{ node: LeafNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{
  (e: 'update:node', n: LeafNode): void;
  (e: 'remove'): void;
  (e: 'wrap'): void;
  (e: 'duplicate', id: string): void;
}>();
/* 参与开关走 TREE_BUS 直达树 owner（QueryTreePane 统一 updateNodeById）——
 首版 emit('toggle-disabled') 无任何层监听，事件发出去即丢，开关点了没反应 */
const bus = inject(TREE_BUS, null);
const toggleDisabled = (v: boolean) => bus?.toggleDisabled(props.node.id, v);

const paramsOpen = ref(false);
const label = (op: string) => OPS_META[op]?.label || op;
/* 985：算子下拉分组——推荐（opsForType）+ 常用（单字段形态非推荐非高级）+ ADV_MENU
 高级分组（全文/精确/地理/脚本/复合，与「+ 高级」菜单同源同序）；去重后全部富算子可达 */
const nodeOpForm = computed(() => OPS_META[props.node.op]?.form);
/* 998：算子语义族——胶囊配色用（族定义在 queryAstOps，纯语义可复用） */
const opFamily = computed(() => opFamilyOf(props.node.op));
const hasFieldSlot = computed(() => nodeOpForm.value === 'field' || nodeOpForm.value === 'named');
const opGroups = computed(() => {
  const rec = opsForType(props.types[props.node.field || '']);
  const seen = new Set(rec);
  const groups: Array<{ label: string; ops: string[] }> = [{ label: '推荐', ops: rec }];
  const advSet = new Set(ADV_MENU.flatMap(g => g.ops));
  const common = RICH_OPS.filter(o => !advSet.has(o) && OPS_META[o].form === 'field' && !seen.has(o));
  if (common.length) { groups.push({ label: '常用', ops: common }); common.forEach(o => seen.add(o)); }
  for (const g of ADV_MENU) {
    /* 985：容器节点（wrap / multi）**不进叶子下拉**——叶子行只有一个 field+value 槽，
       换成 nested 会写出 {term:{nested:…}} 这种非法体；容器只能从「+ 高级」插入，
       那条路径走 makeNodeByOp 会造出正确的 wrap/multi 节点。因此这里仍只认 OPS_META，
       ADV_MENU 里新增的容器组只服务于 BoolGroupNode 的「+ 高级」菜单。 */
    const ops = g.ops.filter(o => OPS_META[o] && !seen.has(o));
    if (ops.length) { groups.push({ label: g.group, ops }); ops.forEach(o => seen.add(o)); }
  }
  return groups;
});
/* 1033：参数 schema 恒追加 _name 命名查询（命中归因 matched_queries）——配 schema
   键提示可发现性；ops 未在册键不被排挤（append 尾位） */
const paramSchema = computed(() => {
  const base = OPS_META[props.node.op]?.params || [];
  return base.some(p => p.key === '_name') ? base : [...base, NAME_PARAM];
});
const hasParams = computed(() => paramSchema.value.length > 0 || Object.keys(props.node.params).length > 0);

/* ═══ 字段类型匹配：徽标 tooltip + 值输入 placeholder 按类型给形态提示 ═══
 操作符侧的类型匹配已由 onField/opsForType 承担（换字段自动回落该类型首算子）；
 这里补输入侧教育：选定字段后输入什么形态的值、该用哪类算子。mapping 缺失全回落现状文案。 */
const NUMERIC_TYPES = NUMERIC_FIELD_TYPES;
/* 字段候选按算子场景类型置顶（typePriority 只调候选分组排序，不改候选集；
 fields 传参与 dsl-assist 计数链路不动——fieldPickerPenetration 契约）。
 优先序下沉为 queryAstOps.typePriorityForOp（DSL/非 Vue 语境可复用），
 本组件删私藏表直接消费——term/terms/prefix/wildcard 精确语义 keyword 优先、
 range 数值/时间语义 date+数值族优先、其余空数组纯 rank 平铺。 */
const fieldTypePriority = computed<string[]>(() => typePriorityForOp(props.node.op));
/* 998：高特异算子（geo/向量/特征/形状/间隔）字段候选按 mapping 类型收窄——
   选 geo_distance 时只列 geo_point，不再让用户在几千字段里翻。
   非高特异算子返回 undefined（不过滤，保留自由手输与跨类型语义） */
const fieldTypeFilter = computed<string[] | undefined>(() => typeFilterForOp(props.node.op));
/* 1045：业务角色优先序（同类型组内先出「本算子最相关」的字段） */
const fieldRolePriority = computed(() => rolePriorityForOp(props.node.op));
const fieldType = computed(() => props.types[props.node.field || ''] || '');
/* 1069 续：手输字段不在 mapping 时给「建运行时字段」入口——把发现→定义→使用闭环在条件行内完成。
   带 . （.keyword 子域）/ ${变量} 的名称不提供（不是可定义的运行时字段名）。 */
const fieldUnknown = computed(() => {
  const f = props.node.field || '';
  return !!f && props.fields.length > 0 && !props.fields.includes(f) && !f.includes('.') && !f.includes('$');
});
const runtimeGuess = computed<RuntimeFieldType>(() => guessRuntimeType(props.node.field || '', props.node.op, props.node.value));
/* 1322：手输字段不在 mapping 时，先回答「你是不是想找 xxx」。
   此前这一行只有「创建运行时字段」一条出路——拼错一个字母的人会被引导去**
   造一个新字段**，而真正该做的是改回已有字段。口径与 LuceneInput / dslLint 的
   unknown-field 完全一致：编辑距离 ≤2 才算笔误候选（>2 大概率是全新字段，提示反而误导）。 */
const fieldSuggestion = computed(() => {
  if (!fieldUnknown.value) return '';
  const f = props.node.field || '';
  let best = '', bestD = Infinity;
  for (const cand of props.fields) {
    const d = editDistance(f.toLowerCase(), cand.toLowerCase());
    if (d < bestD) { bestD = d; best = cand; }
  }
  return bestD <= 2 ? best : '';
});
function useSuggestion() {
  if (fieldSuggestion.value) onFieldPicked(fieldSuggestion.value);
}
const runtimeTitle = computed(() =>
  `字段「${props.node.field}」不在 mapping：创建类型 ${runtimeGuess.value} 的运行时字段（script 到「检索参数 → 运行时字段」里补，补完即可查询）`);
function defineRuntimeField() {
  if (!fieldUnknown.value || !bus) return;
  bus.defineRuntime(props.node.field || '', runtimeGuess.value);
}
/* 1069 续：字段是运行时字段但只有 type（占位）——查询期不产出值，行内诚实提示并给补 script 入口。
   读 bus.runtimeItems（computed ref）→ 补上 script 后提示自动消失。 */
const runtimeField = computed(() => {
  const f = props.node.field;
  if (!f) return null;
  return (bus?.runtimeItems?.value || []).find(x => x.name === f) || null;
});
const runtimeNoScript = computed(() => !!runtimeField.value && runtimeScriptMissing(runtimeField.value.body));
function editRuntimeScript() {
  const f = props.node.field;
  if (f) bus?.editRuntime?.(f);
}
/* 1056：text 字段 + 词项级算子 + mapping 有同名 .keyword 子域 → 一键改打子域。
   分词字段上拿整串原值做精确匹配大概率查空；只给入口，不静默改字段/算子。 */
/* 1193：补 prefix / regexp / fuzzy / terms_set。它们和 term/terms/wildcard 一样
   作用在**分词后的词项**上——text 字段里拿整串原值/整串前缀去配，大概率零命中，
   而这几个算子恰恰被 opsForType('text') 推荐给用户（自己推荐、自己不给补救入口，
   正是「查不到也不知道为什么」的来源）。match_phrase_prefix 不收：它本就是
   全文算子（按词项序列匹配），改打 .keyword 反而改变语义。 */
const KW_EXACT_OPS = new Set(['term', 'terms', 'wildcard', 'prefix', 'regexp', 'fuzzy', 'terms_set']);
const kwTwin = computed(() => {
  const f = props.node.field;
  if (!f || f.endsWith('.keyword') || !KW_EXACT_OPS.has(props.node.op)) return '';
  if (props.types[f] !== 'text') return '';
  const twin = f + '.keyword';
  return props.types[twin] === 'keyword' ? twin : '';
});
function applyKwTwin() { if (kwTwin.value) onField(kwTwin.value); }
const TYPE_HINTS: Record<string, string> = {
  keyword: 'keyword 字段：建议 term/terms 精确匹配（整串一致，不分词）；match 在 keyword 上等同 term',
  text: 'text 字段：建议 match 全文检索（分词匹配）',
  date: 'date 字段：建议 range 范围；值可用右侧 ⏰ 把标准时间转 epoch 毫秒',
  boolean: 'boolean 字段：值取 true / false，用 term 精确匹配',
  ip: 'ip 字段：term 精确匹配或 range 网段范围',
  /* 补 wildcard 类型词条（此前该类型回落「wildcard 字段」裸文案） */
  wildcard: 'wildcard 字段：建议 term 精确或 wildcard 通配（* ? 匹配；开头通配会全表扫描）',
};
const typeHint = computed(() => {
  const t = fieldType.value;
  if (!t) return '';
  if (TYPE_HINTS[t]) return TYPE_HINTS[t];
  if (NUMERIC_TYPES.includes(t)) return `数值字段（${t}）：建议 term/terms 精确或 range 范围比较`;
  return `${t} 字段`;
});
const valPlaceholder = computed(() => {
  /* 1118：主值语义不是「字段值」的具名算子——类型档文案（日期/关键词…）会误导；
     rank_feature 的 boost 可留空，distance_feature 的 pivot 是距离，bitmap_terms 是位图值。 */
  if (props.node.op === 'rank_feature') return 'boost（可选，默认 1）';
  if (props.node.op === 'distance_feature') return 'pivot（如 7d / 1km）';
  if (props.node.op === 'bitmap_terms') return '位图值（Base64 或数字）';
  if (props.node.op === 'terms' || props.node.op === 'terms_set') return '输入值后回车或逗号添加';
  const t = fieldType.value;
  if (t === 'date') return '日期或 epoch 毫秒（⏰ 可转换）';
  if (NUMERIC_TYPES.includes(t)) return '数值，如 ≥ 100';
  if (t === 'boolean') return 'true / false';
  /* 【W3b】补 ip 分支（TYPE_HINTS 已有 ip 词条，值位此前漏配回落通用文案） */
  if (t === 'ip') return 'IP 或 CIDR 网段（如 192.168.0.0/16）';
  if (t === 'keyword') return '精确值（整串一致）';
  if (t === 'text') return '关键词（分词匹配）';
  return '值（时间字段可用 ⏰ 转换）';   // 未知类型/无 mapping：现状文案零降级
});

/* 【W3b】boolean 字段 + term：三态值控件（true/false/空）。空=删键——无值的 term 无查询语义，
 选「（空）」直接删除该条件（走既有 remove 链，父级 removeNodeById 处理） */
const isBoolTerm = computed(() => props.node.op === 'term' && fieldType.value === 'boolean');
const boolText = computed(() =>
  props.node.value === true ? 'true' : props.node.value === false ? 'false' : '');
function onBoolVal(v: string) {
  if (v === '') { emit('remove'); return; }
  patch({ value: v === 'true' });
}

function patch(p: Partial<LeafNode>) { emit('update:node', { ...props.node, ...p }); }
/* params 恒为对象：GenericParams 的 update 联合类型在此收窄（数组分支不会出现，守卫兜底） */
function onParams(v: Record<string, unknown> | unknown[]) { if (!Array.isArray(v)) patch({ params: v }); }

/* 换字段时算子不兼容会被静默换成 allowed[0]——此时行内闪现微提示告知用户换了什么
 （dslLint 静默换算子坑的交互层补救）。2.5s 后开始淡出（opacity 过渡），3.0s 后移除 DOM；
 happy-dom 无 transitionend，用双 timer 而非 Vue Transition，测试可走 fake timers。 */
const nudge = ref('');
const nudgeOut = ref(false);
let nudgeT1: ReturnType<typeof setTimeout> | undefined;
let nudgeT2: ReturnType<typeof setTimeout> | undefined;
function showNudge(msg: string) {
  nudge.value = msg; nudgeOut.value = false;
  clearTimeout(nudgeT1); clearTimeout(nudgeT2);
  nudgeT1 = setTimeout(() => { nudgeOut.value = true; }, 2500);
  nudgeT2 = setTimeout(() => { nudge.value = ''; }, 3000);
}
/* 1036：复制子树入跨查询剪贴（sessionStorage 暂存，刷新后仍在） */
function onCopySubtree() {
  copySubtreeToStash(props.node);
  showNudge('已复制子树——任意条件组可粘贴');
}
/* ═══ 1147：条件行右键 ═══
 行尾图标钮保留；右键是同一批动作的「一次看全」入口，另补两条只读导出：
 条件 JSON（结构排查/贴 issue）与 DSL 片段（直接贴进 Dev Tools 试跑）。
 写动作一律复用既有 emit / bus，不新增通道。 */
const rowMenu = ref<{ x: number; y: number } | null>(null);
const rowTitle = computed(() => {
  const n = props.node;
  const who = n.field || (Array.isArray(n.fields) ? n.fields.join(', ') : '') || '（无字段）';
  return '条件 · ' + label(n.op) + ' · ' + who;
});
function openRowMenu(e: MouseEvent) {
  /* 值输入框/下拉里的右键留给浏览器（复制粘贴文本），只有非输入区才开菜单 */
  const t = e.target as HTMLElement | null;
  if (t?.closest('input, textarea, select, .monaco-editor')) return;
  rowMenu.value = { x: e.clientX, y: e.clientY };
}
function onRowMenuKey(e: KeyboardEvent) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = menuKeyAnchor(e);
}
async function copyJson() {
  const ok = await copyText(JSON.stringify(props.node, null, 2));
  showNudge(ok ? '已复制条件 JSON' : '复制失败');
}
async function copyDsl() {
  const ok = await copyText(JSON.stringify(serQueryNode(props.node), null, 2));
  showNudge(ok ? '已复制为 DSL 片段（可直接贴到 Dev Tools）' : '复制失败');
}
const rowMenuItems = computed<CcmItem[]>(() => [
  { key: 'toggle', label: props.node.disabled ? '恢复参与匹配' : '临时停用（本次不匹配）', icon: props.node.disabled ? Circle : CircleSlash,
    run: () => toggleDisabled(!props.node.disabled) },
  ...(hasParams.value ? [{ key: 'params', label: '参数（boost / operator…）', icon: Settings2, run: () => { paramsOpen.value = !paramsOpen.value; } }] : []),
  {
    key: 'copy-group', label: '复制…', icon: Copy, sep: true, children: [
      { key: 'copy-json', label: '复制条件 JSON', icon: Braces, run: () => void copyJson() },
      { key: 'copy-dsl', label: '复制为 DSL 片段', icon: Code2, run: () => void copyDsl() },
      { key: 'copy-subtree', label: '复制子树（跨查询粘贴）', icon: ClipboardCopy, run: onCopySubtree },
    ],
  },
  {
    key: 'shape-group', label: '结构…', icon: Group, children: [
      { key: 'dup', label: '复制条件（插到下方）', icon: Copy, run: () => emit('duplicate', props.node.id) },
      { key: 'wrap', label: '包成 bool 组', icon: Group, run: () => emit('wrap') },
    ],
  },
  { key: 'del', label: '删除此条件', icon: X, danger: true, sep: true, run: () => emit('remove') },
]);
/* 1039：长查询串主值多行编辑算子集（换行在查询串语法里=合法空白分隔；
   multi_match/query 短串语义维持单行输入） */
const LONG_QUERY_OPS = new Set(['query_string', 'simple_query_string', 'combined_fields']);
const longQueryOp = computed(() => LONG_QUERY_OPS.has(props.node.op));
/* 1042：fields 形态多选字段弹层（两分支触发钮共用一实例；定位同 toggleAdv 右缘钳制） */
const mfOpen = ref(false);
const mfStyle = ref<Record<string, string>>({});
function toggleMf(e: MouseEvent) {
  mfOpen.value = !mfOpen.value;
  if (!mfOpen.value) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  mfStyle.value = { top: rect.bottom + 4 + 'px', left: Math.max(8, Math.min(rect.left, window.innerWidth - 332)) + 'px' };
}
onBeforeUnmount(() => { clearTimeout(nudgeT1); clearTimeout(nudgeT2); });

/* 1124：输入只写字段名——半截输入（type 未知）此前会被 opsForType(undefined)=exists
 静默换算子（选好 range/rank_feature 后一改字段就变 exists）。只有从候选弹层明确选中
 mapping 字段时，才按类型做「保算子优先/角色兜底」的智能切换。 */
function patchFieldOnly(field: string) {
  /* named 形态字段键可空（query_string 无 default_field 合法）：清空 → null（序列化不写键） */
  const f = nodeOpForm.value === 'named' && !field ? null : field;
  patch({ field: f });
}
function onField(field: string) {
  patchFieldOnly(field);
}
function onFieldPicked(field: string) {
  const type = props.types[field];
  if (!type) { patchFieldOnly(field); return; }
  const allowed = opsForType(type);
  /* 1045：换字段保算子优先；不兼容时按角色给默认（date→range / metric→range /
     text→match / 标识→term），而不是永远取 allowed[0]。 */
  const fallback = defaultOpForField(field, type);
  const nextOp = allowed.includes(props.node.op) ? props.node.op
    : allowed.includes(fallback) ? fallback : allowed[0];
  const nv = normalizeValueForOp(nextOp, props.node.value);
  const msgs: string[] = [];
  if (nextOp !== props.node.op) msgs.push(type ? `已按 ${type} 字段切换为「${label(nextOp)}」` : `字段无 mapping，已切换为「${label(nextOp)}」`);
  if (nv.changed) msgs.push('旧值与新算子形态不兼容，已重置');
  if (msgs.length) showNudge(msgs.join('；'));
  const f = nodeOpForm.value === 'named' && !field ? null : field;
  /* 始终写回形态安全值：空串在 range 下也是非法值（应为 {}），changed=false 只表示
     不需要提示「旧值已重置」，不代表值形态已经正确。 */
  patch({ field: f, op: nextOp, value: nv.value });
}

/* 1045：算子/字段切换时的值形态守卫——不兼容旧值不静默留在 DSL 里造「看似有值、
   实际查空」的假条件。返回 changed=true 时调用方把 value 换成安全初值。 */
function isPlainObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function normalizeValueForOp(op: string, v: unknown): { value: unknown; changed: boolean } {
  const meta = OPS_META[op];
  if (!meta || op === 'exists' || op === 'match_all' || op === 'match_none') return { value: v, changed: false };
  const form = meta.form;
  if (form === 'none') {
    if (op === 'ids') return Array.isArray(v) ? { value: v, changed: false } : { value: [], changed: v !== '' && v != null };
    if (op === 'script') return isPlainObj(v) ? { value: v, changed: false } : { value: { source: '' }, changed: v !== '' && v != null };
    return typeof v === 'string' || typeof v === 'number' ? { value: v, changed: false } : { value: '', changed: v != null && v !== '' };
  }
  if (form === 'fields') {
    return typeof v === 'string' || typeof v === 'number' ? { value: v, changed: false } : { value: '', changed: v != null && v !== '' };
  }
  if (form === 'named') {
    /* 向量主值是结构化 JSON：从标量算子切过来时给安全初值，确保 JSON 编辑位立刻出现 */
    if (op === 'knn') return Array.isArray(v) ? { value: v, changed: false } : { value: [], changed: v != null && v !== '' };
    if (op === 'sparse_vector') return isPlainObj(v) ? { value: v, changed: false } : { value: {}, changed: v != null && v !== '' };
    if (op === 'rank_feature') {
      /* boost 必须是数值；从 distance_feature 的 pivot('7d') 等字符串切来时回落默认 1 */
      return typeof v === 'number' && Number.isFinite(v)
        ? { value: v, changed: false }
        : { value: 1, changed: v != null && v !== '' };
    }
    if (op === 'bitmap_terms') {
      return typeof v === 'number' || typeof v === 'string' ? { value: v, changed: false } : { value: '', changed: v != null && v !== '' };
    }
    return { value: v, changed: false };
  }
  /* field 形态 */
  if (ARRAY_VAL_OPS.has(op)) {
    if (Array.isArray(v) || isPlainObj(v)) return { value: v, changed: false };
    if (v === '' || v == null) return { value: [], changed: false };
    return { value: [v], changed: false };
  }
  if (meta.wrap === 'none') {
    if (op === 'span_gap') return typeof v === 'number' ? { value: v, changed: false } : { value: 1, changed: true };
    return isPlainObj(v) ? { value: v, changed: false } : { value: {}, changed: v != null && v !== '' };
  }
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? { value: v, changed: false }
    : { value: '', changed: v != null && v !== '' };
}

/* range-on-keyword：range 打在 keyword/wildcard 字段按字典序比较（'100' < '20'）——
 值输入旁黄点警示（与 dslLint keyword-range 规则同一语义） */
const LEX_ORDER_TYPES = new Set(['keyword', 'wildcard']);
const rangeLexWarn = computed(() => props.node.op === 'range' && LEX_ORDER_TYPES.has(fieldType.value));
/* 手动选算子×字段类型错配提示——onOp 不阻断也不静默替换（与换字段 onField 的
 强制回落不同路径），改在值输入旁黄点+title 微提示（友好不拦截）。兼容判定复用 opsForType
 推荐表（queryAstOps types 组映射）；exists 是万能兜底、match_all/match_none 无字段语义，都豁免。 */
const opMismatchHint = computed(() => {
  const t = fieldType.value;
  const op = props.node.op;
  if (!t || op === 'exists' || op === 'match_all' || op === 'match_none') return '';
  if (opsForType(t).includes(op)) return '';
  /* 建议段用算子 id（与 DSL/下拉 optgroup 语境一致），当前段用中文标签（下拉显示形态） */
  const rec = opsForType(t).filter(o => o !== 'exists').slice(0, 2);
  const sug = rec.length ? rec.join(' / ') + ' / exists' : 'exists';
  return `${t} 字段建议 ${sug}，当前「${label(op)}」可能无结果`;
});
/* prefix/wildcard 值以 * / ? 开头=前缀通配符（dslLint prefix-wildcard 规则的
 交互层等价物）：无法利用倒排索引、全表扫描。结尾通配合法不提示。 */
const prefixStarHint = computed(() => {
  const op = props.node.op;
  if (op !== 'prefix' && op !== 'wildcard') return '';
  const v = props.node.value;
  return typeof v === 'string' && (v.startsWith('*') || v.startsWith('?'))
    ? '开头的 * / ? 无法利用倒排索引、等于全表扫描；建议去掉开头通配符，或改用 match'
    : '';
});
const rowWarn = computed(() => [opMismatchHint.value, prefixStarHint.value].filter(Boolean).join('；'));
/* 黄点一键改推荐算子——取该字段类型推荐首算子（filter 掉万能兜底 exists）。
 错配场景（如 date+term→range）即「改用推荐算子」本义；开头通配场景（keyword+prefix('*x')）
 点击切推荐首算子 term，与 title 的「去掉开头通配符」引导同向。 */
function onOwarnClick() {
  const rec = opsForType(fieldType.value).filter(o => o !== 'exists');
  if (rec.length) onOp(rec[0]);
}
/* 985：切算子按目标形态重建值/字段/多字段——标量尽量带过去，结构不兼容给安全初值。
 对象值算子（wrap none 非 terms）目标 {}；数组值算子（terms/ids）归一 []；
 fields 形态 field 退役、fields=[]；none 形态 field 退役。 */
const ARRAY_VAL_OPS = new Set(['terms', 'ids', 'terms_set']);
function onOp(op: string) {
  const meta = OPS_META[op];
  const form = meta?.form;
  const same = op === props.node.op;
  const nv = normalizeValueForOp(op, props.node.value);
  /* 1120：切到 distance_feature 时必填 origin/pivot 给可跑默认（now/7d），
     避免先补两项才能执行；同算子重选不动现有值。 */
  const value = !same && op === 'distance_feature' ? '7d' : nv.value;
  /* 1045：切换算子造成值形态重置时明确告知（旧实现静默清值，用户以为值还在） */
  if (nv.changed && props.node.value !== '' && props.node.value != null) {
    showNudge(`「${label(op)}」需要不同的值形态，旧值已重置`);
  } else if (!same && op === 'distance_feature' && props.node.value !== '' && props.node.value != null) {
    showNudge('「特征距离」默认 origin=now / pivot=7d，可按需修改');
  }
  const field = form === 'none' || form === 'fields' ? null : (props.node.field ?? '');
  const fields = form === 'fields' ? (Array.isArray(props.node.fields) ? props.node.fields : []) : null;
  patch({ op, value, field, fields, params: same ? props.node.params : paramsForOp(op, props.node.params) });
}
/* 数组值算子（terms/ids）↔ 逗号分隔；其余标量直存 */
const valText = computed(() =>
  ARRAY_VAL_OPS.has(props.node.op)
    ? (Array.isArray(props.node.value) ? props.node.value.join(',') : String(props.node.value ?? ''))
    : String(props.node.value ?? ''));
function onValue(raw: string) {
  patch({ value: ARRAY_VAL_OPS.has(props.node.op) ? raw.split(',').map(s => s.trim()).filter(Boolean) : raw });
}

/* ═══ 1005：数组值 chip 编辑 ═══ draft 不写树（半截值不进 DSL），提交才整项入账；
   粘贴含逗号按项拆分（与旧逗号分隔输入等价）；IME 组合态 Enter 守卫（FieldSelect 同款） */
const isArrayVal = computed(() => ARRAY_VAL_OPS.has(props.node.op) && Array.isArray(props.node.value));
const arrVals = computed(() => (props.node.value as unknown[]).map(v => String(v)));
const chipDraft = ref('');
/* 1045：多值粘贴识别——Excel 一列（换行/Tab）、中文逗号/分号、JSON 数组都按多项拆；
   旧实现只认英文/中文逗号，整列粘贴会变成一枚带换行的巨型 chip。 */
function splitMulti(raw: string): string[] {
  const t = String(raw ?? '').trim();
  if (!t) return [];
  if (/^\[[\s\S]*\]$/.test(t)) {
    try {
      const a = JSON.parse(t);
      if (Array.isArray(a)) {
        return a.filter(x => x != null && x !== '')
          .map(x => typeof x === 'object' ? JSON.stringify(x) : String(x))
          .map(x => x.trim()).filter(Boolean);
      }
    } catch { /* 非 JSON：走分隔符拆分 */ }
  }
  return t.split(/[\n\r\t,，;；]+/)
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}
function commitChip() {
  const parts = splitMulti(chipDraft.value);
  chipDraft.value = '';
  if (parts.length) patch({ value: [...arrVals.value, ...parts] });
}
function onChipPaste(e: ClipboardEvent) {
  const parts = splitMulti(e.clipboardData?.getData('text') || '');
  if (parts.length < 2) return;   // 单项继续走浏览器默认粘贴
  e.preventDefault();
  patch({ value: [...arrVals.value, ...parts] });
  showNudge(`已从剪贴板添加 ${parts.length} 个值`);
}
/* 单值位粘贴一整列：精确语义算子自动升为 terms（多值精确），避免把列表塞进一个 term */
const PASTE_TO_TERMS_OPS = new Set(['term', 'prefix', 'wildcard', 'fuzzy', 'regexp']);
function onValuePaste(e: ClipboardEvent) {
  const parts = splitMulti(e.clipboardData?.getData('text') || '');
  if (parts.length < 2) return;
  e.preventDefault();
  if (ARRAY_VAL_OPS.has(props.node.op)) {
    patch({ value: [...arrVals.value, ...parts] });
    showNudge(`已从剪贴板添加 ${parts.length} 个值`);
    return;
  }
  if (PASTE_TO_TERMS_OPS.has(props.node.op)) {
    patch({ op: 'terms', value: parts, fields: null });
    showNudge(`检测到 ${parts.length} 项多值粘贴，已切换为「多值精确」`);
    return;
  }
  /* 其他算子（match/range…）保留原语义，把原始文本按单值写回 */
  patch({ value: parts.join(' ') });
  showNudge('当前算子按单值处理，多行已合并为空格分隔');
}
function delChip(i: number) {
  const next = arrVals.value.slice();
  next.splice(i, 1);
  patch({ value: next });
}
function onChipEnter(e: KeyboardEvent) { if (!e.isComposing) commitChip(); }
function onChipKey(e: KeyboardEvent) {
  if (e.isComposing) return;
  if (e.key === 'Backspace' && !chipDraft.value && arrVals.value.length) {
    e.preventDefault();
    delChip(arrVals.value.length - 1);
  } else if (e.key === ',' || e.key === '，') {
    e.preventDefault();
    commitChip();
  }
}
/* 多字段形态：fields ↔ 逗号分隔（主值 placeholder 按 mainKey 语义） */
const mainKeyPlaceholder = computed(() => `主值（${OPS_META[props.node.op]?.mainKey || 'query'}）`);
/* 1183：主值键缺席（见模板注释）。只有 fields/named/none 三形态会写 hasMain；
   field 形态恒 undefined（它没有独立主值键这一说），因此天然不触发。 */
const mainKeyName = computed(() => OPS_META[props.node.op]?.mainKey || 'query');
const presentParamKeys = computed(() => Object.keys(props.node.params || {}));
const mainKeyAbsent = computed(() => props.node.hasMain === false);
const fieldsText = computed(() => (Array.isArray(props.node.fields) ? props.node.fields.join(',') : ''));
function onFields(raw: string) {
  patch({ fields: splitMulti(raw) });
}
/* 对象值子表（geo 系/terms_set/script 等）：值是纯对象即子表编辑 */
const isObjValue = computed(() => {
  if (nodeOpForm.value !== 'field' && nodeOpForm.value !== 'none') return false;
  const v = props.node.value;
  return v !== null && typeof v === 'object' && !Array.isArray(v);
});
/* 1011：intervals 规则体可解析（唯一类型键+官方 6 类）→ 专用递归编辑位接管；
   不可解析维持通用键值表（零丢失退化，与 FsFunctionsPanel 自定义形态锁定同语言） */
const intervalsParsed = computed(() =>
  props.node.op === 'intervals' ? parseIntervalRule(props.node.value) : null);
const isIntervals = computed(() => !!intervalsParsed.value);
function onIntervalsUpdate(r: IntervalRule) {
  patch({ value: serIntervalRule(r) });
}
/* 1012：geo 坐标形态可解析 → 专用编辑位（geo_point 双数值 / bbox corners·edges） */
const geoEditable = computed(() =>
  (props.node.op === 'geo_distance' && geoPointView(props.node.value) !== null)
  || (props.node.op === 'geo_bounding_box' && bboxView(props.node.value) !== null));
function onGeoPatch(p: { value?: unknown; params?: Record<string, unknown> }) {
  patch({ ...(p.value !== undefined ? { value: p.value } : {}), ...(p.params !== undefined ? { params: p.params } : {}) });
}
/* 1017：percolate document JSON 编辑位（useJsonDraft 三件套：draft/bad/同步回流） */
const perc = useJsonDraft(() => props.node.op === 'percolate' ? props.node.value : undefined, v => patch({ value: v }));
/* 1045：向量查询值（knn 数组 / sparse_vector 对象）——数组合法，allowArray 档 */
const JSON_VEC_OPS = new Set(['knn', 'sparse_vector']);
const isJsonVec = computed(() => JSON_VEC_OPS.has(props.node.op)
  && props.node.value !== null && typeof props.node.value === 'object');
const vec = useJsonDraft(
  () => (isJsonVec.value ? props.node.value : undefined),
  v => patch({ value: v }),
  { allowArray: true },
);
/* 1018：more_like_this like 混合形态（对象/数组）→ 专用编辑器；字符串维持既有输入 */
const mltRich = computed(() => {
  if (props.node.op !== 'more_like_this') return false;
  const v = props.node.value;
  return !!v && typeof v === 'object';
});
/* 1019：terms lookup 形态判定——值对象且键 ⊆ {index,id,path}、出现的值全字符串
   （半成品允许键缺席；未知键/非字符串值 → null 退化通用键值表保真） */
const TL_KEYS = new Set(['index', 'id', 'path']);
const termsLookup = computed(() => {
  if (props.node.op !== 'terms') return false;
  const v = props.node.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!TL_KEYS.has(k)) return false;
    if (typeof val !== 'string') return false;
  }
  return true;
});
function tlText(k: string): string {
  return String((props.node.value as Record<string, unknown>)?.[k] ?? '');
}
function onTl(k: string, raw: string) {
  const v = { ...(props.node.value as Record<string, unknown>) };
  if (raw === '') delete v[k];
  else v[k] = raw;
  patch({ value: v });
}
const objVal = computed<Record<string, unknown>>(() =>
  (isObjValue.value ? props.node.value : {}) as Record<string, unknown>);
function onObjValue(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) patch({ value: v });
}
/* 常用键快捷骨架（傻瓜化）：点 chips 添加键、初始值按语义给形态（集合 []、嵌套对象 {}、标量空串） */
const OBJ_KEY_HINTS: Record<string, string[]> = {
  geo_polygon: ['points'],
  geo_shape: ['shape', 'relation'],
  terms_set: ['terms', 'minimum_should_match_field'],
  /* intervals 通用退化路径骨架（1011：可解析形态走专用编辑器；此处键名按 ES 官方
     all_of/any_of——旧 allOf/anyOf 驼峰写法 ES 必拒） */
  intervals: ['match', 'all_of', 'any_of'],
  /* 991：对象值算子扩员（8.x 新算子族常用键骨架） */
  geo_grid: ['geohash', 'geotile', 'geohex', 'ignore_unmapped'],
  shape: ['shape', 'relation'],
  text_expansion: ['model_id', 'model_text'],
  weighted_tokens: ['tokens', 'pruning_config'],
};
const OBJ_ARR_KEYS = new Set(['terms', 'points', 'shape']);
const OBJ_OBJ_KEYS = new Set(['top_left', 'bottom_right', 'match', 'all_of', 'any_of', 'filter', 'tokens', 'pruning_config']);
const objKeyHints = computed(() => OBJ_KEY_HINTS[props.node.op] || []);function addObjKey(k: string) {
  if (k in objVal.value) return;
  const init: unknown = OBJ_ARR_KEYS.has(k) ? [] : OBJ_OBJ_KEYS.has(k) ? {} : '';
  patch({ value: { ...objVal.value, [k]: init } });
}

/* ═══ （P1-3a）：值输入候选（term/terms/prefix keyword 精确语义档）═══
 起候选双源：① terms-agg top20（useTermsSuggest）② 跨模式查询历史（pinia 内存态，
 零新增请求依赖）。历史双形态解析：JSON DSL（"field":"v" / "field":["a","b"]）与 lucene
 （field:v / field:"v"）；a.b 与 a.b.keyword 互认（keyword 子字段与逻辑字段同值域）。
 useIndexFields 只有字段名+类型、无样本值通道（源码实证），静态样本走不了——聚合候选即
 「当前索引真实 top 值」口径。护栏：本组件存在无 pinia 的裸挂载环境（clauseNode.spec 单测），
 getActivePinia 判空零降级（qhStore/termCtx 双闸同款）；store 解析收在 setup 作用域一次。 */
import { getActivePinia } from 'pinia';
import { useQueryHistoryStore } from '../../stores/queryHistory';
import { useTermsSuggest } from '../../composables/useTermsSuggest';
import { curFieldSearchIndex } from '../../utils/fieldSearch';
import { isMenuKey, menuKeyAnchor } from '../../utils/menuKey';
import { KEYWORD_VALUE_TYPES } from '../../utils/sqlCompletion';
const qhStore = getActivePinia() ? useQueryHistoryStore() : null;
/* terms-agg 值候选源——同 qhStore 静默闸（无 pinia 裸挂载 null 零降级）；索引语境
 读 fieldSearch 模块态 curFieldSearchIndex（QueryTreePane/RootExtrasPane 随自身 index prop
 写入，ClauseNode 深嵌树内无 index prop 可透传，setFieldSearchIndex 既有先例），缺席时
 suggest 空参早退零请求。：第二参 types 接 props.types——datalist 候选按字段类型
 精化排序（三处同范式，五消费面接线至此收口） */
const termCtx = getActivePinia() ? useTermsSuggest(curFieldSearchIndex, () => props.types) : null;
const valDlId = 'cn-dl-' + props.node.id;
/* 值位 terms-agg 聚合字段解析——a.b ↔ a.b.keyword 互认（历史候选同口径），
 取 keyword 族（KEYWORD_VALUE_TYPES 单一出处，sqlCompletion 同源）类型命中的具体路径 */
function kwAggFieldOf(f: string): string {
  const names = f.endsWith('.keyword') ? [f, f.slice(0, -'.keyword'.length)] : [f, f + '.keyword'];
  for (const n of names) {
    const t = props.types[n] || '';
    if (t && KEYWORD_VALUE_TYPES.includes(t)) return n;
  }
  return '';
}
/* 值位候选 prime——值输入聚焦时空前缀拉 terms-agg top20（datalist 由浏览器按已敲
 文本自行过滤，无需按前缀重查；FieldSelect 选中同字段已预热模块级 TTL 缓存 → 此处缓存
 命中零网络白得）。无 pinia/非精确语义档/非 keyword 族字段/无索引语境零动作 */
function primeValAgg() {
  /* 运行时字段不做 terms-agg 预取：请求不带 runtime_mappings 取不到值；
     带 mapping 又等于每次聚焦对全量文档跑脚本聚合，代价高。值候选只留查询历史。 */
  if (runtimeField.value) return;
  if (!typePriorityForOp(props.node.op).includes('keyword') || !termCtx) return;
  const agg = kwAggFieldOf((props.node.field || '').trim());
  if (agg) termCtx.suggest(agg, '');
}
/* 换字段即 prime——此前仅 @focus 触发，选完字段直接打字/粘贴值就错过预载，
 候选首现要等二次聚焦；watch 同一精确语义档门槛（primeValAgg 内判定），行为白得 */
watch(() => props.node.field, () => primeValAgg());
const valCandidates = computed<string[]>(() => {
  /* 候选档判定随 typePriorityForOp 下沉同源——keyword 优先的算子即精确语义档
 （term/terms/prefix/wildcard），历史值候选与字段候选排序吃同一张表 */
  if (!typePriorityForOp(props.node.op).includes('keyword') || !qhStore) return [];
  const f = (props.node.field || '').trim();
  if (!f) return [];
  const names = f.endsWith('.keyword') ? [f, f.slice(0, -'.keyword'.length)] : [f, f + '.keyword'];
  const cur = String(props.node.value ?? '');
  const out: string[] = [];
  const push = (v: string | undefined) => {
    if (!v) return;
    const t = v.trim();
    if (!t || t === cur || t.includes('*') || t.includes('?')) return; // 通配/当前值不入候选
    if (!out.includes(t)) out.push(t);
  };
  /* terms-agg top20 候选先行（termCtx.suggestions 是本行实例自有态，多行互不串值；
 未 prime/缓存未回时为空，历史候选照出），历史候选续后去重合并 */
  const aggField = kwAggFieldOf(f);
  if (aggField && termCtx && !runtimeField.value) for (const v of termCtx.suggestions.value) push(v);
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const it of qhStore.items) {
      const q = it.query || '';
      if (!q.includes(name)) continue;
      let m: RegExpExecArray | null;
      const reStr = new RegExp('"' + esc + '"\\s*:\\s*"([^"]*)"', 'g');
      while ((m = reStr.exec(q))) push(m[1]);
      const reArr = new RegExp('"' + esc + '"\\s*:\\s*\\[([^\\]]*)\\]', 'g');
      while ((m = reArr.exec(q))) for (const s of m[1].split(',')) push(s.trim().replace(/^"|"$/g, ''));
      if (it.mode === 'lucene') {
        const reLu = new RegExp('(?:^|[\\s+(])' + esc + '\\s*:\\s*(?:"([^"]+)"|([^\\s)()+*~,-]+))', 'g');
        while ((m = reLu.exec(q))) { push(m[1]); push(m[2]); }
      }
      if (out.length >= 20) break;
    }
    if (out.length >= 20) break;
  }
  return out.slice(0, 20);
});
/* 标准时间(YYYY-MM-DD[ HH:mm[:ss]])→ epoch 毫秒——时间戳整型存储的时间字段用它匹配 */
function convertStdTime() {
  const ms = stdTimeToEpochMs(valText.value);
  if (ms != null) onValue(String(ms));
}
/* 【W3b】range 四操作符（gte/gt/lte/lt，与 dslLint RANGE_OPS 同口径） */
type RangeOp = 'gte' | 'lte' | 'gt' | 'lt';
function rangePart(k: RangeOp): string {
  const v = props.node.value as any;
  return v && typeof v === 'object' && v[k] !== undefined ? String(v[k]) : '';
}
function setRange(k: RangeOp, raw: string) {
  const cur = props.node.value as any;
  const next: Record<string, unknown> = cur && typeof cur === 'object' ? { ...cur } : {};
  if (raw === '') delete next[k]; else next[k] = raw;
  patch({ value: next });
}
/* range 值位形态 datalist（按字段类型分派，只提示格式不约束输入）——
 date 族 date-math（dslCompletionContext RANGE_OPS 骨架同形）、数值族字面示例、
 ip CIDR 网段；keyword 等无形态档字段空数组不挂 datalist（零增量） */
const rangeDlId = 'cn-rg-' + props.node.id;
const rangeHints = computed<string[]>(() => {
  const t = fieldType.value;
  if (t === 'date' || t === 'date_nanos') return ['now-1d/d', 'now-1h/h'];
  if (NUMERIC_VALUE_TYPES.includes(t)) return ['100'];
  if (t === 'ip') return ['10.0.0.0/24'];
  return [];
});

/* 1041：日期时间窗快选——公告/研报/舆情类查询的最高频手势（发布时间窗一击成窗：
   gte=相对锚 + lte=now 完整窗口）；仅 date/date_nanos 字段挂载 */
const isDateRange = computed(() => fieldType.value === 'date' || fieldType.value === 'date_nanos');
const DATE_CHIPS = [
  { label: '近7天', gte: 'now-7d/d' },
  { label: '近30天', gte: 'now-30d/d' },
  { label: '近90天', gte: 'now-90d/d' },
  { label: '近一年', gte: 'now-1y/y' },
  { label: '今年', gte: 'now/y' },
];
function applyChip(c: { gte: string }) {
  /* 单次整体 patch（同 tick 两次 setRange 会读到未更新的旧基，lte 覆写 gte） */
  const base = props.node.value && typeof props.node.value === 'object' && !Array.isArray(props.node.value)
    ? props.node.value as Record<string, unknown> : {};
  patch({ value: { ...base, gte: c.gte, lte: 'now' } });
}

function onDragStart(e: DragEvent) {
  (window as any)[DRAG_KEY] = props.node.id;
  e.dataTransfer?.setData('text/plain', props.node.id);
  fireDrag(true);
}
function endDrag() { delete (window as any)[DRAG_KEY]; fireDrag(false); }
</script>

<style scoped>
/* v3.1 条件行：hover 浅底浮现；工具钮 hover/focus 显现，⏰/参与开关常亮；
 深嵌套无卡片（无边框行），字段聚焦品牌描边+柔光由 FieldSelect 内部处理 */
.cn { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-m); margin-bottom: var(--sp-0); position: relative; transition: background var(--tr); }
.cn:hover { background: var(--bg2); }
/* 参与开关：静息态中性灰（每行都亮一粒琥珀会盖过真正的条件内容），hover 才提示「可停用」；
   已停用态转绿色常亮——恢复入口必须显眼，否则停用条件容易被忘掉 */
.cn-pw { flex-shrink: 0; color: var(--tx2); }
.cn-pw:hover { color: var(--warn); background: var(--warn-soft); }
.cn-pw.on { color: var(--ok); }
.cn-pw.on:hover { color: var(--ok); background: var(--ok-soft); }
.cn-grip { cursor: grab; color: var(--tx2); font-size: var(--fs-xs); user-select: none; transition: color var(--tr); }
.cn:hover .cn-grip { color: var(--tx1); }
/* 工具钮恒定全可见（透明度降噪在亮色下过度，点名看不清）——
 hover 仅做背景反馈；⏰ 品牌色常亮 */
.cn .btn.sm.ghost[aria-label="标准时间转时间戳"] { color: var(--ac); }
.cn .btn.sm.ghost[aria-label="标准时间转时间戳"]:hover { color: var(--ac-hi, var(--ac)); background: var(--ac-soft); }
/* ═══ 998：条件行视觉重构 ═══
   目标：一眼分清「字段 / 算子 / 值」三段，而不是四个等权重输入框排在一起。
   · 行：hover 浅底 + focus-within 品牌弱描边（编辑中的那一行自己会亮）；
   · 算子：语义族胶囊（全文=青 / 精确=蓝 / 范围=紫 / 空间=绿 / 向量=品红 / 跨度=橙 / 脚本=中性）；
   · 值：mono 输入，底色比字段输入浅一档，视觉上「这是要被填的东西」。 */
.cn { border: 1px solid transparent; gap: var(--sp-1h); }
.cn:hover { background: var(--bg2); border-color: var(--line); }
.cn:focus-within { background: var(--bg2); border-color: var(--ac-line); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ac) 8%, transparent); }
/* 拖拽柄平时收敛，行 hover/聚焦才浮现（减少每行左侧的视觉噪点；功能与拖拽事件不变） */
.cn-grip { opacity: .35; }
.cn:hover .cn-grip, .cn:focus-within .cn-grip { opacity: 1; }
/* 算子胶囊：原生 select 去壳 + 语义族配色 + 右侧 chevron（背景 SVG，双主题中性灰） */
.cn-op {
  appearance: none; -webkit-appearance: none; -moz-appearance: none;
  height: 26px; max-width: 124px; flex: none;
  font-size: var(--fs-xs); font-weight: 650; letter-spacing: var(--ls-tight);
  padding: 0 16px 0 8px; border-radius: 999px; border: 1px solid transparent;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%236f8b83' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 5px center; background-size: 9px 9px;
  cursor: pointer; transition: filter var(--tr), border-color var(--tr), background-color var(--tr);
}
.cn-op:hover { filter: brightness(1.08); }
.cn-op:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cn-op option { color: var(--tx0); background: var(--card, var(--bg1)); font-weight: 400; }
/* 语义族七色（暗/亮双主题都取语义 token 的对应档）：软底 + 同色文字；
   描边不写固定百分比 color-mix（亮色下会过重，且与全站 -line token 纪律冲突），
   统一走基类的透明边（尺寸稳定，不抖布局） */
.cn-op.opf-text { color: var(--c-must); background-color: var(--c-must-bg); }
.cn-op.opf-exact { color: var(--c-filter); background-color: var(--c-filter-bg); }
.cn-op.opf-range { color: var(--c-should); background-color: var(--c-should-bg); }
.cn-op.opf-geo { color: var(--ok); background-color: var(--ok-soft); }
.cn-op.opf-vector { color: var(--dv-purple); background-color: var(--dv-purple-soft); }
.cn-op.opf-span { color: var(--dv-orange-deep); background-color: color-mix(in srgb, var(--dv-orange-deep) 10%, transparent); }
.cn-op.opf-script { color: var(--tx1); background-color: var(--bg3); }
.cn-op.opf-struct { color: var(--tx2); background-color: var(--bg2); }
/* 类型徽标色统一 theme.css 全站 .mft-type[data-t] 色卡（本文件原局部三类型规则已删）；
 冷门类型回落档走 :where（specificity 0），色卡命中时必胜（同 FieldPicker 口径） */
.cn-fty { flex: none; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; cursor: help; }
:where(.cn-fty) { color: var(--muted); background: var(--hl); }
/* 1056：text→keyword 子域一键建议（accent 弱底，只提示不抢算子/值控件） */
.cn-kwfix { flex: none; height: 20px; padding: 0 var(--sp-1h); font-size: var(--fs-2xs); color: var(--ac-hi); background: var(--ac-soft); border-color: var(--ac-line); }
/* 1069 续：未知字段→建运行时字段（独立整行提示条，不挤压字段/算子/值主控件） */
.cn-defrt-bar {
  flex-basis: 100%; display: flex; align-items: center; gap: var(--sp-1h);
  padding: var(--sp-1) var(--sp-2); border: 1px solid var(--warn-line); border-radius: var(--r-s);
  background: var(--warn-soft);
}
.cn-defrt-hint { font-size: var(--fs-2xs); color: var(--warn); }
/* 1183：主值键缺席说明——中性信息档，不抢警告色（这不是错，是另一种合法写法） */
.cn-mainabs-bar { flex-basis: 100%; display: flex; align-items: center; padding: var(--sp-0) var(--sp-2); border: 1px dashed var(--line); border-radius: var(--r-s); background: var(--bg1); }
.cn-mainabs { font-size: var(--fs-2xs); color: var(--tx2); line-height: 1.5; }
.cn-mainabs code { font-size: var(--fs-2xs); color: var(--info); }
.cn-defrt { flex: none; height: 20px; padding: 0 var(--sp-1h); font-size: var(--fs-2xs); white-space: nowrap; color: var(--warn); background: transparent; border-color: var(--warn-line); }
/* 1322：「是不是想找」——这是**改回正确值**的建议，不是警告，用主色而非警告色，
   与旁边「创建运行时字段」（warn）在视觉上分层：先纠错，再造新字段。 */
.cn-suggest { flex: none; height: 20px; padding: 0 var(--sp-1h); font-size: var(--fs-2xs); white-space: nowrap; color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
.cn-suggest code { font-size: var(--fs-2xs); }
.cn-val { height: 30px; font-size: var(--fs-sm); padding: 3px var(--sp-2); flex: 1 1 120px; min-width: 0; }
/* 1039：长查询串 textarea——覆盖 cn-val 定高，纵向伸缩，行顶对齐由 flex wrap 承接 */
.cn-qry { height: auto; min-height: 52px; resize: vertical; line-height: 1.5; }
.cn-range { flex: 0 1 86px; min-width: 62px; }
/* 998：行尾动作组——整组右对齐、空间不足时整体折行（不散落在行首）；
   24px 方形按钮，hover/focus 才提亮，静息态低对比不抢主控件 */
.cn-acts { display: inline-flex; align-items: center; gap: 0; margin-left: auto; flex: none; }
.cn-act { width: 22px; height: 22px; padding: 0; justify-content: center; border-radius: var(--r-s); color: var(--tx2); }
.cn-act:hover { color: var(--tx0); background: var(--bg3); }
.cn-act.danger:hover { color: var(--err); background: var(--err-soft); }
/* 1215：低频动作静息隐藏（display:none 不占宽，同 RT 列头 1151 的裁决——opacity:0 仍参与
 flex 分配，看不见也吃宽度）。右键盘里这些动作一个不少（1147：复制…/结构… 二级齐全），
 所以隐藏不丢能力；行悬停或行内任一控件获得焦点即整组浮现，键盘用户 Tab 到该行同样可见。
 1440 实测：常驻 6 钮占行宽 31%、整行折成 76px；收成 2 枚后动作簇降到 44px。 */
.cn-act-lo { display: none; }
.cn:hover .cn-act-lo, .cn:focus-within .cn-act-lo { display: inline-flex; }
/* 触屏无 hover：常驻显示，不能让人摸不到（与 ILM/收藏卡/快照行的 @media (hover:none) 同款兜底） */
@media (hover: none) {
  .cn-act-lo { display: inline-flex; }
}
/* 985：多字段形态的字段列表输入（与主值并排换行）+ 对象值子表容器（独占一行，dashed 弱边框与 GenericNode 同语言） */
.cn-fields { flex: 1 1 150px; }
.cn-objval { flex-basis: 100%; padding: var(--sp-2); border: 1px dashed var(--line); border-radius: var(--r-s); background: var(--bg1); }
.cn-perc { width: 100%; min-height: 76px; font-size: var(--fs-xs); line-height: 1.5; resize: vertical; }
.cn-perc.bad { border-color: var(--err); box-shadow: 0 0 0 2px var(--err-soft); }
.cn-tl-tip { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: var(--fs-2xs); color: var(--tx2); }
.cn-tl-in { width: 128px; height: 26px; font-size: var(--fs-sm); }
/* 1005：terms/ids 值 chips——值即标签（hl 底+line 边，与 .cn-objk-btn 同语言）；
   行内折行承载多值，输入框随行伸缩（空态独占一行给 placeholder） */
.cn-chips { display: inline-flex; flex: 1 1 150px; min-width: 0; flex-wrap: wrap; align-items: center; gap: var(--sp-1); }
.cn-chip { display: inline-flex; align-items: center; gap: 2px; max-width: 220px; overflow: hidden;
  padding: 0 var(--sp-1h); border: 1px solid var(--line); border-radius: var(--r-s);
  background: var(--hl); font-size: var(--fs-xs); line-height: 20px; }
.cn-chip-v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cn-chip-x { display: inline-flex; align-items: center; padding: 0; border: none; background: none;
  color: var(--tx2); cursor: pointer; transition: color var(--tr); }
.cn-chip-x:hover { color: var(--warn); }
.cn-chip-in { flex: 1 1 80px; min-width: 70px; width: auto; height: 26px; padding: 0 var(--sp-1h); }
/* 对象值常用键快捷 chips：胶囊虚线弱态，点击补骨架；已添加键禁用防重复 */
.cn-objk { display: flex; gap: var(--sp-1); flex-wrap: wrap; margin-bottom: var(--sp-1); }
.cn-objk-btn { font-size: var(--fs-2xs); padding: 1px 7px; border-radius: 999px; border: 1px dashed var(--line-strong); background: var(--bg2); color: var(--tx2); cursor: pointer; transition: color var(--tr), border-color var(--tr); }
.cn-objk-btn:hover:not(:disabled) { color: var(--ac); border-color: var(--ac); }
.cn-objk-btn:disabled { opacity: .4; cursor: default; }
/* 字段选择器伸展：flex-wrap 行内吃满剩余空间，长路径 a.b.c.keyword 不再截断；
 值输入 flex 比例相应上调（形态对齐 RootExtrasPane .rx-sort-row .fs 的遮挡修复） */
.cn .fs { flex: 1 1 150px; min-width: 0; }
.cn-na { font-size: var(--fs-xs); color: var(--tx2); }
.cn-params { flex-basis: 100%; padding: var(--sp-2); border-top: 1px dashed var(--line); }
/* 换算子微提示：独占一行的小字淡底（克制，不抢值输入焦点），2.5s 后 opacity 淡出 */
.cn-nudge { flex: 0 0 100%; font-size: var(--fs-xs); color: var(--info); background: var(--info-soft); border-radius: var(--r-xs); padding: 1px var(--sp-2); transition: opacity .5s; }
.cn-nudge.out { opacity: 0; }
/* range-on-keyword 字典序警示黄点：title 承载完整说明 */
.cn-rwarn { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--warn); cursor: help; }
/* 1041：日期时间窗快选 chips（cn-objk-btn 同语言：细边胶囊+hover 柔底） */
.cn-rchips { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.cn-rchip { padding: 1px 8px; border: 1px solid var(--line); border-radius: 999px; background: none;
  font-size: var(--fs-2xs); color: var(--tx2); cursor: pointer; transition: background var(--tr), color var(--tr); }
.cn-rchip:hover { background: var(--ac-soft); color: var(--tx0); }
/* 算子×类型错配 / 开头通配符警示黄点（同 .cn-rwarn 形态）。
 span 升级 button（键盘可达），重置 UA 按钮壳、cursor 由 help 改 pointer */
.cn-owarn { flex: none; width: 8px; height: 8px; padding: 0; border: none; border-radius: 50%; background: var(--warn); cursor: pointer; }
.cn-owarn:hover { filter: brightness(1.15); }
</style>
