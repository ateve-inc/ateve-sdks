package ai.ateve.models;

import java.util.Collections;
import java.util.List;

/** Generated answer with citations into {@link #content()}. */
public final class AnswerBlock {

    private String content;
    private List<Citation> citations;

    private AnswerBlock() {
    }

    public String content() { return content; }
    /** Unmodifiable view; null when the field was absent. */
    public List<Citation> citations() {
        return citations == null ? null : Collections.unmodifiableList(citations);
    }
}
