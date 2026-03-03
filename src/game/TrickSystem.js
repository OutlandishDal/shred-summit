export class TrickSystem {
  constructor() {
    this.totalScore = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;
    this.comboDuration = 2.5;
    this.lastTrickName = '';
    this.lastTrickPoints = 0;
    this.lastTrickTime = 0;

    this.spinCount = 0;
    this.flipCount = 0;
    this.grabTime = 0;
    this.currentGrabType = null;
    this.grabTypes = new Set();
    this.wasAirborne = false;
    this.isCork = false; // did this jump include a cork?

    // Catchphrase system
    this.lastCatchphrase = '';
    this.lastCatchphraseTime = 0;
    this.crashPhrase = '';

    // ---- CATCHPHRASES ----

    // Small tricks (< 500 pts)
    this.smallPhrases = [
      'NICE ONE!',
      'CLEAN!',
      'SMOOTH!',
      'NOT BAD!',
      'SOLID!',
      'TASTY!',
      'STYLISH!',
      'EZ MONEY!',
    ];

    // Medium tricks (500-1500 pts)
    this.mediumPhrases = [
      'SICK!',
      'LETS GOOO!',
      'YOOO!',
      'THAT WAS BUTTER!',
      'STEEZY!',
      'SEND IT!',
      'DIALED IN!',
      'CRUSHED IT!',
      'CHEF\'S KISS!',
      'FILTHY!',
    ];

    // Big tricks (1500+ pts)
    this.bigPhrases = [
      'ABSOLUTELY MENTAL!',
      'ARE YOU KIDDING?!',
      'LEGENDARY!',
      'INSANE!',
      'CALL AN AMBULANCE... FOR THE MOUNTAIN!',
      'SHAUN WHITE IS SHAKING!',
      'HALL OF FAME!',
      'UNGODLY!',
      'THE CROWD GOES WILD!',
      'THAT\'S ILLEGAL!',
      'PHYSICS LEFT THE CHAT!',
      'MOM GET THE CAMERA!',
    ];

    // Huge tricks (3000+ pts)
    this.hugePhrases = [
      'WHAT ON EARTH?!',
      'TELL YOUR GRANDKIDS ABOUT THIS!',
      'THEY NEED TO NAME A TRICK AFTER YOU!',
      'THAT SHOULDN\'T BE POSSIBLE!',
      'THE MOUNTAIN JUST FILED A COMPLAINT!',
      'I NEED TO SIT DOWN!',
      'THE JUDGES ARE CRYING!',
      'SNOWBOARDING WILL NEVER BE THE SAME!',
    ];

    // Crash phrases
    this.crashPhrases = [
      'THAT\'S GONNA LEAVE A MARK',
      'THE SNOW JUST WON',
      'YARD SALE!',
      'OOOF... THAT HURT',
      'GRAVITY: 1, YOU: 0',
      'RIP THOSE KNEES',
      'DID THE MOUNTAIN JUST FIGHT BACK?',
      'FACE MEET SNOW. SNOW MEET FACE.',
      'AND HIS NAME WAS JOHN CENAAA',
      'SOMEBODY CALL SKI PATROL',
      'RAGDOLL MODE: ACTIVATED',
      'THE BOARD SAYS GOODBYE',
      'WELL... THAT HAPPENED',
      'WASTED',
      'MAYBE TRY SKIING?',
      'TECHNICAL DIFFICULTIES',
      'THAT WAS NOT IN THE BROCHURE',
      'TACO\'D THE BOARD',
      'YOU FORGOT THE LANDING PART',
      'FULL SCORPION!',
      'THE SLOPE CLAIMED ANOTHER VICTIM',
      'INSERT COIN TO CONTINUE',
      'TASK FAILED SUCCESSFULLY',
      'THE TREES SEND THEIR REGARDS',
    ];
  }

  update(dt, playerState) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboMultiplier = 1;
      }
    }

    if (!playerState.grounded && !playerState.crashed) {
      this.wasAirborne = true;

      const yRot = playerState.trickRotation.y;
      this.spinCount = Math.floor(Math.abs(yRot) / Math.PI);

      const xRot = playerState.trickRotation.x;
      this.flipCount = Math.floor(Math.abs(xRot) / Math.PI);

      // Track cork (flip + spin simultaneously)
      if (playerState.isCork) {
        this.isCork = true;
      }

      if (playerState.isGrabbing) {
        this.grabTime += dt;
        if (playerState.grabType) {
          this.grabTypes.add(playerState.grabType);
          this.currentGrabType = playerState.grabType;
        }
      }
    }

    if (playerState.grounded && !playerState.wasGrounded && this.wasAirborne) {
      this.scoreTrick(playerState);
      this.wasAirborne = false;
    }

    return {
      score: this.totalScore,
      combo: this.comboMultiplier,
      comboTimer: this.comboTimer,
      lastTrick: this.lastTrickName,
      lastTrickPoints: this.lastTrickPoints,
      lastTrickTime: this.lastTrickTime,
      trickMeter: this.getTrickMeterValue(playerState),
      catchphrase: this.lastCatchphrase,
      catchphraseTime: this.lastCatchphraseTime,
      crashPhrase: this.crashPhrase,
    };
  }

  scoreTrick(playerState) {
    const tricks = [];
    let trickScore = 0;

    if (playerState.airTime > 0.5) {
      trickScore += Math.floor(playerState.airTime * 50);
    }

    // Cork detection: when both spin and flip happened simultaneously
    const hasCork = this.isCork && this.spinCount >= 1 && this.flipCount >= 1;

    if (hasCork) {
      // Cork trick — combine spin degrees into cork name
      const degrees = this.spinCount * 180;
      const corkName = this.getCorkName(degrees, this.flipCount);
      tricks.push(corkName);
      // Cork scores more than individual spin + flip (it's harder)
      trickScore += this.spinCount * 300 + this.flipCount * 500;
    } else {
      // Regular spin
      if (this.spinCount >= 1) {
        const degrees = this.spinCount * 180;
        tricks.push(this.getSpinName(degrees));
        trickScore += this.spinCount * 250;
      }

      // Regular flip
      if (this.flipCount >= 1) {
        tricks.push(this.getFlipName(this.flipCount));
        trickScore += this.flipCount * 400;
      }
    }

    if (this.grabTime > 0.3) {
      for (const grab of this.grabTypes) {
        tricks.push(this.getGrabDisplayName(grab));
      }
      trickScore += Math.floor(this.grabTime * 150);
      if (this.grabTypes.size > 1) {
        trickScore += this.grabTypes.size * 100;
      }
    }

    // Height bonus
    if (playerState.peakHeightFeet > 15) {
      trickScore += Math.floor(playerState.peakHeightFeet * 2);
    }

    // Combo multipliers for combining trick types
    const types = (this.spinCount >= 1 || hasCork ? 1 : 0) +
                  (this.flipCount >= 1 || hasCork ? 1 : 0) +
                  (this.grabTime > 0.3 ? 1 : 0);
    if (types >= 3) trickScore *= 2.0;
    else if (types >= 2) trickScore *= 1.5;

    if (tricks.length > 0 && trickScore > 0) {
      trickScore = Math.floor(trickScore * this.comboMultiplier);
      this.totalScore += trickScore;
      this.lastTrickName = tricks.join(' + ');
      this.lastTrickPoints = trickScore;
      this.lastTrickTime = performance.now();

      // Pick catchphrase based on score
      this.lastCatchphrase = this.pickCatchphrase(trickScore);
      this.lastCatchphraseTime = performance.now();

      this.comboMultiplier = Math.min(this.comboMultiplier + 0.5, 5.0);
      this.comboTimer = this.comboDuration;
    }

    this.spinCount = 0;
    this.flipCount = 0;
    this.grabTime = 0;
    this.grabTypes.clear();
    this.currentGrabType = null;
    this.isCork = false;
  }

  pickCatchphrase(score) {
    let pool;
    if (score >= 3000) pool = this.hugePhrases;
    else if (score >= 1500) pool = this.bigPhrases;
    else if (score >= 500) pool = this.mediumPhrases;
    else pool = this.smallPhrases;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  pickCrashPhrase() {
    this.crashPhrase = this.crashPhrases[Math.floor(Math.random() * this.crashPhrases.length)];
    return this.crashPhrase;
  }

  getSpinName(degrees) {
    if (degrees >= 1080) return '1080';
    if (degrees >= 900) return '900';
    if (degrees >= 720) return '720';
    if (degrees >= 540) return '540';
    if (degrees >= 360) return '360';
    return '180';
  }

  getCorkName(spinDegrees, flipCount) {
    // Cork naming: "CORK 540", "DOUBLE CORK 1080", etc.
    const prefix = flipCount >= 3 ? 'TRIPLE CORK' : flipCount >= 2 ? 'DOUBLE CORK' : 'CORK';
    const deg = Math.max(spinDegrees, 360); // minimum cork is 360
    return `${prefix} ${deg}`;
  }

  getFlipName(count) {
    const names = ['', 'BACKFLIP', 'DOUBLE BACKFLIP', 'TRIPLE BACKFLIP'];
    return names[Math.min(count, 3)] || `${count}x FLIP`;
  }

  getGrabDisplayName(type) {
    const names = {
      indy: 'INDY', method: 'METHOD', stalefish: 'STALEFISH',
      melon: 'MELON', nosegrab: 'NOSE GRAB', tailgrab: 'TAIL GRAB',
    };
    return names[type] || 'GRAB';
  }

  getTrickMeterValue(playerState) {
    if (playerState.grounded) return 0;
    let meter = 0;
    meter += this.spinCount * 0.2;
    meter += this.flipCount * 0.3;
    meter += this.grabTime * 0.15;
    meter += playerState.airTime * 0.05;
    return Math.min(meter, 1.0);
  }
}
