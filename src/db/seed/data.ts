/** Données de référence (catégories, marques) et produits de DÉMONSTRATION. */

export const INDUSTRIAL_CATEGORIES = [
  { slug: "roulements", name: "Roulements", icon: "CircleDot", description: "Roulements à billes, à rouleaux, à aiguilles et butées." },
  { slug: "paliers-supports", name: "Paliers et supports", icon: "Anchor", description: "Paliers fonte, appliques, tendeurs et supports." },
  { slug: "courroies", name: "Courroies", icon: "RefreshCcw", description: "Courroies trapézoïdales, crantées, poly-V et plates." },
  { slug: "chaines-pignons", name: "Chaînes et pignons", icon: "Link2", description: "Chaînes à rouleaux, pignons, couronnes et maillons." },
  { slug: "pompes-industrielles", name: "Pompes industrielles", icon: "Waves", description: "Pompes centrifuges, immergées, de surface et doseuses." },
  { slug: "joints-mecaniques", name: "Joints mécaniques", icon: "Disc3", description: "Garnitures mécaniques pour pompes et agitateurs." },
  { slug: "joints-hydrauliques", name: "Joints hydrauliques", icon: "CircleDashed", description: "Joints de tige, de piston, racleurs et toriques." },
  { slug: "transmission-mecanique", name: "Transmission mécanique", icon: "Cog", description: "Accouplements, poulies, réducteurs et moyeux." },
  { slug: "hydraulique", name: "Hydraulique", icon: "Gauge", description: "Vérins, distributeurs, pompes et centrales hydrauliques." },
  { slug: "moteurs-electriques", name: "Moteurs électriques", icon: "Zap", description: "Moteurs asynchrones, motoréducteurs et variateurs." },
  { slug: "tuyaux-raccords", name: "Tuyaux et raccords", icon: "Spline", description: "Flexibles hydrauliques, raccords, colliers et vannes." },
  { slug: "huiles-lubrifiants", name: "Huiles et lubrifiants", icon: "Droplet", description: "Huiles hydrauliques, graisses et lubrifiants industriels." },
  { slug: "outillage-industriel", name: "Outillage industriel", icon: "Wrench", description: "Outillage à main, extracteurs et outils de montage." },
  { slug: "equipements-maintenance", name: "Équipements de maintenance", icon: "HardHat", description: "Chauffe-roulements, alignement laser, contrôle." },
  { slug: "visserie-accessoires", name: "Visserie et accessoires", icon: "Nut", description: "Vis, écrous, rondelles, goupilles et circlips." },
] as const;

export const AGRICULTURAL_CATEGORIES = [
  { slug: "pieces-agricoles", name: "Pièces agricoles", icon: "Tractor", description: "Pièces d'usure et de rechange pour tracteurs et outils." },
  { slug: "pompes-agricoles", name: "Pompes agricoles", icon: "Waves", description: "Pompes d'irrigation, motopompes et électropompes." },
  { slug: "courroies-agricoles", name: "Courroies agricoles", icon: "RefreshCcw", description: "Courroies pour moissonneuses, presses et ensileuses." },
  { slug: "irrigation", name: "Irrigation", icon: "Sprout", description: "Asperseurs, filtres, vannes et programmateurs." },
  { slug: "goutte-a-goutte", name: "Tuyaux goutte-à-goutte", icon: "Droplets", description: "Gaines, goutteurs et accessoires de micro-irrigation." },
  { slug: "accessoires-agricoles", name: "Accessoires agricoles", icon: "Shovel", description: "Attelage, cardans, protections et accessoires." },
  { slug: "pieces-machines-agricoles", name: "Pièces de machines agricoles", icon: "Settings2", description: "Roulements agricoles, moyeux et pièces de moissonneuses." },
] as const;

