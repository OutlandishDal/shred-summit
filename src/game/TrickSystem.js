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
    this.flipDirection = 0; // negative = frontflip (W), positive = backflip (S)
    this.wasInverted = false; // head-under-body tracking for flip counting
    this.grabTime = 0;
    this.currentGrabType = null;
    this.grabTypes = new Set();
    this.wasAirborne = false;
    this.isCork = false; // did this jump include a cork?
    this.corkFlipDirection = 0;  // -1 = frontflip, +1 = backflip
    this.corkSpinDirection = 0;  // +1 = frontside, -1 = backside
    this.tookOffSwitch = false;  // was rider switch at takeoff?
    this.grindStartedSwitch = false; // was rider switch when grind started?

    // Rail grind tracking
    this.wasGrinding = false;
    this.lastBoardslideType = null;
    this.grindAccumulatedTime = 0;
    this.grindFrontswaps = 0;  // frontswap count during current grind
    this.spinOnName = '';      // e.g. "FRONTSIDE 270 ON" — set when landing on rail with spin
    this.spinOnPoints = 0;     // score from the spin-on
    this.rawSpinRadians = 0;   // actual trickRotation.y value for precise degree calculation
    this.wasOnRailBeforeAir = false; // spin-off detection: jumped off rail → airborne → ground

    // Quest tracking events (consumed by QuestSystem)
    this.lastScoredTrick = null;  // set when a trick is scored
    this.lastScoredGrind = null;  // set when a grind is scored

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

    if (!playerState.grounded && !playerState.grinding && !playerState.crashed) {
      if (!this.wasAirborne) {
        // Just left the ground — capture switch state at takeoff
        this.tookOffSwitch = playerState.isSwitch;
      }
      this.wasAirborne = true;

      const yRot = playerState.trickRotation.y;
      // Round to nearest 180° to avoid overshoot mis-counts
      this.spinCount = Math.round(Math.abs(yRot) / Math.PI);
      this.rawSpinRadians = yRot;

      // Count flips by head inversions: each time the head passes under the body
      const xRot = playerState.trickRotation.x;
      const isInverted = Math.cos(xRot) < 0; // head below body when cos < 0
      if (isInverted && !this.wasInverted) {
        this.flipCount++;
        if (xRot !== 0) this.flipDirection = xRot;
      }
      this.wasInverted = isInverted;

      // Track cork (flip + spin simultaneously)
      if (playerState.isCork) {
        this.isCork = true;
        if (playerState.corkFlipDirection !== 0) this.corkFlipDirection = playerState.corkFlipDirection;
        if (playerState.corkSpinDirection !== 0) this.corkSpinDirection = playerState.corkSpinDirection;
      }

      if (playerState.isGrabbing) {
        this.grabTime += dt;
        if (playerState.grabType) {
          this.grabTypes.add(playerState.grabType);
          this.currentGrabType = playerState.grabType;
        }
      }
    }

    // Spin-on detection: air → rail with accumulated spin
    if (playerState.landedOnRail && this.wasAirborne) {
      this.scoreSpinOn(playerState);
      this.wasAirborne = false;
    }

    // Track rail grind state
    if (playerState.grinding) {
      if (!this.wasGrinding) {
        // Just started grinding — capture switch state
        this.grindStartedSwitch = playerState.isSwitch;
      }
      this.wasGrinding = true;
      this.grindAccumulatedTime = playerState.grindTime;
      this.grindFrontswaps = playerState.frontswapCount || 0;
      if (playerState.boardslideType) {
        this.lastBoardslideType = playerState.boardslideType;
      }
    }

    // Score rail trick when grind ends (skip if aborted due to low speed)
    if (!playerState.grinding && this.wasGrinding && !playerState.crashed) {
      if (!playerState.grindAborted) {
        this.scoreRailTrick(playerState);
      }
      this.wasGrinding = false;
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
    // Spin direction: positive Y = left = frontside, negative Y = right = backside
    const spinDir = this.rawSpinRadians > 0 ? 'FRONTSIDE' : 'BACKSIDE';

    if (hasCork) {
      // Classify off-axis trick: rodeo, misty, or cork
      const isRodeo = this.corkFlipDirection > 0 && this.corkSpinDirection < 0; // backflip + backside
      const isMisty = this.corkFlipDirection < 0; // frontflip + any spin
      const totalDeg = this.flipCount * 360 + this.spinCount * 180;
      let offAxisName;
      if (isRodeo) {
        offAxisName = this.getRodeoName(totalDeg, this.flipCount);
      } else if (isMisty) {
        offAxisName = this.getMistyName(totalDeg, this.flipCount, spinDir);
      } else {
        offAxisName = this.getCorkName(totalDeg, this.flipCount, spinDir);
      }
      tricks.push(this.wasOnRailBeforeAir ? offAxisName + ' OFF' : offAxisName);
      // 2x points for all off-axis tricks (cork, rodeo, misty)
      trickScore += (this.spinCount * 300 + this.flipCount * 500) * 2;
    } else {
      // Spin-off: jumped off a rail and spun before landing
      if (this.wasOnRailBeforeAir) {
        const rawDeg = Math.abs(this.rawSpinRadians) * (180 / Math.PI);
        const degrees = Math.round(rawDeg / 90) * 90;
        if (degrees >= 180) {
          const dir = this.rawSpinRadians > 0 ? 'FRONTSIDE' : 'BACKSIDE';
          tricks.push(`${dir} ${degrees} OFF`);
          trickScore += Math.ceil(degrees / 90) * 125;
        }
      } else if (this.spinCount >= 1) {
        // Regular air spin with direction (180° increments)
        const degrees = this.spinCount * 180;
        tricks.push(`${spinDir} ${this.getSpinName(degrees)}`);
        trickScore += this.spinCount * 250;
      }

      // Regular flip
      if (this.flipCount >= 1) {
        tricks.push(this.getFlipName(this.flipCount, this.flipDirection));
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
      // Apply board flex multiplier
      trickScore = Math.floor(trickScore * (playerState.flexMultiplier || 1.0));
      // Sweet spot landing bonus: 1.25x for landing in the middle of a landing zone
      if (playerState.landingQuality === 'perfect') {
        trickScore = Math.floor(trickScore * 1.25);
      }
      // Switch bonus: 1.5x applied last, stacks with all other multipliers
      if (this.tookOffSwitch) {
        trickScore = Math.floor(trickScore * 1.5);
        tricks.unshift('SWITCH');
      }
      this.totalScore += trickScore;
      this.lastTrickName = tricks.join(' + ');
      this.lastTrickPoints = trickScore;
      this.lastTrickTime = performance.now();

      // Pick catchphrase based on score
      this.lastCatchphrase = this.pickCatchphrase(trickScore);
      this.lastCatchphraseTime = performance.now();

      this.comboMultiplier = Math.min(this.comboMultiplier + 0.5, 5.0);
      this.comboTimer = this.comboDuration;

      // Store for quest tracking
      const isRodeo = hasCork && this.corkFlipDirection > 0 && this.corkSpinDirection < 0;
      const isMisty = hasCork && this.corkFlipDirection < 0;
      this.lastScoredTrick = {
        spinCount: this.spinCount,
        flipCount: this.flipCount,
        flipDirection: this.flipDirection,
        grabTypes: new Set(this.grabTypes),
        isCork: hasCork,
        isRodeo,
        isMisty,
        points: trickScore,
        comboMultiplier: this.comboMultiplier,
        landingQuality: playerState.landingQuality,
      };
    }

    this.spinCount = 0;
    this.flipCount = 0;
    this.flipDirection = 0;
    this.wasInverted = false;
    this.grabTime = 0;
    this.grabTypes.clear();
    this.currentGrabType = null;
    this.isCork = false;
    this.corkFlipDirection = 0;
    this.corkSpinDirection = 0;
    this.wasOnRailBeforeAir = false;
    this.rawSpinRadians = 0;
  }

  // Score the spin/flip portion of an air→rail transition
  scoreSpinOn(playerState) {
    const tricks = [];
    let trickScore = 0;

    // Rail on/off use 90° increments (can land sideways on a rail)
    const rawDeg = Math.abs(this.rawSpinRadians) * (180 / Math.PI);
    const degrees = Math.round(rawDeg / 90) * 90;
    if (degrees >= 180) {
      const dir = this.rawSpinRadians > 0 ? 'FRONTSIDE' : 'BACKSIDE';
      tricks.push(`${dir} ${degrees} ON`);
      trickScore += Math.ceil(degrees / 90) * 125;
    }

    if (this.flipCount >= 1) {
      tricks.push(this.getFlipName(this.flipCount, this.flipDirection));
      trickScore += this.flipCount * 400;
    }

    if (this.grabTime > 0.3) {
      for (const grab of this.grabTypes) {
        tricks.push(this.getGrabDisplayName(grab));
      }
      trickScore += Math.floor(this.grabTime * 150);
    }

    // Store spin-on info for combining with the grind trick name
    if (tricks.length > 0 && trickScore > 0) {
      trickScore = Math.floor(trickScore * this.comboMultiplier);
      trickScore = Math.floor(trickScore * (playerState.flexMultiplier || 1.0));
      this.spinOnName = tricks.join(' + ');
      this.spinOnPoints = trickScore;

      // Show the spin-on immediately as a trick
      this.totalScore += trickScore;
      this.lastTrickName = this.spinOnName;
      this.lastTrickPoints = trickScore;
      this.lastTrickTime = performance.now();
      this.lastCatchphrase = this.pickCatchphrase(trickScore);
      this.lastCatchphraseTime = performance.now();

      this.comboMultiplier = Math.min(this.comboMultiplier + 0.5, 5.0);
      this.comboTimer = this.comboDuration;

      // Quest tracking
      this.lastScoredTrick = {
        spinCount: this.spinCount,
        flipCount: this.flipCount,
        flipDirection: this.flipDirection,
        grabTypes: new Set(this.grabTypes),
        isCork: this.isCork,
        points: trickScore,
        comboMultiplier: this.comboMultiplier,
        landingQuality: null,
      };
    } else {
      this.spinOnName = '';
      this.spinOnPoints = 0;
    }

    // Spin-on consumed — not a spin-off
    this.wasOnRailBeforeAir = false;

    // Reset air trick tracking
    this.spinCount = 0;
    this.flipCount = 0;
    this.flipDirection = 0;
    this.wasInverted = false;
    this.grabTime = 0;
    this.grabTypes.clear();
    this.currentGrabType = null;
    this.isCork = false;
    this.corkFlipDirection = 0;
    this.corkSpinDirection = 0;
    this.rawSpinRadians = 0;
  }

  scoreRailTrick(playerState) {
    const tricks = [];
    let trickScore = 0;

    // Only score if grind lasted long enough
    if (this.grindAccumulatedTime > 0.3) {
      if (this.lastBoardslideType === 'frontside') {
        tricks.push('FRONTSIDE BOARDSLIDE');
        trickScore += 200 + Math.floor(this.grindAccumulatedTime * 100);
      } else if (this.lastBoardslideType === 'backside') {
        tricks.push('BACKSIDE BOARDSLIDE');
        trickScore += 200 + Math.floor(this.grindAccumulatedTime * 100);
      } else {
        tricks.push('50-50 GRIND');
        trickScore += 100 + Math.floor(this.grindAccumulatedTime * 75);
      }

      // Frontswap bonus — switching between frontside and backside mid-grind (max 5 scored)
      if (this.grindFrontswaps > 0) {
        const scoredSwaps = Math.min(this.grindFrontswaps, 5);
        const swapLabel = this.grindFrontswaps > 1
          ? `${this.grindFrontswaps}x FRONTSWAP`
          : 'FRONTSWAP';
        tricks.push(swapLabel);
        trickScore += scoredSwaps * 150;
      }

      // Long grind bonus
      if (this.grindAccumulatedTime > 2.0) {
        trickScore += Math.floor((this.grindAccumulatedTime - 2.0) * 150);
      }
    }

    if (tricks.length > 0 && trickScore > 0) {
      trickScore = Math.floor(trickScore * this.comboMultiplier);
      trickScore = Math.floor(trickScore * (playerState.flexMultiplier || 1.0));
      // Switch grind bonus: 1.5x applied last
      if (this.grindStartedSwitch) {
        trickScore = Math.floor(trickScore * 1.5);
        tricks.unshift('SWITCH');
      }
      this.totalScore += trickScore;

      // Combine spin-on name with grind name (e.g. "270 ON + FRONTSIDE BOARDSLIDE")
      let fullName = tricks.join(' + ');
      if (this.spinOnName) {
        fullName = this.spinOnName + ' + ' + fullName;
      }

      this.lastTrickName = fullName;
      this.lastTrickPoints = trickScore + this.spinOnPoints;
      this.lastTrickTime = performance.now();

      this.lastCatchphrase = this.pickCatchphrase(trickScore + this.spinOnPoints);
      this.lastCatchphraseTime = performance.now();

      this.comboMultiplier = Math.min(this.comboMultiplier + 0.5, 5.0);
      this.comboTimer = this.comboDuration;

      // Store for quest tracking
      this.lastScoredGrind = {
        type: this.lastBoardslideType,
        duration: this.grindAccumulatedTime,
      };
    }

    // If player is airborne after grind, they may spin off
    if (!playerState.grounded) {
      this.wasOnRailBeforeAir = true;
    }

    this.spinOnName = '';
    this.spinOnPoints = 0;
    this.lastBoardslideType = null;
    this.grindAccumulatedTime = 0;
    this.grindFrontswaps = 0;
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

  getCorkName(spinDegrees, flipCount, direction = '') {
    // Cork naming: "FRONTSIDE CORK 540", "BACKSIDE DOUBLE CORK 1080", etc.
    const prefix = flipCount >= 3 ? 'TRIPLE CORK' : flipCount >= 2 ? 'DOUBLE CORK' : 'CORK';
    const deg = Math.max(spinDegrees, 360); // minimum cork is 360
    return direction ? `${direction} ${prefix} ${deg}` : `${prefix} ${deg}`;
  }

  getRodeoName(totalDegrees, flipCount) {
    // Rodeo = backside spin + backflip. Always backside, no direction prefix needed.
    const deg = Math.max(totalDegrees, 540); // minimum rodeo is 540
    const prefix = flipCount >= 3 ? 'TRIPLE RODEO' : flipCount >= 2 ? 'DOUBLE RODEO' : 'RODEO';
    return `${prefix} ${deg}`;
  }

  getMistyName(totalDegrees, flipCount, direction = '') {
    // Misty = frontflip + spin (forward cork)
    const deg = Math.max(totalDegrees, 540); // minimum misty is 540
    // McTwisty 1260 = single-flip misty 1260
    if (deg === 1260 && flipCount === 1) {
      return direction ? `${direction} MCTWISTY 1260` : 'MCTWISTY 1260';
    }
    const prefix = flipCount >= 3 ? 'TRIPLE MISTY' : flipCount >= 2 ? 'DOUBLE MISTY' : 'MISTY';
    return direction ? `${direction} ${prefix} ${deg}` : `${prefix} ${deg}`;
  }

  getFlipName(count, direction = 0) {
    // Negative X rotation = frontflip (W key), Positive X = backflip (S key)
    const isFront = direction < 0;
    const type = isFront ? 'FRONTFLIP' : 'BACKFLIP';
    if (count === 1) return type;
    if (count === 2) return `DOUBLE ${type}`;
    if (count === 3) return `TRIPLE ${type}`;
    return `${count}x ${isFront ? 'FLIP' : 'FLIP'}`;
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
