<template>
  <div class="ahr">
    <!-- 副标题与步条叙事对齐（Xmigrate w80「副标题与编号同步」同病异治——
 本页两套口径是真并存而非断链：步条是向导 UI 五步，四阶段是作业内部 ES 侧流程，
 动态副标题会丢四阶段总览，故选低成本标注对应关系） -->
    <PageHeader :icon="Hammer" title="托管重建" subtitle="无 provider · 任意逻辑索引名 · 向导五步编排 · 作业内走 ES 四阶段：建新 → 全量 → 追平 → 切换" />
    <!-- P2：执行进度条（ind-bar 全站范式；preparing/validating/starting 三链任一在途即点亮，
 绝对定位零高度占位，读秒仍在钮面 既有形态零触） -->
    <div class="ar-progress ind-bar" :class="{ on: preparing || validating || starting }"></div>
    <div v-if="draftRestored" class="ar-draft-row">
      <DraftBadge @clear="clearDrafts" />
    </div>

    <!-- 步骤条 -->
    <div class="steps">
      <!-- F1：作业执行中（RUNNING，含停在 AWAIT_CONFIRM 挡写的时刻）时，执行监控 chip
 反向可点——从任意步骤一键回监控步。否则用户从监控步回看配置后就被困在
 前四步，AWAIT_CONFIRM 的阻断横幅（渲染在 step 4）也将永远看不见。 -->
      <div v-for="(s, i) in STEPS" :key="i" class="step"
           :class="{ act: step === i, done: step > i, locked: isTerminal, retmon: canReturnToMonitor(i) }"
           :title="canReturnToMonitor(i) ? '作业执行中——点此返回执行监控' : undefined"
           :role="stepInteractive(i) ? 'button' : undefined"
           :tabindex="stepInteractive(i) ? 0 : -1"
           :aria-current="step === i ? 'step' : undefined"
           :aria-disabled="isTerminal || undefined"
           @click="onStepChipClick(i)"
           @keydown.enter.prevent="onStepChipClick(i)"
           @keydown.space.prevent="onStepChipClick(i)">
        <span class="s-num">{{ i + 1 }}</span><span class="s-name">{{ s }}</span>
        <ChevronRight v-if="i < STEPS.length - 1" :size="13" class="s-arrow" />
      </div>
    </div>

    <!-- W3：运行中作业重挂提示（非阻断）——job 为内存态，刷新后 resumeScene 把
 step>3 钳回 3，运行中作业失联，唯一回路是下方最近作业表 Eye 钮。仅在 step0（首页）
 且最近作业存在 RUNNING 作业时出现；「回到监控」复用既有 watchJob（不自造轮询），
 切回监控步（step=4）后本条随条件隐没。既有 class/状态机分支零触碰（547 卡壳正锁与
 adhocStateMachine/adhocStepPersist 裁决锁兼容：本条是裁决之后数据面的纯新增显示）。 -->
    <div v-if="showReattachHint" class="ar-reattach-hint" data-test="adhoc-reattach-hint" role="status">
      <span>检测到运行中的重建作业 <span class="mono">{{ runningAdhocJob?.jobId }}</span>，可在下方最近作业中点详情回监控</span>
      <button class="btn ghost sm" data-test="adhoc-reattach-go" title="回到该作业的执行监控（与最近作业表「查看任务详情」同一链路）" @click="reattachToRunning"><Eye :size="12" /> 回到监控</button>
    </div>

    <!-- ① 选索引。结构序：索引名行上移到双 Tab 编辑器上方——先选索引再贴配置
 才是实际操作顺序（原序双 Tab 在前、索引名压底，与流程相反）。纯模板位移，
 状态机/草稿键零触碰（adhocStateMachine/adhocStepPersist 口径不变）。 -->
    <!-- P2：全局 .card 壳退役 → border-top 分节（ar-sec，Xmigrate 551 同刀；五步卡+最近作业卡六处同步） -->
    <div v-if="step === 0" class="ar-sec">
      <div class="card-t">选择要重建的逻辑索引名（别名或物理索引名均可）</div>
      <div ref="idxRowEl" class="row" :class="{ 'ar-highlight': highlightIdxInput }">
        <IndexPicker v-model="indexName" placeholder="如 bond_index（别名）或 bond_index_v1（物理索引）" width="100%" @picked="doPrepare" />
        <!-- 「用当前索引」一键回填：草稿与顶栏全局选中是两份状态（写类视图不开 useIdxState
 follow， 白名单口径），小钮把当前全局索引进草稿；有稿时钮仍在，点击显式覆盖。
 内联钮改用 PickCurrentIdxBtn 统一件（兑现；空索引不渲染、
 data-test/title 逐字锚由组件保真透传，回填语义归本消费方） -->
        <PickCurrentIdxBtn @pick="indexName = store.pickedIdx" />
        <button class="btn primary" :disabled="!indexName || preparing" @click="doPrepare">
          <Loader2 v-if="preparing" :size="13" class="spinning" /><Search v-else :size="13" /> 探测
        </button>
        <!-- 原始 IO 快查（评估分节）——最近一次探测/启动请求/响应原文 -->
        <button class="btn ghost sm" aria-label="查看原始 IO（探测评估）" title="最近一次托管重建接口调用的请求/响应原文" @click="openRawIo">
          <Terminal :size="13" />
        </button>
      </div>
      <!-- 探测失败内联错误条（对齐 ar-risk-err 范式）：toast 一闪即逝，prep=null 后这里曾是裸空白。
 私造错误壳合并全局 .err-bar + errPreHtml/errMeta 双参（XmigrateView :63
 同款：prepErrRaw 原始对象旁路，code/endpoint 徽标一眼可辨）。结构序锁
 `<div v-if="prepErr" class="ar-probe-err">` 随批于本注释——本条位置（先于双 Tab）
 即原锁锚位置，断言面待同步更新批换锚 -->
      <div v-if="prepErr" role="alert" class="err-bar rise-in ar-probe-err">
        <span v-html="errPreHtml('探测失败：' + prepErr, errMeta(prepErrRaw))"></span>
        <button class="btn ghost sm" :disabled="!indexName || preparing" @click="doPrepare">重试</button>
      </div>
<!-- w69:双 Tab 输入模式 — 两条路径并排可见,不再是隐藏的折叠 -->
      <div class="ar-input-tabs">
        <button type="button" :class="{ on: inputMode === 'paste' }" @click="inputMode = 'paste'"
          title="从业务应用复制的内容粘贴，自动解析 settings/mapping/字段清单">
粘贴业务侧 JSON
</button>
        <button type="button" :class="{ on: inputMode === 'manual' }" @click="inputMode = 'manual'"
          title="自己写 settings/mapping，不需要业务侧 JSON">
手动输入 settings / mapping
</button>
      </div>

      <!-- 路径 A:粘贴业务侧 JSON -->
      <div v-if="inputMode === 'paste'" class="ar-paste">
        <div class="ar-paste-hd">
          <ClipboardPaste :size="13" />
          <strong>粘贴期望配置</strong>
          <span class="hint">{{ isBrowserMode ? '浏览器模式：从服务端模式复制期望配置后粘贴到这里' : '业务应用 → desired-state.html → 「复制期望配置」→ 贴到这里' }}</span>
          <!-- 期望配置页外链钮（宿主 client 侧 DesiredStateController 自包含单页，
 与 api EP 同前缀 /internal/es/index）——此前只有文案，业务同事找不到入口。
 浏览器模式没有宿主静态页，禁用入口而不是让用户点开 404。 -->
          <button type="button" class="btn ghost xs" :disabled="!canDesiredState"
            :title="isBrowserMode ? '浏览器模式没有宿主期望配置静态页；请从服务端模式复制后粘贴' : (canDesiredState ? '' : '期望配置页需宿主或静态页授权——纯连接授权打开只会得到 403')" @click="openDesiredState"><ExternalLink :size="11" /> 打开期望配置页</button>
          <!-- 四档高度循环钮（ConfigValidatorView data-cv-issues-h 同款范式）——
 title 实时回显当前档，点击切下一档末档回首档，usePref 落盘 -->
          <button type="button" class="btn ghost xs" data-ar-paste-h :title="'粘贴区高度档：' + pasteH + '（点击循环）'" @click="cyclePasteH">高</button>
        </div>
        <MonacoEditor ref="pasteMcRef" v-model="pasteRaw" language="json" :height="pasteH" :dsl-assist="pasteAssist" @execute="applyPaste" /><!-- ：ref + @execute="applyPaste"（弹窗 JsonArea @submit 同语义先例——Ctrl+Enter 即解析；：height 定高字面升四档 :height="pasteH" 循环（默认档=原 min(60vh, 420px) 保底，见 PASTE_H_TIERS； min(200px,24vh)→视口弹性档、 W4 补 dsl-assist 的沿革不变）——不传 bodyKind（期望配置形态任意，挂 settings/mapping 档必误导）、不挂 lint；Ctrl+I 唤起补全经 pasteMcRef 宿主接线 -->
        <div class="ar-paste-act">
          <button class="btn primary" @click="applyPaste">解析并预填 <span class="kbd" style="margin-left:var(--sp-1)">Ctrl⏎</span></button>
          <span v-if="pasteErr" class="ar-paste-err">{{ pasteErr }}</span>
          <span v-else-if="pastePicked" class="ar-paste-ok">已预填：{{ pastePicked }}</span>
          <span v-if="pasteWarn" class="ar-paste-warn">{{ pasteWarn }}</span>
        </div>
        <div v-if="pasteList.length > 1" class="ar-paste-list">
          <button v-for="(r, i) in pasteList" :key="i" class="btn ghost sm"
                  :class="{ primary: pasteIdx === i }" @click="pickPaste(i)">
            {{ r.indexKey || r.alias || ('#' + i) }}
          </button>
        </div>
      </div>

      <!-- 路径 B:手动输入 -->
      <div v-if="inputMode === 'manual'" class="ar-manual">
        <div class="ar-manual-hd">
          <strong>直接写期望的 settings / mapping</strong>
          <span class="hint">知道索引该怎么配就怎么写，不需要业务侧 JSON</span>
          <!-- 拉取源配置——与审编步「粘贴导入」互补双入口（粘贴=外部期望，这里=源现状）：
 拉取优先吃向导步骤①已探测的源索引 settings/mapping（prep 快照，零网络），缺探测时
 现场 api.clusterInspect 补拉；显式用户动作 + askConfirm 确认覆盖后才写两框
 （挂载初值/自动链零触——adhocManualWorkbench426/draftGovernance 口径） -->
          <button type="button" class="btn ghost xs" data-ar-pull-src aria-label="拉取源配置"
            :disabled="pullingSrc || !canPullSrc"
            :title="canPullSrc ? '拉取源索引当前的 settings / mapping 覆盖下方两框（覆盖前需确认）' : '拉取源配置需索引、映射、搜索、配置校验或托管重建任一页读权限'" @click="pullSourceToManual">
            <Download :size="11" /> 拉取源配置
          </button>
          <!-- P1：编辑框高度档循环钮（形态抄本页 paste 档钮；与审编卡头钮同一落盘键 adhoc.edH） -->
          <button type="button" class="btn ghost xs" data-ar-ed-h :title="'编辑框高度档：' + edRows + ' 行（点击循环）'" @click="cycleEdRows">高</button>
        </div>
        <!-- 手动模式对照双栏接可调工作台（411 同款语义收口） -->
        <!-- fill-viewport=false 摘视口 min-height 兜底——向导「目标物理索引名/校验」行动行不被推出首屏（DslQueryView 先例），编辑区高度交 pane 内容自撑。
 P2 高度档接管：四 JsonArea 摘 fill 改 rows 驱动（adhoc.edH 档值 8/16/28/44，
 height=rows*19+16 纯内容函数确定解）——P0 时代的 fill 链整体退役（塌陷成因随之消失），
 pane 高度复归内容自撑，行动行留首屏裁决在低档位下依旧成立（ar-fill-wl 定高档退役） -->
        <WorkbenchLayout class="ar-fill-wl" :scope="arManualScope" :panes="AR_MANUAL_PANES" axis="vertical" mode="arManual" :fill-viewport="false">
          <template #pane-adhoc-manual-settings>
          <div class="ed-col">
            <div class="ar-manual-lb">
settings <span class="dim">索引设置</span>
              <!-- 已填/留空私造胶囊改用 StatusPill n 档（色档归 pill 单源） -->
              <StatusPill v-if="manualSettings.trim()" tone="n" label="✓ 已填" />
              <StatusPill v-else tone="n" label="留空 = 沿用源索引" />
            </div>
            <JsonArea ref="manualSetJaRef" v-model="manualSettings" :rows="edRows" :dsl-assist="arManualSettingsAssist" placeholder="{&quot;index&quot;:{&quot;number_of_shards&quot;:3}}" />
          </div>
          </template>
          <template #pane-adhoc-manual-mapping>
          <div class="ed-col">
            <div class="ar-manual-lb">
mapping <span class="dim">字段映射</span>
              <StatusPill v-if="manualMapping.trim()" tone="n" label="✓ 已填" />
              <StatusPill v-else tone="n" label="留空 = 沿用源索引" />
            </div>
            <JsonArea ref="manualMapJaRef" v-model="manualMapping" :rows="edRows" :dsl-assist="arManualMappingAssist" placeholder="{&quot;properties&quot;:{&quot;field_name&quot;:{&quot;type&quot;:&quot;keyword&quot;}}}" />
          </div>
          </template>
        </WorkbenchLayout>
        <!-- F2：索引名缺失的常驻红字（不只是 toast）——填上索引名即熄 -->
        <div v-if="needIndexForManual && !indexName" class="ar-paste-err ar-manual-idx-miss">← 还需要选一个索引名</div>
        <div class="ar-manual-act">
          <button class="btn primary" :disabled="!manualSettings.trim() && !manualMapping.trim()" @click="applyManual">应用并进入审编</button>
          <span v-if="!manualSettings.trim() && !manualMapping.trim()" class="hint">↑ 至少填一个</span>
        </div>
      </div>

      <template v-if="prep">
        <div class="probe">
          <div class="p-row">
<span>形态</span>
            <b v-if="prep.isAlias" class="ok-txt">别名（原子切换，零窗口 ✓）</b>
            <b v-else class="warn-txt">直连物理索引（切换=删旧+以旧名建别名，存在短暂读写窗口 ⚠）</b>
          </div>
          <div class="p-row" v-if="prep.isAlias">
<span>物理索引</span>
            <span class="mono">{{ (prep.physicals || []).join(', ') }}
              <!-- 索引芯片（xm-idx-go 同款）——直达索引工作区 -->
              <button v-for="ph in prep.physicals || []" :key="ph" class="ad-idx-go" :aria-label="'打开索引工作区：' + ph" title="打开索引工作区" @click="gotoIdx(ph)"><ExternalLink :size="11" /></button>
            </span>
</div>
          <div class="p-row">
<span>源（write）</span><span class="mono">{{ prep.sourcePhysical }}
            <button class="ad-idx-go" :aria-label="'打开索引工作区：' + prep.sourcePhysical" title="打开索引工作区" @click="gotoIdx(prep.sourcePhysical)"><ExternalLink :size="11" /></button>
          </span>
</div>
          <div class="p-row"><span>文档数</span><b>{{ fmtNum(prep.docCount) }}</b></div>
          <div class="p-row">
<span>时间字段候选</span>
            <!-- 候选串改可点 chip（点击预选为追平时间字段；选中态高亮）——
 此前纯文本 join('、') 只可读不可选，INCREMENTAL 用户得回下拉再选一遍 -->
            <span v-if="prep.timeFieldCandidates?.length" class="ar-tf-chips">
              <button v-for="c in prep.timeFieldCandidates" :key="c.field" type="button"
                class="chip mono ar-tf-chip" :class="{ on: timeField === c.field }"
                :title="'点击预选为追平时间字段：' + c.field + '(' + c.type + ')'"
                @click="timeField = c.field">{{ c.field }}({{ c.type }})</button>
            </span>
            <span v-else class="dim">无（INCREMENTAL 策略不可用）</span>
          </div>
        </div>
        <button v-if="!isTerminal" class="btn primary next" @click="step = 1">下一步：审阅 settings / mapping <ChevronRight :size="13" /></button>
      </template>
    </div>

    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y"
      :title="rowMenu.title" :items="rowMenuItems" @close="rowMenu = null" />

    <!-- ② 审编 settings/mapping -->
    <div v-if="step === 1" class="ar-sec">
      <!-- 粘贴导入入口——手里一串原始 JSON 直接识别拆填，不再手动分拆两侧 -->
      <div class="card-t">
新索引 settings / mapping（预填自源索引，可直接修改 —— 改分词/分片正是在这里）
        <button class="btn ghost sm" style="margin-left:auto" title="粘贴 Mapping 页复制的原始 JSON / GET _mapping / _settings 响应，自动识别拆填" @click="openPasteImport">
          <ClipboardPaste :size="12" /> 粘贴导入
        </button>
        <!-- 审编卡头原始 IO 钮——校验走 /config-lab/validate（不在 /adhoc-rebuild/
 记录特征下），openRawIo 取数扩 config-lab 回退链；判空 notify 口径归其既有单源 -->
        <button class="btn ghost sm" aria-label="查看原始 IO（审编校验）" title="最近一次校验（config-lab validate）或探测接口调用的请求/响应原文" @click="openRawIo">
          <Terminal :size="12" /> 原始 IO
        </button>
        <!-- P1：编辑框高度档循环钮（与手动模式 hd 钮同一落盘键 adhoc.edH） -->
        <button type="button" class="btn ghost sm" data-ar-ed-h :title="'编辑框高度档：' + edRows + ' 行（点击循环）'" @click="cycleEdRows"><UnfoldVertical :size="12" /> 高度</button>
      </div>
      <!-- stripDsl 预剔除结果常驻展示——toast 会消散，审编现场必须能随时看到「向导替你改了什么」 -->
      <div v-if="stripNote" class="strip-note">
        <ShieldAlert :size="13" style="flex-shrink:0" />
        <span>{{ stripNote }}</span>
      </div>
      <!-- settings/mapping 对照双栏接统一可调工作台（拖拽调宽，mapping 长文档拉宽直达） -->
      <!-- fill-viewport=false 摘视口 min-height 兜底（同上手动模式，行动行留首屏）； P2 同刀：rows 驱动高度档，ar-fill-wl 定高档退役 -->
      <WorkbenchLayout class="ar-fill-wl" :scope="arEdScope" :panes="AR_ED_PANES" axis="vertical" mode="arEditors" :fill-viewport="false">
        <template #pane-adhoc-settings>
        <div class="ed-col">
          <div class="ed-label">settings <span class="dim">索引设置</span></div>
          <JsonArea ref="setJaRef" v-model="settingsJson" :rows="edRows" :dsl-assist="arSettingsAssist" />
        </div>
        </template>
        <template #pane-adhoc-mapping>
        <div class="ed-col">
          <div class="ed-label">