export const BRANDS = [
  { slug: "skf", name: "SKF", country: "Suède" },
  { slug: "fag", name: "FAG", country: "Allemagne" },
  { slug: "nsk", name: "NSK", country: "Japon" },
  { slug: "ntn-snr", name: "NTN-SNR", country: "Japon / France" },
  { slug: "timken", name: "Timken", country: "États-Unis" },
  { slug: "gates", name: "Gates", country: "États-Unis" },
  { slug: "optibelt", name: "Optibelt", country: "Allemagne" },
  { slug: "parker", name: "Parker", country: "États-Unis" },
  { slug: "bosch-rexroth", name: "Bosch Rexroth", country: "Allemagne" },
  { slug: "grundfos", name: "Grundfos", country: "Danemark" },
  { slug: "pedrollo", name: "Pedrollo", country: "Italie" },
  { slug: "lowara", name: "Lowara", country: "Italie" },
  { slug: "renold", name: "Renold", country: "Royaume-Uni" },
  { slug: "totalenergies", name: "TotalEnergies", country: "France" },
  { slug: "facom", name: "Facom", country: "France" },
  { slug: "leroy-somer", name: "Leroy-Somer", country: "France" },
] as const;

type Attr = [key: string, label: string, value: string, unit?: string];

export type DemoProduct = {
  sku: string;
  mref?: string;
  name: string;
  short: string;
  category: string;
  brand: string;
  unit?: string;
  purchase: number;
  sale: number;
  pro: number;
  stock: number;
  min?: number;
  featured?: boolean;
  isNew?: boolean;
  attrs?: Attr[];
};

