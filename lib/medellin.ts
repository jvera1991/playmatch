// Datos de referencia geográfica de Medellín para los filtros de comuna/barrio
// y el cálculo de punto cardinal. Fuente: división administrativa oficial de
// Medellín (16 comunas urbanas + 5 corregimientos rurales, ~275 barrios
// oficiales). La lista de barrios por comuna es un compendio de buena fe a
// partir de fuentes públicas — si un dueño no encuentra su barrio exacto,
// puede elegir el más cercano; esto no bloquea la publicación de la cancha.

export interface Comuna {
  id: string;
  nombre: string;
  barrios: string[];
}

export const COMUNAS: Comuna[] = [
  {
    id: "comuna-1",
    nombre: "Comuna 1 - Popular",
    barrios: [
      "Santo Domingo Savio Nº 1", "Santo Domingo Savio Nº 2", "Popular", "Granizal",
      "Moscú Nº 2", "Villa Guadalupe", "San Pablo", "Aldea Pablo VI",
      "La Esperanza Nº 2", "El Compromiso", "La Avanzada", "Carpinelo",
    ],
  },
  {
    id: "comuna-2",
    nombre: "Comuna 2 - Santa Cruz",
    barrios: [
      "La Isla", "El Playón de Los Comuneros", "Pablo VI", "La Frontera",
      "La Francia", "Andalucía", "Villa del Socorro", "Villa Niza",
      "Moscú Nº 1", "Santa Cruz", "La Rosa",
    ],
  },
  {
    id: "comuna-3",
    nombre: "Comuna 3 - Manrique",
    barrios: [
      "La Salle", "Las Granjas", "Campo Valdés Nº 2", "Santa Inés", "El Raizal",
      "El Pomar", "Manrique Central Nº 2", "Manrique Oriental", "Versalles Nº 1",
      "Versalles Nº 2", "La Cruz", "Oriente", "María Cano - Carambolas",
      "San José La Cima Nº 1", "San José La Cima Nº 2",
    ],
  },
  {
    id: "comuna-4",
    nombre: "Comuna 4 - Aranjuez",
    barrios: [
      "Berlín", "San Isidro", "Palermo", "Bermejal - Los Álamos", "Moravia",
      "Sevilla", "San Pedro", "Manrique Central Nº 1", "Campo Valdés Nº 1",
      "Las Esmeraldas", "La Piñuela", "Aranjuez", "Brasilia", "Miranda",
    ],
  },
  {
    id: "comuna-5",
    nombre: "Comuna 5 - Castilla",
    barrios: [
      "Toscana", "Las Brisas", "Florencia", "Tejelo", "Boyacá",
      "Héctor Abad Gómez", "Belalcázar", "Girardot", "Tricentenario", "Castilla",
      "Francisco Antonio Zea", "Alfonso López", "Caribe", "El Progreso",
    ],
  },
  {
    id: "comuna-6",
    nombre: "Comuna 6 - Doce de Octubre",
    barrios: [
      "Santander", "Doce de Octubre Nº 1", "Doce de Octubre Nº 2", "Pedregal",
      "La Esperanza", "San Martín de Porres", "Kennedy", "Picacho", "Picachito",
      "Mirador del Doce", "El Progreso Nº 2", "El Triunfo",
    ],
  },
  {
    id: "comuna-7",
    nombre: "Comuna 7 - Robledo",
    barrios: [
      "Cerro El Volador", "San Germán", "Facultad de Minas (U. Nacional)",
      "La Pilarica", "Bosques de San Pablo", "Altamira", "Córdoba",
      "López de Mesa", "El Diamante", "Aures Nº 1", "Aures Nº 2",
      "Bello Horizonte", "Villa Flora", "Palenque", "Robledo", "Cucaracho",
      "Fuente Clara", "Santa Margarita", "Olaya Herrera", "Pajarito",
      "Monteclaro", "Nueva Villa de La Iguaná",
    ],
  },
  {
    id: "comuna-8",
    nombre: "Comuna 8 - Villa Hermosa",
    barrios: [
      "Villa Hermosa", "La Mansión", "San Miguel", "La Ladera",
      "Batallón Girardot", "Llanaditas", "Los Mangos", "Enciso", "Sucre",
      "El Pinal", "Trece de Noviembre", "La Libertad", "Villatina", "San Antonio",
      "Las Estancias", "Villa Turbay", "La Sierra", "Villa Lilliam",
    ],
  },
  {
    id: "comuna-9",
    nombre: "Comuna 9 - Buenos Aires",
    barrios: [
      "Juan Pablo II", "Barrios de Jesús", "Bombona Nº 2", "Los Cerros El Vergel",
      "Alejandro Echavarría", "Barrio Caicedo", "Buenos Aires", "Miraflores",
      "Cataluña", "La Milagrosa", "Gerona", "El Salvador", "Loreto",
      "Asomadera Nº 1", "Asomadera Nº 2", "Asomadera Nº 3", "Ocho de Marzo",
    ],
  },
  {
    id: "comuna-10",
    nombre: "Comuna 10 - La Candelaria (Centro)",
    barrios: [
      "Prado", "Jesús Nazareno", "El Chagualo", "Estación Villa", "San Benito",
      "Guayaquil", "Corazón de Jesús", "Calle Nueva", "Perpetuo Socorro",
      "Barrio Colón", "Las Palmas (Centro)", "Bomboná Nº 1", "Boston",
      "Los Ángeles", "Villa Nueva", "La Candelaria", "San Diego",
    ],
  },
  {
    id: "comuna-11",
    nombre: "Comuna 11 - Laureles-Estadio",
    barrios: [
      "Carlos E. Restrepo", "Suramericana", "Naranjal", "San Joaquín",
      "Los Conquistadores", "Bolivariana", "Laureles", "Las Acacias",
      "La Castellana", "Lorena", "El Velódromo", "Estadio", "Los Colores",
      "Cuarta Brigada", "Florida Nueva",
    ],
  },
  {
    id: "comuna-12",
    nombre: "Comuna 12 - La América",
    barrios: [
      "Ferrini", "Calasanz", "Los Pinos", "La América", "La Floresta",
      "Santa Lucía", "El Danubio", "Campo Alegre", "Santa Mónica",
      "Barrio Cristóbal", "Simón Bolívar", "Santa Teresita", "Calasanz Parte Alta",
    ],
  },
  {
    id: "comuna-13",
    nombre: "Comuna 13 - San Javier",
    barrios: [
      "El Pesebre", "Blanquizal", "Santa Rosa de Lima", "Los Alcázares",
      "Metropolitano", "La Pradera", "Juan XXIII - La Quiebra", "San Javier Nº 2",
      "San Javier Nº 1", "Veinte de Julio", "Belencito", "Betania", "El Corazón",
      "Las Independencias", "Nuevos Conquistadores", "El Salado",
      "Eduardo Santos", "Antonio Nariño", "El Socorro",
    ],
  },
  {
    id: "comuna-14",
    nombre: "Comuna 14 - El Poblado",
    barrios: [
      "Barrio Colombia", "Simesa", "Villa Carlota", "Castropol", "Lalinde",
      "Las Lomas Nº 1", "Las Lomas Nº 2", "Manila", "Provenza", "El Diamante No. 2",
      "Astorga", "Patio Bonito", "El Tesoro", "Los Balsos Nº 1", "Los Balsos Nº 2",
      "Santa María de Los Ángeles",
    ],
  },
  {
    id: "comuna-15",
    nombre: "Comuna 15 - Guayabal",
    barrios: [
      "Tenche", "Trinidad", "Santa Fe", "Parque Juan Pablo II", "Campo Amor",
      "Noel", "Cristo Rey", "Guayabal", "La Colina",
    ],
  },
  {
    id: "comuna-16",
    nombre: "Comuna 16 - Belén",
    barrios: [
      "Fátima", "Rosales", "Belén", "Granada", "San Bernardo", "Las Playas",
      "Diego Echavarría", "La Mota", "La Hondonada", "Nueva Villa de Aburrá",
      "La Gloria", "Miravalle", "Loma de Los Bernal", "Altavista",
    ],
  },
  {
    id: "corregimiento-palmitas",
    nombre: "Corregimiento - San Sebastián de Palmitas",
    barrios: ["Palmitas Centro", "Volcana - Guayabal", "Urquitá"],
  },
  {
    id: "corregimiento-san-cristobal",
    nombre: "Corregimiento - San Cristóbal",
    barrios: ["San Cristóbal Centro", "El Llano", "Pedregal Alto", "Travesías"],
  },
  {
    id: "corregimiento-altavista",
    nombre: "Corregimiento - Altavista",
    barrios: ["Altavista Centro", "San Pablo", "Aguas Frías"],
  },
  {
    id: "corregimiento-san-antonio-de-prado",
    nombre: "Corregimiento - San Antonio de Prado",
    barrios: ["San Antonio de Prado Centro", "La Verde", "Potrerito", "Vallano"],
  },
  {
    id: "corregimiento-santa-elena",
    nombre: "Corregimiento - Santa Elena",
    barrios: ["Santa Elena Centro", "El Placer", "Piedras Blancas", "Barro Blanco"],
  },
];

