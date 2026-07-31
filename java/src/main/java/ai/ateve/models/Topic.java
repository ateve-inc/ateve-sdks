package ai.ateve.models;

import com.fasterxml.jackson.annotation.JsonValue;

/** Vertical topic filter accepted by {@code POST /v1/search}. */
public enum Topic {
    GENERAL("general"),
    NEWS("news"),
    PAPER("paper"),
    DOCS("docs"),
    CODE("code"),
    FORUM("forum"),
    WIKI("wiki"),
    PEOPLE("people"),
    COMPANY("company"),
    PERSONAL_SITE("personal_site"),
    FINANCIAL_REPORT("financial_report"),
    GOVERNMENT("government"),
    ECOMMERCE("ecommerce");

    private final String value;

    Topic(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }
}