const bearing = (d: number, D: number, B: number): Attr[] => [
  ["inner_diameter", "Diamètre intérieur (d)", String(d), "mm"],
  ["outer_diameter", "Diamètre extérieur (D)", String(D), "mm"],
  ["width", "Largeur (B)", String(B), "mm"],
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  { sku: "SG-RL-6205-2RS", mref: "6205-2RSH", name: "Roulement à billes 6205-2RS", short: "Roulement rigide à une rangée de billes, double étanchéité.", category: "roulements", brand: "skf", purchase: 9.8, sale: 16.5, pro: 13.9, stock: 140, min: 30, featured: true, attrs: [...bearing(25, 52, 15), ["sealing", "Étanchéité", "2RS (joints caoutchouc)"]] },
  { sku: "SG-RL-6205-2RS-N", mref: "6205DDU", name: "Roulement à billes 6205-2RS NSK", short: "Équivalent NSK du 6205-2RS, double joint caoutchouc.", category: "roulements", brand: "nsk", purchase: 9.1, sale: 15.4, pro: 13, stock: 85, min: 20, attrs: [...bearing(25, 52, 15), ["sealing", "Étanchéité", "2RS (joints caoutchouc)"]] },
  { sku: "SG-RL-6205-2RS-F", mref: "6205-2RSR", name: "Roulement à billes 6205-2RS FAG", short: "Équivalent FAG du 6205-2RS, double joint caoutchouc.", category: "roulements", brand: "fag", purchase: 9.5, sale: 15.9, pro: 13.4, stock: 0, min: 10, attrs: [...bearing(25, 52, 15), ["sealing", "Étanchéité", "2RS (joints caoutchouc)"]] },
  { sku: "SG-RL-6305-ZZ", mref: "6305-2Z", name: "Roulement à billes 6305-ZZ", short: "Roulement rigide, flasques métalliques, série moyenne.", category: "roulements", brand: "fag", purchase: 14.2, sale: 23.9, pro: 20.1, stock: 62, min: 20, attrs: [...bearing(25, 62, 17), ["sealing", "Étanchéité", "ZZ (flasques métal)"]] },
  { sku: "SG-RL-6008-2RS", mref: "6008DDU", name: "Roulement à billes 6008-2RS", short: "Série légère, faible encombrement radial.", category: "roulements", brand: "nsk", purchase: 12.4, sale: 20.8, pro: 17.5, stock: 48, min: 15, attrs: [...bearing(40, 68, 15), ["sealing", "Étanchéité", "2RS"]] },
  { sku: "SG-RL-22210-E", mref: "22210 E", name: "Roulement à rotule sur rouleaux 22210 E", short: "Supporte de fortes charges radiales et les désalignements.", category: "roulements", brand: "skf", purchase: 86, sale: 139, pro: 121, stock: 12, min: 4, featured: true, attrs: [...bearing(50, 90, 23), ["cage", "Cage", "Acier"]] },
  { sku: "SG-RL-30206", mref: "30206", name: "Roulement à rouleaux coniques 30206", short: "Charges combinées radiales et axiales.", category: "roulements", brand: "timken", purchase: 18.5, sale: 31, pro: 26.4, stock: 36, min: 10, attrs: bearing(30, 62, 17.25) },
  { sku: "SG-RL-NU208", mref: "NU 208 ECP", name: "Roulement à rouleaux cylindriques NU 208", short: "Grande capacité de charge radiale, vitesses élevées.", category: "roulements", brand: "fag", purchase: 41, sale: 68, pro: 58.5, stock: 3, min: 6, isNew: true, attrs: bearing(40, 80, 18) },
  { sku: "SG-PL-UCP205", mref: "UCP 205", name: "Palier à semelle UCP 205", short: "Palier fonte avec roulement insert, arbre 25 mm.", category: "paliers-supports", brand: "ntn-snr", purchase: 22, sale: 36.5, pro: 31, stock: 54, min: 12, featured: true, attrs: [["shaft_diameter", "Diamètre d'arbre", "25", "mm"], ["housing", "Corps", "Fonte grise"]] },
  { sku: "SG-PL-UCF208", mref: "UCF 208", name: "Palier applique carré UCF 208", short: "Palier 4 trous, fixation murale, arbre 40 mm.", category: "paliers-supports", brand: "ntn-snr", purchase: 38, sale: 62, pro: 53, stock: 18, min: 6, attrs: [["shaft_diameter", "Diamètre d'arbre", "40", "mm"]] },
  { sku: "SG-CR-SPA1250", mref: "SPA 1250", name: "Courroie trapézoïdale SPA 1250", short: "Courroie étroite haute performance, profil SPA.", category: "courroies", brand: "optibelt", purchase: 11, sale: 18.9, pro: 15.8, stock: 75, min: 20, attrs: [["profile", "Profil", "SPA"], ["length", "Longueur primitive", "1250", "mm"]] },
  { sku: "SG-CR-B68", mref: "B68", name: "Courroie trapézoïdale B68", short: "Profil classique B, 17 × 11 mm.", category: "courroies", brand: "gates", purchase: 9.2, sale: 15.5, pro: 13, stock: 90, min: 25, attrs: [["profile", "Profil", "B"], ["length", "Longueur", "1727", "mm"]] },
  { sku: "SG-CR-8M-1200", mref: "1200-8M-30", name: "Courroie crantée HTD 8M 1200", short: "Transmission synchrone, largeur 30 mm.", category: "courroies", brand: "gates", purchase: 34, sale: 57, pro: 48.5, stock: 14, min: 5, isNew: true, attrs: [["pitch", "Pas", "8", "mm"], ["length", "Longueur", "1200", "mm"], ["width", "Largeur", "30", "mm"]] },
  { sku: "SG-CH-08B1-5M", mref: "08B-1", name: "Chaîne à rouleaux 08B-1 (5 m)", short: "Chaîne simple ½\" norme européenne, bobine de 5 m.", category: "chaines-pignons", brand: "renold", unit: "bobine", purchase: 58, sale: 94, pro: 82, stock: 20, min: 5, attrs: [["pitch", "Pas", "12.7", "mm"], ["length", "Longueur", "5", "m"]] },
  { sku: "SG-CH-PIG-08B-19", name: "Pignon 08B-1 19 dents à moyeu", short: "Pignon acier C45, alésage brut.", category: "chaines-pignons", brand: "renold", purchase: 16, sale: 27, pro: 23, stock: 25, min: 8, attrs: [["teeth", "Nombre de dents", "19"], ["pitch", "Pas", "12.7", "mm"]] },
  { sku: "SG-PO-CM5-4", mref: "CM 5-4", name: "Pompe centrifuge multicellulaire CM 5-4", short: "Pompe horizontale inox pour surpression et process.", category: "pompes-industrielles", brand: "grundfos", purchase: 980, sale: 1490, pro: 1320, stock: 4, min: 2, featured: true, attrs: [["flow", "Débit max", "8", "m³/h"], ["head", "Hauteur max", "45", "m"], ["power", "Puissance", "1.1", "kW"]] },
  { sku: "SG-PO-CP170", mref: "CPm 170", name: "Électropompe centrifuge CPm 170", short: "Pompe de surface monobloc, usage domestique et industriel léger.", category: "pompes-industrielles", brand: "pedrollo", purchase: 245, sale: 389, pro: 345, stock: 9, min: 3, attrs: [["flow", "Débit max", "6.6", "m³/h"], ["head", "Hauteur max", "34", "m"], ["power", "Puissance", "0.75", "kW"]] },
  { sku: "SG-JM-MG1-25", mref: "MG1/25-G60", name: "Garniture mécanique MG1 Ø25", short: "Garniture à soufflet élastomère, montage G60.", category: "joints-mecaniques", brand: "grundfos", purchase: 48, sale: 79, pro: 68, stock: 16, min: 6, attrs: [["shaft_diameter", "Diamètre d'arbre", "25", "mm"], ["faces", "Faces", "Carbone / Céramique"]] },
  { sku: "SG-JH-KIT-V50", name: "Kit joints vérin Ø50 tige 30", short: "Kit complet tige, piston, racleur et toriques.", category: "joints-hydrauliques", brand: "parker", unit: "kit", purchase: 26, sale: 44, pro: 37.5, stock: 22, min: 6, attrs: [["bore", "Alésage", "50", "mm"], ["rod", "Tige", "30", "mm"], ["material", "Matière", "PU / NBR"]] },
  { sku: "SG-JH-OR-BOX", name: "Coffret joints toriques NBR 382 pièces", short: "30 dimensions métriques, dureté 70 Shore A.", category: "joints-hydrauliques", brand: "parker", unit: "coffret", purchase: 39, sale: 65, pro: 55, stock: 11, min: 4, isNew: true },
  { sku: "SG-TR-ACC-ROTEX", name: "Accouplement élastique à mâchoires R28", short: "Accouplement à étoile, compense les désalignements.", category: "transmission-mecanique", brand: "skf", purchase: 52, sale: 86, pro: 74, stock: 15, min: 5, attrs: [["size", "Taille", "28"], ["max_bore", "Alésage max", "28", "mm"]] },
  { sku: "SG-TR-POU-SPA-200", name: "Poulie SPA 200 × 2 gorges à moyeu amovible", short: "Poulie fonte, moyeu Taper Lock 2012.", category: "transmission-mecanique", brand: "optibelt", purchase: 61, sale: 99, pro: 86, stock: 7, min: 3, attrs: [["diameter", "Diamètre primitif", "200", "mm"], ["grooves", "Gorges", "2"]] },
  { sku: "SG-HY-DIST-4WE6", mref: "4WE6D6X", name: "Distributeur hydraulique 4WE6 D 24 V", short: "Électrodistributeur CETOP 3, 4/2 voies.", category: "hydraulique", brand: "bosch-rexroth", purchase: 310, sale: 495, pro: 435, stock: 6, min: 2, featured: true, attrs: [["size", "Taille", "NG6 / CETOP 3"], ["voltage", "Tension", "24", "V DC"], ["pressure", "Pression max", "350", "bar"]] },
  { sku: "SG-HY-PE-GR2", name: "Pompe à engrenages groupe 2 — 11 cm³", short: "Pompe hydraulique externe, rotation droite.", category: "hydraulique", brand: "bosch-rexroth", purchase: 280, sale: 449, pro: 395, stock: 0, min: 2, attrs: [["displacement", "Cylindrée", "11", "cm³/tr"], ["pressure", "Pression max", "250", "bar"]] },
  { sku: "SG-ME-4KW-1500", name: "Moteur asynchrone 4 kW 1500 tr/min B3", short: "Moteur triphasé IE3, carcasse aluminium 112M.", category: "moteurs-electriques", brand: "leroy-somer", purchase: 820, sale: 1240, pro: 1095, stock: 5, min: 2, featured: true, attrs: [["power", "Puissance", "4", "kW"], ["speed", "Vitesse", "1500", "tr/min"], ["efficiency", "Rendement", "IE3"]] },
  { sku: "SG-ME-075-3000", name: "Moteur asynchrone 0,75 kW 3000 tr/min B14", short: "Moteur triphasé IE2, bride B14, carcasse 80.", category: "moteurs-electriques", brand: "leroy-somer", purchase: 265, sale: 410, pro: 362, stock: 8, min: 3, attrs: [["power", "Puissance", "0.75", "kW"], ["speed", "Vitesse", "3000", "tr/min"]] },
  { sku: "SG-TU-FLEX-2SN12", name: "Flexible hydraulique 2SN DN12 (au mètre)", short: "Tuyau haute pression deux tresses acier.", category: "tuyaux-raccords", brand: "parker", unit: "mètre", purchase: 12, sale: 21, pro: 17.5, stock: 180, min: 50, attrs: [["dn", "Diamètre nominal", "12", "mm"], ["pressure", "Pression de service", "250", "bar"]] },
  { sku: "SG-TU-RAC-JIC12", name: "Raccord à sertir JIC 3/4\" femelle", short: "Embout tournant 37°, acier zingué.", category: "tuyaux-raccords", brand: "parker", purchase: 6.2, sale: 10.8, pro: 9, stock: 120, min: 40 },
  { sku: "SG-HU-HM46-20L", mref: "Azolla ZS 46", name: "Huile hydraulique HM 46 — 20 L", short: "Huile anti-usure pour circuits hydrauliques.", category: "huiles-lubrifiants", brand: "totalenergies", unit: "bidon", purchase: 98, sale: 149, pro: 132, stock: 30, min: 10, featured: true, attrs: [["viscosity", "Viscosité ISO", "VG 46"], ["volume", "Contenance", "20", "L"]] },
  { sku: "SG-HU-GR-EP2", mref: "Multis EP 2", name: "Graisse lithium EP2 — 400 g", short: "Graisse multi-usage extrême pression, cartouche.", category: "huiles-lubrifiants", brand: "totalenergies", unit: "cartouche", purchase: 7.5, sale: 12.5, pro: 10.5, stock: 210, min: 60 },
  { sku: "SG-OU-EXT-3B", name: "Extracteur à 3 griffes 150 mm", short: "Extracteur de roulements et poulies, griffes réversibles.", category: "outillage-industriel", brand: "facom", purchase: 74, sale: 119, pro: 104, stock: 7, min: 2, attrs: [["capacity", "Capacité", "150", "mm"]] },
  { sku: "SG-OU-CLE-DYN", name: "Clé dynamométrique 40-200 N·m", short: "Clé à déclenchement, carré 1/2\".", category: "outillage-industriel", brand: "facom", purchase: 180, sale: 279, pro: 248, stock: 4, min: 2, isNew: true },
  { sku: "SG-EM-CHAUF-TIH", mref: "TIH 030m", name: "Chauffe-roulement à induction TIH 030m", short: "Montage des roulements jusqu'à 40 kg, sans flamme.", category: "equipements-maintenance", brand: "skf", purchase: 4200, sale: 5890, pro: 5390, stock: 1, min: 1, featured: true, attrs: [["max_weight", "Poids max", "40", "kg"], ["power", "Puissance", "2", "kVA"]] },
  { sku: "SG-VI-M10-BOX", name: "Boîte vis HM M10×40 classe 8.8 (100 pcs)", short: "Vis tête hexagonale zinguée, filetage partiel.", category: "visserie-accessoires", brand: "facom", unit: "boîte", purchase: 14, sale: 23, pro: 19.5, stock: 40, min: 10 },
  { sku: "SG-VI-CIRC-BOX", name: "Coffret circlips intérieurs / extérieurs", short: "300 pièces, Ø 8 à 32 mm.", category: "visserie-accessoires", brand: "facom", unit: "coffret", purchase: 22, sale: 36, pro: 30.5, stock: 13, min: 4 },
  // Agriculture (activité complémentaire)
  { sku: "SG-AG-POM-4SR", name: "Électropompe immergée 4\" 1,5 kW", short: "Pompe de forage pour irrigation, 4 pouces.", category: "pompes-agricoles", brand: "pedrollo", purchase: 690, sale: 1050, pro: 935, stock: 5, min: 2, attrs: [["power", "Puissance", "1.5", "kW"], ["flow", "Débit max", "6", "m³/h"]] },
  { sku: "SG-AG-CR-MOIS", name: "Courroie moissonneuse HB 2540", short: "Courroie à double profil pour batteuse.", category: "courroies-agricoles", brand: "optibelt", purchase: 48, sale: 79, pro: 68, stock: 10, min: 3 },
  { sku: "SG-AG-GAG-16-100", name: "Gaine goutte-à-goutte Ø16 — rouleau 100 m", short: "Goutteurs intégrés tous les 33 cm, 2 L/h.", category: "goutte-a-goutte", brand: "lowara", unit: "rouleau", purchase: 38, sale: 59, pro: 51, stock: 35, min: 10, attrs: [["diameter", "Diamètre", "16", "mm"], ["length", "Longueur", "100", "m"]] },
  { sku: "SG-AG-ASP-SECT", name: "Asperseur sectoriel laiton 3/4\"", short: "Portée jusqu'à 15 m, réglage du secteur.", category: "irrigation", brand: "lowara", purchase: 17, sale: 28, pro: 24, stock: 44, min: 12 },
  { sku: "SG-AG-CARD-T4", name: "Cardan de transmission catégorie 4", short: "Arbre à cardan pour outils attelés, avec protection.", category: "accessoires-agricoles", brand: "skf", purchase: 310, sale: 480, pro: 425, stock: 3, min: 1 },
  { sku: "SG-AG-RL-MOYEU", name: "Moyeu de disque agricole complet", short: "Unité de roulement étanche pour herses et déchaumeurs.", category: "pieces-machines-agricoles", brand: "ntn-snr", purchase: 64, sale: 105, pro: 91, stock: 9, min: 4 },
];