mapping <span class="dim">字段映射</span>
            <!-- 注解推导私造胶囊改用 StatusPill b 档（ 来源标明语义走 title 同步更新） -->
            <StatusPill v-if="mappingFromDerived" tone="b" label="来自注解推导"
                  title="业务侧实体没有 @Mapping，这份来自 starter 对实体注解的推导（payload 的 derivedMappingJson），也是重建实际会应用的那份" />
          </div>
          <JsonArea ref="mapJaRef" v-model="mappingJson" :rows="edRows" :dsl-assist="arMappingAssist" />
        </div>
        </template>
      </WorkbenchLayout>
      <div class="row">
        <label class="lbl">目标物理索引名</label>
        <input v-model.trim="destIndex" class="ipt grow mono" :placeholder="prep?.suggestedDest" @keydown.enter="destIndexEnter" />
        <!-- 行尾「用建议名」一键回填（destNameErr 链零触——回填建议名后红字照常即时复评） -->
        <button v-if="prep?.suggestedDest" class="btn ghost xs" title="回填探测建议的目标索引名" @click="destIndex = prep.suggestedDest">用建议名</button>
      </div>
      <!-- sem-rm 智能纠错：目标物理索引名即时红字——非法字符/大写（同 Xmigrate idxNameProblem 口径）；
 目标=源物理名（直连模式）＝「切换即删源本身」的核武级配错，必须在启动前看见 -->
      <div v-if="destNameErr" role="alert" class="ar-dest-err">⚠ {{ destNameErr }}</div>

      <!-- 内嵌三层校验 —— 不过不放行（ERROR 阻断，WARN/INFO 提示） -->
      <div v-if="valReport" class="val-box">
        <div class="val-hd">
          <b :class="valReport.valid && valReport.dryRunPassed ? 'ok-txt' : 'err-txt'">
            {{ valReport.valid && valReport.dryRunPassed ? '✔ 校验通过（含 ES Dry-run 实测）' : '✘ 配置存在问题，修复后方可继续' }}
          </b>
          <span class="dim">{{ valReport.errorCount }} 错误 / {{ valReport.warnCount }} 警告 / {{ valReport.infoCount }} 建议 · <TookBadge :ms="valReport.elapsedMs" /><!-- ：裸 ms → TookBadge 四档语义徽标 --></span>
          <!-- w44:实测目标透出——Dry-run 打偏集群(如回落宿主)一眼可见,不再误判为配置问题 -->
          <span v-if="valReport.dryRunExecuted" class="dim" style="margin-left:var(--sp-2)">
            Dry-run 实测于：<b class="mono">{{ valReport.dryRunTargetName || valReport.dryRunTargetId || '宿主集群' }}</b>
          </span>
        </div>
        <div v-for="(iss, i) in valReport.issues" :key="i" class="val-iss">
          <!-- severity 裸枚举 → sevZh 中文主体 + 英文小字 en 档（ W10 的
 .pill+sevPill 手滚形态改用 StatusPill 统一件；tone 色档口径不变：err→r/warn→y/info→b） -->
          <StatusPill :tone="sevTone(iss.severity)" :label="sevZh(iss.severity)" :en="iss.severity" />
          <span class="mono dim">{{ iss.code }}</span>
          <span><span v-if="iss.path" class="mono val-path">{{ iss.path }}</span>{{ iss.message }}<span v-if="iss.suggestion" class="dim"> — {{ iss.suggestion }}</span></span>
        </div>
      </div>

      <div class="row">
        <button v-if="canValidate" class="btn ghost" :disabled="validating || !canValidate" title="校验需配置校验页或托管重建写权限" @click="doValidateConfig(false)">
          <Loader2 v-if="validating" :size="13" class="spinning" /><ShieldCheck v-else :size="13" /> 仅校验
        </button>
        <button v-if="canValidate" class="btn primary" :disabled="validating || !canValidate" title="校验需配置校验页或托管重建写权限" @click="doValidateConfig(true)">
          <Loader2 v-if="validating" :size="13" class="spinning" /><ChevronRight v-else :size="13" /> {{ validating ? '校验中 ' + valSecs + 's' : '校验并继续：选择追平策略' }}
        </button>
      </div>
    </div>

    <!-- ③ 选策略 -->
    <div v-if="step === 2" class="ar-sec">
      <div class="card-t">追平策略（全量 reindex 期间业务持续写入旧索引，如何补齐这段增量？）</div>
      <div class="strats">
        <label class="strat" :class="{ sel: strategy === 'INCREMENTAL', dis: !prep?.timeFieldCandidates?.length }">
          <input type="radio" value="INCREMENTAL" v-model="strategy" :disabled="!prep?.timeFieldCandidates?.length" />
          <div><strong>A · 增量追平（推荐）</strong>
            <p>业务不停写。按时间字段做 ≤3 轮 range reindex 收敛 → 切换 → 切换后终追一轮兜底。要求文档带更新时间字段。</p>
          </div>
        </label>
        <label class="strat" :class="{ sel: strategy === 'WRITE_BLOCK' }">
          <input type="radio" value="WRITE_BLOCK" v-model="strategy" />
          <div><strong>B · 写阻断窗口</strong>
            <p>阻断旧索引写入（业务写请求短暂失败）→ 追平/全量 → 切换。绝对一致，适合可容忍秒~分钟级写失败的低峰操作。</p>
          </div>
        </label>
        <label class="strat" :class="{ sel: strategy === 'MANUAL' }">
          <input type="radio" value="MANUAL" v-model="strategy" />
          <div><strong>C · 直切 + 回补报告</strong>
            <p>全量后直接切换，不自动追平。产出 T0~切换点差异报告与建议回补 DSL，由你人工回补。</p>
          </div>
        </label>
      </div>
      <div class="row" v-if="strategy !== 'MANUAL' || prep?.timeFieldCandidates?.length">
        <label class="lbl">时间字段</label>
        <select v-model="timeField" class="ipt sel">
          <option value="">（不指定{{ strategy === 'INCREMENTAL' ? ' —— INCREMENTAL 必填' : '' }}）</option>
          <option v-for="c in prep?.timeFieldCandidates || []" :key="c.field" :value="c.field">{{ c.field }} ({{ c.type }})</option>
        </select>
        <label class="lbl">追平缓冲（ms）</label>
        <input v-model.number="bufferMs" type="number" min="0" class="ipt num" @blur="clampBufferMs" @keydown.enter="strategyNextEnter" />
      </div>
      <!-- +1：INCREMENTAL 必选时间字段的常驻红字（对齐 needIndexForManual 形态：
 选上即熄）——此前只靠「下一步」钮禁用，用户不知道被什么拦住 -->
      <div v-if="strategy === 'INCREMENTAL' && !timeField" class="ar-paste-err ar-manual-idx-miss">← 增量追平必须指定时间字段：按它做 range reindex 收敛增量；候选为空说明索引无时间字段，请改用写阻断或直切策略</div>
      <label class="chk"><input type="checkbox" v-model="deleteOldIndex" /> 切换成功后删除旧物理索引（默认保留只读，验证无误后再手动清理更稳妥）</label>
      <!-- 切换前人工确认门。开启后作业会停在 AWAIT_CONFIRM 等人放行 -->
      <label class="chk"><input type="checkbox" v-model="pauseBeforeSwitch" /> 切换前等待人工确认（作业停在 AWAIT_CONFIRM，确认后才翻别名）</label>

      <!-- / spec 无 timeField 时 WRITE_BLOCK 会全程挡写（AdhocRebuildService:235 earlyBlock），
 窗口不是「一轮追平」而是「全量 reindex 全程」，大索引可能几十分钟。必须让人看见再决定。 -->
      <div v-if="needAckFullBlock" class="ar-warn-window">
        <TriangleAlert :size="13" />
        <b>该索引未指定时间字段 —— 业务写入将在整个重建期间被阻断</b>
        <span>
          源索引约 {{ prep?.docCount ?? '—' }} 条，全量 reindex 全程挡写；
          指定一个时间字段可把窗口缩短到「一轮追平」的量级。
        </span>
        <label class="ar-warn-ack">
          <input type="checkbox" v-model="ackFullBlock" /> 我已知悉并接受全程挡写
        </label>
      </div>

      <!-- 期望（粘贴来的）vs 实际（ES 读回）字段级比对。
 P2：分节标题升 .sec-t 档（行首横排 fs-sm/600/tx1，选择器限 .ar-diff/.report 两区） -->
      <div v-if="cfgDiff.length" class="ar-diff">
        <div class="ed-label sec-t">
          期望 vs 实际（mapping）
          <span class="dim sm-txt">
            期望有实际没有 {{ cfgSum.added }} · 实际有期望没有 {{ cfgSum.removed }} ·
            值不同 {{ cfgSum.changed }} · 一致 {{ cfgSum.same }} ·
            已忽略 {{ cfgSum.ignored }} · 撞车 {{ cfgSum.conflict }}
          </span>
        </div>
        <table class="tbl">
          <thead><tr><th>路径</th><th>类别</th><th>期望</th><th>实际</th><th>说明</th></tr></thead>
          <tbody>
            <!-- kind 是 已评审的契约不动，但界面不显示 raw kind：
 added/removed 对使用者天然歧义，必须给人话标签。
 -9 / I-4：标签与提示已提成纯函数并由断言看守，模板只做调用。 -->
            <!-- 真差异区始终展开。 -->
            <tr v-for="row in cfgParts.real" :key="'r-' + row.path" class="cd-real" :class="'cd-' + row.kind" tabindex="0"
              @contextmenu.prevent="openDiffMenu($event, row)" @keydown="onDiffMenuKey($event, row)" data-row-nav @keydown.self="rowArrowNav">
              <td class="cd-path mono">{{ row.path }}</td>
              <td class="cd-kind">{{ kindLabel(row.kind) }}</td>
              <td class="cd-l mono">{{ fmtVal(row.expected) }}</td>
              <td class="cd-r mono">{{ fmtVal(row.actual) }}</td>
              <td class="cd-note">
                <span v-if="kindNote(row)" class="cd-hint">{{ kindNote(row) }}</span>
              </td>
            </tr>
            <!-- 等价噪声折叠条，默认收起。：键盘可达（role/tabindex/Enter） -->
            <tr v-if="cfgParts.benign.length" class="cd-benign-toggle" role="button" tabindex="0" :aria-label="benignOpen ? '收起无风险变更' : '展开无风险变更'" @click="benignOpen = !benignOpen" @keydown.enter.prevent="benignOpen = !benignOpen" @keydown.space.prevent="benignOpen = !benignOpen">
              <td :colspan="5">{{ cfgParts.benign.length }} 项已知等价默认值（点击展开）</td>
            </tr>
            <!-- 噪声区，仅在展开时进入 DOM。 -->
            <template v-if="benignOpen">
              <tr v-for="row in cfgParts.benign" :key="'b-' + row.path" class="cd-benign" :class="'cd-' + row.kind">
                <td class="cd-path mono">{{ row.path }}</td>
                <td class="cd-kind">{{ kindLabel(row.kind) }}</td>
                <td class="cd-l mono">{{ fmtVal(row.expected) }}</td>
                <td class="cd-r mono">{{ fmtVal(row.actual) }}</td>
                <td class="cd-note">
                  <span v-if="kindNote(row)" class="cd-hint">{{ kindNote(row) }}</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- / ：date 兼容风险报告。与 configDiff 同屏（spec ）。
 +1：源/目标类型对比行（destTypeRisks）并轨同一区块展示
 （mergeRiskRows 已按档位/字段排序，error 前置）。 -->
      <div v-if="displayRiskRows.length || riskErr || riskBusy" class="ar-risk">
        <div class="ar-risk-hd">
          <ShieldAlert :size="13" />
          <b>date 兼容风险</b>
          <span v-if="destTypeRisks.length" class="hint">另有源/目标 mapping 对比 {{ destTypeRisks.length }} 项</span>
          <span class="hint">
            <template v-if="riskBusy">正在采样…</template>
            <template v-else>
              <!-- 修订四：取样口径必须露出来。一份不说明自己怎么取样的报告，
 读者会默认它是随机的 —— 这次恰好对，下次不一定对。 -->
              基于 {{ sampledCount }} 条样本<template v-if="samplingMode">（取样方式：{{ samplingMode }}）</template>
              —— 结论只表示「这 {{ sampledCount }} 条中未发现」，不代表全量无风险
            </template>
          </span>
        </div>
        <div v-if="riskErr" class="ar-risk-err">{{ riskErr }}</div>
        <div v-for="(r, i) in displayRiskRows" :key="i" class="ar-risk-row" :class="r.level">
          <!-- level 裸英文 → sevZh 中文（warning 别名同步补齐）；row class 保留原
 枚举供 ar-risk 档着色；'ok' 全清行 sevZh 回落「建议」失真，单独给「无风险」 -->
          <span class="ar-risk-lv">{{ r.level === 'ok' ? '无风险' : sevZh(r.level) }}</span>
          <code>{{ r.field || '（全索引）' }}</code>
          <span class="ar-risk-code">{{ r.code }}</span>
          <span class="ar-risk-reason">{{ r.reason }}</span>
          <pre v-if="r.fix" class="ar-risk-fix">{{ r.fix }}</pre>
        </div>
      </div>

      <button v-if="!isTerminal" class="btn primary next" :disabled="(strategy === 'INCREMENTAL' && !timeField) || !canStart" @click="step = 3">下一步：确认预览 <ChevronRight :size="13" /></button>
    </div>

    <!-- ④ 确认预览 -->
    <div v-if="step === 3" class="ar-sec">
      <div class="card-t">执行预览
        <!-- 原始 IO 快查（执行分节）——与探测评估共用 /adhoc-rebuild/ 记录环特征 -->
        <button class="btn ghost sm" style="margin-left:auto" aria-label="查看原始 IO（托管重建）" title="最近一次托管重建接口调用的请求/响应原文" @click="openRawIo">
          <Terminal :size="12" />
        </button>
      </div>
      <div class="probe">
        <div class="p-row"><span>逻辑名</span><span class="mono">{{ indexName }}</span></div>
        <div class="p-row"><span>源 → 目标</span><span class="mono">{{ prep?.sourcePhysical }} → {{ destIndex || prep?.suggestedDest }}</span></div>
        <div class="p-row"><span>策略</span><b>{{ strategyLabel }}</b></div>
        <div class="p-row" v-if="timeField"><span>时间字段</span><span class="mono">{{ timeField }}（缓冲 {{ bufferMs }}ms）</span></div>
        <div class="p-row">
<span>切换方式</span>
          <span v-if="prep?.isAlias">别名 write-index 原子切换（零窗口）</span>
          <span v-else class="warn-txt">删除旧索引 → 以旧名建别名（短暂读写失败窗口）</span>
        </div>
        <!-- w80：确认门状态上屏——刷新续场后是否仍停在 AWAIT_CONFIRM，启动前必须可见 -->
        <div class="p-row" data-test="pv-confirm-gate"><span>切换确认</span><span>{{ pauseBeforeSwitch ? '人工（作业停在 AWAIT_CONFIRM，确认后才翻别名）' : '自动' }}</span></div>
        <div class="p-row"><span>旧索引处置</span><span :class="{ 'err-txt': deleteOldIndex }">{{ deleteOldIndex ? '切换后删除' : '保留只读（加写阻塞）' }}</span></div>
      </div>
      <label v-if="!prep?.isAlias" class="chk warn-txt">
        <input type="checkbox" v-model="confirmDirectSwap" /> 我已知悉直连模式切换存在短暂读写窗口，确认执行
      </label>
      <div v-if="!isTerminal" class="row">
        <button class="btn ghost" @click="step = 2"><ChevronLeft :size="13" /> 上一步</button>
        <!-- -9 / I-1：canStart 一并接到**执行按钮**上。步骤条只允许回退、
 doValidateConfig 只从 1→2，故这是防御深度而非补漏；但「知悉全程挡写」
 这个门本就该守在真正扣扳机的地方，而不只是守在翻页处。 -->
        <button v-if="canOps" class="btn primary" :disabled="starting || (!prep?.isAlias && !confirmDirectSwap) || !canStart" @click="doStart">
          <Loader2 v-if="starting" :size="13" class="spinning" /><Play v-else :size="13" /> {{ starting ? '启动中 ' + startSecs + 's' : '启动托管重建' }}
        </button>
        <span v-else class="dim" style="font-size: var(--fs-xs)">发起重建需 REBUILD_OP/ADMIN 角色</span>
      </div>
    </div>

    <!-- ⑤ 执行监控 -->
    <div v-if="step === 4" class="ar-sec">
      <div class="card-t">
执行监控
        <StatusPill v-if="job" class="ar-st-en" :tone="statusTone(job.status)" :label="jobStatusZh(job.status) || String(job.status)" :en="jobStatusZh(job.status) ? job.status : undefined" /><!-- ：手滚 pill 改用 StatusPill（en 英文小字组件化；.ar-st-en 锚类外挂保留——小字视觉由组件 sp-en 承担；起轮次徽标小字亦归组件，本页不再自携小字样式） --><!-- ：状态枚举加中文名（esEnumZh.jobStatusZh 收口；英文枚举小字保留在后，XmigrateView 同范式；数据/条件行不动） -->
        <span v-if="job" class="dim sm-txt">阶段：<StatusPill class="sm" :tone="stagePill(job.stage)" :label="stageZh(job.stage) || String(job.stage)" :en="stageZh(job.stage) ? job.stage : undefined" /></span><!-- ：stage 裸枚举 → stageZh 中文 + 英文小字（Lead 十 stage 契约接线；w80：stage 裸串→pill 徽标同谱系） -->
        <!-- 锁安全徽标（后端 toMap 透出 gateOutcome/lockActive/switchedWithoutLock，
 此前前端不显=锁保护盲区：lock.enabled=false 与锁正常工作在界面上无法区分）。
 switchedWithoutLock=true（无锁切换，数据一致性风险）最重，与 lockActive=false 互斥显
 （切换已发生时锁是否在保护已无意义）；gateOutcome 非 CONFIRMED（TIMED_OUT 超时自动
 解除阻断 / ABORTED 人工中止）=门结局非人工确认放行。数据/条件行零改动，纯加显。 -->
        <StatusPill v-if="job && job.switchedWithoutLock" tone="r" label="无锁切换" title="失锁后仍执行了别名切换——另一实例可能在切换窗口内继续写源索引，数据一致性需人工核对" />
        <StatusPill v-else-if="job && job.lockActive === false" tone="y" label="锁保护未生效" title="分布式锁未生效（lock.enabled=false 或未抢到锁）——本次重建没有跨实例互斥保护，请确认没有其他实例在同时重建同一索引" />
        <StatusPill v-if="job && job.gateOutcome === 'TIMED_OUT'" tone="y" label="确认超时" title="确认门超时：超时方赢得竞争，写阻断已自动解除、别名切换未执行" />
        <StatusPill v-else-if="job && job.gateOutcome === 'ABORTED'" tone="n" label="门已中止" title="确认门以人工中止告终——写阻断已解除、别名切换未执行" />
        <!-- 监控步行尾原始 IO 钮（423 执行分节先例同形）——询现场
 （/adhoc-rebuild/ 记录环）此前在 step4 无取数入口；中止钮在场时其 .right
 margin-left:auto 独占行尾推进，本钮不叠加 auto（防双 auto 平分剩余空间挤移中止钮），
 非 RUNNING（中止钮缺席）时本钮自持 margin-left:auto 补行尾位 -->
        <button class="btn ghost sm" :style="(canOps && job?.status === 'RUNNING') ? '' : 'margin-left:auto'" aria-label="查看原始 IO（监控轮询）" title="最近一次托管重建接口调用的请求/响应原文（含监控轮询现场）" @click="openRawIo"><Terminal :size="12" /></button>
        <button v-if="canMutateJob && job?.status === 'RUNNING'" class="btn ghost sm danger right" title="中止作业：删除半成品新索引、回滚到原索引，已迁移的数据丢弃" :disabled="aborting" @click="doAbort"><CircleStop :size="12" /> 中止</button>
      </div>
      <template v-if="job">
        <!-- 等待人工确认。此刻 WRITE_BLOCK 已在挡写，业务写入持续失败，必须醒目。 -->
        <div v-if="job.stage === 'AWAIT_CONFIRM'" class="ar-await">
          <TriangleAlert :size="14" />
          <b>业务写入正在被阻断</b>
          <span>已阻断 {{ blockedSec }} 秒 —— 请尽快「确认切换」或「中止」</span>
          <button v-if="canMutateJob" class="btn primary sm" :disabled="confirming" @click="doConfirmSwitch">确认切换</button>
          <button v-if="canMutateJob" class="btn ghost sm danger" :disabled="aborting" @click="doAbort">中止并解除阻断</button>
          <span v-if="!canOps" class="dim" style="font-size: var(--fs-xs)">切换/中止需 REBUILD_OP/ADMIN 角色——请联系对应角色处置，勿自行尝试</span>
          <span v-else-if="!canMutateJob && jobOwner" class="dim" style="font-size: var(--fs-xs)">作业由 <b class="mono">{{ jobOwner }}</b> 创建：切换/中止仅创建者本人或 ADMIN 可操作；同连接成员可查看进度与报告</span>
        </div>
        <div class="probe">
          <div class="p-row"><span>作业</span><span class="mono cpy" :title="'点击复制 jobId：' + job.jobId" tabindex="0" role="button" @keydown.enter.prevent="copyJobId(job.jobId)" @keydown.space.prevent="copyJobId(job.jobId)" @click="copyJobId(job.jobId)">{{ job.jobId }}</span></div>
          <div class="p-row">
<span>{{ job.sourcePhysical }} → {{ job.destPhysical }}</span>
            <span class="dim">源 {{ job.sourceDocCount != null ? fmtNum(job.sourceDocCount) : '-' }} 条 / 目标 {{ job.destDocCount != null ? fmtNum(job.destDocCount) : '…' }} 条</span>
          </div>
          <div class="p-row" v-if="job.currentProgress">
            <span>全量进度</span>
            <span class="mono" style="flex:1;display:flex;align-items:center;gap:var(--sp-2)">
              <span style="flex:1;height:4px;background:var(--bg2);border-radius:2px;overflow:hidden;display:inline-block">
                <i :style="{ display:'block', height:'100%', width: reindexPct(job) + '%', background:'linear-gradient(90deg, var(--ok), var(--warn))', transition:'width 300ms' }"></i>
              </span>
              <span>{{ fmtNum(job.currentProgress.created) }} / {{ fmtNum(job.currentProgress.total) }}</span>
              <span class="dim">{{ reindexPct(job) }}%</span>
            </span>
          </div>
          <!-- J1 配套：/status 顶层 docs 级进度三字段（total/created/updated，
 Java AdhocRebuildJobProgressTest 契约：awaitTask 轮询 ReindexProgress 单源刷新、
 终态保留末次采样）行内小字消费——currentProgress 兼容路径之外的第二通道，
 追平轮间隙/终态也可见末次计数；字段缺省（旧后端/未进入 reindex 阶段）整行
 不渲染 = 零增量向后兼容（不冒充 0） -->
          <div class="p-row" v-if="job.total != null && job.created != null" data-test="adhoc-docs-progress">
            <span>已写</span>
            <span class="mono">{{ fmtNum(job.created) }} / {{ fmtNum(job.total) }}<template v-if="job.updated != null">（更新 {{ fmtNum(job.updated) }}）</template></span>
          </div>
          <!-- W3：速率观测行（XmigrateView rateOf 范式移植，Xm 文件零触碰）——
 Σcreated 对询相邻两次采样的时间差分出 docs/s（差分 ≤0 不出，不冒充速率）；
 已耗时随既有轮询刷新（终态取后端 tookMs），零新增定时器。轮次表零触碰（有锁）。 -->
          <div class="p-row" v-if="job.currentProgress" data-test="adhoc-rate">
            <span>速率观测</span>
            <span class="dim">
              <template v-if="reindexRate != null"><span class="mono">{{ fmtNum(reindexRate) }} docs/s</span> · </template>
              <template v-if="jobElapsedMs != null">已耗时 <TookBadge :ms="jobElapsedMs" title="自作业启动起的已耗时（随监控轮询刷新；终态取后端 tookMs 收尾值）" /></template>
              <template v-else>已耗时 —</template>
              <!-- P2：预计剩余 ETA——速率缺失/非正、余量非正不渲染（不冒充） -->
              <template v-if="reindexEtaMs != null"> · 预计剩余 <TookBadge :ms="reindexEtaMs" title="预计剩余 =（total − created − updated）/ 速率（估算值，随监控轮询采样刷新；速率缺失时不显示）" /></template>
            </span>
          </div>
          <div class="p-row" v-if="job.error"><span>错误</span><span class="err-txt">{{ job.error }}</span></div>
        </div>
        <table class="tbl ar-rounds" v-if="job.rounds?.length">
          <thead><tr><th>轮次</th><th>阶段</th><th>总计</th><th>已建</th><th>已更新</th><th>冲突跳过</th></tr></thead>
          <tbody>
            <tr v-for="r in job.rounds" :key="r.round + r.phase" tabindex="0"
              @contextmenu.prevent="openRoundMenu($event, r)" @keydown="onRoundMenuKey($event, r)" data-row-nav @keydown.self="rowArrowNav">
              <td>{{ r.round }}</td><td><StatusPill tone="b" :label="roundZh(r.phase) || r.phase" :en="roundZh(r.phase) ? r.phase : undefined" /></td><!-- ：r.phase 裸枚举 → roundZh 中文接线（Lead 收口实地核 addRound 四值 FULL/CATCHUP/CATCHUP_BLOCKED/FINAL 全收录）。：轮次阶段私造胶囊改用 StatusPill b 档——未收录新枚举回退原英文（label 兜底），en 英文小字归组件 sp-en -->
              <td>{{ r.total != null ? fmtNum(r.total) : '-' }}</td><td>{{ r.created != null ? fmtNum(r.created) : '-' }}</td><td>{{ r.updated != null ? fmtNum(r.updated) : '-' }}</td><td>{{ r.versionConflicts != null ? fmtNum(r.versionConflicts) : '-' }}</td>
            </tr>
          </tbody>
          <!-- W1：Σ 聚合行（DiagView/HealthReportView 523 聚合行同语言：bg2 底+顶部分隔线，
 数值右对齐）——追平收敛一眼判读：Σcreated+Σupdated 应趋近 Σtotal；ΣversionConflicts
 高涨=全量期间源仍在被写（增量策略下的正常现象，写阻断策略下应恒 0） -->
          <tfoot class="ar-rounds-agg">
            <tr class="ar-rounds-agg-row">
              <td class="mono ar-agg-lb" aria-hidden="true">Σ</td>
              <td></td>
              <td></td>
              <td class="ar-rounds-agg-num">Σ {{ roundSum('created') }}</td>
              <td class="ar-rounds-agg-num">Σ {{ roundSum('updated') }}</td>
              <td class="ar-rounds-agg-num">Σ {{ roundSum('versionConflicts') }}</td>
            </tr>
          </tfoot>
        </table>
        <div v-if="job.report" class="report">
          <div class="ed-label sec-t">收尾报告
            <!-- 回补 DSL 一键复制（RawIoModal copyReq 三行手法；直切策略人工回补高频） -->
            <button v-if="job.report.suggestedBackfillDsl" class="btn ghost xs" title="复制建议回补 DSL" @click="copyBackfillDsl">
              <Copy :size="11" /> 复制回补 DSL
            </button>
          </div>
          <div class="p-row" v-if="job.report.hint"><span class="dim">{{ job.report.hint }}</span></div>
          <pre v-if="job.report.suggestedBackfillDsl" class="mono dsl" v-html="backfillHtml"></pre><!-- ：裸 pre → highlightJson 高亮（先 pretty，输出已转义） -->
        </div>
        <!-- w80：SUCCEEDED 后「去查询验证」常驻钮——此前只挂在确认切换 toast 的 action 上（12s 即逝），
 错过就得手动找索引。目标优先作业回传，回落向导内 destIndex/建议名（深链同 doConfirmSwitch 的 toast action） -->
        <button v-if="job.status === 'SUCCEEDED'" class="btn primary next" data-test="go-verify"
                :title="'在查询工作台打开「' + (verifiedTarget || '目标索引') + '」验证数据'"
                @click="goVerifyFromJob"><Search :size="13" /> 去查询验证</button>
        <button v-if="job.status !== 'RUNNING'" class="btn ghost next" @click="reset"><RotateCcw :size="13" /> 再来一次</button>
      </template>
    </div>

    <!-- 最近作业 -->
    <!-- W1：工具行 kw 过滤（jobId/逻辑名/状态，命中 MarkText 高亮）+
 状态 pill 漏斗（点状态只看该状态，再点取消）+ matrixText TSV/MD 复制（锚在 524 spec）。
 W-B：裸表换 QRT rows 型（525 W5 HealthReport/SqlBridge 同判据）——表头排序/
 列选/列宽记忆/单元格右键菜单/导出四格式（CSV/MD/XLSX/PNG）/按值类型徽标/tfoot 聚合行
 归内核白得；过滤职责仍在宿主（kw+状态漏斗算好 visibleJobs 单一行集喂 :rows，
 所见即所复，与 TSV/MD 导出同一行集）。cell 形态迁 #cell-<col> 作用域槽：jobId 复制芯片/
 MarkText 命中高亮/状态 pill 漏斗/stage pill/TimeCell；行操作迁 #row-actions。
 形态同步更新不回退：状态 cell 接 jobStatusZh 中文+英文小字（.ar-st-en，监控步
 同范式）；锁安全徽标（switchedWithoutLock 红 / lockActive 黄 / gateOutcome 徽）——
 后端 toMap 对 jobs 列表行同样透出三字段（AdhocRebuildJob.toMap），监控步同语义。 -->
    <div class="ar-sec" v-if="allJobs.length">
      <div class="card-t">
