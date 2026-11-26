/**
 * Matrice des permissions SOGER : module × action.
 * Source de vérité unique, utilisée par le seed et par les contrôles serveur.
 */
export const MODULES = {
  dashboard: ["view"],
  products: ["view", "create", "update", "delete", "publish", "import", "export", "view_cost"],
  categories: ["view", "create", "update", "delete"],
  brands: ["view", "create", "update", "delete"],
  stock: ["view", "adjust", "transfer", "inventory", "receive"],
  customers: ["view", "create", "update", "delete", "view_balance"],
  suppliers: ["view", "create", "update", "delete"],
  quotes: ["view", "create", "update", "delete", "send", "convert"],
  orders: ["view", "create", "update", "cancel", "return"],
  pos: ["use", "discount", "refund", "close_register"],
  purchases: ["view", "create", "update", "receive", "cancel"],
  invoices: ["view", "create", "issue", "cancel"],
  payments: ["view", "create", "delete"],
  expenses: ["view", "create", "delete"],
  reports: ["view", "export"],
  users: ["view", "create", "update", "delete", "assign_roles"],
  audit: ["view"],
  settings: ["view", "update"],
} as const;

export type Module = keyof typeof MODULES;
export type Permission = {
  [M in Module]: `${M}.${(typeof MODULES)[M][number]}`;
}[Module];

export const ALL_PERMISSIONS = Object.entries(MODULES).flatMap(([m, actions]) =>
  actions.map((a) => `${m}.${a}` as Permission),
);

const all = (m: Module) => MODULES[m].map((a) => `${m}.${a}` as Permission);
const only = (m: Module, ...a: string[]) =>
  all(m).filter((p) => a.includes(p.split(".")[1]));

export const ROLE_DEFINITIONS: {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}[] = [
  {
    key: "super_admin",
    name: "Super administrateur",
    description: "Accès total, y compris utilisateurs et paramètres.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "admin",
    name: "Administrateur",
    description: "Gestion complète de la boutique, sans les paramètres système.",
    permissions: ALL_PERMISSIONS.filter(
      (p) => p !== "settings.update" && p !== "users.delete",
    ),
  },
  {
    key: "manager",
    name: "Responsable",
    description: "Pilotage commercial, stock et achats.",
    permissions: [
      ...all("dashboard"), ...all("products"), ...all("categories"), ...all("brands"),
      ...all("stock"), ...all("customers"), ...all("suppliers"), ...all("quotes"),
      ...all("orders"), ...all("pos"), ...all("purchases"),
      ...only("invoices", "view", "create", "issue"), ...only("payments", "view", "create"),
      ...only("expenses", "view", "create"), ...all("reports"), ...only("users", "view"),
      ...all("audit"),
    ],
  },
  {
    key: "sales",
    name: "Commercial",
    description: "Devis, commandes, caisse et clients.",
    permissions: [
      ...all("dashboard"), ...only("products", "view"), ...only("stock", "view"),
      ...only("customers", "view", "create", "update", "view_balance"),
      ...all("quotes"), ...only("orders", "view", "create", "update"),
      ...only("pos", "use", "discount"), ...only("invoices", "view", "create"),
      ...only("payments", "view", "create"),
    ],
  },
  {
    key: "storekeeper",
    name: "Magasinier",
    description: "Réceptions, mouvements de stock et inventaires.",
    permissions: [
      ...only("products", "view"), ...all("stock"), ...only("suppliers", "view"),
      ...only("purchases", "view", "receive"), ...only("orders", "view", "update"),
    ],
  },
  {
    key: "accountant",
    name: "Comptable",
    description: "Factures, paiements, dépenses et rapports.",
    permissions: [
      ...all("dashboard"), ...only("products", "view", "view_cost"),
      ...only("customers", "view", "view_balance"), ...only("suppliers", "view"),
      ...only("orders", "view"), ...only("purchases", "view"), ...all("invoices"),
      ...all("payments"), ...all("expenses"), ...all("reports"), ...all("audit"),
    ],
  },
];
