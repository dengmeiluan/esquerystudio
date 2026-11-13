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

public final class MappingSnapshot {

    private final boolean indexExists;
    private final String logicalName;
    private final List<String> indexNames;
    private final String mappingJson;

    public MappingSnapshot(boolean indexExists,
                           String logicalName,
                           List<String> indexNames,
                           String mappingJson) {
        this.indexExists = indexExists;
        this.logicalName = Objects.requireNonNull(logicalName, "logicalName");
        this.indexNames = Collections.unmodifiableList(
                new ArrayList<String>(Objects.requireNonNull(indexNames, "indexNames")));
        this.mappingJson = mappingJson;
    }

    public boolean isIndexExists() {
        return indexExists;
    }

    public String getLogicalName() {
        return logicalName;
    }

    public List<String> getIndexNames() {
        return indexNames;
    }

    public String getMappingJson() {
        return mappingJson;
    }
}