<History :size="14" /> 最近作业
        <!-- 导出两钮恒在场 disabled 联动过滤行集（exportEmptyGuard936 口径：无数据 disabled 而非 v-if 消失；
     过滤筛零行时按钮保持座位，铁律 B 位置恒定）。导出函数内空集另有 warning 报真兜底。 -->
        <button class="btn ghost sm" style="margin-left:auto" :disabled="!visibleJobs.length" @click="exportJobsMatrix('md')" title="复制当前视图为 Markdown 表（群聊/工单直贴）"><ClipboardList :size="12" /> Markdown</button>
        <button class="btn ghost sm" :disabled="!visibleJobs.length" @click="exportJobsMatrix('tsv')" title="复制当前视图为 TSV（Excel 可直接粘贴）"><ClipboardCopy :size="12" /> 导出 TSV</button>
        <button aria-label="刷新任务列表" class="btn ghost sm" :disabled="jobsLoading" @click="loadJobs" title="刷新任务列表"><RefreshCw :size="12" :class="{ spinning: jobsLoading }" /></button>
      </div>
      <div class="ar-jobs-tools">
        <!-- kw 过滤改用 SearchFilterBar 统一件（559 TasksView tv-kw 先例；placeholder 逐字保留，
 Esc 清空/Enter 语义内建；ar-jobs-kw 类锚随 input-class 保留在 input 上——524/529 挂载过滤锁同路径零迁，
 落位宽度随改用迁 wrap 根） -->
        <SearchFilterBar v-model="jobKw" class="ar-jobs-kw-wrap" input-class="ar-jobs-kw" placeholder="过滤：jobId / 逻辑名 / 状态" />
        <button v-if="jobKw || jobStatusFilter" class="btn ghost xs" @click="clearJobFilters" title="清除过滤条件，恢复完整清单">清除过滤</button>
        <span v-if="jobKw || jobStatusFilter" class="dim ar-jobs-hit">{{ visibleJobs.length }}/{{ allJobs.length }} 条命中</span>
      </div>
      <QueryResultTable :cols="JOB_COLS" :rows="jobsMatrix" sortable
        storage-key="adhoc:jobs" max-height="none" :loading="jobsLoading" export-name="adhoc-jobs"
        :empty-text="jobsEmptyText" empty-hint="点上方「清除过滤」恢复完整清单">
        <template #cell-jobId="{ row }">
          <span class="mono cpy" :title="'点击复制 jobId：' + row[0]" tabindex="0" role="button"
                @keydown.enter.prevent="copyJobId(String(row[0] ?? ''))" @keydown.space.prevent="copyJobId(String(row[0] ?? ''))" @click.stop="copyJobId(String(row[0] ?? ''))"><MarkText :text="row[0]" :kw="jobKw" /></span>
        </template>
        <template #cell-logicalName="{ row }"><span class="mono"><MarkText :text="row[1]" :kw="jobKw" /></span></template>
        <template #cell-status="{ row }">
          <!-- W1：状态 pill 兼作漏斗——点击只看该状态（aria-pressed 表达按下态），再点取消。
 改用 StatusPill：role/tabindex/aria-pressed/键盘经 attrs 落根（单根透传），
 锚类 ar-st-funnel/ar-st-en 外挂保留；中文主体+英文小字 en 档组件化（MarkText 两处随装
 退役——英文枚举不再吃过滤词高亮，524 spec 同步改锚） -->
          <StatusPill class="ar-st-funnel ar-st-en" :tone="statusTone(row[3])"
                :label="jobStatusZh(String(row[3] ?? '')) || String(row[3] ?? '')"
                :en="jobStatusZh(String(row[3] ?? '')) ? String(row[3] ?? '') : undefined"
                role="button" tabindex="0"
                :aria-pressed="jobStatusFilter === funnelKey(row[3]) ? 'true' : 'false'"
                :title="'点击只看状态 ' + row[3] + '（再点取消）'"
                @keydown.enter.prevent="toggleJobStatusFilter(row[3])" @keydown.space.prevent="toggleJobStatusFilter(row[3])" @click.stop="toggleJobStatusFilter(row[3])" />
          <StatusPill v-if="jobOf(row).switchedWithoutLock" tone="r" label="无锁切换" title="失锁后仍执行了别名切换——另一实例可能在切换窗口内继续写源索引，数据一致性需人工核对" />
          <StatusPill v-else-if="jobOf(row).lockActive === false" tone="y" label="锁保护未生效" title="分布式锁未生效（lock.enabled=false 或未抢到锁）——本次重建没有跨实例互斥保护，请确认没有其他实例在同时重建同一索引" />
          <StatusPill v-if="jobOf(row).gateOutcome === 'TIMED_OUT'" tone="y" label="确认超时" title="确认门超时：超时方赢得竞争，写阻断已自动解除、别名切换未执行" />
          <StatusPill v-else-if="jobOf(row).gateOutcome === 'ABORTED'" tone="n" label="门已中止" title="确认门以人工中止告终——写阻断已解除、别名切换未执行" />
        </template>
        <template #cell-stage="{ row }"><StatusPill class="sm" :tone="stagePill(row[4])" :label="stageZh(row[4]) || String(row[4] ?? '')" :en="stageZh(row[4]) ? String(row[4] ?? '') : undefined" /></template><!-- ：stage 裸串 → stageZh 中文 + 英文小字徽标（监控步同范式；w80：stage 裸串→pill 徽标同谱系） -->
        <template #cell-startedAt="{ row }"><TimeCell :ts="row[5]" /></template>
        <template #cell-tookMs="{ row }"><!-- ：作业耗时徽标（TookBadge 四档语义；后端 AdhocRebuildJob.toMap tookMs=finishedAt-startedAt，运行中约定 -1、字段缺席 null——两者都不冒充 0，走 '—' 档；null 直判防 Number(null)=0 误显 0ms） --><TookBadge v-if="row[6] != null && Number(row[6]) >= 0" :ms="Number(row[6])" title="作业总耗时（启动 → 收尾）" /><span v-else class="dim">—</span></template>
        <template #row-actions="{ row }">
          <button aria-label="查看任务详情" class="btn ghost sm" @click.stop="watchJob(String(row[0] ?? ''))" title="查看任务详情"><Eye :size="12" /></button>
        </template>
      </QueryResultTable>
    </div>

    <!-- 粘贴导入——原始 JSON 一手进，识别只拆壳不改值（校准铁律）。
 与 Mapping 页「原始 JSON → 复制全部」形成跨页闭环：复制 → 跳托管重建 → 粘贴 → 秒拆双框 -->
    <n-modal v-model:show="pasteImportOpen" preset="card"
             title="粘贴导入 — 识别并拆填 settings / mapping" style="width:680px;max-width:94vw" :bordered="false">
      <div class="pi-hint">
        支持识别：Mapping 页「原始 JSON」复制的完整配置 · GET _mapping / _settings 响应（自动剥索引名外壳）·
        纯 mapping / settings 片段。只拆壳、不改值，与粘贴原文严格一致。贴入后
        <b>Ctrl+Enter</b>（或点下方按钮）解析并填入。
      </div>
      <!-- 裸 textarea 合并 JsonArea——与审编框同一编辑内核（JSON 高亮/合法性圆点/
 格式化·压缩·复制工具条），粘贴导入现场获得同款校验反馈。Ctrl+Enter 走 MonacoEditor
 既有 es-execute action → JsonArea submit 事件 → doPasteImport，与原
 @keydown.enter.ctrl.prevent 行为等价；Esc 关弹窗由 NModal 自身 closeOnEsc 承接
 （footer「取消」同路）。placeholder prop 为 JsonArea 签名保留项（Monaco 无占位渲染），
 操作引导文案由上方 pi-hint 承担。 -->
      <!-- W10：JsonArea rows 定高退役 → fill + 弹性 wrapper（min(60vh, 600px)：
 大屏随视口撑高粘贴区、≥1000px 视口 600px 封顶；小窗按 60vh 收缩不撑破弹窗）。
 定高字面升 adhoc.piH 四档（useTierCycle，首位=原值零漂移），档位钮在弹窗 footer -->
      <div class="pi-ja-wrap" :style="{ height: piH }">
        <JsonArea
          ref="pasteJaEl" v-model="pasteImportText" fill
          placeholder="在此 Ctrl+V 粘贴原始 JSON…（Ctrl+Enter 解析并填入）"
          @submit="doPasteImport"
        />
      </div>
      <!-- 实时校准预览——边贴边回显识别形态/键数/字段数/错误，输错即刻可见 -->
      <div v-if="pasteImportText.trim() && pastePreview" class="pi-preview" :class="pastePreview.ok ? 'ok' : 'bad'" data-test="pi-preview">
        <template v-if="pastePreview.ok">
          <span v-for="(ln, i) in pastePreviewLines(pastePreview)" :key="i" class="pi-pl">{{ ln }}</span>
        </template>
        <span v-else class="pi-pl">{{ pastePreviewLines(pastePreview)[0] }}</span>
      </div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <!-- 粘贴区高度四档循环钮（adhoc.pasteH data-ar-paste-h 同范式，
 title 实时回显当前档，点击切下一档末档回首档） -->
          <button type="button" class="btn ghost sm" data-ar-pi-h style="margin-right:auto"
                  :title="'粘贴区高度档：' + piH + '（点击循环）'" @click="cyclePiH">高</button>
          <button class="btn" @click="pasteImportOpen = false">取消</button>
          <button class="btn primary" :disabled="!pasteImportText.trim()" @click="doPasteImport">
            <ClipboardPaste :size="12" /> 解析并填入
          </button>
        </div>
      </template>
    </n-modal>

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /adhoc-rebuild/ 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
/* Adhoc 托管重建五步向导 —— 选索引 → 审编 → 策略 → 预览 → 监控 */
import { ref, computed, watch, onMounted, onActivated, onBeforeUnmount, nextTick, type Ref } from 'vue';
import { NModal } from 'naive-ui'; /* 粘贴导入弹窗——不 import 会被当原生 custom element 渲染（named slot 全丢） */
import { fmtNum, copyText, statusColor } from '../utils/format';
import { sevPill } from '../utils/esEnumZh'; /* W4：severity pill 档收口 esEnumZh（本地 sevPill 退役） */
import { jobStatusZh } from '../utils/esEnumZh'; /* ：jobStatusZh 作业状态中文接线（独立 import 行——既有 sevPill import 行被两处 spec 逐字锁，一字不动） */
import { sevZh, stageZh, roundZh } from '../utils/esEnumZh'; /* ：severity/stage/轮次 phase 中文接线（Lead 跨工蚁契约；独立行——上两行被 spec 逐字锁） */
import { highlightJson } from '../utils/jsonc'; /* ：backfill DSL 高亮 */
import { friendlyApiError } from '../utils/esError'; /* ：裸 e.message 友好化 */
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：探测失败条双参改用（XmigrateView :63 / errMetaPave547 口径） */
import { indexNameProblem } from '../utils/indexNameRule'; /* 索引名硬规则共享口径（ReindexAdvanced 同源） */
import { matrixText } from '../utils/copyMatrix'; /* W1：最近作业 TSV/MD 导出（RT/QRT 共用矩阵内核） */
import { useRoute, useRouter } from 'vue-router';
import {
  Hammer, Search, ChevronRight, ChevronLeft, Play, Loader2,
  CircleStop, RotateCcw, History, RefreshCw, Eye, ShieldCheck, ShieldAlert,
  ClipboardPaste, TriangleAlert, ExternalLink, ClipboardCopy, ClipboardList,
  Terminal, UnfoldVertical, Copy, Download, Info, Braces,
} from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, EP, ioRecorder, type RawIoRec } from '../api'; /* ：EP 供期望配置页外链（DesiredStateController 同前缀）；：ioRecorder 原始 IO 快查 */
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { isBrowserMode } from '../platform/browserApi';
import IndexPicker from '../components/IndexPicker.vue';
import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'; /* ：「用当前索引」回填钮统一件（兑现） */
import { askConfirm } from '../composables/confirm';
/* 校验/启动两链执行读秒+竞态作废（IndexHub 三链 P0-A 同范式统一件） */
import { useQueryRun } from '../composables/useQueryRun';
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import DraftBadge from '../components/DraftBadge.vue';
import JsonArea from '../components/JsonArea.vue';
import TimeCell from '../components/TimeCell.vue';
import MarkText from '../components/MarkText.vue'; /* W1：最近作业过滤命中高亮（全站 <mark> 统一件） */
import TookBadge from '../components/TookBadge.vue'; /* ：校验耗时四档语义徽标 */
import { diffConfig, diffConfigSummary, type ConfigDiffRow } from '../utils/configDiff';
import { kindLabel, kindNote, parseExpectedMapping, shouldDiffMapping, partitionDiffRows } from '../utils/configDiffView';
import { assessDateRisks, assessFieldNameMismatch, mergeRiskRows, type RiskRow } from '../utils/dateRisk';
import MonacoEditor from '../components/MonacoEditor.vue';
import QueryResultTable from '../components/QueryResultTable.vue'; /* W-B：最近作业表换 QRT rows 型（排序/列选/右键/导出四格式/按值徽标归内核） */
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：最近作业 kw 过滤胶囊统一件（559 TasksView tv-kw 先例） */
/* 原始请求/响应快查弹窗（探测/托管重建执行共用，ioRecorder 记录环取数） */
import RawIoModal from '../components/RawIoModal.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：手滚 pill 改用统一件（ 范式；tone/label/en?/title? 四项契约） */
import { parseEsConfigPaste, pastePreviewLines, type ParsedEsConfig } from '../utils/esConfigPaste';
import { useIndexFields } from '../composables/useIndexFields';
/* P1：settings/mapping 四编辑框 lint 划线——lintSettingsBody/lintMappingBody 纯函数
 只消费 dslLint 既有出口（禁改 dslLint）；防抖统一件（SearchSandboxView 同款） */
