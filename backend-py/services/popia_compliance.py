"""POPIA (Protection of Personal Information Act) Compliance Utilities.

PII detection, redaction, and compliance tracking for data sent to external AI APIs.
"""

import re
from datetime import datetime, timezone

# South African specific PII patterns
SA_ID_PATTERN = re.compile(r"\b\d{13}\b")
SA_PASSPORT_PATTERN = re.compile(r"\b[A-Z]\d{8}\b", re.IGNORECASE)
SA_PHONE_PATTERN = re.compile(r"\b(?:\+27|0)[1-9]\d{8,9}\b")

# General PII patterns
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
CREDIT_CARD_PATTERN = re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")
DATE_OF_BIRTH_PATTERN = re.compile(
    r"\b(?:DOB|Date of Birth|Born|Birth Date)[:\s]*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b",
    re.IGNORECASE,
)

NAME_KEYWORDS = [
    "name:", "naam:", "full name:", "surname:", "first name:",
    "last name:", "applicant:", "client:", "customer:", "employee:",
]
ADDRESS_KEYWORDS = [
    "address:", "adres:", "street:", "road:", "avenue:",
    "postal:", "physical address:", "residential:",
]

DEFAULT_REDACTION_OPTIONS = {
    "redactEmails": True,
    "redactPhones": True,
    "redactIDNumbers": True,
    "redactBankAccounts": False,
    "redactCreditCards": True,
    "redactAddresses": False,
    "redactNames": False,
    "replacementChar": "*",
}


def is_valid_sa_id(id_str: str) -> bool:
    """Basic SA ID validation with Luhn check."""
    if len(id_str) != 13:
        return False

    month = int(id_str[2:4])
    day = int(id_str[4:6])

    if month < 1 or month > 12:
        return False
    if day < 1 or day > 31:
        return False

    # Luhn algorithm check
    total = 0
    for i in range(13):
        digit = int(id_str[i])
        if i % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit

    return total % 10 == 0


def _mask_pii(value: str, pii_type: str) -> str:
    if pii_type == "id":
        return value[:6] + "****" + value[10:]
    elif pii_type == "email":
        parts = value.split("@")
        domain_parts = parts[1].split(".")
        return parts[0][0] + "***@***." + domain_parts[-1]
    elif pii_type == "phone":
        return value[:3] + "*****" + value[-4:]
    elif pii_type == "credit_card":
        digits = re.sub(r"[-\s]", "", value)
        return "****-****-****-" + digits[-4:]
    return "***"


def detect_pii(text: str) -> dict:
    """Detect PII in text content.

    Returns dict with: hasPII, detectedTypes, matches, riskLevel, recommendations.
    """
    matches = []
    detected_types = []

    # SA ID Numbers
    id_matches = SA_ID_PATTERN.findall(text)
    valid_ids = [m for m in id_matches if is_valid_sa_id(m)]
    if valid_ids:
        matches.append({
            "type": "SA ID Number",
            "pattern": "XXXXXX****XXX",
            "count": len(valid_ids),
            "sample": _mask_pii(valid_ids[0], "id"),
        })
        detected_types.append("SA ID Number")

    # Email Addresses
    email_matches = EMAIL_PATTERN.findall(text)
    if email_matches:
        matches.append({
            "type": "Email Address",
            "pattern": "x***@***.***",
            "count": len(email_matches),
            "sample": _mask_pii(email_matches[0], "email"),
        })
        detected_types.append("Email Address")

    # Phone Numbers
    phone_matches = SA_PHONE_PATTERN.findall(text)
    if phone_matches:
        matches.append({
            "type": "Phone Number",
            "pattern": "+27*****XXXX",
            "count": len(phone_matches),
            "sample": _mask_pii(phone_matches[0], "phone"),
        })
        detected_types.append("Phone Number")

    # Credit Cards
    cc_matches = CREDIT_CARD_PATTERN.findall(text)
    if cc_matches:
        matches.append({
            "type": "Credit Card",
            "pattern": "****-****-****-XXXX",
            "count": len(cc_matches),
            "sample": _mask_pii(cc_matches[0], "credit_card"),
        })
        detected_types.append("Credit Card")

    # Contextual PII
    lower_text = text.lower()
    if any(kw in lower_text for kw in NAME_KEYWORDS):
        detected_types.append("Potential Name Reference")
    if any(kw in lower_text for kw in ADDRESS_KEYWORDS):
        detected_types.append("Potential Address Reference")

    # Date of Birth
    dob_matches = DATE_OF_BIRTH_PATTERN.findall(text)
    if dob_matches:
        matches.append({
            "type": "Date of Birth",
            "pattern": "DOB: **/**/****",
            "count": len(dob_matches),
            "sample": "[DATE OF BIRTH]",
        })
        detected_types.append("Date of Birth")

    risk_level = _calculate_risk_level(detected_types, matches)
    recommendations = _generate_recommendations(detected_types, risk_level)

    return {
        "hasPII": len(detected_types) > 0,
        "detectedTypes": detected_types,
        "matches": matches,
        "riskLevel": risk_level,
        "recommendations": recommendations,
    }


