import re

# Three regexes cover the common PII shapes in chat text. Swap for presidio if recall matters.
RULES = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[EMAIL]"),
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "[CARD]"),  # before PHONE: a card is also a long digit run
    (re.compile(r"\+?\d[\d\- ()]{8,14}\d"), "[PHONE]"),
]


def redact(text: str) -> str:
    for rx, tag in RULES:
        text = rx.sub(tag, text)
    return text