/** Relations de démonstration : [référence, référence liée, type]. */
export const DEMO_RELATIONS: [string, string, "equivalent" | "compatible" | "similar"][] = [
  ["SG-RL-6205-2RS", "SG-RL-6205-2RS-N", "equivalent"],
  ["SG-RL-6205-2RS", "SG-RL-6205-2RS-F", "equivalent"],
  ["SG-RL-6205-2RS-N", "SG-RL-6205-2RS-F", "equivalent"],
  ["SG-RL-6205-2RS", "SG-HU-GR-EP2", "compatible"],
  ["SG-RL-6205-2RS", "SG-OU-EXT-3B", "compatible"],
  ["SG-RL-6205-2RS", "SG-EM-CHAUF-TIH", "compatible"],
  ["SG-PL-UCP205", "SG-HU-GR-EP2", "compatible"],
  ["SG-CR-SPA1250", "SG-TR-POU-SPA-200", "compatible"],
  ["SG-CH-08B1-5M", "SG-CH-PIG-08B-19", "compatible"],
  ["SG-HY-DIST-4WE6", "SG-HU-HM46-20L", "compatible"],
  ["SG-HY-DIST-4WE6", "SG-TU-FLEX-2SN12", "compatible"],
  ["SG-PO-CM5-4", "SG-JM-MG1-25", "compatible"],
];