def redact_pii(text: str, options: dict | None = None) -> str:
    """Redact PII from text based on options."""
    opts = {**DEFAULT_REDACTION_OPTIONS, **(options or {})}
    redacted = text
    char = opts.get("replacementChar", "*")

    if opts["redactIDNumbers"]:
        def _redact_id(m):
            val = m.group()
            if is_valid_sa_id(val):
                return val[:6] + char * 4 + val[10:]
            return val
        redacted = SA_ID_PATTERN.sub(_redact_id, redacted)

    if opts["redactEmails"]:
        def _redact_email(m):
            val = m.group()
            parts = val.split("@")
            local = parts[0]
            domain = parts[1]
            return local[0] + char * min(len(local) - 1, 5) + "@" + char * 3 + "." + domain.split(".")[-1]
        redacted = EMAIL_PATTERN.sub(_redact_email, redacted)

    if opts["redactPhones"]:
        def _redact_phone(m):
            val = m.group()
            return val[:3] + char * (len(val) - 7) + val[-4:]
        redacted = SA_PHONE_PATTERN.sub(_redact_phone, redacted)

    if opts["redactCreditCards"]:
        def _redact_cc(m):
            val = m.group()
            digits = re.sub(r"[-\s]", "", val)
            return char * 12 + digits[-4:]
        redacted = CREDIT_CARD_PATTERN.sub(_redact_cc, redacted)

    return redacted


def create_audit_entry(
    action: str,
    data_type: str,
    pii_result: dict,
    redaction_applied: bool,
    data_sent_bytes: int,
    destination_service: str,
    purpose: str,
) -> dict:
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "dataType": data_type,
        "piiDetected": pii_result,
        "redactionApplied": redaction_applied,
        "dataSentBytes": data_sent_bytes,
        "destinationService": destination_service,
        "purpose": purpose,
        "userConsented": True,
    }


def prepare_for_api_call(text: str, options: dict) -> dict:
    """Prepare text for API call with POPIA compliance. Returns processed text + metadata."""
    original_length = len(text)
    pii_detection = detect_pii(text)

    processed_text = text
    was_redacted = False

    if options.get("enableRedaction") and pii_detection["hasPII"]:
        processed_text = redact_pii(text, options.get("redactionOptions"))
        was_redacted = True

    audit_entry = create_audit_entry(
        "API_CALL", "document_text", pii_detection, was_redacted,
        len(processed_text), options.get("destinationService", ""), options.get("purpose", ""),
    )

    return {
        "text": processed_text,
        "originalLength": original_length,
        "processedLength": len(processed_text),
        "piiDetection": pii_detection,
        "wasRedacted": was_redacted,
        "auditEntry": audit_entry,
    }


def _calculate_risk_level(types: list[str], matches: list[dict]) -> str:
    if not types:
        return "none"

    high_risk = {"SA ID Number", "Credit Card", "Bank Account"}
    medium_risk = {"Email Address", "Phone Number", "Date of Birth"}

    has_high = any(t in high_risk for t in types)
    has_medium = any(t in medium_risk for t in types)
    total_matches = sum(m["count"] for m in matches)

    if has_high or total_matches > 10:
        return "high"
    if has_medium or total_matches > 5:
        return "medium"
    return "low"


def _generate_recommendations(types: list[str], risk_level: str) -> list[str]:
    recs: list[str] = []

    if risk_level == "high":
        recs.append("Consider enabling PII redaction before sending to external APIs")
        recs.append("Review document content for unnecessary personal information")

    if "SA ID Number" in types:
        recs.append("SA ID numbers detected - ensure compliance with POPIA Section 26 (Special Personal Information)")

    if "Email Address" in types or "Phone Number" in types:
        recs.append("Contact information detected - verify purpose limitation compliance")

    if risk_level != "none":
        recs.append("Consider using anonymized or aggregated data where possible")
        recs.append("Ensure data retention policies are followed")

    return recs
