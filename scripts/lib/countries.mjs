// Mapa nombre de selección (openfootball) -> código ISO para banderas de flagcdn.
// flagcdn admite códigos alpha-2 (mx, es, br...) y subdivisiones británicas (gb-eng...).

const NAME_TO_CODE = {
  // 48 participantes del Mundial 2026 (según openfootball)
  'Algeria': 'dz', 'Argentina': 'ar', 'Australia': 'au', 'Austria': 'at', 'Belgium': 'be',
  'Bosnia & Herzegovina': 'ba', 'Brazil': 'br', 'Canada': 'ca', 'Cape Verde': 'cv', 'Colombia': 'co',
  'Croatia': 'hr', 'Curaçao': 'cw', 'Czech Republic': 'cz', 'DR Congo': 'cd', 'Ecuador': 'ec',
  'Egypt': 'eg', 'England': 'gb-eng', 'France': 'fr', 'Germany': 'de', 'Ghana': 'gh', 'Haiti': 'ht',
  'Iran': 'ir', 'Iraq': 'iq', 'Ivory Coast': 'ci', 'Japan': 'jp', 'Jordan': 'jo', 'Mexico': 'mx',
  'Morocco': 'ma', 'Netherlands': 'nl', 'New Zealand': 'nz', 'Norway': 'no', 'Panama': 'pa',
  'Paraguay': 'py', 'Portugal': 'pt', 'Qatar': 'qa', 'Saudi Arabia': 'sa', 'Scotland': 'gb-sct',
  'Senegal': 'sn', 'South Africa': 'za', 'South Korea': 'kr', 'Spain': 'es', 'Sweden': 'se',
  'Switzerland': 'ch', 'Tunisia': 'tn', 'Turkey': 'tr', 'USA': 'us', 'Uruguay': 'uy', 'Uzbekistan': 'uz',

  // Extras por si cambia algún clasificado (no rompe nada tenerlos de más)
  'Italy': 'it', 'Wales': 'gb-wls', 'Northern Ireland': 'gb-nir', 'Poland': 'pl', 'Denmark': 'dk',
  'Serbia': 'rs', 'Nigeria': 'ng', 'Cameroon': 'cm', 'Mali': 'ml', 'Costa Rica': 'cr', 'Peru': 'pe',
  'Chile': 'cl', 'Venezuela': 've', 'Bolivia': 'bo', 'Greece': 'gr', 'Ukraine': 'ua', 'Romania': 'ro',
  'Hungary': 'hu', 'Slovakia': 'sk', 'Slovenia': 'si', 'China': 'cn', 'Honduras': 'hn', 'Jamaica': 'jm',
  'United Arab Emirates': 'ae', 'Oman': 'om', 'New Caledonia': 'nc', 'Bahrain': 'bh', 'Israel': 'il'
};

export function codeForTeam(name) {
  if (!name) return null;
  // Los placeholders de eliminatoria ("1A", "W73", "3E/H/I/J/K") no son selecciones reales.
  return NAME_TO_CODE[name] || null;
}

export function flagUrl(code) {
  return code ? `https://flagcdn.com/${code}.svg` : null;
}

export { NAME_TO_CODE };