import { lintSettingsBody, lintMappingBody, type Finding } from '../utils/dslLint';
import { useDebounceFn } from '../composables/useDebounceFn';
/* W2：pasteRaw 高度档循环统一件（useTierCycle 三件套：档值数组+usePref+cycle） */
import { useTierCycle } from '../composables/useTierCycle';
import { removeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

/* 预填即 pretty：压缩单行 JSON 对人审阅障碍极大 */
function prettyJson(s: string): string {
  if (!s) return s;
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
const STEPS = ['选索引', '审编 settings/mapping', '追平策略', '确认预览', '执行监控'];
const store = useAppStore();

/* 期望配置页外链（宿主 client 侧 /internal/es/index/desired-state.html 自包含单页，
 与 api 请求同 EP 前缀、同集群目标）——步①「业务应用 → desired-state.html」此前只有文案无入口 */
function openDesiredState() {
  if (isBrowserMode) return;
  window.open(EP + '/desired-state.html', '_blank', 'noopener');
}

/* 原始 IO 快查——探测（评估）与托管重建（执行）分节共用，
 取记录环最近一条 /adhoc-rebuild/ 记录开弹窗。
 W3 判空口径统一（546 裁决=notify 不开空弹窗，rawIoPave546 六视图同款
 形态同步更新）：无记录 notify 引导并返回，不再以空 rec 开弹窗（EmptyState 仍归 RawIoModal
 自身兜底）；last('/adhoc-rebuild/') 特征子串逐字保留（rawIo545 spec 字面锁）。
 步②审编校验走 /config-lab/validate（不在 /adhoc-rebuild/ 特征下）——
 last 取数扩回退链：托管链无记录时回落 config-lab 记录（rawIo545 锁同步更新） */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/adhoc-rebuild/') ?? ioRecorder.last('/config-lab/');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* settings/mapping 对照可调工作台声明（拖拽/预设/记忆由 WorkbenchLayout 统一负责） */
const arEdScope = { target: store.target || 'host', route: '/adhoc', mode: 'arEditors', profile: 'standard' as const };

/* 手动模式 settings/mapping 对照（与 411 自动派生模式同款语义） */
const arManualScope = { ...arEdScope, mode: 'arManual' };
/* w80:sized+flex 混合——两组全 flex pane 时中缝拖不动(两侧互相让位),settings 给数值档、
 mapping 吃 flex,柄拖动语义恢复(BE_PANES 参数 260/编辑 flex 同构先例)。
 W4：竖排标题轨退役（/DevToolsView 先例）——title 置空即不渲染，
 settings/mapping 标题语义落各 pane 行首横排（.ar-manual-lb / .ed-col .ed-label，sec-t 档） */
const AR_MANUAL_PANES: WorkbenchPaneSpec[] = [
  { id: 'adhoc.manual-settings', role: 'request', title: '', minSize: 260, defaultSize: 320, collapsible: true },
  { id: 'adhoc.manual-mapping', role: 'response', title: '', minSize: 260, defaultSize: 'flex', collapsible: true },
];
const AR_ED_PANES: WorkbenchPaneSpec[] = [
  { id: 'adhoc.settings', role: 'request', title: '', minSize: 260, defaultSize: 320, collapsible: true },
  { id: 'adhoc.mapping', role: 'response', title: '', minSize: 260, defaultSize: 'flex', collapsible: true },
];
/* 权限门禁——托管重建发起/中止/确认切换=REBUILD 档（rank3+）；
 只读角色可看向导与监控（评估/探测是只读 POST），不给出扳机 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', store.target));
/* 作业归属（后端 1007）：中止/确认切换是用户级不可逆动作，仅创建者本人或 ADMIN；
   legacy 无 owner 的升级前作业维持连接级语义。同连接同事仍可观测进度。 */
const jobOwner = computed(() => String((job.value as any)?.ownerUsername || '').trim());
const canMutateJob = computed(() => {
  if (!canOps.value) return false;
  if (!jobOwner.value) return true;
  if (auth.isAdmin()) return true;
  return jobOwner.value === (auth.me?.username || '');
});
/* 校验独立权限面：配置校验页写端点（可能与 start 的 ops 档不同权） */
const canValidate = computed(() =>
  auth.canEndpoint('write', 'POST', '/internal/es/index/config-lab/validate', store.target)
  || auth.canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', store.target));
/* 拉取源配置的回退补拉通道 cluster/inspect 是共享读端点（索引/映射/搜索/配置校验/托管
 重建任一页读键可见，与后端 SHARED_READ_PAGES 同源）——纯连接模型缺页时补拉必 403，
 doStart/doAbort 同款闸（探测 prep 快照路径零网络不受闸） */
const canPullSrc = computed(() => auth.canEndpoint('write', 'GET', '/internal/es/index/cluster/inspect', store.target));
/* 期望配置页是宿主 client 侧静态单页（浏览器 window.open 直开不携连接目标头，恒按
 宿主/静态页授权裁决）——纯连接模型点开必得 403 裸页，钮面禁用先给引导；
 探测完成前不禁用（OverviewView 宿主页预判同款，独立部署首屏入口不闪断） */
const canDesiredState = computed(() => !isBrowserMode && (!auth.probed
  || auth.canEndpoint('write', 'GET', EP + '/desired-state.html', 'host')));
/* 草稿：向导全程草稿（按集群目标隔离）。粘贴/审编/表单字段挂载时读一次、
 之后只写不读——切页/失焦/重挂载后现场可复原；doPrepare/校验/prepare 失败不清稿
 （机制保证：只有显式 reset 或改回默认值才清）。 */
/* w45:向导草稿不按集群隔离——粘贴的期望配置/索引名/策略/步骤是用户意图,与顶栏目标
 无关;此前按 target 分键,「host 态粘贴→切生产→稿消失→反复重粘」正是体感最差的来源。
 集群相关风险由 w44 的「Dry-run 实测于:<集群>」行自查。 */
const adhocScope = { route: 'adhoc' };
const indexName = useScopedDraft('index-name', adhocScope).text;
/* 草稿与顶栏全局选中是两份状态（写类视图不开 useIdxState follow， 白名单口径）。
 「初始化回填」刻意不做 setup 一次性读——那会把「全新进入」误判成「有现场」
 （adjudicateEntry 的 hasRestoredScene 以 indexName 非空为据，w29 P2 的开新流程
 契约会被静默改道 resumeScene）；全新进入的全局回落已由 adjudicateEntry ③ 承担。
 这里只补「进页后/空稿时」的缝隙：pickedIdx 真实变化且草稿为空 → 回填（只补空，
 用户已输/已恢复的稿永不覆写，w29 P6 同一条红线）。 */
watch(() => store.pickedIdx, (v) => {
  if (v && !indexName.value) indexName.value = v;
});
/* 「用当前索引」钮的显式覆盖语义（有稿时也在，点击即以顶栏选中为准）随钮迁入
 PickCurrentIdxBtn 统一件——本视图只承接 @pick 回填（改用，就地函数退役） */
/* +1：审编步与手动模式四个编辑框挂 dsl-assist——字段源并轨 useIndexFields
 全站字段源标准（源索引视角：嵌套 a.b.c 与 multi-field 全量在场），bodyKind 按
 settings/mapping 分档（MappingView mpMappingAssist/mpSettingsAssist 先例）。
 字段清单在 doPrepare 探测时同点预载（幂等+缓存，失败零降级=无候选）。
 四个 assist 对象 setup 作用域常量声明——模板内联对象箭头经 _ctx 代理每次渲染换引用，
 Monaco provider 会反复重注册（IndexHub 渗透 spec 红灯实证）。 */
const { fields: arIdxFields, ensure: ensureArFields } = useIndexFields(() => indexName.value);
const arAssistFields = () => arIdxFields.value;
const arSettingsAssist = { fields: arAssistFields, bodyKind: () => 'settings' as const };
const arMappingAssist = { fields: arAssistFields, bodyKind: () => 'mapping' as const };
const arManualSettingsAssist = { fields: arAssistFields, bodyKind: () => 'settings' as const };
const arManualMappingAssist = { fields: arAssistFields, bodyKind: () => 'mapping' as const };
/* W4：粘贴区 Monaco 补全（轨1 残面 R6）——只挂字段候选不传 bodyKind：
 粘贴的是业务期望配置，settings/mapping 形态任意，挂档必误导；lint 也不挂（原文保持零侵入，
 四 JsonArea 框已各自 lint）。字段源并轨 arAssistFields（doPrepare 探测时同点预载） */
const pasteAssist = { fields: arAssistFields };
/* ═══ W2：粘贴编辑器四档高度循环（useTierCycle 三件套 + usePref 落盘，
 ConfigValidatorView 535 W9 同款范式）═══
 默认档=原 min(60vh, 420px) 字面保底（改动前后默认形态高度行为一致），档值升序循环、
 全部为确定解（CSS min() 定高直接绑定，无 min-height 叠加、无 height:100%+静态兄弟）；
 大粘贴场景（千行 mapping）随档撑高，落盘刷新/回页保持 */
const PASTE_H_TIERS: string[] = ['min(60vh, 420px)', 'min(70vh, 560px)', 'min(80vh, 700px)', 'min(92vh, 860px)'];
const { v: pasteH, cycle: cyclePasteH } = useTierCycle('adhoc.pasteH', PASTE_H_TIERS);
/* ═══ ：粘贴导入弹窗 JsonArea 四档高度循环（useTierCycle 统一件，adhoc.pasteH
 同范式同族：60/70/80/92vh 梯，px 封顶随原 600 档同谱系 120px 步进）═══
 默认档=原 min(60vh, 600px) 字面保底（525 W10 弹性档默认形态零漂移），大粘贴场景随档撑高，
 usePref 落盘（adhoc.piH），刷新/回开弹窗保持 */
const PI_H_TIERS: string[] = ['min(60vh, 600px)', 'min(70vh, 720px)', 'min(80vh, 840px)', 'min(92vh, 960px)'];
const { v: piH, cycle: cyclePiH } = useTierCycle('adhoc.piH', PI_H_TIERS);
/* ═══ P1：settings/mapping 四编辑框高度档（useTierCycle 统一件，pasteH/xm.cfgRows 同范式）═══
 原 rows=8/14 写死且 fill 态下 rows 纯装饰（height:100% 接管）——四页唯一高度锁死编辑面。
 四框摘 fill 改 rows 驱动：档值 8/16/28/44 循环，Monaco 高度=rows*19+16 纯内容函数确定解
 （红线：档位驱动 rows、禁 rAF 反馈，零触）；默认 16 档 ≈ 原 40vh 视口弹性档视觉，
 双入口（手动 hd「高」+ 审编卡头「高度」）同一落盘键 adhoc.edH，四框同档联动 */
const ED_ROWS_TIERS = [8, 16, 28, 44];
const { v: edRows, cycle: cycleEdRows } = useTierCycle('adhoc.edH', ED_ROWS_TIERS, 16);
const settingsDraft = useScopedDraft('settings', adhocScope);
const mappingDraft = useScopedDraft('mapping', adhocScope);
const pasteDraft = useScopedDraft('paste-raw', adhocScope);
const destIndex = useScopedDraft('dest-index', adhocScope).text;
/* 目标名建议带时间戳，跨会话恢复会指向旧索引或撞名（实测恢复出 9 天前的
   *_adhoc_2026... 目标名）。进入向导一律清空，由本次 prepare 重新生成；
   用户随后手改的目标名只在本次会话内有效，切源索引也立即作废。 */
const AUTO_DEST_RE = /_adhoc_\d{14}$/;
destIndex.value = '';
/* 换源索引 = 换一轮重建：上一索引的目标名不能跟着走。 */
watch(indexName, () => { destIndex.value = ''; });
const strategy = useScopedDraft('strategy', adhocScope, 'INCREMENTAL').text;
const timeField = useScopedDraft('time-field', adhocScope).text;
const settingsJson = settingsDraft.text;
const mappingJson = mappingDraft.text;
const pasteRaw = pasteDraft.text;
/* w68:手动 settings/mapping 输入(不经业务侧 JSON,直接贴) */
const manualSettings = useScopedDraft('manual-settings', adhocScope).text;
const manualMapping = useScopedDraft('manual-mapping', adhocScope).text;

/* ═══ P1：settings/mapping 四编辑框 lint 划线接线（SearchSandboxView 范式逐字）═══
 useDebounceFn 250ms + JsonArea setMarkers 透传口 + info→hint 降级（MonacoEditor 结构类型
 只收 warning/hint/error）；档路由：settings 框→lintSettingsBody、mapping 框→lintMappingBody
 （dslLint 纯函数只消费）；非法 JSON 不 lint——JsonArea 合法性圆点已报。四框共用一条防抖
 尾值队列（任一框击键 250ms 后四框统一重估，空框静默清 marker） */
const setJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const mapJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const manualSetJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const manualMapJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
/* 粘贴区 Monaco ref（K2 五编辑面 Ctrl+I 第一面；@execute 见模板） */
const pasteMcRef = ref<InstanceType<typeof MonacoEditor> | null>(null);

/* ═══ ：五编辑面 Ctrl+I 唤起补全（IndexHubView 1平移，Kibana 控制台同键）═══
 经 getEditor expose 出口（MonacoEditor 组件本体 / JsonArea 转发通道）拿内层 Monaco——组件零触。
 monaco 包走回调内动态 import：本页行为锁 spec（adhocDiffWiring 等）vi.mock MonacoEditor
 「斩断 monaco 导入链」不能被静态链拉进真 monaco。happy-dom stub 无 getEditor/addCommand
 出口 → 守卫跳过（DevToolsView 同口径）。 */
type CtrlIHost = { getEditor?: () => any };
function wireCtrlI(host: Ref<CtrlIHost | null>) {
  watch(host, (mc) => {
    if (!mc) return;
    nextTick(() => {
      const ed = mc.getEditor?.();
      if (!ed || typeof ed.addCommand !== 'function') return;
      void import('monaco-editor/esm/vs/editor/editor.api').then((m) => {
        ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyI, () => {
          ed.trigger('', 'editor.action.triggerSuggest', null);
        });
      }).catch(() => { /* 测试 stub 面/包缺失时静默：补全仍有 Ctrl+Space 既有键 */ });
    });
  }, { immediate: true });
}
wireCtrlI(pasteMcRef);
wireCtrlI(manualSetJaRef);
wireCtrlI(manualMapJaRef);
wireCtrlI(setJaRef);
wireCtrlI(mapJaRef);
function parseArBody(t: string): Record<string, unknown> | null {
  if (!t.trim()) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { return null; }
}
const queueArLint = useDebounceFn(() => {
  const mark = (r: { value: any }, text: string, lint: (o: unknown) => Finding[]) => {
    const o = parseArBody(text);
    const findings = o ? lint(o) : [];
    r.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
  };
  mark(setJaRef, settingsJson.value, lintSettingsBody);
  mark(mapJaRef, mappingJson.value, lintMappingBody);
  mark(manualSetJaRef, manualSettings.value, lintSettingsBody);
  mark(manualMapJaRef, manualMapping.value, lintMappingBody);
}, 250);
watch([settingsJson, mappingJson, manualSettings, manualMapping], () => queueArLint(), { immediate: true });

const highlightIdxInput = ref(false);
/* F2：索引选择行容器——applyManual 缺索引名时滚动定位的可靠锚点。
 原先全仓 querySelector 依赖的 .xm-idx-focus-target 根本不存在（恒 miss 后
 落到 document 级 .row .inp，而本视图输入框类是 ipt/ixp-inp，落点不可控）。 */
const idxRowEl = ref<HTMLElement | null>(null);
/* F2：索引名缺失的常驻红字。toast 10s 即消、新手找不到要看哪里；
 模板条件带 !indexName —— 一旦填上名字立即熄灭，不需要额外 watch */
const needIndexForManual = ref(false);
/* w69:双 Tab 模式切换 */
const inputMode = ref<'paste' | 'manual'>('paste');
const draftRestored = computed(() => settingsDraft.restored.value || mappingDraft.restored.value
  || pasteDraft.restored.value);
function clearDrafts() {
  settingsDraft.clear(); mappingDraft.clear(); pasteDraft.clear();
}
const route = useRoute();
const router = useRouter();
/* 索引芯片跳转 + jobId 复制（Xmigrate 同范式） */
function gotoIdx(idx?: string) { if (idx) router.push({ path: '/indices', query: { idx } }); }
function copyJobId(id: string) {
  copyText(id).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'jobId 已复制' : '复制失败'));
}

/* 向导 step 落 sessionStorage，切页返回不再弹回流程起点。
 注：草稿已迁 useScopedDraft（按集群目标隔离），旧 useDraft 通道已删。
 带 route.query.index 显式进入时 applyRouteContext 仍会重置流程（见其早返回），
 持久化只在裸路径返回时复原离开时的步骤。 */
const stepDraft = useScopedDraft('step', adhocScope, '0').text;
const step = computed({
  get: () => Number(stepDraft.value) || 0,
  set: (v: number) => { stepDraft.value = String(v); },
});
const preparing = ref(false);
const prepErr = ref(''); // 探测失败原因，供探测卡内联错误条展示
const prepErrRaw = ref<unknown>(null); // ：原始错误对象旁路（errMeta 读 code/endpoint，Xmigrate checkErrRaw 同款）
const prep = ref<any>(null);
/* A3：上一轮 prepare 的建议值快照——用于区分字段是「自动填的」还是「用户手改的」。 */
let lastPrepDest = '';
let lastPrepTimeField = '';

/* stripDsl 自动处置结果说明，常驻审编步顶部 */
const stripNote = ref('');

/* 审编步内嵌校验 —— ERROR 不放行，防止带病配置进入重建 */
const validating = ref(false);
/* ═══ ：校验/启动两执行链接 useQueryRun（IndexHub 三链 P0-A 同范式）═══
 api.adhoc.start/api.configLab.validate 签名无 signal 参（api.ts 禁改），signal 落
 「竞态丢弃」消费：begin 即作废上一轮控制器（queryRunRace382 竞态语义随身）——
 旧轮响应返回时 signal.aborted 置位即丢弃，不写状态不推进 step，防旧覆盖新
 （审编步 Enter/主钮连触场景）。控制面无手动取消钮：abort 只断前端等待而后端可能
 已受理，取消面仅保留竞态丢弃，读秒照显（valSecs/startSecs 消费）。 */
const valQr = useQueryRun();
const startQr = useQueryRun();
const valSecs = computed(() => (valQr.elapsedMs.value / 1000).toFixed(1));
const startSecs = computed(() => (startQr.elapsedMs.value / 1000).toFixed(1));
/* w41:校验报告也进草稿——此前是内存态,切页/重挂载即丢,用户回来要重点校验才能再看报告
 (「又要重新点」的真正来源)。报告只读展示用,持久化后回来即见失败原因。
 用 {report} 包装:T extends object 不接受 null,包一层保持可空语义。 */
const valReportDraft = useScopedDraftState<{ report: any }>('val-report', adhocScope, { report: null });
const valReport = computed({
  get: () => valReportDraft.state.value.report,
  set: (v: any) => { valReportDraft.state.value = { report: v }; },
});

/* 状态徽标统一 pill+statusColor（自造 st-tag/st-* 色档退役）。
 W4：本页两档扩展（SUCCEEDED 补 g / ABORTED 中性 n）已上提进
 format.ts statusColor 枚举，jobStatusColor 页内特例退役——调用处直连 statusColor。 */

/* 建议回补 DSL 裸 pre → highlightJson 高亮（先 pretty；输出已转义，v-html 安全） */
const backfillHtml = computed(() => {
  const raw = String(job.value?.report?.suggestedBackfillDsl || '');
  if (!raw) return '';
  let pretty = raw;
  try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* 非 JSON 原样展示 */ }
  return highlightJson(pretty);
});

/* 回补 DSL 一键复制（RawIoModal copyReq 三行手法平移）——直切策略人工回补高频 */
async function copyBackfillDsl() {
  const ok = await copyText(String(job.value?.report?.suggestedBackfillDsl || ''));
  store.notify(ok ? 'success' : 'error', ok ? '回补 DSL 已复制' : '复制失败：浏览器拦截了剪贴板');
}

async function doValidateConfig(advance: boolean) {
  /* 权限执行体首行门：覆盖 Enter/程序化通道（按钮 v-if 之外） */
  if (!canValidate.value) { store.notify('warning', '校验需配置校验页或托管重建写权限'); return; }
  validating.value = true;
  const signal = valQr.begin(); /* ：begin 即作废上一轮（queryRunRace382 竞态语义随身） */
  try {
    valReport.value = await api.configLab.validate(
      settingsJson.value.trim() || undefined,
      mappingJson.value.trim() || undefined,
      true,
    );
    /* 旧轮竞态丢弃——signal.aborted 置位说明已有新一轮在校验，不写状态不推进 */
    if (signal.aborted) return;
    if (advance) {
      if (valReport.value.valid && valReport.value.dryRunPassed !== false) {
        step.value = 2;
      } else {
        store.notify('error', '配置校验未通过，请先修复问题（重建中途建索引失败代价更大）');
      }
    }
  } catch (e: any) {
    store.notify('error', friendlyApiError(e) || '校验请求失败'); /* ：裸 e.message → friendlyEsError */
  } finally {
    valQr.finish();
    validating.value = false;
  }
}

/* w80:追平缓冲/破坏性选项并入草稿(与 step/strategy 同稿口径)——此前 bufferMs/deleteOldIndex/
 confirmDirectSwap/pauseBeforeSwitch/expectedFromPaste 是内存 ref,刷新续场后「切换前人工确认门」
 无声关闭(粘贴流 pickPaste 置 pauseBeforeSwitch=true,刷新即丢),用户在不知情下自动翻别名。 */
const bufferMsDraft = useScopedDraft('buffer-ms', adhocScope, '120000');
const bufferMs = computed<number>({
  get: () => { const n = Number(bufferMsDraft.text.value); return Number.isFinite(n) && n >= 0 ? n : 120000; },
  set: (v: number) => { bufferMsDraft.text.value = String(v); },
});
/* +1：追平缓冲失焦钳制——负数/非数字一律归 0（min=0 挡 UI 步进，
 手输负值由这里兜住，后端按 ms 等待，负值语义不明） */
