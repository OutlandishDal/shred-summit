const STORAGE_KEY = 'shred-summit-ridepass';
const XP_PER_LEVEL = 100;
const MAX_LEVEL = 60;

const S1 = 'steezeL1';
const S2 = 'steezeL2';
const S3 = 'steezeL3';
const B = 'board';
const T = 'title';

// Fixed reward table: index 0 = level 1, index 59 = level 60
const REWARDS = [
  { type: S1, qty: 1 },                      // 1
  { type: S1, qty: 1 },                      // 2
  { type: S1, qty: 1 },                      // 3
  { type: S1, qty: 2 },                      // 4
  { type: T, title: 'GROM' },                // 5
  { type: S1, qty: 1 },                      // 6
  { type: B, qty: 1 },                       // 7
  { type: S1, qty: 2 },                      // 8
  { type: S1, qty: 1 },                      // 9
  { type: S2, qty: 1 },                      // 10
  { type: S1, qty: 1 },                      // 11
  { type: S1, qty: 2 },                      // 12
  { type: B, qty: 1 },                       // 13
  { type: S1, qty: 1 },                      // 14
  { type: T, title: 'RIPPER' },              // 15
  { type: S1, qty: 2 },                      // 16
  { type: S1, qty: 1 },                      // 17
  { type: S2, qty: 1 },                      // 18
  { type: S1, qty: 1 },                      // 19
  { type: B, qty: 1 },                       // 20
  { type: S1, qty: 2 },                      // 21
  { type: S1, qty: 1 },                      // 22
  { type: S1, qty: 1 },                      // 23
  { type: S2, qty: 1 },                      // 24
  { type: T, title: 'SHREDDER' },            // 25
  { type: S1, qty: 2 },                      // 26
  { type: S1, qty: 1 },                      // 27
  { type: B, qty: 1 },                       // 28
  { type: S1, qty: 2 },                      // 29
  { type: S2, qty: 1 },                      // 30
  { type: S1, qty: 1 },                      // 31
  { type: S1, qty: 3 },                      // 32
  { type: S1, qty: 1 },                      // 33
  { type: B, qty: 1 },                       // 34
  { type: T, title: 'SEND IT' },             // 35
  { type: S1, qty: 2 },                      // 36
  { type: S2, qty: 1 },                      // 37
  { type: S1, qty: 1 },                      // 38
  { type: S1, qty: 2 },                      // 39
  { type: B, qty: 1 },                       // 40
  { type: S1, qty: 1 },                      // 41
  { type: S2, qty: 1 },                      // 42
  { type: S1, qty: 2 },                      // 43
  { type: S1, qty: 3 },                      // 44
  { type: T, title: 'PRO' },                 // 45
  { type: S1, qty: 2 },                      // 46
  { type: B, qty: 1 },                       // 47
  { type: S2, qty: 1 },                      // 48
  { type: S1, qty: 2 },                      // 49
  { type: S2, qty: 2 },                      // 50
  { type: S1, qty: 2 },                      // 51
  { type: S1, qty: 3 },                      // 52
  { type: B, qty: 1 },                       // 53
  { type: S1, qty: 2 },                      // 54
  { type: T, title: 'LEGEND' },              // 55
  { type: S2, qty: 1 },                      // 56
  { type: S1, qty: 3 },                      // 57
  { type: B, qty: 1 },                       // 58
  { type: S2, qty: 2 },                      // 59
  { type: S3, qty: 1, title: 'IMMORTAL' },   // 60
];

export class RidePass {
  constructor() {
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
  }

  createFreshData() {
    return {
      claimedLevels: [],
      tokens: { steezeL1: 0, steezeL2: 0, steezeL3: 0, board: 0 },
      unlockedTitles: [],
      selectedTitle: null,
    };
  }

  getLevel(totalXP) {
    return Math.min(Math.floor(totalXP / XP_PER_LEVEL), MAX_LEVEL);
  }

  getLevelProgress(totalXP) {
    if (this.getLevel(totalXP) >= MAX_LEVEL) return XP_PER_LEVEL;
    return totalXP % XP_PER_LEVEL;
  }

  claimAvailable(totalXP) {
    const level = this.getLevel(totalXP);
    const newlyClaimed = [];
    for (let i = 1; i <= level; i++) {
      if (this.data.claimedLevels.includes(i)) continue;
      this.data.claimedLevels.push(i);
      const reward = REWARDS[i - 1];
      if (reward.type === T) {
        this.data.unlockedTitles.push(reward.title);
      } else {
        this.data.tokens[reward.type] = (this.data.tokens[reward.type] || 0) + reward.qty;
      }
      // Level 60 also grants IMMORTAL title
      if (reward.title && reward.type !== T) {
        this.data.unlockedTitles.push(reward.title);
      }
      newlyClaimed.push({ level: i, reward });
    }
    if (newlyClaimed.length > 0) this.save();
    return newlyClaimed;
  }

  getRewardForLevel(levelNum) {
    return REWARDS[levelNum - 1] || null;
  }

  getAllRewards() { return REWARDS; }
  getMaxLevel() { return MAX_LEVEL; }
  getXPPerLevel() { return XP_PER_LEVEL; }

  getTokens() { return { ...this.data.tokens }; }
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

  spendTokens(type, amount) {
    if (this.data.tokens[type] >= amount) {
      this.data.tokens[type] -= amount;
      this.save();
      return true;
    }
    return false;
  }

  isLevelClaimed(levelNum) {
    return this.data.claimedLevels.includes(levelNum);
  }
}
