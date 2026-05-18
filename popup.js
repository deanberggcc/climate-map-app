// popup.js
import { formatAddress, formatCity } from "./formatters.js";

/**
 * Safely normalize any field that might be:
 *  - a list
 *  - a JSON list string
 *  - a slash-separated string ("Residents / Businesses")
 *  - a comma-separated string
 *  - a single string
 *  - null / undefined
 */
function normalizeList(value) {
  if (Array.isArray(value)) return value;

  if (typeof value !== "string") return [];

  const s = value.trim();
  if (!s) return [];

  // JSON list?
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }

  // Slash, comma, semicolon
  if (/[\/,;]/.test(s)) {
    return s.split(/[\/,;]/).map(x => x.trim()).filter(Boolean);
  }

  // Single item
  return [s];
}

function normalizeListField(value) {
  // Nullish → Unknown
  if (!value) return "Unknown";

  // Already a list
  if (Array.isArray(value)) {
    const cleaned = value
      .map(v => (typeof v === "string" ? v.trim() : ""))
      .filter(v => v && v.toLowerCase() !== "nan" && v.toLowerCase() !== "none");

    if (cleaned.length === 0) return "Unknown";

    // Capitalize each item
    return cleaned
      .map(v => v.charAt(0).toUpperCase() + v.slice(1))
      .join(", ");
  }

  // Strings that look like lists: "['foo', 'bar']"
  if (typeof value === "string") {
    const s = value.trim();

    if (!s || s.toLowerCase() === "nan" || s.toLowerCase() === "none") {
      return "Unknown";
    }

    // Try to parse Python/JSON list strings
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return normalizeListField(parsed);
    } catch {}

    try {
      const parsed = eval(s);
      if (Array.isArray(parsed)) return normalizeListField(parsed);
    } catch {}

    // Otherwise treat as scalar string
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  return "Unknown";
}

export function renderPopupHTML(data) {
  const isVerified = data.verified === "Verified";
  const verifiedIcon = isVerified ? "✔️ " : "";

  // Normalize list fields
  const climate = normalizeListField(data.climate_categories);
  const audience = normalizeListField(data.audience_focus);
  const resilience = normalizeListField(data.adaptation_vs_mitigation);
  const activity = normalizeListField(data.advocacy_vs_action);

  // Social links (list → bullet-separated)
  const socialRaw = Array.isArray(data.social_links) ? data.social_links : [];
  const social = socialRaw
    .filter(v => v && v !== "nan")
    .join(" • ");

  return `
    <div class="popup">
      <div class="popup-title">${verifiedIcon}${data.name || "Unknown"}</div>

      <div class="popup-address">
        ${formatAddress(data.address || "")}<br>
        ${formatCity(data.city || "")}${data.state ? ", " + data.state.toUpperCase() : ""}
      </div>

      <div class="popup-meta">
        <div><strong>Type:</strong> ${data.organization_type || "Unknown"}</div>
        <div><strong>Audience:</strong> ${audience}</div>
        <div><strong>Resilience:</strong> ${resilience}</div>
        <div><strong>Activity:</strong> ${activity}</div>
        <div><strong>Action:</strong> ${data.action_category || "Unknown"}</div>
        <div><strong>Climate:</strong> ${climate}</div>
        <div><strong>Reach:</strong> ${data.reach || "Unknown"}</div>
      </div>

      ${data.website_url ? `<a class="popup-link" href="${data.website_url}" target="_blank">Website</a>` : ""}

      ${social ? `<div class="popup-social">${social}</div>` : ""}

      ${data.summary ? `<div class="popup-summary">${data.summary}</div>` : ""}
    ${!isVerified ? `
  <div class="popup-verify">
    <a href="https://forms.gle/qrH53jyJkizRgKNN7" target="_blank">Click to claim and verify</a>
  </div>` : ""}
</div>

  `;
}
