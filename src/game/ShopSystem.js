const STORAGE_KEY = 'shred-summit-shop';

// Token tier constants
const S1 = 'steezeL1';
const S2 = 'steezeL2';
const S3 = 'steezeL3';
const B = 'board';

// ---- ITEM CATALOG ----

const ITEMS = [
  // === JACKETS (S1 - 5 tokens) ===
  { id: 'dope-blizzard-jacket', brand: 'DOPE SNOW', name: 'Blizzard', category: 'jacket', tier: S1, cost: 5, color: 0x3d4f3a },
  { id: 'dope-akin-jacket', brand: 'DOPE SNOW', name: 'Akin', category: 'jacket', tier: S1, cost: 5, color: 0x5c4a72 },
  { id: 'burton-ak-jacket', brand: 'BURTON', name: 'AK Gore-Tex', category: 'jacket', tier: S1, cost: 5, color: 0x1a2744 },
  { id: 'burton-covert-jacket', brand: 'BURTON', name: 'Covert', category: 'jacket', tier: S1, cost: 5, color: 0x111111 },
  { id: 'jones-mtn-jacket', brand: 'JONES', name: 'MTN Surf', category: 'jacket', tier: S1, cost: 5, color: 0xcc5500 },
  { id: 'snowverb-summit-jacket', brand: 'SNOWVERB', name: 'Summit', category: 'jacket', tier: S1, cost: 5, color: 0x722f37 },
  { id: 'snowverb-alpine-jacket', brand: 'SNOWVERB', name: 'Alpine', category: 'jacket', tier: S1, cost: 5, color: 0x2d5a3a },

  // === REGULAR PANTS (S1 - 5 tokens) ===
  { id: 'burton-covert-pants', brand: 'BURTON', name: 'Covert Pants', category: 'pants', tier: S1, cost: 5, color: 0x1a1a1a },
  { id: 'dope-nomad-pants', brand: 'DOPE SNOW', name: 'Nomad', category: 'pants', tier: S1, cost: 5, color: 0x3d4a3a },
  { id: 'jones-mtn-pants', brand: 'JONES', name: 'MTN Surf Pants', category: 'pants', tier: S1, cost: 5, color: 0x1c2333 },
  { id: 'snowverb-classic-pants', brand: 'SNOWVERB', name: 'Classic', category: 'pants', tier: S1, cost: 5, color: 0x333333 },

  // === BAGGY PANTS (S2 - 3 tokens) ===
  { id: 'dope-blizzard-bibs', brand: 'DOPE SNOW', name: 'Blizzard Bibs', category: 'pants', tier: S2, cost: 3, color: 0xc4a86d, baggy: true },
  { id: 'burton-ballast-pants', brand: 'BURTON', name: 'Ballast Gore-Tex', category: 'pants', tier: S2, cost: 3, color: 0x2d5a3d, baggy: true },
  { id: 'snowverb-wide-pants', brand: 'SNOWVERB', name: 'Wide Leg', category: 'pants', tier: S2, cost: 3, color: 0x2a2a2a, baggy: true },
  { id: 'dope-poise-pants', brand: 'DOPE SNOW', name: 'Poise', category: 'pants', tier: S2, cost: 3, color: 0xe8dcc8, baggy: true },

  // === HELMETS (S1 - 5 tokens) ===
  { id: 'anon-raider-helmet', brand: 'BURTON', name: 'Anon Raider', category: 'helmet', tier: S1, cost: 5, color: 0x1a1a1a },
  { id: 'dope-unity-helmet', brand: 'DOPE SNOW', name: 'Unity', category: 'helmet', tier: S1, cost: 5, color: 0xe8e8e8 },
  { id: 'jones-frontier-helmet', brand: 'JONES', name: 'Frontier', category: 'helmet', tier: S1, cost: 5, color: 0x2d4a32 },
  { id: 'snowverb-pro-helmet', brand: 'SNOWVERB', name: 'Pro', category: 'helmet', tier: S1, cost: 5, color: 0xc62828 },
  { id: 'anon-merak-helmet', brand: 'BURTON', name: 'Anon Merak', category: 'helmet', tier: S1, cost: 5, color: 0x777777 },

  // === LEGENDARY ITEMS (S3 - 1 token) ===
  { id: 'legend-gold-jacket', brand: 'SHRED SUMMIT', name: 'Gold Rush Jacket', category: 'jacket', tier: S3, cost: 1, color: 0xffd700, legendary: true },
  { id: 'legend-chrome-pants', brand: 'SHRED SUMMIT', name: 'Chrome Pants', category: 'pants', tier: S3, cost: 1, color: 0xc0c0c0, legendary: true, baggy: true },
  { id: 'legend-halo-helmet', brand: 'SHRED SUMMIT', name: 'Halo Helmet', category: 'helmet', tier: S3, cost: 1, color: 0x00e5ff, legendary: true },

  // === SNOWBOARDS (Board - 3 tokens) ===
  { id: 'burton-custom', brand: 'BURTON', name: 'Custom', category: 'board', equipType: 'snowboard', tier: B, cost: 3, color: 0x1565c0, stats: { speed: 7, pop: 7, flex: 6 }, style: 'All-Mountain' },
  { id: 'yes-greats', brand: 'YES.', name: 'Greats', category: 'board', equipType: 'snowboard', tier: B, cost: 3, color: 0x4caf50, stats: { speed: 6, pop: 9, flex: 7 }, style: 'Freestyle' },
  { id: 'capita-doa', brand: 'CAPiTA', name: 'DOA', category: 'board', equipType: 'snowboard', tier: B, cost: 3, color: 0xc62828, stats: { speed: 6, pop: 8, flex: 8 }, style: 'Park' },
  { id: 'jones-mtn-twin', brand: 'JONES', name: 'Mountain Twin', category: 'board', equipType: 'snowboard', tier: B, cost: 3, color: 0x00695c, stats: { speed: 9, pop: 6, flex: 5 }, style: 'Freeride' },
  { id: 'burton-process', brand: 'BURTON', name: 'Process', category: 'board', equipType: 'snowboard', tier: B, cost: 3, color: 0xff6f00, stats: { speed: 5, pop: 7, flex: 9 }, style: 'Park/Jib' },
  { id: 'capita-mega-merc', brand: 'CAPiTA', name: 'Mega Merc', category: 'board', equipType: 'snowboard', tier: B, cost: 3, color: 0x6a1b9a, stats: { speed: 8, pop: 8, flex: 5 }, style: 'Aggressive' },
  { id: 'yes-standard', brand: 'YES.', name: 'Standard', category: 'board', equipType: 'snowboard', tier: B, cost: 3, color: 0xf9a825, stats: { speed: 7, pop: 6, flex: 8 }, style: 'All-Mountain' },
  { id: 'yes-eiki', brand: 'YES.', name: 'Eiki Pro', category: 'board', equipType: 'snowboard', tier: B, cost: 25, color: 0x000000, stats: { speed: 10, pop: 10, flex: 10 }, style: 'Pro Model', bindingColor: 0x1565c0 },

  // === SKIS (Board - 3 tokens) ===
  { id: '1000skis-rival', brand: '1000 SKIS', name: 'Rival', category: 'board', equipType: 'ski', tier: B, cost: 3, color: 0xd32f2f, stats: { speed: 7, pop: 8, flex: 7 }, style: 'Park' },
  { id: 'faction-prodigy', brand: 'FACTION', name: 'Prodigy', category: 'board', equipType: 'ski', tier: B, cost: 3, color: 0xff5722, stats: { speed: 6, pop: 9, flex: 8 }, style: 'Freestyle' },
  { id: 'atomic-bent', brand: 'ATOMIC', name: 'Bent 100', category: 'board', equipType: 'ski', tier: B, cost: 3, color: 0x1e88e5, stats: { speed: 8, pop: 7, flex: 6 }, style: 'All-Mountain' },
  { id: 'faction-dancer', brand: 'FACTION', name: 'Dancer', category: 'board', equipType: 'ski', tier: B, cost: 3, color: 0xe91e63, stats: { speed: 7, pop: 7, flex: 9 }, style: 'Playful' },
  { id: 'atomic-maverick', brand: 'ATOMIC', name: 'Maverick', category: 'board', equipType: 'ski', tier: B, cost: 3, color: 0xb71c1c, stats: { speed: 9, pop: 6, flex: 5 }, style: 'Freeride' },
  { id: '1000skis-icon', brand: '1000 SKIS', name: 'Icon', category: 'board', equipType: 'ski', tier: B, cost: 3, color: 0xb71c1c, stats: { speed: 8, pop: 8, flex: 6 }, style: 'Aggressive' },
];

// Build lookup map
const ITEM_MAP = {};
ITEMS.forEach(item => { ITEM_MAP[item.id] = item; });

export class ShopSystem {
  constructor(ridePass) {
    this.ridePass = ridePass;
    this.onSave = null; // cloud save callback
    this.data = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return this.createFreshData();
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) { /* ignore */ }
    if (this.onSave) this.onSave();
  }

  setData(data) {
    if (data && typeof data === 'object') {
      this.data = {
        purchased: data.purchased || [],
        equipped: data.equipped || { jacket: null, pants: null, helmet: null, board: null },
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
    }
  }

  createFreshData() {
    return {
      purchased: [],
      equipped: { jacket: null, pants: null, helmet: null, board: null },
    };
  }

  getItem(id) {
    return ITEM_MAP[id] || null;
  }

  getEquipped() {
    return { ...this.data.equipped };
  }

  getEquippedItem(category) {
    const id = this.data.equipped[category];
    return id ? this.getItem(id) : null;
  }

}