function clampBufferMs() {
  const n = Number(bufferMs.value);
  bufferMs.value = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
/* 布尔选项草稿桥：勾选='1'（落盘），取消=默认 ''（等价清除，不残留陈稿） */
const delOldDraft = useScopedDraft('delete-old-index', adhocScope);
const deleteOldIndex = computed<boolean>({
  get: () => delOldDraft.text.value === '1',
  set: (v: boolean) => { delOldDraft.text.value = v ? '1' : ''; },
});
const confirmSwapDraft = useScopedDraft('confirm-direct-swap', adhocScope);
const confirmDirectSwap = computed<boolean>({
  get: () => confirmSwapDraft.text.value === '1',
  set: (v: boolean) => { confirmSwapDraft.text.value = v ? '1' : ''; },
});
/* 切换前人工确认门。粘贴流默认开启（诉求：等待完成再手动确认），手工流默认关 */
const pauseSwitchDraft = useScopedDraft('pause-before-switch', adhocScope);
const pauseBeforeSwitch = computed<boolean>({
  get: () => pauseSwitchDraft.text.value === '1',
  set: (v: boolean) => { pauseSwitchDraft.text.value = v ? '1' : ''; },
});

/* / spec 无 timeField 的 WRITE_BLOCK 走 earlyBlock 全程挡写
 （AdhocRebuildService:235），窗口 = 全量 reindex 全程，必须二次确认才放行。 */
const ackFullBlock = ref(false);
const needAckFullBlock = computed(() => strategy.value === 'WRITE_BLOCK' && !timeField.value);
const canStart = computed(() => !needAckFullBlock.value || ackFullBlock.value);

/* sem-rm 智能纠错：目标物理索引名即时校验——非法字符/大写走 utils/indexNameRule 共享口径
 （ReindexAdvanced destIndexErr 同源）；直连模式下目标=源物理名意味着切换将删除源索引
 本身（核武级配错），即时红字前置警示。
 别名形态下同名不拦（物理名=别名名的场景由别名探测卡已有 warn 语义覆盖）。 */
const destNameErr = computed(() => {
  const name = destIndex.value.trim();
  if (!name) return '';
  const base = indexNameProblem(name);
  if (base) return base;
  if (prep.value && !prep.value.isAlias && name === prep.value.sourcePhysical) return '目标索引名与源物理索引同名——直连模式下切换将删除该索引本身，请换名（如加 -v2 后缀）';
  return '';
});

/* -9 / I-1：改动阻断窗口的两个输入（strategy / timeField）后，上一轮的「已知悉」失效。
 场景：用户在无 timeField 下勾了「接受全程挡写」，回退到策略步选了个 timeField
 （窗口从「全量 reindex 全程」缩到「一轮追平」），又把它清空 —— 此时窗口重新变回
 全程，而 ackFullBlock 仍是 true，警示条一闪而过、按钮直接可点。
 人确认的是「这个大小的窗口我接受」，不是「以后所有窗口我都接受」；
 输入一变，那份确认就不再对应当前事实，必须重新征得。
 （reset() 里的复位是另一回事，那是「再来一轮」的整体清场，管不到同一轮内的改动。） */
watch([strategy, timeField], () => { ackFullBlock.value = false; });

/* 粘贴解析。硬要求：失败必须给出具体原因，且不清空用户已填的表单、不静默回落——
 静默失败会让人以为预填成功了，拿着旧的 settings 去执行重建。 */
const pasteErr = ref('');
const pasteWarn = ref('');   // 警告独立于错误，二者可并存
const pastePicked = ref('');
const pasteList = ref<Array<Record<string, any>>>([]);
const pasteIdx = ref(-1);
/* w80：自动探测幂等游标——同一 alias 只在粘贴选中时自动 doPrepare 一次（见 pickPaste 尾注） */
let lastAutoPreparedAlias = '';
/* #68：粘贴来的期望 mapping 原文，与 mappingJson 分开存。
 mappingJson 是**审编框**——未粘贴时 doPrepare 会把源索引现状写进去，
 届时它装的是「实际」而不是「期望」。拿它当期望会得到一屏假 same。
 这一份只由 pickPaste 写入，缺席时为 ''，语义单一。
 w80：入草稿——它是 cfgDiff 的期望侧源头，刷新续场后丢失会静默变出一屏假 same。 */
const expectedFromPaste = useScopedDraft('expected-mapping', adhocScope).text;
/* 本条 mapping 是否来自注解推导（而非业务侧 @Mapping 原文）。
 只影响提示文案与界面标记，不改审编框内容的用法。 */
const mappingFromDerived = ref(false);

/* ═══ ：手动模式「拉取源配置」（与审编步「粘贴导入」互补双入口）═══
 粘贴导入是「外部期望」，这里是「源现状」：优先吃向导步骤①已探测的 prep 快照
 （prep.settingsJson/mappingJson，零网络），未探测（或探测回 null）时现场
 api.clusterInspect(indexName, 0) 补拉——DslQueryView preloadMapping 同通道；
 解包对齐 ConfigValidatorView doImport（settings/mappings 按索引名键控，取首键）。
 显式用户动作 + askConfirm 确认覆盖：确认通过才写 manualSettings/manualMapping 两个
 草稿 ref（挂载初值与自动预填链零触碰——adhocManualWorkbench426/draftGovernance 口径），
 pretty 口径与 doPrepare 预填一致（prettyJson）。 */
const pullingSrc = ref(false);
async function pullSourceToManual() {
  /* 权限执行体首行门（拉取钮已随 canPullSrc 禁用，此处覆盖程序化通道；doStart/doAbort
     同款）——仅约束会发网络的回退补拉分支，本地 prep 快照路径确认窗随后照常 */
  if (!canPullSrc.value) { store.notify('warning', '拉取源配置需索引、映射、搜索、配置校验或托管重建任一页读权限'); return; }
  if (!indexName.value) { store.notify('warning', '先在上方选择要重建的索引名，才能拉取源配置'); return; }
  /* 闸置位前移到确认窗之前（xmigrateGateExport941 同族口径）：确认窗+clusterInspect 在途全程拉取钮
     :disabled="pullingSrc || !canPullSrc" 即禁用，二击不再穿透双开确认窗；取消路径由 finally 复位防闸死。 */
  if (pullingSrc.value) return;
  pullingSrc.value = true;
  try {
    const ok = await askConfirm({
      title: '拉取源配置到手动编辑框',
      message: `将用源索引「${indexName.value}」当前的 settings / mapping 覆盖两个手动编辑框（已填内容会被覆盖）。`,
      level: 'warn',
      okText: '覆盖填入',
    });
    if (!ok) return;
    let sRaw = prep.value?.settingsJson || '';
    let mRaw = prep.value?.mappingJson || '';
    if (!sRaw && !mRaw) {
      try {
        const r = await api.clusterInspect(indexName.value, 0);
        const firstIdx = Object.keys(r?.settings || {})[0] || Object.keys(r?.mappings || {})[0];
        if (!firstIdx) throw new Error('未取到索引配置');
        sRaw = JSON.stringify(r.settings?.[firstIdx] || {});
        mRaw = JSON.stringify(r.mappings?.[firstIdx] || {});
      } catch (e: any) {
        store.notify('error', '拉取源配置失败：' + (friendlyApiError(e) || '索引不存在或不可达'));
        return;
      }
    }
    manualSettings.value = prettyJson(sRaw);
    manualMapping.value = prettyJson(mRaw);
    store.notify('success', '已拉取源索引配置填入手动编辑框，可继续修改后「应用并进入审编」');
  } finally {
    pullingSrc.value = false;
  }
}

function applyManual() {
  const s = manualSettings.value.trim();
  const m = manualMapping.value.trim();
  const errs: string[] = [];
  if (s) {
    try { JSON.parse(s); } catch (e) { errs.push('settings 不是合法 JSON: ' + String((e as Error).message).slice(0, 60)); }
  }
  if (m) {
    try { JSON.parse(m); } catch (e) { errs.push('mapping 不是合法 JSON: ' + String((e as Error).message).slice(0, 60)); }
  }
  if (errs.length) {
    store.notify('error', errs.join('; '));
    return;
  }
  if (s) settingsJson.value = prettyJson(s);
  if (m) mappingJson.value = prettyJson(m);
  if (!indexName.value) {
    /* F2/w77:滚动到索引输入框 + 高亮边框 — 引导式修正而非仅弹 toast(toast 10s 即消,新手找不到要看哪里)。
 首选本组件的索引选择行（ref 锚点,落点确定）;
 document 级两条链按 F2 要求保留为兜底(选择器修复为「索引选择区输入框」路径)。 */
    const el = idxRowEl.value?.querySelector('input')
      || document.querySelector('.ar-input-tabs')?.nextElementSibling?.querySelector('.inp')
      || document.querySelector('.row .inp');
    (el as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightIdxInput.value = true;
    needIndexForManual.value = true;
    setTimeout(() => { highlightIdxInput.value = false; }, 2500);
    store.notify('warning', '手动配置已暂存 — 请先在下方选择要重建的索引名');
    return;
  }
  store.notify('success', '手动配置已应用' + (s ? '(settings)' : '') + (m ? (s ? '+' : '') + '(mapping)' : '') + '，进入审编步');
  step.value = 1;
}

function applyPaste() {
  pasteErr.value = '';
  pasteWarn.value = '';
  pastePicked.value = '';
  pasteList.value = [];
  pasteIdx.value = -1;
  expectedFromPaste.value = '';
  mappingFromDerived.value = false;  const raw = pasteRaw.value.trim();
  if (!raw) { pasteErr.value = '粘贴内容为空'; return; }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    pasteErr.value = '不是合法 JSON：' + String((e as Error).message).slice(0, 120);
    return;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const bad = list.findIndex(r => !r || typeof r !== 'object' || !(r as any).alias);
  if (bad >= 0) {
    pasteErr.value = `第 ${bad + 1} 项缺少 alias 字段（期望配置必须含读写别名）`;
    return;
  }
  /* -9 / M-1：settingsJson 缺失是**警告**不是错误，与 mappingJson 同构。
 核实结论（IndexMetaRegistry:95-98 readAnnotationPath）：实体没有 @Setting 时
 getSettingPath 返回 null → readAnnotationPath 直接返回 null → payload 里
 settingsJson 就是 null（RebuildableIndexMeta:44 的注释也明写「可能为 null」）。
 即「有 @Mapping 但没 @Setting」是完全合法的实体形态，而原来的 !settingsJson
 会把它整条**拒绝**，人只能回去手抄 —— 粘贴入口对一类合法输入直接关门。
 ""（空文件）同理。两者都退化成「按 ES 默认建索引」，
 与 mappingJson 为 null 的处置一致，故降级为警告（由 pickPaste 逐条产出）。 */
  pasteList.value = list as Array<Record<string, any>>;
  pickPaste(0);
}

/* ═══ ：步骤②「粘贴导入」——原始 JSON 一手进，识别只拆壳不改值 ═══
 与 Mapping 页「原始 JSON → 复制全部」形成跨页闭环：复制 → 跳托管重建 → 粘贴 → 秒拆双框。
 不走 applyPaste 的业务侧期望配置链路（那条要求 alias 字段），这里是**索引配置原文**直通审编框。 */
const pasteImportOpen = ref(false);
const pasteImportText = ref('');
/* 裸 textarea 退役，ref 换 JsonArea 实例——聚焦走其 expose 的 focus()（转发 Monaco） */
const pasteJaEl = ref<InstanceType<typeof JsonArea> | null>(null);
async function openPasteImport() {
  pasteImportOpen.value = true;
  await nextTick();
  pasteJaEl.value?.focus();
}
/* 输入即解析（同步纯函数，微秒级无需防抖）——所见即所认 */
const pastePreview = computed<ParsedEsConfig | null>(() =>
  pasteImportText.value.trim() ? parseEsConfigPaste(pasteImportText.value) : null);

function doPasteImport() {
  const r = parseEsConfigPaste(pasteImportText.value);
  if (!r.ok) { store.notify('error', r.error || '无法识别粘贴内容'); return; }
  /* 填入走 prettyJson（与 doPrepare 预填同一 pretty 口径）；值本身解析前后的对象等价——校准不重写 */
  if (r.settings) settingsJson.value = prettyJson(JSON.stringify(r.settings));
  if (r.mappings) mappingJson.value = prettyJson(JSON.stringify(r.mappings));
  store.notify('success', '已导入：' + (r.notes || []).join('；') + '；建议点「仅校验」确认后再继续');
  pasteImportOpen.value = false;
  pasteImportText.value = '';
}

/* Mapping 页「发送到托管重建」直通消费——sessionStorage 契约（REBUILD_HANDOFF_KEY），
 零剪贴板参与必然成功；直达审编步并自动解析拆填。mounted 与 KeepAlive activated 双口消费。 */
const REBUILD_HANDOFF_KEY = 'esquerystudio.rebuild-paste';
function consumeRebuildHandoff() {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(REBUILD_HANDOFF_KEY); } catch { return; }
  if (!raw) return;
  removeStoredRaw(sessionStorage, REBUILD_HANDOFF_KEY);
  const r = parseEsConfigPaste(raw);
  if (!r.ok) { store.notify('error', r.error || '直通内容无法识别'); return; }
  if (r.settings) settingsJson.value = prettyJson(JSON.stringify(r.settings));
  if (r.mappings) mappingJson.value = prettyJson(JSON.stringify(r.mappings));
  if (step.value < 1) step.value = 1;
  store.notify('success', '已从 Mapping 页直通导入：' + (r.notes || []).join('；') + '；建议点「仅校验」确认后再继续');
}

/** 缺失判定：null / undefined / 纯空白都算「业务侧没声明」，与 的 null 透传同构 */
function isAbsent(v: unknown): boolean {
  return v == null || String(v).trim() === '';
}

function pickPaste(i: number) {
  const r = pasteList.value[i];
  if (!r) return;
  pasteIdx.value = i;
  indexName.value = String(r.alias);
  /* -9 / M-1：settingsJson 可能为 null（实体无 @Setting）。
 不能直接 String(r.settingsJson) —— String(null) 是字符串 "null"，
 会被当成一份内容为 null 的配置塞进表单，再送进校验/重建。
 与 mappingJson 的处置对称：缺失即空串，让人看到「这里没有配置」。 */
  settingsJson.value = isAbsent(r.settingsJson) ? '' : prettyJson(String(r.settingsJson));
  /* mapping 三态。业务侧无 @Mapping 时，starter 会把**注解推导**出的那份放进
 payload 的 derivedMappingJson —— 它才是重建实际会应用的 mapping
 （IndexNameResolver.resolveMappingJson 第②级）。宿主 没有接入方的实体类、
 无法自己推导，只能用这份。不读它的话，这里会退化成「没有 mapping」，
 doPrepare 随后把**源索引现状**写进审编框，代码声明的字段类型就静默丢了。 */
  mappingFromDerived.value = isAbsent(r.mappingJson) && !isAbsent(r.derivedMappingJson);
  const effectiveMapping = isAbsent(r.mappingJson) ? r.derivedMappingJson : r.mappingJson;
  mappingJson.value = isAbsent(effectiveMapping) ? '' : prettyJson(String(effectiveMapping));
  /* #68：期望侧另存一份。与 mappingJson 同源同值，但**不会**被 doPrepare 的预填覆盖，
 故 cfgDiff 永远拿的是「业务侧声明」而不是「ES 现状」。
 缺席仍是 ''（isAbsent 已把 null / 空白归一），C-1 的 null 判据照常生效。 */
  expectedFromPaste.value = mappingJson.value;
  strategy.value = 'WRITE_BLOCK';
  pauseBeforeSwitch.value = true;   // 粘贴流默认开人工确认门
  pastePicked.value = String(r.indexKey || r.alias);
  /* 「未声明 mapping / settings」是**警告**不是错误：预填其实成功了。塞进 pasteErr 会因
 模板里 err/ok 互斥而把「已预填」藏掉，使用者看到红字会判定粘贴失败、而表单已被改写——
 那是撒谎的界面。 裁定 mappingJson 为 null 原样透传，此路径必然会走到；
 settingsJson 同样可能为 null（IndexMetaRegistry:95-98，实体无 @Setting），见 M-1。
 两条警告可并存 —— 逐条产出而不是在 applyPaste 里拼一次，
 否则数组多选时切到另一条会把警告冲掉，人以为这条没问题。 */
  pasteWarn.value = [
    /* 三态。原来只分「有/无 mappingJson」，把「无 @Mapping 但有注解推导」也
 说成「将由 ES 动态推断」—— 那是假话，重建会用推导出的那份。 */
    mappingFromDerived.value
      ? '提示：该索引未声明 @Mapping，已采用业务侧注解推导的 mapping（payload 的 derivedMappingJson）—— 它就是重建实际会应用的那份，请照常审阅'
      : isAbsent(r.mappingJson)
        ? '注意：该索引未声明 mapping、也推导不出，重建后将由 ES 动态推断字段类型，请确认这是预期行为'
        : '',
    isAbsent(r.settingsJson)
      ? '注意：该索引未声明 settings，重建后将按 ES 默认值建索引（分片/副本等），请确认这是预期行为'
      : '',
  ].filter(Boolean).join('；');
  loadDateRisks(r);
  /* w80：粘贴成功即自动探测——pasteIdx 已置位，doPrepare 的「粘贴优先」守卫会保住
 刚填入的期望配置，只补 prep（源物理名/文档数/时间字段候选）。
 幂等守卫：同一 alias 只自动探一次，重复点击同一 chip / 多条清单来回切不重复打探测；
 换 alias（多索引清单另选）或 reset 清场后重新粘贴才再探。手动「探测」钮不受限。 */
  const alias = String(r.alias);
  if (alias !== lastAutoPreparedAlias) {
    lastAutoPreparedAlias = alias;
    void doPrepare();
  }
}

/* ── ：date 兼容风险报告（──────────────────────────────────
 粘贴的 payload 带 fields / mappingParsed / sdesVersion，加上 ES 侧的存储形态采样，
 就能查 实测矩阵给出精确判定。判定全在 utils/dateRisk 的纯函数里，此处只负责
 **取数与展示** —— 不在这里解析 mapping、不在这里排序、不在这里编文案。 */
const riskRows = ref<RiskRow[]>([]);
const sampledCount = ref(0);
const samplingMode = ref('');
const riskBusy = ref(false);
const riskErr = ref('');

async function loadDateRisks(picked: Record<string, any>) {
  /* 切换竞态守卫：守卫锚=选中粘贴对象的**身份**（pasteIdx 数值跨 applyPaste 轮会复用，
   值比对会被「重贴后仍选第 0 条」骗过）。chip 连切/整单重贴/reset 清场后，旧采样回包
   落定时选中已漂移则整包丢弃——成功/catch/finally 三支同口径；过期支跳过 finally
   复位，故 reset 侧须显式清 riskBusy（防采样钮卡死）。 */
  const stillPicked = () => pasteList.value[pasteIdx.value] === picked;
  riskRows.value = [];
  riskErr.value = '';
  sampledCount.value = 0;
  samplingMode.value = '';
  const fields = Array.isArray(picked.fields) ? picked.fields : [];
  /* mappingParsed 是 **row 级**（DesiredStatePayload:40），不在 fields 上。
 缺席时按 false 处理：那会让依赖 mapping 的规则走「测不出」降级，
 而不是静默当成「mapping 读懂了」—— 后者会把一堆判定伪装成已确认。 */
  /* w26：体检判定必须与**实际采用的期望 mapping** 同源 —— pickPaste 已在
 mappingJson 缺席时回落 derivedMappingJson(注解推导,同样是重建会应用的那份),
 若仍拿 payload 的原始 mappingParsed=false,会把「derived 明明可用」误报成
 全字段测不出(80 字段刷屏的根因)。据此重算:采用文本能解析出对象型 properties 即可用。 */
  const adoptedMappingText = isAbsent(picked.mappingJson)
    ? (isAbsent(picked.derivedMappingJson) ? '' : String(picked.derivedMappingJson))
    : String(picked.mappingJson);
  let mappingParsed = false;
  try {
    const v = JSON.parse(adoptedMappingText);
    mappingParsed = !!(v && typeof v === 'object' && !Array.isArray(v) && typeof v.properties === 'object');
  } catch { /* 采用文本解析失败 → 维持 false,由 dateRisk 的 per-index 汇总条如实说明 */ }
  /* w27:文本也必须同源传 adopted —— w26 只同源了 mappingParsed 却仍把原始 null 喂给
 判定器,「mapping 可用但零键」的假象让每字段刷 2 条假警告(DYNAMIC/FIELD_NAME)。 */
  const mappingJson = adoptedMappingText || null;

  /* 移交一：**两个函数都要调**。FIELD_NAME_MISMATCH 只由 assessFieldNameMismatch 产出，
 只调 assessDateRisks 会让 的原始案例整类从界面上消失。合并与排序见 mergeRiskRows。 */
  const nameMismatches = assessFieldNameMismatch({ mappingJson, mappingParsed, fields });

  if (!picked.alias) {
    riskRows.value = mergeRiskRows([], nameMismatches);
    return;
  }
  riskBusy.value = true;
  try {
    const r = await api.dateForms(String(picked.alias), 50);
    if (!stillPicked()) return;
    sampledCount.value = Number(r?.sampled || 0);
    samplingMode.value = String(r?.sampling || '');
    riskRows.value = mergeRiskRows(
      assessDateRisks({
        mappingParsed,
        fields,
        /* 端点的 forms（计数树）→ 判定函数的 forms。端点另有一棵 samples 树装样例值，
 两者**不可混淆**（dateRisk.ts 顶注专门拆开过这个命名）。 */
        forms: r?.forms || {},
        sdesVersion: picked.sdesVersion ?? null,
      }),
      nameMismatches,
    );
  } catch (e: any) {
    if (!stillPicked()) return;
    /* 采样失败不阻断粘贴流程，但必须说清「判定不完整」，不许静默当成无风险。
 不依赖采样的那几条（字段名对不齐等）照常展示。 */
    riskRows.value = mergeRiskRows([], nameMismatches);
    riskErr.value = '采样失败，无法判定存储形态：' + friendlyApiError(e);
  } finally {
    if (stillPicked()) riskBusy.value = false;
  }
}

/* 期望 vs 实际比对。prepare 返回源索引现状，与粘贴来的期望做字段级 diff。
 注意 prep.mappingJson 已由 EsIndexAdmin.getMapping → unwrapTypeLayer 剥掉 6.x 的
 type 包层（EsIndexAdmin:165，EsResponseShapeTest 锁定），两侧同为 typeless
 {"properties":...}，此处**不要**再做任何 _doc 处理，否则整棵 mapping 会坍缩。

 #68：cfgDiff 由「期望文本 + 探测结果」派生（见下方 computeDiffRows 顶注），
 不再是一个要靠调用点记得写的 ref —— 粘贴与探测无论谁先谁后都自动重算。 */
const cfgDiff = computed<ConfigDiffRow[]>(() => computeDiffRows(expectedFromPaste.value, prep.value));
const cfgSum = computed(() => diffConfigSummary(cfgDiff.value));

/* 分区呈现——真差异默认展开、等价噪声默认折叠。
 分区逻辑在 partitionDiffRows（已测），此处只持有开合状态。 */
const cfgParts = computed(() => partitionDiffRows(cfgDiff.value));
const benignOpen = ref(false);

/* kind→人话标签、added 提示挂载点已提到 utils/configDiffView.ts 并由真实
 diffConfig 输出驱动的断言看守（-9 / I-4）。模板直接调 kindLabel / kindNote。 */

function fmtVal(v: unknown): string {
  if (v === undefined) return '—';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/* ═══ 两张只读表的行右键 ═══
 期望/实际差异表与轮次表此前只能看不能取——比对出「哪个字段类型不对」之后，
 要拿路径/值去改注解、贴工单或回给业务方，只能手拖选中再复制。
 一级只留最常用的「复制路径/复制行」，其余收进「复制…」二级（与全站右键同规矩）。
 两张表共用一个菜单状态：同一时刻只会有一个菜单开着。 */
const rowMenu = ref<{ x: number; y: number; title: string; kind: 'diff' | 'round'; row: any } | null>(null);
function openDiffMenu(e: MouseEvent, row: ConfigDiffRow) {
  rowMenu.value = { x: e.clientX, y: e.clientY, title: '差异 · ' + row.path, kind: 'diff', row };
}
function onDiffMenuKey(e: KeyboardEvent, row: ConfigDiffRow) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), title: '差异 · ' + row.path, kind: 'diff', row };
}
function openRoundMenu(e: MouseEvent, r: any) {
  rowMenu.value = { x: e.clientX, y: e.clientY, title: '第 ' + r.round + ' 轮 · ' + (roundZh(r.phase) || r.phase), kind: 'round', row: r };
}
function onRoundMenuKey(e: KeyboardEvent, r: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), title: '第 ' + r.round + ' 轮 · ' + (roundZh(r.phase) || r.phase), kind: 'round', row: r };
}
async function copyWithToast(text: string, okMsg: string) {
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败');
}
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value; if (!m) return [];
  if (m.kind === 'diff') {
    const row = m.row as ConfigDiffRow;
    const line = [row.path, kindLabel(row.kind), fmtVal(row.expected), fmtVal(row.actual)].join('\t');
    return [
      { key: 'diff-copy-path', label: '复制路径', icon: Copy, run: () => copyWithToast(row.path, '已复制路径：' + row.path) },
      { key: 'diff-copy-row', label: '复制整行（TSV，可直接贴表格）', icon: ClipboardList, run: () => copyWithToast(line, '已复制差异行') },
      {
        key: 'diff-group', label: '复制…', icon: Copy, sep: true, children: [
          { key: 'diff-copy-expected', label: '复制期望值 JSON', icon: Braces, run: () => copyWithToast(JSON.stringify(row.expected ?? null, null, 2), '已复制期望值') },
          { key: 'diff-copy-actual', label: '复制实际值 JSON', icon: Braces, run: () => copyWithToast(JSON.stringify(row.actual ?? null, null, 2), '已复制实际值') },
          ...(row.reason ? [{ key: 'diff-copy-reason', label: '复制忽略原因', icon: Info, run: () => copyWithToast(String(row.reason), '已复制原因') }] : []),
        ],
      },
    ];
  }
  const r = m.row as any;
  const num = (v: unknown) => (v != null ? fmtNum(v) : '-');
  const line = [r.round, roundZh(r.phase) || r.phase, num(r.total), num(r.created), num(r.updated), num(r.versionConflicts)].join('\t');
  return [
    { key: 'round-copy-row', label: `复制第 ${r.round} 轮数据（TSV）`, icon: ClipboardList, run: () => copyWithToast(line, `已复制第 ${r.round} 轮数据`) },
    { key: 'round-copy-json', label: `复制第 ${r.round} 轮 JSON`, icon: Braces, run: () => copyWithToast(JSON.stringify(r, null, 2), `已复制第 ${r.round} 轮 JSON`) },
    {
      key: 'round-group', label: '更多…', icon: Copy, sep: true, children: [
        { key: 'round-copy-phase', label: '复制阶段名（中文 + 英文原名）', icon: Info, run: () => copyWithToast(`${roundZh(r.phase) || r.phase}（${r.phase}）`, '已复制阶段名') },
        { key: 'round-copy-conflicts', label: '复制冲突数（版本冲突）', icon: ClipboardCopy, run: () => copyWithToast(String(r.versionConflicts ?? 0), '已复制冲突数') },
      ],
    },
  ];
});

