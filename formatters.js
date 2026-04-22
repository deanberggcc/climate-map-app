// map-app/formatters.js

export function formatAddress(addr) {
  if (!addr) return "";
  addr = addr.trim().replace(/\s+/g, " ");

  const words = addr.split(" ");

  const suffixes = new Set([
    "st","rd","ave","blvd","ln","dr","ct","pkwy","hwy","way","pl","sq","ter","cir","trl","pk","rdg","pt"
  ]);

  const states = new Set(["MA","NH","CT","RI","VT","ME","NY"]);

  return words
    .map(w => {
      const upper = w.toUpperCase();

      if (states.has(upper)) return upper;
      if (/^PO$/i.test(w)) return "PO";
      if (/^Box$/i.test(w)) return "Box";
      if (/^\d+(st|nd|rd|th)$/i.test(w)) return w.toLowerCase();
      if (suffixes.has(w.toLowerCase()))
        return w[0].toUpperCase() + w.slice(1).toLowerCase();
      if (/^mc[a-z]/i.test(w)) return "Mc" + w.slice(2).toLowerCase();
      if (/^mac[a-z]/i.test(w)) return "Mac" + w.slice(3).toLowerCase();

      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export function formatCity(city) {
  if (!city) return "";
  city = city.trim();
  return city[0].toUpperCase() + city.slice(1).toLowerCase();
}
