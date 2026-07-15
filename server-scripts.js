// ============================================================
// Darwin Derby — Robinhood Chain — server-side scripts
// These run in the Bankr app sandbox (globals: appKV, bankr, args, log).
// Each "=== name ===" block is one script body.
// ============================================================

// === getState ===
const now = Date.now();
const heat = await appKV.get('heat');
const history = (await appKV.get('history')) || [];
const config = (await appKV.get('config')) || { prizeEth: 0.0005 };
const me = await bankr.wallet.me();
let treasuryWei = '0';
try { treasuryWei = String(await bankr.chain.getBalance({ chain: 'robinhood', address: me.evmAddress })); } catch (e) { log('balance read failed', String((e && e.message) || e)); }
return { now, heat: heat || null, history, config, ownerAddress: String(me.evmAddress).toLowerCase(), treasuryWei };

// === startHeat ===
if (args && args.smoke) return { ok: true, smoke: true };
const now = Date.now();
const existing = await appKV.get('heat');
if (existing && existing.status === 'lobby') {
  if (now < existing.endsAt) return { ok: false, error: 'lobby already open', heat: existing };
  return { ok: false, error: 'previous heat awaiting draw', heat: existing };
}
const heat = { id: 'heat_' + now + '_' + Math.floor(Math.random() * 1e6), status: 'lobby', createdAt: now, endsAt: now + 45000, entries: [], devices: [], winner: null, paid: false, txHash: null };
await appKV.set('heat', heat);
return { ok: true, heat };

// === joinHeat ===
if (args && args.smoke) return { ok: true, smoke: true };
const now = Date.now();
const heat = await appKV.get('heat');
if (!heat || heat.status !== 'lobby') return { ok: false, error: 'no open lobby' };
if (now >= heat.endsAt) return { ok: false, error: 'entry window closed' };
if (heat.entries.length >= 20) return { ok: false, error: 'field is full (20/20)' };
const username = String(args.username || '').trim().slice(0, 18);
const wallet = String(args.wallet || '').trim();
const deviceId = String(args.deviceId || '').trim();
if (!username) return { ok: false, error: 'username required' };
if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return { ok: false, error: 'invalid EVM wallet — 0x + 40 hex chars' };
if (!deviceId) return { ok: false, error: 'missing device id' };
if (heat.devices.indexOf(deviceId) !== -1) return { ok: false, error: 'one entry per device per heat' };
const wl = wallet.toLowerCase();
if (heat.entries.some(function (e) { return e.wallet === wl; })) return { ok: false, error: 'wallet already entered this heat' };
if (heat.entries.some(function (e) { return e.username.toLowerCase() === username.toLowerCase(); })) return { ok: false, error: 'username taken this heat' };
heat.entries.push({ username: username, wallet: wl, isBot: false, joinedAt: now });
heat.devices.push(deviceId);
await appKV.set('heat', heat);
return { ok: true, heat };

// === settleHeat ===
if (args && args.smoke) return { ok: true, smoke: true };
const now = Date.now();
const heat = await appKV.get('heat');
if (!heat) return { ok: false, error: 'no heat to settle' };
if (heat.status === 'done') return { ok: true, heat: heat, alreadySettled: true };
if (now < heat.endsAt) return { ok: false, error: 'lobby still open', heat: heat };
const BOTS = ['Tin Lizzie','Sir Skids','Gasket Case','Mad Axle','Rust Bucket','Paper Cutter','Duct Taper','Crank Shaft','Loose Wheel','Oily Bird','Piston Pete','Slick Nick','Gearless Joe','Flat Tire Phil','Nitro Nan','Sputter','Backfire Bob','Chassis Clyde','Lug Nut Lou','Torque McTurn','Wobbles','Botwright'];
const used = {};
heat.entries.forEach(function (e) { used[e.username.toLowerCase()] = 1; });
let i = 0;
while (heat.entries.length < 20) {
  let name = BOTS[i % BOTS.length];
  i++;
  if (used[name.toLowerCase()]) name = name + ' ' + i;
  used[name.toLowerCase()] = 1;
  heat.entries.push({ username: name, wallet: null, isBot: true });
}
const buf = new Uint32Array(1);
const limit = 4294967296 - (4294967296 % 20);
let r;
do { crypto.getRandomValues(buf); r = buf[0]; } while (r >= limit);
const idx = r % 20;
const w = heat.entries[idx];
heat.status = 'done';
heat.settledAt = now;
heat.winner = { index: idx, username: w.username, wallet: w.wallet || null, isBot: !!w.isBot };
await appKV.set('heat', heat);
const history = (await appKV.get('history')) || [];
history.unshift({ id: heat.id, settledAt: now, winner: heat.winner, humans: heat.entries.filter(function (e) { return !e.isBot; }).length, paid: false, txHash: null });
await appKV.set('history', history.slice(0, 25));
return { ok: true, heat: heat };

// === preparePayout ===
if (args && args.smoke) return { ok: true, smoke: true };
const heat = await appKV.get('heat');
if (!heat || heat.id !== args.heatId) return { ok: false, error: 'heat not found' };
if (heat.status !== 'done') return { ok: false, error: 'heat not settled yet' };
if (!heat.winner || heat.winner.isBot || !heat.winner.wallet) return { ok: false, error: 'winner is a bot — treasury keeps the prize' };
if (heat.paid) return { ok: false, error: 'prize already paid', txHash: heat.txHash };
const config = (await appKV.get('config')) || { prizeEth: 0.0005 };
const wei = (BigInt(Math.round(config.prizeEth * 1e9)) * 1000000000n).toString();
const blob = await bankr.tx.prepare({ chain: 'robinhood', to: heat.winner.wallet, value: wei, label: 'Darwin Derby prize: ' + config.prizeEth + ' ETH on Robinhood Chain to ' + heat.winner.username + ' (' + heat.winner.wallet + ')' });
return { ok: true, txBlob: blob, prizeEth: config.prizeEth, to: heat.winner.wallet };

// === recordPayout ===
if (args && args.smoke) return { ok: true, smoke: true };
const heat = await appKV.get('heat');
if (!heat || heat.id !== args.heatId) return { ok: false, error: 'heat not found' };
if (!heat.winner || heat.winner.isBot) return { ok: false, error: 'no human winner on this heat' };
heat.paid = true;
heat.txHash = String(args.txHash || '').trim() || null;
await appKV.set('heat', heat);
const history = (await appKV.get('history')) || [];
history.forEach(function (h) { if (h.id === heat.id) { h.paid = true; h.txHash = heat.txHash; } });
await appKV.set('history', history);
return { ok: true, txHash: heat.txHash };

// === setPrize ===
if (args && args.smoke) return { ok: true, smoke: true };
const p = Number(args.prizeEth);
if (!isFinite(p) || p <= 0 || p > 0.01) return { ok: false, error: 'prize must be > 0 and <= 0.01 ETH' };
const config = (await appKV.get('config')) || {};
config.prizeEth = p;
await appKV.set('config', config);
return { ok: true, prizeEth: p };