/* -9 / C-1：没有期望就没有「期望 vs 实际」这回事。
 原实现在未粘贴时用 {} 当期望，与 ES 读回的整棵 mapping 比，产出几十上百条
 kind:'removed'，类别列写着「实际有，期望没有」—— 用户根本没提供任何期望，
 界面却断言「你的期望里没有这些字段」。

 根因不是少一个 if，而是用 {} 这个**合法值**表示「缺席」：{} 既可能是
 「没提供」也可能是「期望确实为空」。故判据取 parseExpectedMapping 返回的
 null（缺席），而不是「粘贴过没有」—— 粘了但该索引 mappingJson 为 null 时
 pasteIdx >= 0 成立而期望仍缺席，用 pasteIdx 当判据 C-1 会原样复发。
 详见 utils/configDiffView.ts 顶注。

 #68 / 次因：原实现是「computeDiff(p) 写 cfgDiff.value」，且**唯一**调用点在
 doPrepare 里。于是「先探测、后粘贴」这个完全自然的顺序恒不出行且界面零提示 ——
 期望侧后到，而没有任何东西会再算一次。修法不是补一个 watch 去追平两份状态
 （那等于把「何时重算」继续交给调用点记牢），而是把 cfgDiff 改成 computed：
 它由 mappingJson（期望）与 prep（实际）**共同派生**，两侧谁后到都会自动重算，
 顺序不再可能出错。少一个可写状态，也就少一处能忘记同步的地方。

 #68 / 派生化暴露出的一个**旧顺序在偷偷承担**的语义：未粘贴时 doPrepare 会把源索引
 现状**写进 mappingJson 这同一个框**（它既是「期望输入框」又是「预填结果框」）。
 老代码靠「在覆盖之**前**算一次」躲开，即顺序本身充当了判据。改成派生后这层保护没了：
 覆盖后期望文本 == 实际文本，会渲染出一整屏 kind:'same' —— 用户没提供任何期望，
 界面却报「你的期望与实际完全一致」，与 C-1 同类（拿一个并非期望的合法值冒充期望）。
 故判据显式化为 expectedFromPaste：**只有粘贴来的那份文本才是期望**。
 它与 C-1 的 null 判据是**与**的关系，不是替代 —— 粘了但该索引 mappingJson 为 null 时
 仍须缺席（ 的 null 透传路径，e2e 5-4 在跑）。 */
function computeDiffRows(expectText: string, p: any): ConfigDiffRow[] {
  const expectMapping = parseExpectedMapping(expectText);
  if (!shouldDiffMapping(expectMapping)) return [];
  /* 实际侧缺席（源索引无 mapping）退化成 {} 是**对的**：此时「期望有、实际没有」
 确实成立，added 行是真话。与期望侧缺席不对称，因为不对称的是语义本身。 */
  const actualMapping = parseExpectedMapping(String(p?.mappingJson ?? '')) ?? {};
  return diffConfig(expectMapping, actualMapping);
}

/* ── +1：源/目标 mapping 叶子级类型对比 ──────────────────────────
 探测后（prep 在场）用 useIndexFields(源) 与审编框 mappingJson 逐叶对比：
 源字段在目标缺失 / 类型变更 → 以 RiskRow 结构进既有 ar-risk 区（warning 档）；
 目标已置 dynamic:false 且有缺失时升 error（写入将吃 strict 映射拒绝，不只是降级）。
 mappingJson 为空（目标由 ES 动态推断）或不合法时静默不出行——非法 JSON 由
 校验步红字负责，这里不重复播报。对比行数封顶 100，防整树缺席刷屏。 */
function targetLeafTypes(text: string): { types: Map<string, string>; dynamicOff: boolean } | null {
  let root: any;
  try { root = JSON.parse(text); } catch { return null; }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  const m = root.mappings?.properties ? root.mappings
    : root.properties ? root
      : (Object.values<any>(root).find(v => v && typeof v === 'object' && v.properties) || root);
  const types = new Map<string, string>();
  (function walk(props: any, prefix: string) {
    if (!props || typeof props !== 'object') return;
    for (const [name, def] of Object.entries<any>(props)) {
      const path = prefix ? prefix + '.' + name : name;
      if (def?.type) types.set(path, String(def.type));
      else if (def?.properties) types.set(path, 'object');
      if (def?.fields) for (const [sub, sd] of Object.entries<any>(def.fields)) types.set(path + '.' + sub, String(sd?.type || '?'));
      if (def?.properties) walk(def.properties, path);
    }
  })(m?.properties || {}, '');
  return { types, dynamicOff: m?.dynamic === false };
}

const destTypeRisks = computed<RiskRow[]>(() => {
  if (!prep.value || !mappingJson.value.trim()) return [];
  const t = targetLeafTypes(mappingJson.value);
  if (!t) return [];
  const rows: RiskRow[] = [];
  let missing = 0;
  for (const f of arIdxFields.value) {
    const dt = t.types.get(f.path);
    if (dt == null) {
      missing++;
      if (rows.length < 100) rows.push({
        code: 'DEST_FIELD_MISSING',
        level: t.dynamicOff ? 'error' : 'warning',
        field: f.path,
        reason: t.dynamicOff
          ? `源字段在目标 mapping 中缺失且目标已置 dynamic:false——重建后写入含该字段的文档将报 strict 映射错误`
          : `源字段在目标 mapping 中缺失——重建后将由 ES 动态推断类型，首写文档决定类型，可能与源不一致`,
        fix: `在目标 mapping 的 properties 中补上 "${f.path}": { "type": "${f.type}" }`,
      });
    } else if (dt !== f.type && dt !== 'object' && f.type !== 'object') {
      if (rows.length < 100) rows.push({
        code: 'DEST_FIELD_TYPE_CHANGED',
        level: 'warning',
        field: f.path,
        reason: `类型变更：源 ${f.type} → 目标 ${dt}——reindex 按目标类型重新解析，格式不符的文档将被丢弃`,
        fix: `确认目标类型正确，或改回 "${f.type}" 保持兼容`,
      });
    }
  }
  return rows;
});

/* 采样风险 + 源/目标类型对比并轨展示（error 档前置排序由 mergeRiskRows 提供） */
const displayRiskRows = computed<RiskRow[]>(() => mergeRiskRows(riskRows.value, destTypeRisks.value));

const starting = ref(false);
const job = ref<any>(null);

/* w80：阶段徽标档——推进中（含 AWAIT_CONFIRM 等待放行）pill y 醒目；
 终态阶段 pill n 中性（作业终态本身已由状态 pill 承担色语义，阶段不抢戏） */
function stagePill(s: any): 'y' | 'n' {
  const v = String(s || '').toUpperCase();
  return ['DONE', 'SUCCEEDED', 'FAILED', 'ABORTED'].includes(v) ? 'n' : 'y';
}

/* StatusPill tone 字面量收窄（BulkEditorView statusPillCls 同法）——
 statusColor/sevPill 返回 string，StatusPill 契约 tone 为五档联合，消费处显式收窄 */
function statusTone(s: any): 'g' | 'y' | 'r' | 'b' | 'n' {
  return statusColor(s) as 'g' | 'y' | 'r' | 'b' | 'n';
}
function sevTone(s: any): 'g' | 'y' | 'r' | 'b' | 'n' {
  return sevPill(s) as 'g' | 'y' | 'r' | 'b' | 'n';
}

/* W4：校验报告 severity → .pill 档映射收口 utils/esEnumZh 的 sevPill
 （error→r / warn→y / info→b / 兜底 n，critical→r），本地实现退役；
 ConfigValidatorView cvSevPill（err/warn/info 别名档）同步并入同源。 */

/* w80：SUCCEEDED 常驻「去查询验证」的数据源——优先作业回传的新索引名，
 回落向导内目标名/建议名（与 doConfirmSwitch toast action 同一深链口径） */
const verifiedTarget = computed(() =>
  job.value?.newIndex || job.value?.targetIndex || destIndex.value || prep.value?.suggestedDest || '');
function goVerifyFromJob() {
  const t = verifiedTarget.value;
  if (t) store.pick(t);
  router.push({ path: '/search', query: t ? { idx: t } : {} });
}

/* 全量 reindex 进度百分比（后端 awaitTask 每秒透出 currentProgress.created/total） */
function reindexPct(j: any): number {
  const p = j?.currentProgress;
  if (!p || !p.total) return 0;
  return Math.min(100, Math.round((p.created || 0) / p.total * 100));
}

/* ═══ W3：全量进度速率观测（XmigrateView rateOf 范式移植，Xm 文件零触碰）═══
 Σcreated 对时间差分：采样源=既有 useAutoRefresh 询（2s 一拍，零新增定时器）——
 watch currentProgress.created 相邻两次采样，差值/时间差 = docs/s；差分 ≤0（未推进/回读
 抖动）不出，不冒充速率。jobId 变更即重置采样基线（换作业不串差）。 */
const rateSample = ref<{ ts: number; created: number } | null>(null);
const reindexRate = ref<number | null>(null);
let rateJid: unknown = null;
watch(() => [job.value?.jobId, job.value?.currentProgress?.created] as const, ([jid, created]) => {
  if (jid == null || typeof created !== 'number') { rateSample.value = null; reindexRate.value = null; rateJid = null; return; }
  if (jid !== rateJid) { rateJid = jid; rateSample.value = { ts: Date.now(), created }; reindexRate.value = null; return; }
  const prev = rateSample.value;
  const now = Date.now();
  if (prev && created > prev.created && now > prev.ts) {
    reindexRate.value = Math.round((created - prev.created) / ((now - prev.ts) / 1000));
  } else {
    reindexRate.value = null;
  }
  rateSample.value = { ts: now, created };
});

/* ═══ P2：预计剩余 ETA=(total−created−updated)/rate（速率观测行尾随段）═══
 速率=reindexRate 既有差分件；速率缺失/非正数、total 缺席、余量非正一律不出（不冒充）；
 结果 ms 交 TookBadge 四档语义徽标，随询采样刷新 */
const reindexEtaMs = computed<number | null>(() => {
  const p = job.value?.currentProgress;
  if (!p?.total || reindexRate.value == null || reindexRate.value <= 0) return null;
  const remain = Number(p.total) - Number(p.created || 0) - Number(p.updated || 0);
  if (!Number.isFinite(remain) || remain <= 0) return null;
  return Math.round((remain / reindexRate.value) * 1000);
});

/* 已耗时：运行中=now-startedAt（随询刷新，无自建心跳）；终态取后端 tookMs
 （finishedAt-startedAt，口径；-1/缺席 → 不冒充，走 '—' 档），终态后不再增长撒谎 */
const jobElapsedMs = computed<number | null>(() => {
  const j = job.value;
  const raw = j?.startedAt;
  if (raw == null) return null;
  const started = Number(raw);
  if (!Number.isFinite(started) || started <= 0) return null;
  if (j.status !== 'RUNNING' && j.tookMs != null && Number(j.tookMs) >= 0) return Number(j.tookMs);
  return Math.max(0, Date.now() - started);
});
const allJobs = ref<any[]>([]);
/* 轮询合并 useAutoRefresh（Xmigrate 同范式）：KeepAlive 失活/页面隐藏/
 卸载全链停续，取代裸 setInterval + 手写可见性守卫；间隔沿用 2000ms。
 pollJobId 非空 =「有在跑的作业要盯」= ms>0；tick 内见到终态即置空停表。 */
const pollJobId = ref('');
const jobPoller = useAutoRefresh(async () => {
  const id = pollJobId.value;
  if (!id) return;
  try {
    const j = await api.adhoc.status(id);
    if (pollJobId.value !== id) return; // 轮询目标已切：旧拍回包不得覆盖新作业状态
    job.value = j;
    if (job.value.status !== 'RUNNING') {
      /* w80：终态不在页内 notify——全局 jobTracker 对同一终态跃迁已发通知（见过在跑→终态弹一次），
 页内再弹一次是双 toast。这里只停表 + 刷最近作业列表，状态行由上方 pill 呈现终态 */
      stopPolling();
      loadJobs();
    }
  } catch { /* 网络抖动忽略，下一轮重试 */ }
}, {
  ms: () => (pollJobId.value ? 2000 : 0),
  guard: () => !!pollJobId.value,
});
jobPoller.setOn(true);

const TERMINAL = new Set(['SUCCEEDED', 'DONE', 'FAILED', 'ABORTED']);
const isTerminal = computed(() => !!job.value && TERMINAL.has(job.value.status));

/* F1：作业执行中。status === 'RUNNING' 已涵盖 AWAIT_CONFIRM——后端等确认门时只翻
 stage（AdhocRebuildService:691 setStage(AWAIT_CONFIRM)）不翻 status，前端轮询也
 正是以 status==='RUNNING' 持续，此刻业务写入可能正被阻断，更得留一条回监控的出路。 */
const hasRunningJob = computed(() => !!job.value && job.value.status === 'RUNNING');

/* F1：步骤条点击。回退照旧（RUNNING 时回退可用是 adhocDiffWiring 的既有契约）；
 前向只放行「执行监控」一步——作业在跑时它是用户在任何位置都能一键回去的家。
 其余前向步骤仍锁：未经探测/校验不得跳页，流程不可倒灌。 */
function onStepChipClick(i: number) {
  if (isTerminal.value) return;
  if (i < step.value) { step.value = i; return; }
  if (i === STEPS.length - 1 && hasRunningJob.value && step.value !== i) step.value = 4;
}

/* 键盘可达：与 onStepChipClick 同一套放行规则——回退步与「返回执行监控」chip
 才是 button（Tab 可达、Enter/Space 触发），其余步骤 tabindex=-1 不进 Tab 序 */
function stepInteractive(i: number): boolean {
  if (isTerminal.value) return false;
  return i < step.value || canReturnToMonitor(i);
}

/* 监控 chip 的「可一键返回」视觉提示（虚线描边 + title），仅当人在别处且作业在跑 */
function canReturnToMonitor(i: number): boolean {
  return i === STEPS.length - 1 && step.value !== STEPS.length - 1 && hasRunningJob.value;
}

const strategyLabel = computed(() =>
  strategy.value === 'INCREMENTAL' ? 'A · 增量追平'
    : strategy.value === 'WRITE_BLOCK' ? 'B · 写阻断窗口' : 'C · 直切 + 回补报告');

/* prepare 世代守卫（本文件 watchJob watchSeq 同语言）：探测钮 disabled 是单通道闸，
 IndexPicker @picked 通道绕闸——探测在途换索引再探即双在途，无世代守卫时旧包后到
 覆写新 prep、旧失败 catch 把新成功 prep 清成 null。成功/catch/finally 三支同口径
 （raceGuard858 同款）：过期支整体丢弃且跳过 finally 复位（新在途轮持闸），reset 侧显式清场。 */
let prepSeq = 0;
async function doPrepare() {
  preparing.value = true;
  const seq = ++prepSeq;
  prepErr.value = '';
  prepErrRaw.value = null;
  ensureArFields(); /* +1：补全字段源同点预载（dsl-assist 候选 + 源/目标类型对比共用） */
  try {
    const p = await api.adhoc.prepare(indexName.value);
    if (seq !== prepSeq) return;
    prep.value = p;
    /* 粘贴来的期望配置**优先于**源索引预填。若在此无条件覆盖，
 使用者刚粘贴的 settings/mapping 会被源索引现状悄悄冲掉，
 他却以为正拿着业务侧声明的配置去重建——静默回落到旧配置正是本 Task 要堵的。 */
    if (pasteIdx.value < 0) {
      settingsJson.value = prettyJson(prep.value.settingsJson || '');
      mappingJson.value = prettyJson(prep.value.mappingJson || '');
    }
    /* A3：destIndex / timeField 只覆写「自动填充」的值（空，或仍等于上一轮建议——
 说明用户没碰过）。手改过的目标名/时间字段不许被再次探测冲掉，
 与上方「粘贴来的期望优先于源索引预填」是同一条红线。 */
    const sugDest = prep.value.suggestedDest || '';
    /* 自动建议名（*_adhoc_<14 位时间戳>）必须取当前这一轮的值；手写名才保留。 */
    if (!destIndex.value || destIndex.value === lastPrepDest || AUTO_DEST_RE.test(destIndex.value.trim())) {
      destIndex.value = sugDest;
    }
    lastPrepDest = sugDest;
    /* 同理：粘贴流已把 strategy 钉成 WRITE_BLOCK，不让探测结果改回去 */
    if (pasteIdx.value < 0 && !prep.value.timeFieldCandidates?.length) strategy.value = 'WRITE_BLOCK';
    const sugTf = prep.value.timeFieldCandidates?.[0]?.field || '';
    if (!timeField.value || timeField.value === lastPrepTimeField) timeField.value = sugTf;
    lastPrepTimeField = sugTf;
  } catch (e: any) {
    if (seq !== prepSeq) return;
    /* 裸 e.message → friendlyEsError（toast 与内联错误条同用一份人话文案） */
    const msg = friendlyApiError(e) || '探测失败';
    store.notify('error', msg);
    prepErr.value = msg;
    prepErrRaw.value = e; /* ：原始对象旁路（喂 errMeta 读 code/endpoint） */
    prep.value = null;
  } finally {
    if (seq === prepSeq) preparing.value = false;
  }
}

/* ═══ W10：timeField 智能预填（预填兼防呆）═══
 此前时间字段只在 doPrepare/resumeScene 探测点补位；策略步把策略切回 INCREMENTAL 时
 timeField 常为空，「下一步」被禁+红字拦截（346 门），用户得回下拉手动选。
 现落进 INCREMENTAL 档且字段为空时自动预填首位候选（候选唯一/首位=最佳，用户仍可改/清）。
 只盯 INCREMENTAL：WRITE_BLOCK 无 timeField 的「全程挡写警告+已知悉」是确认门语义
 （needAckFullBlock/ackFullBlock），预填会把它静默短路——零触碰。 */
watch(() => [strategy.value, prep.value?.timeFieldCandidates] as const, () => {
  if (strategy.value !== 'INCREMENTAL' || timeField.value) return;
  const first = prep.value?.timeFieldCandidates?.[0]?.field;
  if (first) timeField.value = first;
}, { immediate: true });

/* W10：步卡内单行 input Enter=该步主钮（无 form 包装，轻量函数分派）。
 守卫与主钮 disabled 逐一对应，disabled 时 Enter 静默（与钮同语义）；步骤条 chips
 既有 Enter/Space 键盘口径（adhocStepA11y/）不在此列、零触碰。 */
function destIndexEnter() {
  if (!validating.value) void doValidateConfig(true); /* 审编步主钮「校验并继续」 */
}
function strategyNextEnter() {
  if ((strategy.value !== 'INCREMENTAL' || !!timeField.value) && canStart.value) step.value = 3; /* 策略步主钮「下一步」 */
}

async function doStart() {
  /* 权限执行体首行门（启动钮已有 v-if，此处覆盖 Enter/程序化通道） */
  if (!canOps.value) { store.notify('warning', '重建操作需专项或 ADMIN 角色'); return; }
  /* sem-rm 智能纠错：目标名硬规则未过不放行（红字常驻审编步，这里兜底防绕过） */
  if (destNameErr.value) { store.notify('error', '目标索引名校验未通过——已阻止启动：' + destNameErr.value); return; }
  starting.value = true;
  const signal = startQr.begin(); /* ：begin 即作废上一轮（竞态丢弃防线） */
  try {
    const r = await api.adhoc.start({
      index: indexName.value,
      strategy: strategy.value,
      destIndex: destIndex.value || undefined,
      settingsJson: settingsJson.value || undefined,
      mappingJson: mappingJson.value || undefined,
      timeField: timeField.value || undefined,
      bufferMs: bufferMs.value,
      deleteOldIndex: deleteOldIndex.value,
      confirmDirectSwap: confirmDirectSwap.value,
      pauseBeforeSwitch: pauseBeforeSwitch.value,
    });
    /* 旧轮竞态丢弃——启动是控制面写操作，丢弃响应时提示以作业列表为准
 （后端可能已受理，UI 不假装未发生） */
    if (signal.aborted) { store.notify('warning', '启动响应已作废（后端可能已受理，以作业列表为准）'); return; }
    job.value = r.job;
    step.value = 4;
    startPolling(r.jobId);
    loadJobs();
  } catch (e: any) {
    store.notify('error', friendlyApiError(e) || '启动失败'); /* ：裸 e.message → friendlyEsError */
  } finally {
    startQr.finish();
    starting.value = false;
  }
}

function startPolling(jobId: string) {
  pollJobId.value = jobId;
  /* setOn(true) 内部 start()：先停旧表再按当前 ms 排新表（幂等，防双表） */
  jobPoller.setOn(true);
}

function stopPolling() {
  pollJobId.value = '';
  watchSeq += 1; // 离开监控步/reset 后，在途 watchJob 回包整体过期——旧作业回包不得复活轮询
  jobPoller.stop();
}

async function doAbort() {
  /* 权限执行体首行门（中止钮已有 v-if，此处覆盖程序化通道） */
  if (!canMutateJob.value) {
    store.notify('warning', jobOwner.value && auth.me?.username !== jobOwner.value && !auth.isAdmin()
      ? `作业由 ${jobOwner.value} 创建：中止仅创建者本人或 ADMIN 可操作`
      : '重建操作需专项或 ADMIN 角色');
    return;
  }
  if (!job.value || aborting.value) return;
  /* 闸置位前移到确认窗之前（xmigrateGateExport941 同族口径）：确认窗挂起期中止钮
     :disabled="aborting" 即禁用，二击不再穿透双开确认窗（confirm.ts 全局单例覆写会把
     第一开按取消静默收掉）；取消路径由 finally 复位防闸死。 */
  aborting.value = true;
  try {
    /* W10：本点全站首批开 dismissable（调试期反复起停作业的高频中低风险 warn 确认，
     勾「本次会话不再询问」后本会话内中止不再逐次弹窗）。critical 确认门（删除旧索引）零触碰。 */
    if (!await askConfirm({
      level: 'warn',
      title: '中止重建作业',
      message: '将中止当前作业并 best-effort 取消 ES 侧 reindex task：已写入新索引的数据会保留，作业不可恢复继续，需重新发起。',
      okText: '中止作业',
      dismissable: true,
    })) return;
    job.value = await api.adhoc.abort(job.value.jobId);
  } catch (e: any) { store.notify('error', friendlyApiError(e) || '中止失败'); } /* ：裸 e.message → friendlyEsError */
  finally { aborting.value = false; }
}

/* AWAIT_CONFIRM 期间业务写入正在被阻断，秒数必须自己跳动——
 静止的数字会让人低估已经挡了多久。

 -9 / I-2：原来接的是 useNow —— 那是 为「Xm 前」建的**分钟级**共享心跳
 （composables/useNow.ts:13 是 setInterval(..., 30000)），显示秒数会「7 秒」
 静止 30 秒再跳到「37 秒」，注释写着要跳动而实现没做到。
 useNow 的 30s 绝不能改：它是全站共享单例，NotifyCenter/DslQuery/History 三处在用，
 改成 1s 等于给全站白加 30 倍无谓重渲染。故本视图自建局部 1s 心跳。 */
const blockNow = ref(Date.now());
let blockTimer: any = null;

function startBlockTicker() {
  if (blockTimer) return;
  blockNow.value = Date.now();
  blockTimer = setInterval(() => { blockNow.value = Date.now(); }, 1000);
}

function stopBlockTicker() {
  if (blockTimer) { clearInterval(blockTimer); blockTimer = null; }
}

const confirming = ref(false);
const aborting = ref(false);
const blockedSec = computed(() => {
  const since = job.value?.awaitConfirmSince;
  return since ? Math.max(0, Math.round((blockNow.value - since) / 1000)) : 0;
});

