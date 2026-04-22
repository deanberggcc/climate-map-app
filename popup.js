// popup.js
import { formatAddress, formatCity } from "./formatters.js";

export function renderPopupHTML(data) {
  // Verified is ALWAYS a string: "Verified" or "Not Verified"
  const isVerified = data.verified === "Verified";
  const verifiedIcon = isVerified ? "✔️ " : "";

  const climate = (data.climate_categories || []).slice(0, 3).join(", ");
  const social = (data.social_links || []).join(" • ");

  return `
    <div class="popup">
      <div class="popup-title">${verifiedIcon}${data.name || "Unknown"}</div>

      <div class="popup-address">
        ${formatAddress(data.address || "")}<br>
        ${formatCity(data.city || "")}${data.state ? ", " + data.state.toUpperCase() : ""}
      </div>

      <div class="popup-meta">
        <div><strong>Type:</strong> ${data.organization_type || "Unknown"}</div>
        <div><strong>Action:</strong> ${data.action_category || "Unknown"}</div>
        <div><strong>Climate:</strong> ${climate || "Unknown"}</div>
        <div><strong>Audience:</strong> ${Array.isArray(data.audience_focus) ? data.audience_focus.join(", ") : data.audience_focus || "Unknown"}</div>
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

