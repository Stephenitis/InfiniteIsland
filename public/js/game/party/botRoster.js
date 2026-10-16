// The party bots' faces (Step 80a): a bot is named after one of the Tdoongz, wears that friend's colours and a party-hat version of their ears (player/partyHats.js). PURE data (no three.js).
//
//   BOTS[i] = { id: Tdoongz id, name (short), ears: key of PARTY_HATS, colors: { hat, cuff, shirt, pants, ui } }
//   botFor(slotOrIndex)   the bot with that index, wrapping            botByName(name)   lookup for a replica's avatar (the slot table carries the name)
//   botOrder(taken)       the order bots are picked in: skips friends already in the party, so four bots are four different friends
//   hostFor(gameId)       the Tdoong (or NPC) who hosts a game, for the how-to's speech bubble
// The lines the hosts say fit their Personalities (game/tdoongzScript.js header): Nabong comes running and cheers first, Mokuring loves everything, Shyam Shyam pranks, Dub Nyangee is gentle and dependable,
// Myodette is calm and graceful, Son Chaetty naps then eats; Marlo and Bramble keep their voices.
export const BOTS = [
  { id: 'imnabong',   name: 'Nabong',   ears: 'bunny',    colors: { hat: '#a9c2fb', cuff: '#8fadf2', shirt: '#c6d7fd', pants: '#7f9be8', ui: '#8fb0ff' } },
  { id: 'mokuring',   name: 'Mokuring', ears: 'bear',     colors: { hat: '#f7a3c6', cuff: '#e07fae', shirt: '#ffd0e4', pants: '#b79af0', ui: '#ff9ec9' } },
  { id: 'dubnyangee', name: 'Nyangee',  ears: 'cat',      colors: { hat: '#f2f2f6', cuff: '#c9c9d8', shirt: '#ff9aa8', pants: '#8f8fa8', ui: '#ffb0bc' } },
  { id: 'sonchaetty', name: 'Chaetty',  ears: 'tiger',    colors: { hat: '#ffb347', cuff: '#e0852a', shirt: '#ffd08a', pants: '#8a5a32', ui: '#ffbe5c' } },
  { id: 'shyamshyam', name: 'Shyam',    ears: 'hamster',  colors: { hat: '#ffcf9a', cuff: '#f0a868', shirt: '#fff0d8', pants: '#e48aa8', ui: '#ffc78f' } },
  { id: 'yubbuibbui', name: 'Bbui',     ears: 'puppy',    colors: { hat: '#2e3a6a', cuff: '#1f2850', shirt: '#445391', pants: '#fbefd8', ui: '#7d8cff' } },
  { id: 'myodette',   name: 'Myodette', ears: 'penguin',  colors: { hat: '#c9b6f2', cuff: '#a58ae0', shirt: '#ffffff', pants: '#8fe6d0', ui: '#c8b0ff' } },
  { id: 'parkzyoni',  name: 'Zyoni',    ears: 'unicorn',  colors: { hat: '#ffe58a', cuff: '#f2c24a', shirt: '#fff5c8', pants: '#ff9ed0', ui: '#ffe47a' } },
  { id: 'tzukumi',    name: 'Tzukumi',  ears: 'fawn',     colors: { hat: '#d9b48a', cuff: '#b88a58', shirt: '#f4e2c8', pants: '#a8d49a', ui: '#e6c49a' } },
];
export const botFor = (i) => BOTS[((i % BOTS.length) + BOTS.length) % BOTS.length];
export const botByName = (name) => BOTS.find((b) => b.name === name) || null;
export const PARTY_EAR_KEYS = BOTS.map((b) => b.ears);

/** The bots to bring, in order, skipping names already `taken` (a party's four bots are four different friends). */
export function botOrder(taken = []) {
  const free = BOTS.filter((b) => !taken.includes(b.name));
  return free.length ? free : BOTS.slice();
}

export const HOSTS = {
  vineskip: { name: 'Im Nabong + Mokuring', lines: { welcome: "Hi, hi, hi! I'll swing the vine!", go: 'Mokuring: Ooh, so sparkly! Ready? Jump!', win: 'Nabong: You did it! Come on, again again!' } },
  marlosays: { name: 'Skipper Marlo + Biscuit', lines: { welcome: "Ahoy, crew! Watch my flag, now. Red is B, on the left. Green is A, on the right. Biscuit fibs, mind.", go: 'Biscuit: Squawk! Trust the flag, not me, mates!', win: 'Marlo: Dry as a biscuit! Fine sailing, crew.' } },
  huddle: { name: 'Myodette', lines: { welcome: 'Hello, dear friends. Breathe in... and when the pinecones fall, curl up gracefully, like a little bud.', go: 'Listen for the whistle... and curl.', win: 'How graceful. Well done, all of you.' } },
  sizzle: { name: 'Dub Nyangee', lines: { welcome: 'Oh my. A sizzling seed. Please do not worry, it is only warm. Hand it to a friend, gently, by bumping into them.', go: 'There, it is lit. Pass it along, dears.', win: 'Dub Nyangee: Oh, a little soot. It suits you. Well played, everyone.' } },
  eggs: { name: 'Shyam Shyam', lines: { welcome: 'Hee hee! Run in your lane and the eggs land on your head! Golden ones count three. I might throw a pinecone. Maybe.', go: 'Shyam Shyam: Oops, my paw slipped! Hee hee hee!', win: 'Shyam Shyam: Wheee! So many eggs! Again, again!' } },
  timber: { name: 'Bramble', lines: { welcome: 'Hrm. See the red stripe on each log? Chop it right on the red line.', go: 'Stripe on the line. Chop!', win: 'Bramble: A fine set of bites, friends.' } },
};
export const hostFor = (id) => HOSTS[id] || { name: 'The Glade', lines: {} };

/** The three Tdoongz cheering in the lobby at a time (rotating through the nine). */
export const cheerers = (round) => [0, 1, 2].map((k) => BOTS[(round * 3 + k) % BOTS.length].id);
