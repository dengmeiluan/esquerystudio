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

package io.github.dengmeiluan.esquerystudio.console.mapping;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

public final class MappingReconcileReport {

    public enum Status {
        DISABLED,
        SKIPPED_NO_CLIENT,
        SKIPPED_INDEX_MISSING,
        FAILED_INDEX_MISSING,
        NO_CHANGE,
        UPDATED,
        CONFLICT,
        MAPPING_UNPARSED,
        FAILED_CONNECTIVITY,
        FAILED_ES
    }

    public enum Source {
        MAPPING_FILE,
        ANNOTATION_DERIVED
    }

    private final String indexKey;
    private final String logicalIndex;
    private final List<String> physicalIndices;
    private final Source source;
    private final List<String> addedFields;
    private final List<String> unchangedFields;
    private final List<MappingConflict> conflicts;
    private final Status status;
    private final long startedAt;
    private final long finishedAt;
    private final String detail;
    private final String action;

    MappingReconcileReport(String indexKey,
                           String logicalIndex,
                           List<String> physicalIndices,
                           Source source,
                           List<String> addedFields,
                           List<String> unchangedFields,
                           List<MappingConflict> conflicts,
                           Status status,
                           long startedAt,
                           long finishedAt,
                           String detail,
                           String action) {
        this.indexKey = Objects.requireNonNull(indexKey, "indexKey");
        this.logicalIndex = Objects.requireNonNull(logicalIndex, "logicalIndex");
        this.physicalIndices = immutableCopy(physicalIndices, "physicalIndices");
        this.source = Objects.requireNonNull(source, "source");
        this.addedFields = immutableCopy(addedFields, "addedFields");
        this.unchangedFields = immutableCopy(unchangedFields, "unchangedFields");
        this.conflicts = immutableCopy(conflicts, "conflicts");
        this.status = Objects.requireNonNull(status, "status");
        this.startedAt = startedAt;
        this.finishedAt = finishedAt;
        this.detail = detail;
        this.action = action;
    }

    public String getIndexKey() {
        return indexKey;
    }

    public String getLogicalIndex() {
        return logicalIndex;
    }

    public List<String> getPhysicalIndices() {
        return physicalIndices;
    }

    public Source getSource() {
        return source;
    }

    public List<String> getAddedFields() {
        return addedFields;
    }

    public List<String> getUnchangedFields() {
        return unchangedFields;
    }

    public List<MappingConflict> getConflicts() {
        return conflicts;
    }

    public Status getStatus() {
        return status;
    }

    public long getStartedAt() {
        return startedAt;
    }

    public long getFinishedAt() {
        return finishedAt;
    }

    public String getDetail() {
        return detail;
    }

    public String getAction() {
        return action;
    }

    private static <T> List<T> immutableCopy(List<T> source, String name) {
        return Collections.unmodifiableList(
                new ArrayList<T>(Objects.requireNonNull(source, name)));
    }
}
