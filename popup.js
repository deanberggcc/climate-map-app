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

export function renderPopupHTML(data) {
  // Verified is ALWAYS a string: "Verified" or "Not Verified"
  const isVerified = data.verified === "Verified";
  const verifiedIcon = isVerified ? "✔️ " : "";

  // Climate categories (always list)
  const climateList = normalizeList(data.climate_categories);
  const climate = climateList.slice(0, 3).join(", ") || "Unknown";

  // Audience focus (always list)
  const audienceList = normalizeList(data.audience_focus);
  const audience = audienceList.join(", ") || "Unknown";

  // Social links (list)
  const socialList = normalizeList(data.social_links);
  const social = socialList.join(" • ");

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
        <div><strong>Resilience:</strong> ${data.adaptation_vs_mitigation || "Unknown"}</div>
        <div><strong>Activity:</strong> ${data.advocacy_vs_action || "Unknown"}</div>
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
