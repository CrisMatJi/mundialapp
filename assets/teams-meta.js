// Metadatos de presentación por selección: código de 3 letras, color de marca y
// nombre en español. La fuente de verdad (resultados, calendario) son los JSON de
// /data, que usan el nombre en inglés de openfootball; aquí solo añadimos estilo.

export const META = {
  'Algeria':              { code: 'ALG', color: '#0B6B3A', es: 'Argelia' },
  'Argentina':            { code: 'ARG', color: '#4E8FD6', es: 'Argentina' },
  'Australia':            { code: 'AUS', color: '#0B6B3A', es: 'Australia' },
  'Austria':              { code: 'AUT', color: '#ED2939', es: 'Austria' },
  'Belgium':              { code: 'BEL', color: '#B0283A', es: 'Bélgica' },
  'Bosnia & Herzegovina': { code: 'BIH', color: '#1B3A8C', es: 'Bosnia y H.' },
  'Brazil':               { code: 'BRA', color: '#1E9E4A', es: 'Brasil' },
  'Canada':               { code: 'CAN', color: '#D52B1E', es: 'Canadá' },
  'Cape Verde':           { code: 'CPV', color: '#1B3A8C', es: 'Cabo Verde' },
  'Colombia':             { code: 'COL', color: '#C29A0E', es: 'Colombia' },
  'Croatia':              { code: 'CRO', color: '#C8102E', es: 'Croacia' },
  'Curaçao':              { code: 'CUW', color: '#15296B', es: 'Curazao' },
  'Czech Republic':       { code: 'CZE', color: '#C8102E', es: 'Chequia' },
  'DR Congo':             { code: 'COD', color: '#0B7A45', es: 'RD Congo' },
  'Ecuador':              { code: 'ECU', color: '#0A4595', es: 'Ecuador' },
  'Egypt':                { code: 'EGY', color: '#C1121F', es: 'Egipto' },
  'England':              { code: 'ENG', color: '#1B3A8C', es: 'Inglaterra' },
  'France':               { code: 'FRA', color: '#1B3A8C', es: 'Francia' },
  'Germany':              { code: 'GER', color: '#2A2A2A', es: 'Alemania' },
  'Ghana':                { code: 'GHA', color: '#0B6B3A', es: 'Ghana' },
  'Haiti':                { code: 'HAI', color: '#1B3A8C', es: 'Haití' },
  'Iran':                 { code: 'IRN', color: '#1F7A3D', es: 'Irán' },
  'Iraq':                 { code: 'IRQ', color: '#0B6B3A', es: 'Irak' },
  'Ivory Coast':          { code: 'CIV', color: '#D9700A', es: 'Costa de Marfil' },
  'Japan':                { code: 'JPN', color: '#B0203A', es: 'Japón' },
  'Jordan':               { code: 'JOR', color: '#1B7A43', es: 'Jordania' },
  'Mexico':               { code: 'MEX', color: '#0B6B3A', es: 'México' },
  'Morocco':              { code: 'MAR', color: '#A8231A', es: 'Marruecos' },
  'Netherlands':          { code: 'NED', color: '#D9700A', es: 'Países Bajos' },
  'New Zealand':          { code: 'NZL', color: '#15296B', es: 'Nueva Zelanda' },
  'Norway':               { code: 'NOR', color: '#BA0C2F', es: 'Noruega' },
  'Panama':               { code: 'PAN', color: '#B01020', es: 'Panamá' },
  'Paraguay':             { code: 'PAR', color: '#C8102E', es: 'Paraguay' },
  'Portugal':             { code: 'POR', color: '#0B6B3A', es: 'Portugal' },
  'Qatar':                { code: 'QAT', color: '#7A1230', es: 'Catar' },
  'Saudi Arabia':         { code: 'KSA', color: '#1B7A43', es: 'Arabia Saudí' },
  'Scotland':             { code: 'SCO', color: '#15296B', es: 'Escocia' },
  'Senegal':              { code: 'SEN', color: '#0B7A45', es: 'Senegal' },
  'South Africa':         { code: 'RSA', color: '#007749', es: 'Sudáfrica' },
  'South Korea':          { code: 'KOR', color: '#1B3A8C', es: 'Corea del Sur' },
  'Spain':                { code: 'ESP', color: '#C8102E', es: 'España' },
  'Sweden':               { code: 'SWE', color: '#B58A00', es: 'Suecia' },
  'Switzerland':          { code: 'SUI', color: '#C8102E', es: 'Suiza' },
  'Tunisia':              { code: 'TUN', color: '#C8102E', es: 'Túnez' },
  'Turkey':               { code: 'TUR', color: '#E30A17', es: 'Turquía' },
  'USA':                  { code: 'USA', color: '#0A3161', es: 'Estados Unidos' },
  'Uruguay':              { code: 'URU', color: '#3DA0D6', es: 'Uruguay' },
  'Uzbekistan':           { code: 'UZB', color: '#1E8FD5', es: 'Uzbekistán' }
};

// Cabeceras de grupo (degradados) reutilizadas del diseño, por id de grupo.
export const GROUP_HEADS = {
  A: 'linear-gradient(120deg,#FF2D7E,#FF6A9C)', B: 'linear-gradient(120deg,#7C4DFF,#A07BFF)',
  C: 'linear-gradient(120deg,#1D6FF2,#52A0FF)', D: 'linear-gradient(120deg,#16C784,#4FE0A8)',
  E: 'linear-gradient(120deg,#FFA12D,#FFC23D)', F: 'linear-gradient(120deg,#16C7D6,#5FE3EE)',
  G: 'linear-gradient(120deg,#FF2D7E,#7C4DFF)', H: 'linear-gradient(120deg,#C8102E,#FF5A78)',
  I: 'linear-gradient(120deg,#1D6FF2,#16C784)', J: 'linear-gradient(120deg,#7C4DFF,#1D6FF2)',
  K: 'linear-gradient(120deg,#FF6A2D,#FFB02D)', L: 'linear-gradient(120deg,#16C784,#16C7D6)'
};

const PLACEHOLDER = { code: '·', color: '#C9D4E0', es: 'Por definir', tbd: true };

// Devuelve metadatos de una selección por su nombre (inglés). Los placeholders de
// eliminatoria ("1L", "W73", "3E/H/I/J/K") se marcan como "Por definir".
export function metaFor(name) {
  if (name && META[name]) return { name, ...META[name], tbd: false };
  return { name: name || '', ...PLACEHOLDER };
}