/* 心跳的开关与「阻断横幅是否在渲染」绑定同一个条件（job.stage === 'AWAIT_CONFIRM'），
 而不是散在 5 处 job.value 赋值点上逐个 start/stop —— 那种写法漏掉任何一处
 都会留下一个跑着的定时器，且漏没漏看不出来。watch 保证二者不可能分叉：
 横幅在 ⇔ 心跳在。stage 离开 AWAIT_CONFIRM（确认/中止/失败）即停表。 */
watch(
  () => job.value?.stage === 'AWAIT_CONFIRM',
  (blocked) => { blocked ? startBlockTicker() : stopBlockTicker(); },
  { immediate: true },
);

/* 页面隐藏不空转（stores/jobTracker.ts onVisChange 范式）——业务写入被阻断的读秒
 是给人看的，页面隐藏时 1s 心跳空转纯属浪费：hidden 停表，回前台且横幅仍在（AWAIT_CONFIRM）
 时重启并重取基点（blockedSec 由 awaitConfirmSince 重算，秒数不因停表失真）。卸载清理见下。 */
function onBlockVisChange() {
  if (document.hidden) { stopBlockTicker(); return; }
  if (job.value?.stage === 'AWAIT_CONFIRM') startBlockTicker();
}
document.addEventListener('visibilitychange', onBlockVisChange);

async function doConfirmSwitch() {
  /* 权限执行体首行门（确认切换钮已有 v-if，此处覆盖深链/程序化通道） */
  if (!canMutateJob.value) {
    store.notify('warning', jobOwner.value && auth.me?.username !== jobOwner.value && !auth.isAdmin()
      ? `作业由 ${jobOwner.value} 创建：确认切换仅创建者本人或 ADMIN 可操作`
      : '重建操作需专项或 ADMIN 角色');
    return;
  }
  /* 闸读收本体首行+置位前移（templateSaveGate937 口径：确认窗 await 在闸读之前=闸形同虚设）——critical
     确认窗须手输旧索引名、挂起窗口长，确认切换钮 :disabled="confirming" 在窗期即禁用，
     二击不再穿透双开确认窗；取消路径由 finally 复位防闸死。 */
  if (!job.value || confirming.value) return;
  confirming.value = true;
  try {
    /* 删除旧物理索引不可逆——勾选后切换确认必须过 critical 门 */
    if (deleteOldIndex.value) {
      const okDel = await askConfirm({
        level: 'critical',
        title: '将删除旧物理索引',
        message: `切换成功后会物理删除旧索引「${indexName.value}」及其全部数据，不可恢复。输入旧索引名以确认。`,
        guardText: indexName.value,
        okText: '确认切换并删除',
      });
      if (!okDel) return;
    }
    job.value = await api.adhoc.confirmSwitch(job.value.jobId);
    /* 联动性：切换成功 toast 带「去查询验证」动作——重建完成后第一步就是验证数据，
     一键跳查询工作台（带索引深链），免手动导航 */
    const newIndex = job.value?.newIndex || job.value?.targetIndex || '';
    store.notify('success', '已确认切换', {
      duration: 12000,
      action: {
        label: '去查询验证',
        onClick: () => {
          if (newIndex) store.pick(newIndex);
          router.push({ path: '/search', query: newIndex ? { idx: newIndex } : {} });
        },
      },
    });
  } catch (e: any) {
    store.notify('error', '确认失败：' + friendlyApiError(e));
  } finally {
    confirming.value = false;
  }
}

const jobsLoading = ref(false);
async function loadJobs() {
    if (jobsLoading.value) return;
    jobsLoading.value = true;
  /* -A2：内存态辅助卡片——空时整卡消隐是有意设计，但拉取失败不能静默吞 */
  try { allJobs.value = await api.adhoc.jobs(); } catch (e: any) { allJobs.value = []; store.notify('warning', '作业列表拉取失败：' + friendlyApiError(e)); } finally { jobsLoading.value = false; }
}

/* ═══ W1：最近作业表内核（kw 过滤 + 状态漏斗 + matrixText 导出）═══
 过滤只动显示与导出行集（visibleJobs），allJobs 仍是刷新拉取的完整清单——
 过滤绝不吞数据：n/m 命中数与「清除过滤」钮在过滤生效时始终可见。 */
const jobKw = ref('');
const jobStatusFilter = ref('');
function funnelKey(s: any): string {
  return String(s || '').toUpperCase();
}
const visibleJobs = computed(() => {
  const kw = jobKw.value.trim().toLowerCase();
  return allJobs.value.filter(j => {
    if (jobStatusFilter.value && funnelKey(j.status) !== jobStatusFilter.value) return false;
    if (!kw) return true;
    return [j.jobId, j.logicalName, j.status].some(v => String(v ?? '').toLowerCase().includes(kw));
  });
});
function toggleJobStatusFilter(s: any) {
  const k = funnelKey(s);
  jobStatusFilter.value = jobStatusFilter.value === k ? '' : k;
}
function clearJobFilters() {
  jobKw.value = '';
  jobStatusFilter.value = '';
}
/* W-B：最近作业表 QRT rows 型矩阵——列序=JOB_COLS（#cell-<col> 槽按列名接线），
 行集仍收口 visibleJobs（kw+状态漏斗过滤后单一来源，表格显示与 TSV/MD 导出所见即所复）。
 数值/epoch 以原始值进矩阵：排序/Σ/采样类型徽标由内核按值口径处理，显示层由槽接管。
 尾追 tookMs 耗时列（后端 toMap 既有字段；运行中 -1/缺席 null 原值进矩阵，
 显示层 #cell-tookMs 分档） */
const JOB_COLS = ['jobId', 'logicalName', 'strategy', 'status', 'stage', 'startedAt', 'tookMs'];
const jobsMatrix = computed<any[][]>(() => visibleJobs.value.map(j => [
  j.jobId ?? null, j.logicalName ?? null, j.strategy ?? null, j.status ?? null, j.stage ?? null, j.startedAt ?? null, j.tookMs ?? null,
]));
/* 矩阵行只有七列（尾追 tookMs）：锁安全徽标/job 附加字段从 allJobs 原行对象取
 （后端 toMap 行级透出 gateOutcome/lockActive/switchedWithoutLock；作业量级小，find 足够） */
function jobOf(row: any[]): any {
  return allJobs.value.find(j => String(j?.jobId) === String(row?.[0])) || {};
}
/* 过滤空集的空态分档（QRT EmptyState 接管旧 nomatch 行）：真无作业 ≠ 过滤无命中 */
const jobsEmptyText = computed(() =>
  (jobKw.value.trim() || jobStatusFilter.value) ? '无匹配作业（过滤生效中）' : '暂无作业记录');
/* 最近作业 TSV/MD 复制（XmigrateView exportTsv/exportMd 同手法；行集=过滤后所见即所复。
 空集 warning 报真（exportEmptyGuard936 同款话术）——恒在场 disabled 的程序化兜底，不造第二措辞） */
