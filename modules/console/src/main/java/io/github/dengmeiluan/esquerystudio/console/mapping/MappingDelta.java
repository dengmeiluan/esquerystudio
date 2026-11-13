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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MappingDelta {

    private final Map<String, Object> additions;
    private final List<MappingConflict> conflicts;
    private final List<String> unchanged;
    private final List<String> ignored;
    private final boolean unparsed;

    public MappingDelta(Map<String, Object> additions,
                        List<MappingConflict> conflicts,
                        List<String> unchanged,
                        List<String> ignored,
                        boolean unparsed) {
        this.additions = immutableMap(additions);
        this.conflicts = Collections.unmodifiableList(new ArrayList<MappingConflict>(conflicts));
        this.unchanged = Collections.unmodifiableList(new ArrayList<String>(unchanged));
        this.ignored = Collections.unmodifiableList(new ArrayList<String>(ignored));
        this.unparsed = unparsed;
    }

    public Map<String, Object> getAdditions() {
        return additions;
    }

    public List<MappingConflict> getConflicts() {
        return conflicts;
    }

    public List<String> getUnchanged() {
        return unchanged;
    }

    public List<String> getIgnored() {
        return ignored;
    }

    public boolean isUnparsed() {
        return unparsed;
    }

    static MappingDelta unparsed() {
        return new MappingDelta(
                Collections.<String, Object>emptyMap(),
                Collections.<MappingConflict>emptyList(),
                Collections.<String>emptyList(),
                Collections.<String>emptyList(),
                true);
    }

    private static Map<String, Object> immutableMap(Map<String, Object> source) {
        Map<String, Object> copy = new LinkedHashMap<String, Object>();
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            copy.put(entry.getKey(), immutableValue(entry.getValue()));
        }
        return Collections.unmodifiableMap(copy);
    }

    @SuppressWarnings("unchecked")
    private static Object immutableValue(Object value) {
        if (value instanceof Map) {
            return immutableMap((Map<String, Object>) value);
        }
        if (value instanceof List) {
            List<Object> copy = new ArrayList<Object>();
            for (Object item : (List<?>) value) {
                copy.add(immutableValue(item));
            }
            return Collections.unmodifiableList(copy);
        }
        return value;
    }
}
