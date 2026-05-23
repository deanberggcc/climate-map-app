// popup.js
import { formatAddress, formatCity } from "./formatters.js";

/**
 * Normalize any list-like field into a clean array.
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
    } catch {}
  }

  // Slash, comma, semicolon
  if (/[\/,;]/.test(s)) {
    return s.split(/[\/,;]/).map(x => x.trim()).filter(Boolean);
  }

  // Single item
  return [s];
}

/**
 * Convert list-like values into a display string.
 */
function normalizeListField(value) {
  if (!value) return "Unknown";

  if (Array.isArray(value)) {
    const cleaned = value
      .map(v => (typeof v === "string" ? v.trim() : ""))
      .filter(v => v && v.toLowerCase() !== "nan" && v.toLowerCase() !== "none");

    if (cleaned.length === 0) return "Unknown";

    return cleaned
      .map(v => v.charAt(0).toUpperCase() + v.slice(1))
      .join(", ");
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (!s || ["nan", "none"].includes(s.toLowerCase())) return "Unknown";

    // Try JSON or Python-style list
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return normalizeListField(parsed);
    } catch {}

    try {
      const parsed = eval(s);
      if (Array.isArray(parsed)) return normalizeListField(parsed);
    } catch {}

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

  // Normalize reach (scalar or list)
  const reach = Array.isArray(data.reach)
    ? data.reach.join(", ")
    : (data.reach || "Unknown");

  // Social links
  const socialRaw = Array.isArray(data.social_links) ? data.social_links : [];
  const social = socialRaw.filter(v => v && v !== "nan").join(" • ");

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
        <div><strong>Reach:</strong> ${reach}</div>
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