async function exportJobsMatrix(fmt: 'tsv' | 'md') {
  const rows = visibleJobs.value;
  if (!rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const cols = ['jobId', 'logicalName', 'strategy', 'status', 'stage', 'startedAt', 'tookMs'];
  const ok = await copyText(matrixText({ rows, cols, getVal: (r: any, c: string) => r[c] ?? '' }, fmt));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行作业（${fmt.toUpperCase()}）` : '复制失败');
}
/* 轮次表 Σ（null 不计入；全 null 显示 '-'，不冒充 0——fmtNum 的 口径同源） */
function roundSum(k: string): string {
  let has = false, s = 0;
  for (const r of job.value?.rounds || []) {
    const v = r?.[k];
    if (v != null) { has = true; s += Number(v) || 0; }
  }
  return has ? fmtNum(s) : '-';
}

let watchSeq = 0;
function watchJob(jobId: string) {
  const seq = ++watchSeq; // Eye 连点竞态锚：旧作业回包按世代丢弃（job 写点/轮询劫持/失败踢回三面同口径）
  step.value = 4;
  /* 失败兜底——此前请求失败静默，监控步整块空白用户被困 */
  api.adhoc.status(jobId).then(j => {
    if (seq !== watchSeq) return; // 旧作业慢包不得顶掉新作业监控
    job.value = j;
    if (j.status === 'RUNNING') startPolling(jobId);
  }).catch((e: any) => {
    if (seq !== watchSeq) return; // 旧作业失败不得把新监控页踢回首页
    store.notify('error', '拉取作业状态失败：' + friendlyApiError(e));
    step.value = 1;
  });
}

/* ═══ W3：运行中作业重挂提示（job 内存态，刷新后 resumeScene 把 step>3 钳回 3，
 运行中作业失联，唯一回路=最近作业表 Eye 钮）═══
 扫 allJobs（api.adhoc.jobs() 的既有消费形态）复用既有 running 判据 status==='RUNNING'
 （hasRunningJob/询同一字面判据，勿自造）；仅在 step0（首页）在场。「回到监控」复用
 既有 watchJob（拉状态+startPolling 一条龙，不自造轮询），切回后 step=4 本条随条件隐没。
 resumeScene 既有 step 裁决零触碰（adhocStateMachine/adhocStepPersist 锁）；onMounted 的
 loadJobs 既有拉取即为数据源，无需新增扫描点。 */
const runningAdhocJob = computed<any>(() => allJobs.value.find(j => j?.status === 'RUNNING') || null);
const showReattachHint = computed(() => step.value === 0 && !!runningAdhocJob.value);
function reattachToRunning() {
  const j = runningAdhocJob.value;
  if (j?.jobId) watchJob(String(j.jobId));
}

function reset() {
  stopPolling();
  step.value = 0;
  /* 清场显式失效在途 prepare 世代：在途回包被守卫整体丢弃；其守卫式 finally 会跳过
     过期复位，preparing 须在此显式清（raceGuard858 reset 清 riskBusy 同款，防探测钮卡死） */
  prepSeq += 1;
  preparing.value = false;
  prep.value = null;
  /* 探测失败红条一并入清场清单：清场后红条配着新一轮的干净表单滞留屏上
     （探测失败态与粘贴失败态 pasteErr 同域同律，失败结论不陪下一轮） */
  prepErr.value = '';
  prepErrRaw.value = null;
  job.value = null;
  valReport.value = null;
  confirmDirectSwap.value = false;
  stripNote.value = '';
  /* 粘贴态与确认门一并复位，否则「再来一次」会带着上一轮的期望配置和
 已勾选的全程挡写知悉，人以为是新的一轮 */
  pasteRaw.value = '';
  pasteErr.value = '';
  pasteWarn.value = '';
  pastePicked.value = '';
  pasteList.value = [];
  pasteIdx.value = -1;
  /* #68：清期望源头即可，cfgDiff 是派生量会自己回到 []（prep 也已置 null）。
 原来这里是 cfgDiff.value = []，那是「手工同步派生状态」的最后一处，
 一并去掉才谈得上「少一处能忘记同步的地方」。 */
  expectedFromPaste.value = '';
  ackFullBlock.value = false;
  pauseBeforeSwitch.value = false;
  /* w80：清场后重新粘贴允许再次自动探测 */
  lastAutoPreparedAlias = '';
  /* F2：「再来一次」整体清场一并熄掉索引名缺失红字 */
  needIndexForManual.value = false;
  /* 风险报告是 loadDateRisks 写入的**非派生**状态（它带一次网络取数，
 做不成 computed），故必须在这里显式清 —— 否则「再来一轮」会把上一个索引的
 风险结论留在屏幕上，配着新索引的名字。riskBusy 同理须在此显式清：
 在途采样被清场后，其守卫式 finally 会认定「已不是选中项」而跳过复位。 */
  riskRows.value = [];
  riskErr.value = '';
  sampledCount.value = 0;
  samplingMode.value = '';
  riskBusy.value = false;
}

/* 热Setting页「转零停机重建」携带 {index, pendingSettings} 上下文预填。
 pendingSettings 为扁平 dot-key 变更集，合并进 prepare 预填的 settingsJson.index；
 上下文损坏时静默忽略，向导零影响。 */
async function applyRouteContext() {
  /* 无显式 ?index= 时回退读全局选中索引——IndexHub 等入口走 store.pick 不传 query，否则落到空向导 */
  const qIndex = typeof route.query.index === 'string' ? route.query.index : (store.pickedIdx || '');
  if (!qIndex) return;
  indexName.value = qIndex;
  await doPrepare();
  if (!prep.value) return;
  /* Mapping 页污染警示条「去零停机重建」携带 stripDsl=污染根清单——
 预剔除这些字段并置 dynamic:false（不防复染的重建等于白做），审编步人工确认后才进重建 */
  const qStrip = typeof route.query.stripDsl === 'string' ? route.query.stripDsl : '';
  if (qStrip && mappingJson.value) {
    try {
      const m = JSON.parse(mappingJson.value);
      const removed: string[] = [];
      for (const root of qStrip.split(',').filter(Boolean)) {
        if (m.properties && m.properties[root]) { delete m.properties[root]; removed.push(root); }
      }
      if (removed.length) {
        m.dynamic = false;
        mappingJson.value = JSON.stringify(m, null, 2);
        stripNote.value = `已自动剔除 ${removed.length} 个疑似 DSL 污染字段（${removed.join('、')}）并置 dynamic:false 防再次污染，确认无误后再继续`;
        store.notify('info', `已剔除 ${removed.length} 个疑似 DSL 污染字段并置 dynamic:false 防再次污染，请在审编步确认`);
      } else {
        /* 零剔除不能静默——典型成因是来源页看的是远程集群，而本向导 prepare 的是宿主集群同名索引 */
        stripNote.value = '预填 mapping 中未找到待剔除的污染字段（' + qStrip + '）——托管重建恒定作用于宿主集群，宿主的同名索引可能与来源页所见不同，请人工核对后再继续';
        store.notify('warning', '未在预填 mapping 中找到待剔除的污染字段，请人工核对（详见审编步提示）');
      }
    } catch { /* mapping 损坏→保持 prepare 原样，人工审编 */ }
  }
  const qPending = typeof route.query.pendingSettings === 'string' ? route.query.pendingSettings : '';
  if (qPending) {
    try {
      const pending = JSON.parse(qPending) as Record<string, any>;
      const parsed = settingsJson.value ? JSON.parse(settingsJson.value) : {};
      if (!parsed.index || typeof parsed.index !== 'object') parsed.index = {};
      let applied = 0;
      for (const [k, v] of Object.entries(pending)) {
        const key = k.startsWith('index.') ? k.slice('index.'.length) : k;
        setDotted(parsed.index, key, v);
        applied++;
      }
      settingsJson.value = JSON.stringify(parsed, null, 2);
      if (applied) store.notify('info', `已带入 ${applied} 项待应用 setting，请在审编步确认`);
    } catch { /* 上下文损坏→仅预填索引名 */ }
  }
  step.value = 1;
}

function setDotted(obj: any, dotPath: string, v: any) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (v === null) delete cur[leaf]; else cur[leaf] = v;
}

/* 草稿（w24）：切页返回不再弹回第一步。三态：
 ① 显式 ?index= 上下文（热Setting/Mapping 页转入）→ 按上下文开新流程（用户带着新意图来，旧稿让位）；
 ② 无 query 但有可恢复草稿（step>0 的向导现场）→ 续现场：保步骤，静默重拉 prep 重建服务端派生态，
 审编/策略等用户编辑稿一律不覆写（doPrepare 的覆写路径只在显式开流时走）；
 ③ 全新进入（无 query 无稿）→ 维持旧行为回落全局选中索引预填。 */
/* 进入裁决(整页导航与 SPA 内重入共用):
 ① 显式 ?index= 上下文(且非同索引返回) → 按上下文开新流程,用后即清 query;
 ② 有现场(到过 step≥1 或 step0 输过索引名) → 续现场;
 ③ 全新 → 回落全局选中索引预填。 */
function adjudicateEntry() {
  const hasQueryCtx = typeof route.query.index === 'string' && !!route.query.index;
  const hasRestoredScene = step.value > 0 || !!indexName.value;
  /* w27:同一个索引的 query 重入 = 用户从原入口回来看现场,不是新意图 —— 不重置;
 换了索引才是带着新意图来,才走上下文重置。 */
  const sameIndexReturn = hasQueryCtx && hasRestoredScene
    && String(route.query.index) === indexName.value && step.value > 1;
  if (hasQueryCtx && !sameIndexReturn) {
    applyRouteContext().then(() => {
      /* 一次性上下文用后即清(同 dsl.carry 惯例):浏览器回退/侧栏返回不再带着旧 query
 重复触发重置——这正是「切页回来跳回第一步」的第二病根。 */
      router.replace({ query: {} }).catch(() => {});
    });
  } else if (hasRestoredScene) resumeScene();
  else applyRouteContext();
}

/* KeepAlive 回流：视图被缓存时 mounted 不再触发，直通契约改由 activated 消费 */
onActivated(() => { consumeRebuildHandoff(); });

onMounted(() => {
  /* 1125：挂载期读取（作业清单 + 入口裁决里的 prepare/体检采样）同样要过身份门——
     宿主换 token 的窗口里 probed 未落地，旧 target 的作业行/源档案会先拉回来，
     在「作业列表」里呈现出上一账号的现场。不放行则挂起，身份落地补跑一次。 */
  if (adhocReady()) { consumeRebuildHandoff(); loadJobs(); adjudicateEntry(); }
  else adhocPendingBoot = true;
});

/** 与 DslQuery autoRunAllowed 同口径（无鉴权/探测未启动视同身份已定） */
const adhocReady = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('adhoc-rebuild', store.target));
let adhocPendingBoot = false;
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!adhocPendingBoot || !adhocReady()) return;
  adhocPendingBoot = false;
  consumeRebuildHandoff();
  void loadJobs();
  adjudicateEntry();
});

/* w29:SPA 内点带 ?index= 的链接进入时组件已挂载、onMounted 不再跑——此前 query 完全无响应。
 仅在 query.index 「从空到有」或「值变化」时裁决;消费后的清空(有→无)不触发。
 同索引返回仍由 sameIndexReturn 保护,不会被这条 watch 意外重置。 */
watch(() => route.query.index, (nv, ov) => {
  if (nv === ov) return;
  if (typeof nv === 'string' && nv) adjudicateEntry();
});

/* 续现场：执行监控步（job 为内存态、跨页不存）钳回确认预览；step>0 时 prep 必须补拉——
 后续步骤的源物理名/文档数等展示都依赖它。只填 prep，不碰任何用户编辑稿。 */
async function resumeScene() {
  if (step.value > 3) step.value = 3;
  /* w27:riskRows/pasteList 是内存态,重挂载即失——体检结果「第一回有、第二回没了」的根因。
 现场还在(pasteList 有选中项)时重跑采样体检,让回到向导的人始终看到同一份风险报告。 */
  if (pasteIdx.value >= 0 && pasteList.value[pasteIdx.value] && !riskRows.value.length && !riskBusy.value) {
    loadDateRisks(pasteList.value[pasteIdx.value]);
  }
  if (!prep.value && indexName.value) {
    /* 与 doPrepare 同一条世代守卫：挂载续场的补拉在途时用户手动探测，慢回包不得覆写新 prep */
    const seq = ++prepSeq;
    preparing.value = true;
    try {
      const p = await api.adhoc.prepare(indexName.value);
      if (seq !== prepSeq) return;
      prep.value = p;
    } catch {
      if (seq !== prepSeq) return;
      prep.value = null; /* 目标不可达等：保留现场可看，续走时 doPrepare/doStart 自会再报 */
    } finally {
      if (seq === prepSeq) preparing.value = false;
    }
  }
  /* 只补空、不覆写：用户没编辑过的字段从 prep 回填(等价首次预填),
 编辑过的草稿(粘贴/手改)原样保留——与 doPrepare 的「粘贴优先」同一条红线。 */
  if (prep.value) {
    if (!settingsJson.value) settingsJson.value = prettyJson(prep.value.settingsJson || '');
    if (!mappingJson.value) mappingJson.value = prettyJson(prep.value.mappingJson || '');
    if (!destIndex.value) destIndex.value = prep.value.suggestedDest || '';
    if (!timeField.value) timeField.value = prep.value.timeFieldCandidates?.[0]?.field || '';
  }
}
/* 两个定时器都必须随组件卸载停掉 —— 卸载后还在跑的 setInterval 是泄漏，
 且 blockNow 每秒写一次会让已销毁组件的 computed 继续被触发。
 visibilitychange 监听一并摘除（与注册同生命周期）。 */
onBeforeUnmount(() => { stopPolling(); stopBlockTicker(); document.removeEventListener('visibilitychange', onBlockVisChange); });
</script>

<style scoped>
/* 页根改 flex+gap 承担区块间距（原 .card margin-bottom:14px 随局部重声明一并退役）；
 页头/草稿徽标行/步骤条的旧 margin-bottom 同步归零，避免与 gap 双重叠加 */
.ahr { display: flex; flex-direction: column; gap: var(--sp-4); position: relative; }
.ahr > .ph { margin-bottom: 0; }
/* P2：执行进度条（ind-bar 全站范式，DevTools dt-progress 同款 absolute 零高度占位
 纯 CSS 动画）——preparing/validating/starting 三执行链任一在途即点亮 */
.ar-progress { position: absolute; top: 0; left: 0; right: 0; color: var(--ac); }
/* 索引芯片（xm-idx-go 同款） */
.ad-idx-go {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; margin-left: 5px; vertical-align: middle;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer; transition: all .12s;
}
.ad-idx-go:hover { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
/* 草稿：恢复徽标行（间距归 .ahr 页 gap，仅保留左侧对齐缩进） */
.ar-draft-row { margin: 0 0 0 var(--sp-0); }

/* 页头四件套已收敛 PageHeader 组件（.ph 系列，--sp token 版），本地旧值块删除 */

.steps { display: flex; align-items: center; gap: var(--sp-1); flex-wrap: wrap; }
.step { display: flex; align-items: center; gap: var(--sp-1h); padding: 5px var(--sp-2h); border-radius: 7px; font-size: var(--fs-sm); color: var(--tx2); cursor: default; }
.step.done { color: var(--ok); cursor: pointer; }
.step.locked { cursor: default !important; }
.step.locked:hover { background: transparent; }
/* F1：作业执行中监控步的反向入口提示——虚线描边标示「点这里回到监控」 */
.step.retmon { cursor: pointer; border: 1px dashed var(--info-line); }
.step.retmon:hover { background: var(--bg1); }
/* sem-rm：当前步走 ac 语义档（运行中→ac 标准）——品牌柔底+描边+实心序号圆，
 与 done(ok 绿)/待办(中性灰) 构成三态语言；retmon 虚线 info 蓝保持导航提示 */
.step.act { color: var(--ac); background: var(--ac-soft); border: 1px solid var(--ac-line); font-weight: 600; }
.step.act .s-num { background: var(--ac); border-color: var(--ac); color: var(--bg0); font-weight: 650; }
.s-num { display: inline-flex; align-items: center; justify-content: center; width: 17px; height: 17px; border-radius: 50%; border: 1px solid currentColor; font-size: var(--fs-xs); }
.s-arrow { color: var(--tx2); margin-left: var(--sp-1); }

/* 卡壳与卡头走 theme.css 全局 .card/.card-t（radius 归 --r-l、卡头归 13px/650）：
 卡片间距由 .ahr 页 gap 承担，不再用 margin-bottom 散值 */
/* 卡壳退壳（ P2，Xmigrate 551 先例同刀）：六个步卡/作业卡全局 .card 壳
 （border+bg+radius，theme.css:375）退役 → border-top 分节；卡留白由 .ar-sec 落位 padding 承接，
 语义边框（危险操作描边等）豁免保留；页根 .ahr flex gap 继续承担区块间距 */
.ar-sec { border-top: 1px solid var(--border); padding: var(--sp-3) var(--sp-4); }
.right { margin-left: auto; }
.row { display: flex; align-items: center; gap: var(--sp-2); margin: var(--sp-2h) 0; flex-wrap: wrap; }
.grow { flex: 1; min-width: 260px; }
.lbl { font-size: var(--fs-sm); color: var(--tx2); }
.num { width: 110px; }
/* appearance:auto 已移除——交给 theme.css 的 select[class] 全局自绘箭头 */
.sel { min-width: 220px; }
.next { margin-top: var(--sp-2h); }
/* sem-rm 智能纠错：目标物理索引名即时红字（贴近输入行，err 档） */
.ar-dest-err { margin: -4px 0 var(--sp-2); font-size: var(--fs-sm); color: var(--err); line-height: 1.5; }

.probe { display: flex; flex-direction: column; gap: var(--sp-1h); margin: var(--sp-2h) 0; }
.p-row { display: flex; gap: var(--sp-3); font-size: var(--fs-sm); align-items: baseline; }
.p-row > span:first-child { color: var(--tx2); min-width: 90px; flex-shrink: 0; }
.ok-txt { color: var(--ok); }
.warn-txt { color: var(--warn); }
.err-txt { color: var(--err); }
/* 时间字段候选可点 chip（形态归全局 .chip/.chip.on，本类只管换行排布） */
.ar-tf-chips { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.ar-tf-chip { cursor: pointer; }

/* 固定等分 grid 退役——对照双栏交给 WorkbenchLayout（拖拽/预设/记忆/窄屏堆叠） */

/* P2：.ed-label 基础档退役——类型归全局 .sec-t（.ar-diff/.report 分节标题挂类升档，
 行首横排 fs-sm/600/tx1），本类只留落位；.ed-col pane 标题走下方既有升档规则不波及 */
.ed-label { margin-bottom: var(--sp-1); }
/* W4：AR_ED 竖排标题轨退役随之——pane 内 settings/mapping 行首标题升 sec-t 档
 （fs-sm/600/tx1，.ar-manual-lb 同档）；作用域限 .ed-col（pane 实例），.ar-diff 的 .ed-label 不受影响 */
.ed-col .ed-label { font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); }
/* ed-col 吃满 pane：slot 直接落在 ResizablePane 的 .rp-content（display:block，无 flex 上下文，
 data-flex-fill/flex:1 均无效——曾因此编辑器塌到 5px 完全无法编辑）。block 父层用 height:100%
 直取 rp-content 确定高度，JsonArea fill 模式内 monaco-host flex:1 跟随。 */
.ed-col { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* JsonArea .ja 外框视图侧退壳（border:none/radius:0 独立规则追加，
 JsonArea 组件零触）——手动/审编四框在 .ed-col pane 内、粘贴导入框在弹窗 .pi-ja-wrap 内
 （NModal teleport 到 body，类锚与内容同渲染树，scoped :deep 经祖先类命中）。
 卡内卡双层描边根治；背景/圆点/工具条等组件内语义零触 */
.ed-col :deep(.ja) { border: none; border-radius: 0; box-shadow: none; }
.pi-ja-wrap :deep(.ja) { border: none; border-radius: 0; box-shadow: none; }
/* P2：ar-fill-wl 定高档（554-P0 为 fill 链补的 max(280px,40vh) 宿主确定档）随
 高度档退役——四 JsonArea 已摘 fill 改 rows 驱动（Monaco 高度=rows*19+16 纯内容函数，
 无 height:100% 解析路径，塌陷成因整体消失），pane 高度交内容自撑复归 547 裁决；
 类保留作 DOM 锚（411/426/锚字面） */
/* 标明这份 mapping 来自注解推导而非业务侧 @Mapping 原文。
 推导徽标改用 StatusPill b 档（ 语义走组件 title 同步更新），私造规则退役。 */
/* w80：.ta 裸 textarea 死样式删除（textarea 已退役 JsonArea/Monaco，模板零引用） */

.strats { display: flex; flex-direction: column; gap: var(--sp-2); }
.strat { display: flex; gap: var(--sp-2h); padding: var(--sp-2h) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); cursor: pointer; }
.strat.sel { border-color: var(--ac-hi); background: var(--ac-soft); }
.strat.dis { opacity: .45; cursor: not-allowed; }
.strat strong { font-size: var(--fs-sm); color: var(--tx0); font-weight: 650; } /* ：步骤标题 b→strong 语义清理；b 全站 650 兜底不盖 strong，字重同步更新本规则保视觉零变化 */
.strat p { margin: 3px 0 0; font-size: var(--fs-xs); color: var(--tx2); line-height: 1.5; }
.chk { display: flex; align-items: center; gap: 7px; font-size: var(--fs-sm); color: var(--tx1); margin: var(--sp-2h) 0; cursor: pointer; }

/* 自造 st-tag/st-running/st-succeeded/st-done/st-failed/st-aborted 徽标系统退役——
 状态 pill 统一走 theme.css 全局 .pill + utils/statusColor（ W4：
 SUCCEEDED/ABORTED 语义档已上提进 statusColor 枚举本身）。
 轮次阶段标签（info 私造底）亦改用 StatusPill b 档，规则随之退役。 */
/* 状态枚举英文小字（中文主体后缀，XmigrateView .xm-st-en 同款）。
 改用 StatusPill 后，监控步/作业表状态 pill 的小字视觉由组件 .sp-en 承担
 （.ar-st-en 仅作 DOM 锚外挂于 pill 根）；起轮次徽标小字亦归组件，本页
 不再自携小字样式 */

.tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); margin-top: var(--sp-2); }
/* W10：font-weight:400 页内覆写删除——表头字重回 theme.css 全局 .tbl th 600 基线
 （Security 同款由 W9 处理）；本行其余紧凑档（padding/边框）保留，布局零漂移。
 P2：--sp 收口——8px 归 var(--sp-2)（5px 非档位奇数刻意值保字面；
 w10ReduceSteps525/adhocWave544/ 三锁同步更新改锚） */
.tbl th { text-align: left; padding: 5px var(--sp-2); color: var(--tx2); border-bottom: 1px solid var(--line); }
.tbl td { padding: 5px var(--sp-2); border-bottom: 1px dashed var(--line); }
.danger { color: var(--err); }

/* W1：最近作业工具行（kw 过滤 + 清除 + 命中数） */
.ar-jobs-tools { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-2); flex-wrap: wrap; }
/* width:240px → min(240px,100%) 极窄溢出钳制（547 XmigrateView:1291 同款；
 900 档 100% 独占行不变；改用 SFB 后类锚随 input-class 留在 input 上） */
.ar-jobs-kw { width: min(240px, 100%); }
/* SFB 胶囊壳落位宽（TasksView tv-kw-wrap 先例；box-sizing 含壳边框） */
.ar-jobs-kw-wrap { width: min(240px, 100%); box-sizing: border-box; }
.ar-jobs-hit { font-size: var(--fs-xs); }
/* W-B：.ar-jobs-nomatch 空态行随裸表退役——过滤空集由 QRT EmptyState
 （emptyText/emptyHint 动态分档）承担，换壳勿留双份 */
/* 状态 pill 漏斗：可点（漏斗语义）+ 按下态描边（该状态筛选中） */
.pill.ar-st-funnel { cursor: pointer; }
.pill.ar-st-funnel[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--ac-line); }
/* 877 对称对齐：tbody 数字列与 tfoot Σ 同右轴（QRT num-col 全站语言：表头左/数值右/
聚合右）——原表体左对齐致 Σ 与其所合计的数字不共纵轴；阶段胶囊列（第 2 列）除外 */
.ar-rounds tbody td:nth-child(1), .ar-rounds tbody td:nth-child(n+3) { text-align: right; font-variant-numeric: tabular-nums; }
/* 轮次表 Σ 聚合行（DiagView dg-agg 同语言：bg2 底+顶部分隔线，数值右对齐） */
.ar-rounds-agg-row td { background: var(--bg2); border-top: 1px solid var(--line-strong); white-space: nowrap; padding: 5px var(--sp-2); font-size: var(--fs-xs); }
.ar-agg-lb { color: var(--tx2); }
.ar-rounds-agg-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--tx1); }

.report { margin-top: var(--sp-3); padding-top: var(--sp-2h); border-top: 1px dashed var(--line); }

/* stripDsl 预剔除结果常驻提示（样式对齐 MappingFieldTree 的污染警示条） */
.strip-note {
  display: flex; align-items: center; gap: var(--sp-2); padding: 7px var(--sp-3); margin-bottom: var(--sp-2h); font-size: var(--fs-sm);
  color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line));
  background: var(--warn-soft); border-radius: var(--r-m);
}

/* 内嵌校验面板。：260px 定高 → max(240px, 42vh) 弹性档（同 .ar-diff 42vh 站内口径：
 大屏随视口撑高报告可视区，240px 保底）。 W4：bg0+四边 border 圆角壳退役（卡中卡降层）
 → border-top 分节（xm-group 同刀），内容直贴卡片流；max(240px, 42vh) 滚动钳制口径原样保留 */
.val-box { margin: var(--sp-2h) 0; padding: var(--sp-2h) 0 0; border: 0; border-top: 1px solid var(--line); max-height: max(240px, 42vh); overflow: auto; }
.val-hd { display: flex; align-items: baseline; gap: var(--sp-2h); margin-bottom: var(--sp-1h); font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); }
.val-iss { display: flex; gap: var(--sp-2); align-items: baseline; padding: 3px 0; font-size: var(--fs-sm); line-height: 1.5; }
/* W10：.val-sev 基础块+三档色块退役——severity 徽标统一 .pill（theme.css 423 起），
 基础档（尺寸/圆角/配色）全由 .pill 承担，本文件只保留 flex 行内不被压缩的布局属性 */
.val-iss .pill { flex-shrink: 0; }
.val-path { color: var(--info); margin-right: var(--sp-1h); font-size: var(--fs-xs); }
/* bg0+border+radius 独立代码盒退役 → 柔底承接（uq-result ：内容面
 bg2 豁免可保底色，去 border+radius 卡中卡降层；pre 排版/换行语义零触）。
 补 max(240px, 42vh) 滚动钳（.val-box/.ar-diff 同站内口径）——backfill DSL
 超长时容器内滚动，不再把收尾报告撑出页高 */
.dsl { margin: var(--sp-2) 0 0; padding: var(--sp-2h) var(--sp-3); background: var(--bg2); border: 0; font-size: var(--fs-xs); white-space: pre-wrap; max-height: max(240px, 42vh); overflow: auto; }


/* 从业务侧粘贴期望配置 */
/* w68:手动输入折叠区 */
/* w69:双 Tab 输入模式切换 */
/* 双 Tab 输入模式降全局 seg 档（theme.css .seg 形态：bg2 底+2px 内衬+小 gap+
 --r-m 圆角，on 态 bg3 浮起）——border+通栏大圆角壳与按钮常驻底色退役。
 字面锁 `<div class="ar-input-tabs">`，故以本地规则对齐 seg 档而非挂全局类。
 P2：--sp 收口——容器行 gap/padding 2px 同为 --sp-0 等值（原 534 契约整行锁
 同步更新改锚，w10/adhocWave544/ 同步同步更新） */
.ar-input-tabs { display: inline-flex; gap: var(--sp-0); padding: var(--sp-0); background: var(--bg2); border-radius: var(--r-m); margin-bottom: var(--sp-3); }
.ar-input-tabs button {
  /* W4：--sp 精确等值收口（4=--sp-1、12=--sp-3）；容器行 gap/padding 2px 同为
 --sp-0 等值，但 rebuildFlat534:49 逐字锁 + 对该 spec 仅追加权限 → 保字面（锁面优先） */
  padding: var(--sp-1) var(--sp-3); border: 0; background: transparent; color: var(--tx1);
  font-size: var(--fs-sm); font-weight: 500; cursor: pointer; transition: all var(--tr);
  border-radius: var(--r-s); font-family: var(--font);
}
.ar-input-tabs button:hover { color: var(--tx0); }
.ar-input-tabs button.on { background: var(--bg3); color: var(--tx0); box-shadow: 0 1px 3px rgba(0,0,0,.3); font-weight: 600; }
/* w77:引导高亮 — 提醒用户需要填索引名 */
.ar-highlight { outline: 2px solid var(--ac); border-radius: var(--r-m); animation: ar-pulse 0.8s ease-in-out 3; }
/* w80：品牌色硬编码 rgba(20,184,166,.15)→token 派生——主题换肤/浅色档不再脱钩 */
@keyframes ar-pulse { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--ac) 15%, transparent); } }

/* ar-manual 编辑器外框（bg0+border 壳直包 Workbench 双编辑器）退役——内容直贴
 卡片流（扁平语言）；引导标题升 fs-head 档（card-t 同档 fs-md/650）行首横排 */
.ar-manual-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2h); }
.ar-manual-hd strong { font-size: var(--fs-md); font-weight: 650; color: var(--tx0); letter-spacing: var(--ls-tight); } /* ：b→strong 选择器同步更新 */
/* 固定等分 grid 退役——对照双栏交给 WorkbenchLayout。
 行首已填/留空徽标改用 StatusPill n 档，私造规则退役（色档归 pill 单源） */
.ar-manual-lb { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-sm); color: var(--tx1); margin-bottom: var(--sp-1); font-weight: 600; }
.ar-manual-act { display: flex; align-items: center; gap: var(--sp-2h); margin-top: var(--sp-2h); }
/* F2：索引名缺失常驻红字（颜色复用 .ar-paste-err） */
.ar-manual-idx-miss { margin-top: var(--sp-2); font-size: var(--fs-sm); font-weight: 600; }

/* ar-paste 编辑器外框（bg0+border 壳直包 Monaco）退役——Monaco 直贴卡片流；
 ⚠Monaco height="min(60vh, 420px)" 字面被 rebuildThreeState/adhocDerivedMapping/
 锁，只去壳不改字面；引导标题升 fs-head 档行首横排 */
.ar-paste { margin-bottom: var(--sp-3); }
.ar-paste-hd { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-2); }
.ar-paste-hd strong { font-size: var(--fs-md); font-weight: 650; color: var(--tx0); letter-spacing: var(--ls-tight); } /* ：b→strong 选择器同步更新 */
.ar-paste-hd .hint { color: var(--tx2); font-size: var(--fs-xs); margin-left: auto; }
.ar-paste-act { display: flex; align-items: center; gap: var(--sp-2h); margin-top: var(--sp-2); flex-wrap: wrap; }
/* 三态必须三色：解析失败(红) / 成功但无 mapping(琥珀) / 成功(绿)。
 err 与 warn 同色会让「失败」和「成功但要留意」长得一样，拆 pasteWarn 就白拆了。 */
.ar-paste-err { color: var(--err); font-size: var(--fs-sm); }
.ar-paste-warn { color: var(--warn); font-size: var(--fs-sm); }
.ar-paste-ok { color: var(--ok); font-size: var(--fs-sm); }
.ar-paste-list { display: flex; flex-wrap: wrap; gap: var(--sp-1h); margin-top: var(--sp-2); }

/* / ：date 兼容风险报告（与 .ar-diff 同款分区样式，不再是卡中卡） */
.ar-risk { margin-top: var(--sp-3); }
.ar-risk-hd { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-2); }
.ar-risk-hd .hint { color: var(--tx2); font-size: var(--fs-xs); margin-left: auto; }
.ar-risk-err { color: var(--err); font-size: var(--fs-sm); margin-bottom: var(--sp-2); }
/* 私造错误壳退役（border/err-soft/radius/排版归 theme.css .err-bar 单源，
 557 IH .ih-qerr 同刀），类名保留作 DOM 锚，只留落位 margin */
.ar-probe-err { margin-top: var(--sp-2h); }
.ar-risk-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-1h);
  padding: var(--sp-1h) 0; border-top: 1px solid var(--line); font-size: var(--fs-sm); }
.ar-risk-lv { font-weight: 600; text-transform: uppercase; font-size: var(--fs-2xs); }
.ar-risk-row.error .ar-risk-lv { color: var(--err); }
.ar-risk-row.warning .ar-risk-lv { color: var(--warn); }
.ar-risk-row.info .ar-risk-lv, .ar-risk-row.ok .ar-risk-lv { color: var(--tx2); }
.ar-risk-code { color: var(--tx2); font-size: var(--fs-xs); font-family: var(--mono, ui-monospace, monospace); }
.ar-risk-reason { flex: 1 1 100%; color: var(--tx1); line-height: 1.5; }
/* 等宽 + 可选中：人要复制这段照着改代码，不许截断、不许禁选。
 bg0+border+radius 独立代码盒退役 → 柔底承接（.dsl 同刀，uq-result ；
 user-select:text 可选中语义零触） */
.ar-risk-fix { flex: 1 1 100%; margin: var(--sp-1) 0 0; padding: var(--sp-2); background: var(--bg2);
  border: 0; white-space: pre-wrap;
  word-break: break-word; user-select: text; font-size: var(--fs-xs); line-height: 1.5;
  font-family: var(--mono, ui-monospace, monospace); }

/* / spec 全程挡写警告 */
.ar-warn-window {
  display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; margin-top: var(--sp-2h); padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-s); font-size: var(--fs-sm);
  border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line));
  background: var(--warn-soft);
}
.ar-warn-window .ar-warn-ack { margin-left: auto; display: flex; align-items: center; gap: 5px; cursor: pointer; }

/* 等待人工确认——此刻业务写入正被阻断，必须比普通提示更醒目 */
.ar-await {
  display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; margin-bottom: var(--sp-2h); padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-s); font-size: var(--fs-sm);
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line));
  background: var(--warn-soft);
}

/* W3：运行中作业重挂提示条（info 语义软档，非阻断；.ar-await 同族形态降 info 档） */
.ar-reattach-hint {
  display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-s); font-size: var(--fs-sm);
  border: 1px solid var(--info-line);
  background: var(--info-soft);
}
.ar-reattach-hint .btn { margin-left: auto; flex-shrink: 0; }

/* 期望 vs 实际 diff 表。 W10：320px 定高档退役 → max(240px, 42vh) 弹性档
 （大屏随视口撑高 diff 可视区；240px 保底同 indexHub/RankDebug 42vh 档站内口径） */
.ar-diff { margin-top: var(--sp-3); max-height: max(240px, 42vh); overflow: auto; }
/* diff 表可上百行：容器内滚动时表头吸顶。作用域限定 .ar-diff 内（同 DiagView .dg-nodes 范式），
 本文件其余 .tbl（轮次表/最近作业表）不受影响；底色须不透明，否则滚动内容穿透粘顶行 */
.ar-diff .tbl th { position: sticky; top: 0; background: var(--bg2); z-index: 1; }
/* 期望 vs 实际 diff 表——值列弹性吃满表宽（fixed 布局，弃固定 max-width 压缩） */
.ar-diff .tbl { table-layout: fixed; }
.cd-path { width: 24%; word-break: break-all; }
/* 等价噪声折叠条是 role=button 的可点 tr（点击展开/收起），补手型光标 */
.cd-benign-toggle { cursor: pointer; }
.cd-kind { width: 96px; white-space: nowrap; font-size: var(--fs-xs); }
.cd-l, .cd-r { width: 25%; word-break: break-all; font-size: var(--fs-xs); }
.cd-note { overflow-wrap: anywhere; }
.cd-hint { color: var(--tx2); font-size: var(--fs-xs); line-height: 1.5; }
.cd-added .cd-kind { color: var(--warn); }
.cd-removed .cd-kind { color: var(--info); }
.cd-changed .cd-kind { color: var(--err); }
.cd-conflict .cd-kind { color: var(--err); }

/* ═══ ：粘贴导入弹窗 ═══ */
/* bg2+radius 小卡退役（556 设计稿——弹窗内卡中卡根治）→ 行内弱文
 （.ih-tip 同语言：fs-xs/tx2，IndexHubView .ih-tip 先例）；模板壳与引导文案零触 */
.pi-hint { font-size: var(--fs-xs); color: var(--tx2); line-height: 1.5; margin-bottom: var(--sp-2); }
/* W10：粘贴编辑区弹性档（原 rows=12→244px 定高退役）——JsonArea fill 吃满
 wrapper。：定高字面退役 → :style 绑 adhoc.piH 四档（首位=原 min(60vh, 600px)
 零漂移；档位钮在弹窗 footer，data-ar-pi-h），大粘贴场景随档撑高 */
.pi-ja-wrap { display: flex; flex-direction: column; }
.pi-preview { display: flex; flex-wrap: wrap; gap: var(--sp-1) 14px; margin-top: var(--sp-1h); padding: var(--sp-1h) var(--sp-2h); border-radius: var(--r-s); font-size: var(--fs-xs); }
.pi-preview.ok { background: var(--ok-line); color: var(--tx1); }
.pi-preview.bad { background: var(--err-soft); color: var(--err); }
/* W10：sep 弱化对齐全站 .meta-strip .sep 口径（opacity .45） */
.pi-pl::before { content: '· '; opacity: .45; }
/* .pi-ta 三条规则随裸 textarea 退役——编辑区由 JsonArea（.ja 外壳 + monaco-host）承担 */

/* 900 紧凑微调档（ 口径；529 W-D 十五视图同范式）——双 Tab 与侧板
 侧距收窄、作业表工具行 kw 独占一行（.ar-jobs-tools 已 wrap；对照双栏单列归
 WorkbenchLayout 内部窄屏堆叠，本页无裸 grid 分栏）。档内零 ≥300px 裸 width */
@media (max-width: 900px) {
  .ar-input-tabs button { padding: var(--sp-2h) var(--sp-2); }
  .ar-jobs-kw { width: 100%; }
  .ar-jobs-kw-wrap { width: 100%; }
}
</style>
