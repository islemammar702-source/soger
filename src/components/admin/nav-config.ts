import type { Permission } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; permission: Permission };
export type NavGroup = { title: string; items: NavItem[] };

/** Menu du back-office. Chaque entrée n'est affichée que si l'utilisateur a la permission. */
export const ADMIN_NAV: NavGroup[] = [
  { title: "", items: [{ href: "/admin", label: "Tableau de bord", icon: "LayoutDashboard", permission: "dashboard.view" }] },
  {
    title: "Ventes",
    items: [
      { href: "/admin/caisse", label: "Caisse (POS)", icon: "ScanBarcode", permission: "pos.use" },
      { href: "/admin/commandes", label: "Commandes", icon: "Package", permission: "orders.view" },
      { href: "/admin/devis", label: "Devis", icon: "FileText", permission: "quotes.view" },
      { href: "/admin/clients", label: "Clients", icon: "Users", permission: "customers.view" },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/admin/produits", label: "Produits", icon: "Boxes", permission: "products.view" },
      { href: "/admin/categories", label: "Catégories", icon: "FolderTree", permission: "categories.view" },
      { href: "/admin/marques", label: "Marques", icon: "Tag", permission: "brands.view" },
      { href: "/admin/import", label: "Import / export", icon: "FileSpreadsheet", permission: "products.import" },
    ],
  },
  {
    title: "Stock",
    items: [
      { href: "/admin/stock", label: "Niveaux de stock", icon: "Warehouse", permission: "stock.view" },
      { href: "/admin/stock/mouvements", label: "Mouvements", icon: "ArrowLeftRight", permission: "stock.view" },
      { href: "/admin/stock/operations", label: "Entrées / sorties", icon: "PackagePlus", permission: "stock.adjust" },
      { href: "/admin/stock/inventaires", label: "Inventaires", icon: "ClipboardCheck", permission: "stock.inventory" },
    ],
  },
  {
    title: "Achats",
    items: [
      { href: "/admin/fournisseurs", label: "Fournisseurs", icon: "Truck", permission: "suppliers.view" },
      { href: "/admin/achats", label: "Commandes fournisseurs", icon: "ShoppingBag", permission: "purchases.view" },
    ],
  },
  {
    title: "Finances",
    items: [
      { href: "/admin/factures", label: "Factures", icon: "Receipt", permission: "invoices.view" },
      { href: "/admin/paiements", label: "Paiements", icon: "Wallet", permission: "payments.view" },
      { href: "/admin/depenses", label: "Dépenses", icon: "TrendingDown", permission: "expenses.view" },
      { href: "/admin/caisses", label: "Sessions de caisse", icon: "Landmark", permission: "pos.close_register" },
    ],
  },
  {
    title: "Pilotage",
    items: [
      { href: "/admin/rapports", label: "Rapports", icon: "ChartColumn", permission: "reports.view" },
      { href: "/admin/journal", label: "Journal d'activité", icon: "History", permission: "audit.view" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/utilisateurs", label: "Utilisateurs", icon: "UserCog", permission: "users.view" },
      { href: "/admin/parametres", label: "Paramètres", icon: "Settings", permission: "settings.view" },
    ],
  },
];
