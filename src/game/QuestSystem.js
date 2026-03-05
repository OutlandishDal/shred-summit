const STORAGE_KEY = 'shred-summit-quests';

// Daily quest templates — each generates a quest with variable targets
const DAILY_POOL = [
  // Easy (25 XP)
  { id: 'backflips_e', desc: 'Land {n} backflips', type: 'backflip', targets: [3, 5], xp: 25 },
  { id: 'frontflips_e', desc: 'Land {n} frontflips', type: 'frontflip', targets: [3, 5], xp: 25 },
  { id: '360s_e', desc: 'Land {n} 360s', type: 'spin360', targets: [3, 5], xp: 25 },
  { id: 'grinds_e', desc: 'Do {n} grinds', type: 'grind', targets: [3, 5], xp: 25 },
  { id: 'grabs_e', desc: 'Land {n} grabs', type: 'grab', targets: [5, 8], xp: 25 },
  { id: 'indy_e', desc: 'Land {n} indys', type: 'indy', targets: [1, 3], xp: 25 },
  { id: 'method_e', desc: 'Land {n} methods', type: 'method', targets: [1, 3], xp: 25 },
  { id: 'run_e', desc: 'Complete a run', type: 'run', targets: [1], xp: 25 },
  // Medium (50 XP)
  { id: 'backflips_m', desc: 'Land {n} backflips', type: 'backflip', targets: [8, 10], xp: 50 },
  { id: 'frontflips_m', desc: 'Land {n} frontflips', type: 'frontflip', targets: [8, 10], xp: 50 },
  { id: '720_m', desc: 'Land {n} 720s', type: 'spin720', targets: [1, 3], xp: 50 },
  { id: 'grabs_m', desc: 'Land {n} grabs', type: 'grab', targets: [10, 15], xp: 50 },
  { id: 'score_m', desc: 'Get {n} score in one run', type: 'runScore', targets: [5000], xp: 50 },
  { id: 'stalefish_m', desc: 'Land {n} stalefish', type: 'stalefish', targets: [1, 3], xp: 50 },
  { id: 'nosegrab_m', desc: 'Land {n} nose grabs', type: 'nosegrab', targets: [1, 3], xp: 50 },
  { id: 'tailgrab_m', desc: 'Land {n} tail grabs', type: 'tailgrab', targets: [1, 3], xp: 50 },
  { id: 'boardslide_m', desc: 'Do {n} boardslides', type: 'boardslide', targets: [1, 3], xp: 50 },
  { id: 'combo_m', desc: 'Reach {n}x combo', type: 'combo', targets: [2, 3], xp: 50 },
  { id: 'grabtypes_m', desc: 'Land {n} different grab types', type: 'grabTypes', targets: [3, 4], xp: 50 },
  { id: 'grindtime_m', desc: 'Grind for {n}+ seconds in one go', type: 'grindTime', targets: [2, 3], xp: 50 },
  // Hard (75 XP)
  { id: 'dbl_backflip_h', desc: 'Land a double backflip', type: 'doubleBackflip', targets: [1], xp: 75 },
  { id: 'dbl_frontflip_h', desc: 'Land a double frontflip', type: 'doubleFrontflip', targets: [1], xp: 75 },
  { id: 'cork_h', desc: 'Land {n} corks', type: 'cork', targets: [1, 3], xp: 75 },
  { id: '1080_h', desc: 'Land a 1080', type: 'spin1080', targets: [1], xp: 75 },
  { id: 'score_h', desc: 'Get {n} score in one run', type: 'runScore', targets: [10000], xp: 75 },
  { id: 'grindtime_h', desc: 'Grind for {n}+ seconds in one go', type: 'grindTime', targets: [4, 5], xp: 75 },
  { id: 'grabtypes_h', desc: 'Land {n} different grab types in one run', type: 'grabTypesRun', targets: [5, 6], xp: 75 },
  { id: 'trickpts_h', desc: 'Land a trick worth {n}+ pts', type: 'trickPoints', targets: [1000, 1500], xp: 75 },
  // Epic (100 XP)
  { id: 'score_ep', desc: 'Get {n} score in one run', type: 'runScore', targets: [20000], xp: 100 },
  { id: 'triple_cork_ep', desc: 'Land a triple cork', type: 'tripleCork', targets: [1], xp: 100 },
  { id: 'combo_ep', desc: 'Reach {n}x combo', type: 'combo', targets: [5], xp: 100 },
  { id: 'trickpts_ep', desc: 'Land a trick worth {n}+ pts', type: 'trickPoints', targets: [2000], xp: 100 },
  { id: 'triple_backflip_ep', desc: 'Land a triple backflip', type: 'tripleBackflip', targets: [1], xp: 100 },
];