// Centro geográfico de referencia de Medellín (Parque Berrío / Centro) para
// calcular el punto cardinal de cada cancha según su latitud/longitud.
const CENTRO_MEDELLIN = { lat: 6.2518, lng: -75.5636 };

export type PuntoCardinal = "norte" | "sur" | "oriente" | "occidente" | "centro";

export const PUNTOS_CARDINALES: { value: PuntoCardinal; label: string }[] = [
  { value: "centro", label: "Centro" },
  { value: "norte", label: "Norte" },
  { value: "sur", label: "Sur" },
  { value: "oriente", label: "Oriente" },
  { value: "occidente", label: "Occidente" },
];

// Calcula el punto cardinal de una coordenada relativa al centro de Medellín.
// Radio de "Centro": ~1.3 km del Parque Berrío (cubre La Candelaria).
export function getCardinalZone(lat: number | null, lng: number | null): PuntoCardinal | null {
  if (lat == null || lng == null) return null;

  const dLat = lat - CENTRO_MEDELLIN.lat;
  const dLng = lng - CENTRO_MEDELLIN.lng;

  // Distancia aproximada en km (suficiente para esta escala de ciudad).
  const kmPorGradoLat = 111;
  const kmPorGradoLng = 111 * Math.cos((CENTRO_MEDELLIN.lat * Math.PI) / 180);
  const distKm = Math.sqrt((dLat * kmPorGradoLat) ** 2 + (dLng * kmPorGradoLng) ** 2);

  if (distKm < 1.3) return "centro";

  const anguloGrados = (Math.atan2(dLat, dLng) * 180) / Math.PI; // -180..180, 0 = este

  if (anguloGrados >= -45 && anguloGrados < 45) return "oriente";
  if (anguloGrados >= 45 && anguloGrados < 135) return "norte";
  if (anguloGrados >= 135 || anguloGrados < -135) return "occidente";
  return "sur";
}

export function findComuna(comunaId: string | null | undefined) {
  return COMUNAS.find((c) => c.id === comunaId) ?? null;
}
