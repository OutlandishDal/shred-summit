const STORAGE_KEY = 'shred-summit-ridepass';

export class RidePass {
  constructor() {
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
        seasonStart: data.seasonStart || '',
        claimedLevels: data.claimedLevels || [],
        tokens: data.tokens || { steezeL1: 0, steezeL2: 0, steezeL3: 0, board: 0 },
        unlockedTitles: data.unlockedTitles || [],
        selectedTitle: data.selectedTitle || null,
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
    }
  }

  createFreshData() {
    return {
      seasonStart: '',
      claimedLevels: [],
      tokens: { steezeL1: 0, steezeL2: 0, steezeL3: 0, board: 0 },
      unlockedTitles: [],
      selectedTitle: null,
    };
  }

  reset(seasonStart) {
    this.data = this.createFreshData();
    if (seasonStart) this.data.seasonStart = seasonStart;
    this.save();
  }


  getUnlockedTitles() { return [...this.data.unlockedTitles]; }
  getSelectedTitle() { return this.data.selectedTitle; }

  selectTitle(title) {
    if (title === null || this.data.unlockedTitles.includes(title)) {
      this.data.selectedTitle = title;
      this.save();
      return true;
    }
    return false;
  }

}