// Season quests — persistent, harder, more XP
const SEASON_QUESTS = [
  { id: 's_360s', desc: 'Land 100 360s', type: 'spin360', target: 100, xp: 150 },
  { id: 's_backflips', desc: 'Land 50 backflips', type: 'backflip', target: 50, xp: 150 },
  { id: 's_runs', desc: 'Complete 20 runs', type: 'run', target: 20, xp: 150 },
  { id: 's_grindtime', desc: 'Grind for 60 total seconds', type: 'grindTimeTotal', target: 60, xp: 150 },
  { id: 's_score50k', desc: 'Get 50,000 total score across all runs', type: 'totalScore', target: 50000, xp: 250 },
  { id: 's_corks', desc: 'Land 25 corks', type: 'cork', target: 25, xp: 250 },
  { id: 's_grabs', desc: 'Land 200 grabs', type: 'grab', target: 200, xp: 250 },
  { id: 's_combo5x', desc: 'Reach 5x combo 10 times', type: 'combo5x', target: 10, xp: 250 },
  { id: 's_1080', desc: 'Hit a 1080 spin', type: 'spin1080', target: 1, xp: 250 },
  { id: 's_tripleBack', desc: 'Land 10 triple backflips', type: 'tripleBackflip', target: 10, xp: 500 },
  { id: 's_score100k', desc: 'Get 100,000 total score across all runs', type: 'totalScore', target: 100000, xp: 500 },
  { id: 's_tripleCork', desc: 'Land 5 triple corks', type: 'tripleCork', target: 5, xp: 500 },
  { id: 's_allGrabs', desc: 'Land every grab type in one run', type: 'allGrabsRun', target: 1, xp: 500 },
  { id: 's_runs50', desc: 'Complete 50 runs', type: 'run', target: 50, xp: 500 },
  { id: 's_tricks500', desc: 'Land 500 tricks total', type: 'trickTotal', target: 500, xp: 500 },
];

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Simple seeded PRNG (mulberry32)
function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class QuestSystem {
  constructor() {
    this.data = this.load();
    this.checkDailyReset();

    // Per-run tracking
    this.runGrabTypes = new Set();
    this.runScore = 0;
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
    const today = getTodayString();
    return {
      dailyDate: today,
      dailyProgress: this.generateDaily(today),
      seasonProgress: SEASON_QUESTS.map(q => ({
        id: q.id, current: 0, target: q.target, completed: false,
      })),
      totalXP: 0,
    };
  }

  checkDailyReset() {
    const today = getTodayString();
    if (this.data.dailyDate !== today) {
      this.data.dailyDate = today;
      this.data.dailyProgress = this.generateDaily(today);
      this.save();
    }
  }

  generateDaily(dateStr) {
    const seed = hashSeed(dateStr);
    const rng = seededRandom(seed);

    // Separate pool by XP tier
    const easy = DAILY_POOL.filter(q => q.xp === 25);
    const medium = DAILY_POOL.filter(q => q.xp === 50);
    const hard = DAILY_POOL.filter(q => q.xp === 75);
    const epic = DAILY_POOL.filter(q => q.xp === 100);

    const pick = (pool, count) => {
      const shuffled = [...pool].sort(() => rng() - 0.5);
      return shuffled.slice(0, count);
    };

    const selected = [
      ...pick(easy, 8),
      ...pick(medium, 8),
      ...pick(hard, 6),
      ...pick(epic, 3),
    ];

    // Shuffle final list
    selected.sort(() => rng() - 0.5);

    return selected.map(q => {
      const target = q.targets[Math.floor(rng() * q.targets.length)];
      return {
        id: q.id,
        current: 0,
        target,
        completed: false,
      };
    });
  }

  // Get display info for a quest progress entry
  getQuestInfo(progress, tab) {
    if (tab === 'daily') {
      const template = DAILY_POOL.find(q => q.id === progress.id);
      if (!template) return null;
      return {
        desc: template.desc.replace('{n}', progress.target),
        xp: template.xp,
        current: progress.current,
        target: progress.target,
        completed: progress.completed,
      };
    } else {
      const template = SEASON_QUESTS.find(q => q.id === progress.id);
      if (!template) return null;
      return {
        desc: template.desc,
        xp: template.xp,
        current: progress.current,
        target: progress.target,
        completed: progress.completed,
      };
    }
  }

  getDailyQuests() {
    return this.data.dailyProgress.map(p => this.getQuestInfo(p, 'daily')).filter(Boolean);
  }

  getSeasonQuests() {
    return this.data.seasonProgress.map(p => this.getQuestInfo(p, 'season')).filter(Boolean);
  }

  getTotalXP() {
    return this.data.totalXP;
  }

  // ---- Run lifecycle ----

  onRunStart() {
    this.runGrabTypes = new Set();
    this.runScore = 0;
  }

  // ---- Tracking hooks ----

  onTrickLanded(trickData) {
    // trickData: { spinCount, flipCount, flipDirection, grabTypes, isCork, points, comboMultiplier }
    const { spinCount, flipCount, flipDirection, grabTypes, isCork, points, comboMultiplier } = trickData;

    const isFront = flipDirection < 0;

    // Track grabs
    if (grabTypes && grabTypes.size > 0) {
      const grabCount = grabTypes.size;
      this.increment('grab', grabCount);
      for (const g of grabTypes) {
        this.increment(g, 1); // indy, method, stalefish, etc
        this.runGrabTypes.add(g);
      }
    }

    // Track spins
    if (spinCount >= 2) this.increment('spin360', 1); // 360 = 2 half-spins
    if (spinCount >= 4) this.increment('spin720', 1);
    if (spinCount >= 6) this.increment('spin1080', 1);

    // Track flips
    if (flipCount >= 1) {
      if (isFront) this.increment('frontflip', 1);
      else this.increment('backflip', 1);
    }
    if (flipCount >= 2) {
      if (isFront) this.increment('doubleFrontflip', 1);
      else this.increment('doubleBackflip', 1);
    }
    if (flipCount >= 3) {
      if (!isFront) this.increment('tripleBackflip', 1);
    }

    // Corks
    if (isCork) {
      this.increment('cork', 1);
      if (flipCount >= 3) this.increment('tripleCork', 1);
    }

    // Trick points threshold
    if (points > 0) {
      this.incrementThreshold('trickPoints', points);
    }

    // Combo tracking
    if (comboMultiplier >= 5) this.increment('combo5x', 1);
    this.incrementThreshold('combo', comboMultiplier);

    // Total tricks
    this.increment('trickTotal', 1);

    // All grab types in one run
    if (this.runGrabTypes.size >= 6) {
      this.increment('allGrabsRun', 1);
    }

    // Grab types in run count
    this.setMax('grabTypesRun', this.runGrabTypes.size);
    this.setMax('grabTypes', this.runGrabTypes.size);

    this.save();
    return this.getNewlyCompleted();
  }

  onGrind(type, duration) {
    this.increment('grind', 1);
    if (type === 'frontside' || type === 'backside') {
      this.increment('boardslide', 1);
    }
    this.incrementThreshold('grindTime', duration);
    this.incrementAdd('grindTimeTotal', duration);
    this.save();
  }

  onRunComplete(score) {
    this.increment('run', 1);
    this.runScore = score;
    this.setMax('runScore', score);
    this.incrementAdd('totalScore', score);
    this.save();
  }

  // ---- Internal progress helpers ----

  increment(type, amount) {
    for (const p of this.data.dailyProgress) {
      const tmpl = DAILY_POOL.find(q => q.id === p.id);
      if (tmpl && tmpl.type === type && !p.completed) {
        p.current = Math.min(p.current + amount, p.target);
        if (p.current >= p.target) {
          p.completed = true;
          this.data.totalXP += tmpl.xp;
        }
      }
    }
    for (const p of this.data.seasonProgress) {
      const tmpl = SEASON_QUESTS.find(q => q.id === p.id);
      if (tmpl && tmpl.type === type && !p.completed) {
        p.current = Math.min(p.current + amount, p.target);
        if (p.current >= p.target) {
          p.completed = true;
          this.data.totalXP += tmpl.xp;
        }
      }
    }
  }

  // For thresholds like "reach Nx combo" or "get N score"  — set to max if higher
  incrementThreshold(type, value) {
    for (const p of this.data.dailyProgress) {
      const tmpl = DAILY_POOL.find(q => q.id === p.id);
      if (tmpl && tmpl.type === type && !p.completed) {
        if (value >= p.target) {
          p.current = p.target;
          p.completed = true;
          this.data.totalXP += tmpl.xp;
        }
      }
    }
    for (const p of this.data.seasonProgress) {
      const tmpl = SEASON_QUESTS.find(q => q.id === p.id);
      if (tmpl && tmpl.type === type && !p.completed) {
        if (value >= p.target) {
          p.current = p.target;
          p.completed = true;
          this.data.totalXP += tmpl.xp;
        }
      }
    }
  }

  // For cumulative values like total grind time
  incrementAdd(type, value) {
    for (const p of this.data.dailyProgress) {
      const tmpl = DAILY_POOL.find(q => q.id === p.id);
      if (tmpl && tmpl.type === type && !p.completed) {
        p.current = Math.min(p.current + value, p.target);
        if (p.current >= p.target) {
          p.completed = true;
          this.data.totalXP += tmpl.xp;
        }
      }
    }
    for (const p of this.data.seasonProgress) {
      const tmpl = SEASON_QUESTS.find(q => q.id === p.id);
      if (tmpl && tmpl.type === type && !p.completed) {
        p.current = Math.round(Math.min(p.current + value, p.target) * 10) / 10;
        if (p.current >= p.target) {
          p.completed = true;
          this.data.totalXP += tmpl.xp;
        }
      }
    }
  }

  // Set to max (for per-run stats like grab types count)
  setMax(type, value) {
    for (const p of this.data.dailyProgress) {
      const tmpl = DAILY_POOL.find(q => q.id === p.id);
      if (tmpl && tmpl.type === type && !p.completed) {
        p.current = Math.max(p.current, Math.min(value, p.target));
        if (p.current >= p.target) {
          p.completed = true;
          this.data.totalXP += tmpl.xp;
        }
      }
    }
    for (const p of this.data.seasonProgress) {
      const tmpl = SEASON_QUESTS.find(q => q.id === p.id);
      if (tmpl && tmpl.type === type && !p.completed) {
        p.current = Math.max(p.current, Math.min(value, p.target));
        if (p.current >= p.target) {
          p.completed = true;
          this.data.totalXP += tmpl.xp;
        }
      }
    }
  }

  getNewlyCompleted() {
    // Return completed quests for potential notification use
    const completed = [];
    for (const p of this.data.dailyProgress) {
      if (p.completed) {
        const info = this.getQuestInfo(p, 'daily');
        if (info) completed.push(info);
      }
    }
    return completed;
  }
}
