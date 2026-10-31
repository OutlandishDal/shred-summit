import { getRtdb, rtdbRef, rtdbSet, rtdbGet, onValue, onDisconnect, rtdbRemove, rtdbUpdate, rtdbTimestamp } from './firebase.js';
import { RemotePlayer } from './RemotePlayer.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_PARTY_SIZE = 8;
const SEND_RATE_MS = 100; // 10 Hz
const DEFAULT_MAP = { mode: 'park', chair: null, parkId: 'big-white', seed: 1 };

// Party data lives in one Realtime Database node per party:
//
//   parties/{CODE}/
//     createdAt
//     map:     { mode, chair, parkId, seed }   — picked by the leader
//     runId:   number                          — bumped by the leader to start a run for everyone
//     members/{uid}: { nickname, cosmetics, joinedAt, status: 'lobby' | 'riding' }
//     players/{uid}: live rider state, only while riding
//
// The leader is whoever joined first and is still connected, so if the leader
// leaves or loses connection the next player takes over automatically.
// Each client removes its own member/player entries on disconnect, and
// re-adds them when the connection comes back (phones going to sleep etc.).

export function mapKey(map) {
  if (!map) return '';
  const id = map.mode === 'backcountry' ? map.chair : map.parkId;
  return `${map.mode}:${id}:${map.seed}`;
}

export class MultiplayerManager {
  constructor(game) {
    this.game = game;
    this.rtdb = null;
    this.partyCode = null;
    this.members = {};          // { uid: { nickname, cosmetics, joinedAt, status } }
    this.map = { ...DEFAULT_MAP };
    this.runId = 0;
    this.remotePlayers = {};    // { uid: RemotePlayer } — riders on the same map as us
    this.listeners = [];        // onValue unsubscribe functions for the current party
    this.status = 'lobby';
    this.lastSendTime = 0;
    this.active = false;
    this._connected = false;
    this._seenRunId = null;
    this._wasLeader = false;
  }

  init() {
    this.rtdb = getRtdb();
    if (!this.rtdb || this._connListener) return;
    // Re-register ourselves whenever the connection comes back
    this._connListener = onValue(rtdbRef(this.rtdb, '.info/connected'), (snap) => {
      this._connected = snap.val() === true;
      if (this._connected && this.active) this.registerPresence();
      this.game.onPartyChanged();
    });
  }

  get available() {
    return !!(this.rtdb && this.game.currentUser);
  }

  get uid() {
    return this.game.currentUser?.uid || null;
  }

  get leaderUid() {
    const entries = Object.entries(this.members);
    if (entries.length === 0) return this.uid;
    // joinedAt is a server timestamp; it's a placeholder until the server confirms it
    const t = (m) => (typeof m.joinedAt === 'number' ? m.joinedAt : Number.MAX_SAFE_INTEGER);
    entries.sort(([ua, a], [ub, b]) => (t(a) - t(b)) || ua.localeCompare(ub));
    return entries[0][0];
  }

  get isLeader() {
    return this.active && this.leaderUid === this.uid;
  }

  get memberCount() {
    return Object.keys(this.members).length;
  }

  get inviteLink() {
    if (!this.partyCode) return '';
    return `${location.origin}${location.pathname}?party=${this.partyCode}`;
  }

  // ---- PARTY LIFECYCLE ----

  async createParty() {
    if (!this.available) return { error: 'SIGN IN TO PLAY ONLINE' };
    if (this.active) await this.leaveParty();

    // Pick a code nobody is using
    let code = null;
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = this.generateCode();
      const snap = await rtdbGet(rtdbRef(this.rtdb, `parties/${candidate}`));
      if (!snap.exists()) code = candidate;
    }
    if (!code) return { error: 'COULD NOT CREATE PARTY, TRY AGAIN' };

