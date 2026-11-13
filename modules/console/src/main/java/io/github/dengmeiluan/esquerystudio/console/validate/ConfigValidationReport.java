/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.console.validate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 *  配置门禁——一次校验的聚合报告（L1 Lint + L2 Dry-run + L3 Advisor）。
 *
 * <p>{@code valid} 只看 ERROR：有任一 ERROR 即 false（WARN/INFO 不阻断）。
 * {@code dryRunExecuted}/{@code dryRunPassed} 区分「没跑 dry-run」与「跑了没过」。</p>
 *
 * @author aicoding
 */
public class ConfigValidationReport {

    private final List<ConfigIssue> issues = new ArrayList<>();
    private boolean dryRunExecuted;
    private boolean dryRunPassed;
    /** w44:Dry-run 实际执行的目标集群(打偏自查) */
    private String dryRunTargetId;
    private String dryRunTargetName;
    private long elapsedMs;

    public void add(ConfigIssue issue) {
        issues.add(issue);
    }

    public void addAll(List<ConfigIssue> more) {
        issues.addAll(more);
    }

    public boolean isValid() {
        for (ConfigIssue i : issues) {
            if (i.isError()) {
                return false;
            }
        }
        return true;
    }

    public List<ConfigIssue> getIssues() {
        return issues;
    }

    /** 全部 ERROR 的一行式串联（启动 fail-fast 报错信息用）。 */
    public String errorSummary() {
        StringBuilder sb = new StringBuilder();
        for (ConfigIssue i : issues) {
            if (i.isError()) {
                if (sb.length() > 0) {
                    sb.append("; ");
                }
                sb.append(i);
            }
        }
        return sb.toString();
    }

    public boolean isDryRunExecuted() {
        return dryRunExecuted;
    }

    public void setDryRunTargetId(String dryRunTargetId) {
        this.dryRunTargetId = dryRunTargetId;
    }

    public void setDryRunTargetName(String dryRunTargetName) {
        this.dryRunTargetName = dryRunTargetName;
    }

    public void setDryRunExecuted(boolean dryRunExecuted) {
        this.dryRunExecuted = dryRunExecuted;
    }

    public boolean isDryRunPassed() {
        return dryRunPassed;
    }

    public void setDryRunPassed(boolean dryRunPassed) {
        this.dryRunPassed = dryRunPassed;
    }

    public long getElapsedMs() {
        return elapsedMs;
    }

    public void setElapsedMs(long elapsedMs) {
        this.elapsedMs = elapsedMs;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("valid", isValid());
        m.put("dryRunExecuted", dryRunExecuted);
        m.put("dryRunPassed", dryRunPassed);
        m.put("dryRunTargetId", dryRunTargetId);
        m.put("dryRunTargetName", dryRunTargetName);
        m.put("elapsedMs", elapsedMs);
        int errors = 0;
        int warns = 0;
        int infos = 0;
        List<Map<String, Object>> list = new ArrayList<>(issues.size());
        for (ConfigIssue i : issues) {
            list.add(i.toMap());
            if (ConfigIssue.ERROR.equals(i.getSeverity())) {
                errors++;
            } else if (ConfigIssue.WARN.equals(i.getSeverity())) {
                warns++;
            } else {
                infos++;
            }
        }
        m.put("errorCount", errors);
        m.put("warnCount", warns);
        m.put("infoCount", infos);
        m.put("issues", list);
        return m;
    }
}