    const map = this.mapFromGame();
    await rtdbSet(rtdbRef(this.rtdb, `parties/${code}`), {
      createdAt: rtdbTimestamp(),
      map,
      runId: 0,
      members: { [this.uid]: this.memberData() },
    });
    this.enterParty(code, map, 0);
    return { code };
  }

  async joinParty(rawCode) {
    if (!this.available) return { error: 'SIGN IN TO PLAY ONLINE' };
    const code = (rawCode || '').trim().toUpperCase();
    if (code.length !== CODE_LENGTH) return { error: `ENTER A ${CODE_LENGTH}-CHARACTER CODE` };
    if (this.active && this.partyCode === code) return { code };
    if (this.active) await this.leaveParty();

    const snap = await rtdbGet(rtdbRef(this.rtdb, `parties/${code}`));
    if (!snap.exists()) return { error: 'PARTY NOT FOUND' };
    const data = snap.val();
    const members = data.members || {};
    if (!members[this.uid] && Object.keys(members).length >= MAX_PARTY_SIZE) {
      return { error: 'PARTY IS FULL' };
    }

    await rtdbSet(rtdbRef(this.rtdb, `parties/${code}/members/${this.uid}`), this.memberData());
    this.enterParty(code, data.map || DEFAULT_MAP, data.runId || 0);
    return { code };
  }

  enterParty(code, map, runId) {
    this.partyCode = code;
    this._joinedAt = null;
    this.map = { ...DEFAULT_MAP, ...map };
    this.runId = runId;
    this._seenRunId = runId; // don't auto-start a run that began before we joined
    this.members = { [this.uid]: this.memberData() };
    this.status = 'lobby';
    this.active = true;
    this.armDisconnectCleanup();
    this.listenToParty();
    this.game.onPartyChanged();
  }

  async leaveParty() {
    if (!this.active) return;
    const code = this.partyCode;
    const uid = this.uid;
    this.teardown();

    try {
      await onDisconnect(rtdbRef(this.rtdb, `parties/${code}/members/${uid}`)).cancel();
      await onDisconnect(rtdbRef(this.rtdb, `parties/${code}/players/${uid}`)).cancel();
      await rtdbRemove(rtdbRef(this.rtdb, `parties/${code}/players/${uid}`));
      await rtdbRemove(rtdbRef(this.rtdb, `parties/${code}/members/${uid}`));
      // Last one out deletes the party
      const left = await rtdbGet(rtdbRef(this.rtdb, `parties/${code}/members`));
      if (!left.exists()) await rtdbRemove(rtdbRef(this.rtdb, `parties/${code}`));
    } catch (e) {
      console.warn('[multiplayer] leave cleanup failed:', e);
    }
    this.game.onPartyChanged();
  }

  teardown() {
    for (const unsub of this.listeners) unsub();
    this.listeners = [];
    this.clearRemotePlayers();
    this.partyCode = null;
    this.active = false;
    this.members = {};
    this.status = 'lobby';
    this.map = { ...DEFAULT_MAP };
    this._joinedAt = null;
  }

  // ---- PRESENCE ----

  memberData() {
    return {
      nickname: this.game.nicknameManager.getNickname() || 'Player',
      cosmetics: this.gatherCosmetics(),
      joinedAt: this._joinedAt || rtdbTimestamp(),
      status: this.status,
    };
  }

  armDisconnectCleanup() {
    onDisconnect(rtdbRef(this.rtdb, `parties/${this.partyCode}/members/${this.uid}`)).remove();
    onDisconnect(rtdbRef(this.rtdb, `parties/${this.partyCode}/players/${this.uid}`)).remove();
  }

  registerPresence() {
    if (!this.active) return;
    // After a reconnect the server has already run our onDisconnect cleanup.
    // Keep our original joinedAt so we don't lose (or steal) the leader spot.
    rtdbSet(rtdbRef(this.rtdb, `parties/${this.partyCode}/members/${this.uid}`), this.memberData());
    this.armDisconnectCleanup();
  }

  /** Push nickname / cosmetics changes to the party. */
  refreshSelf() {
    if (!this.active) return;
    const { nickname, cosmetics } = this.memberData();
    rtdbUpdate(rtdbRef(this.rtdb, `parties/${this.partyCode}/members/${this.uid}`), { nickname, cosmetics });
  }

  setStatus(status) {
    this.status = status;
    if (!this.active) return;
    rtdbUpdate(rtdbRef(this.rtdb, `parties/${this.partyCode}/members/${this.uid}`), { status });
  }

  gatherCosmetics() {
    const shop = this.game.shop;
    const player = this.game.player;

    const cosmetics = {
      equipType: this.game.selectedEquipment,
      stance: this.game.selectedStance,
      jacketColor: player.jacketMat.color.getHex(),
      pantsColor: player.pantsMat.color.getHex(),
      helmetColor: player.helmetMat.color.getHex(),
      boardColor: player.boardMat.color.getHex(),
      jacketFit: player.jacketFit,
      pantsFit: player.pantsFit,
    };

    // Resolve shop items for visual properties
    const jacketItem = shop.getEquippedItem('jacket');
    if (jacketItem) {
      cosmetics.jacketColor = jacketItem.color;
      cosmetics.jacketBrand = jacketItem.brand;
      cosmetics.jacketLegendary = !!jacketItem.legendary;
    }

    const pantsItem = shop.getEquippedItem('pants');
    if (pantsItem) {
      cosmetics.pantsColor = pantsItem.color;
      cosmetics.pantsBaggy = !!pantsItem.baggy;
      cosmetics.pantsLegendary = !!pantsItem.legendary;
    }

    const helmetItem = shop.getEquippedItem('helmet');
    if (helmetItem) {
      cosmetics.helmetColor = helmetItem.color;
      cosmetics.helmetHalo = helmetItem.id === 'legend-halo-helmet';
    }

    const boardItem = shop.getEquippedItem('board');
    if (boardItem) {
      cosmetics.boardColor = boardItem.color;
      cosmetics.boardItemId = boardItem.id;
      cosmetics.boardStats = boardItem.stats;
      cosmetics.bindingColor = boardItem.bindingColor || 0x222222;
    }

    return cosmetics;
  }

  // ---- PARTY LISTENERS ----

  listenToParty() {
    const base = `parties/${this.partyCode}`;

    this.listeners.push(onValue(rtdbRef(this.rtdb, `${base}/members`), (snap) => {
      const members = snap.val() || {};
      const mine = members[this.uid];
      if (mine && typeof mine.joinedAt === 'number') this._joinedAt = mine.joinedAt;
      // Our own entry can briefly vanish during a reconnect; keep showing ourselves
      if (!members[this.uid]) members[this.uid] = this.memberData();
      this.members = members;

      // Drop riders who left the party
      for (const uid of Object.keys(this.remotePlayers)) {
        if (!members[uid]) this.removeRemotePlayer(uid);
      }

      const leaderNow = this.isLeader;
      if (leaderNow && !this._wasLeader && this.memberCount > 1) {
        console.log('[multiplayer] you are now the party leader');
      }
      this._wasLeader = leaderNow;
      this.game.onPartyChanged();
    }));

    this.listeners.push(onValue(rtdbRef(this.rtdb, `${base}/map`), (snap) => {
      if (!snap.exists()) return;
      this.map = { ...DEFAULT_MAP, ...snap.val() };
      this.game.onPartyMapChanged(this.map);
    }));

    this.listeners.push(onValue(rtdbRef(this.rtdb, `${base}/runId`), (snap) => {
      const runId = snap.val() || 0;
      this.runId = runId;
      if (this._seenRunId !== null && runId > this._seenRunId) {
        this._seenRunId = runId;
        this.game.onPartyRunStarted(this.map);
      }
      this._seenRunId = runId;
    }));

    this.listeners.push(onValue(rtdbRef(this.rtdb, `${base}/players`), (snap) => {
      this.receivePlayers(snap.val() || {});
    }));
  }

  // ---- MAP / RUNS (leader) ----

  mapFromGame() {
    const g = this.game;
    return {
      mode: g.gameMode === 'backcountry' ? 'backcountry' : 'park',
      chair: g.gameMode === 'backcountry' ? g.backcountryChair : null,
      parkId: g.parkId || 'big-white',
      seed: Math.floor(Math.random() * 999999) + 1,
    };
  }

  /** Leader picks a map for the party. Returns false for non-leaders. */
  setMap(mode, chair, parkId) {
    if (!this.isLeader) return false;
    const map = {
      mode,
      chair: mode === 'backcountry' ? chair : null,
      parkId: parkId || this.map.parkId || 'big-white',
      // A new park layout each time the park changes; same layout for everyone
      seed: (mode === this.map.mode && parkId === this.map.parkId && chair === this.map.chair)
        ? this.map.seed : Math.floor(Math.random() * 999999) + 1,
    };
    this.map = map;
    rtdbSet(rtdbRef(this.rtdb, `parties/${this.partyCode}/map`), map);
    this.game.onPartyMapChanged(map);
    return true;
  }

  /** Leader starts a run: everyone waiting in the lobby drops in together. */
  startRun() {
    if (!this.isLeader) return;
    const next = (this.runId || 0) + 1;
    this.runId = next;
    this._seenRunId = next;
    rtdbSet(rtdbRef(this.rtdb, `parties/${this.partyCode}/runId`), next);
  }

  // ---- LOCAL RUN LIFECYCLE (called by Game) ----

  onLocalRunStarted() {
    if (!this.active) return;
    this.setStatus('riding');
    this._myMapKey = mapKey(this.map);
    this.lastSendTime = 0;
    this.sendState(true);
  }

  onLocalReturnedToLobby() {
    if (!this.active) return;
    this.setStatus('lobby');
    this._myMapKey = null;
    this.clearRemotePlayers();
    rtdbRemove(rtdbRef(this.rtdb, `parties/${this.partyCode}/players/${this.uid}`));
  }

  // ---- STATE SYNC ----

  update(dt, camera) {
    if (!this.active || this.status !== 'riding') return;
    this.sendState();
    for (const remote of Object.values(this.remotePlayers)) {
      remote.update(dt, camera);
    }
  }

  sendState(force = false) {
    if (!this.active || this.status !== 'riding' || !this._connected) return;
    const now = performance.now();
    if (!force && now - this.lastSendTime < SEND_RATE_MS) return;
    this.lastSendTime = now;

    const p = this.game.player;
    rtdbSet(rtdbRef(this.rtdb, `parties/${this.partyCode}/players/${this.uid}`), {
      m: this._myMapKey,
      x: +p.position.x.toFixed(2),
      y: +p.position.y.toFixed(2),
      z: +p.position.z.toFixed(2),
      h: +p.heading.toFixed(3),
      tx: +p.trickRotation.x.toFixed(3),
      ty: +p.trickRotation.y.toFixed(3),
      tz: +p.trickRotation.z.toFixed(3),
      g: p.grounded ? 1 : 0,
      gr: p.grinding ? 1 : 0,
      gb: p.isGrabbing ? 1 : 0,
      gt: p.grabType || null,
      sw: p.isSwitch ? 1 : 0,
      cr: p.crashed ? 1 : 0,
      tm: p.tomahawking ? 1 : 0,
      el: +p.edgeLeanSmooth.toFixed(2),
      tk: p.isTucking ? 1 : 0,
      bs: p.boardslideType || null,
      ba: +(p.boardslideAngle || 0).toFixed(3),
      trick: this.game.tricks.lastTrickName || null,
    }).catch(() => { /* dropped frame, next one will follow */ });
  }

  receivePlayers(allPlayers) {
    const myKey = this.status === 'riding' ? this._myMapKey : null;

    for (const [uid, data] of Object.entries(allPlayers)) {
      if (uid === this.uid) continue;
      const member = this.members[uid];
      const sameMap = myKey && data.m === myKey;

      if (!sameMap || !member) {
        this.removeRemotePlayer(uid);
        continue;
      }
      if (!this.remotePlayers[uid]) {
        this.remotePlayers[uid] = new RemotePlayer(
          this.game.scene, uid, member.nickname || 'Player', member.cosmetics || {}
        );
      }
      this.remotePlayers[uid].receiveState(data);
    }

    for (const uid of Object.keys(this.remotePlayers)) {
      if (!allPlayers[uid]) this.removeRemotePlayer(uid);
    }
  }

  removeRemotePlayer(uid) {
    if (this.remotePlayers[uid]) {
      this.remotePlayers[uid].dispose();
      delete this.remotePlayers[uid];
    }
  }

  clearRemotePlayers() {
    for (const uid of Object.keys(this.remotePlayers)) this.removeRemotePlayer(uid);
  }

  /** Number of other riders currently visible on our map. */
  get ridersHere() {
    return Object.keys(this.remotePlayers).length;
  }

  // ---- UTILITY ----

  generateCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }
}
