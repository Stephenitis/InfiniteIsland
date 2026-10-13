// Skipper Marlo's lines (PLAN Step 68a). Unhurried, warm, hums shanties, calls everybody "crew", mixes up landlubber words ("the pointy end") and loves clams. Pure text (no DOM): world/marlo.js plays it.
//
//   MARLO_SCRIPT.intro / .greet / .who / .clams / .bye / .doze / .wake   fixed lines
//   boatPages(boat) -> string[]     what he says to "How's the boat?": it follows the saved boat state (which parts are back), so it needs no extra memory
//   nextHint(boat) -> string        the one-line pointer shown under the menu ("Next: ...")
//   PART_HINTS                      where the open courses lead (Step 68b)
export const PART_HINTS = {
  planks: 'my planks washed up on the big reef rock out in the tide pools',
  sail: "the sail's up in that big tree, the tallest one, tangled in the canopy",
  rudder: "the rudder's stuck on a basalt column in a cooling lava pool, down the volcano's flank",
  compass: 'my compass is on the sea-stack headland, with the spray and the slippery steps',
};

export const MARLO_SCRIPT = {
  intro: [
    '*hums a shanty* ...oh! Ahoy there, crew! Do not mind the mess. Skipper Marlo, at your service. Well. At your leisure. Mostly leisure.',
    'A storm blew me and my good outrigger in here overnight. She is lying there with her stern end in the sand, and her pointy end... also in the sand. It is a bit of a day.',
    'The storm scattered her parts all over this island. Planks, sail, rudder, compass, the lot! The sea has been waiting a thousand years for me, so it can wait for lunch. Lunch is clams.',
    'But if you are the hopping sort of crew, I could use a few hops. Start with my planks, out on the reef rock. Just mind the water. It is wet. I checked.',
  ],
  greet: 'Ahoy, crew! Pull up a bit of sand.',
  who: [
    'Me? I am a sea otter, crew. Born on a wave, raised on a raft, retired on... well, a different raft. Old Marlo has sailed every sea there is, and a few that were only puddles.',
    'I fix boats, tell tall tales and crack clams on my tummy. That last one is the important job.',
  ],
  clams: [
    'Clams, crew! The finest thing in the sea. You find a good flat stone, you float on your back, you place the clam on your tummy and *tok, tok, tok*. Lunch.',
    'A sailor who does not love clams is a sailor who has not had a good clam. Remember that.',
  ],
  bye: 'Fair winds, crew!',
  doze: 'Zzz...',
  wake: 'Hm? Ahoy!',
  lockedHop: 'The reef rock is out in the tide pools, hop from stone to stone. If you fall in, you only get wet. And pop back. Magic of the sea.',
  planksBack: ['My planks! Oh, ho ho, crew, you hopped it just right. Biscuit! Biscuit, take those to the hull, there is a good gull.'],
  allBack: ['Every part is back! Sail, rudder, compass, planks. I will be ready to patch her up soon, crew.'],
};

/** "How's the boat?": the pages follow which parts are back. The open courses stay fun after their saved parts return; repair is Step 68c. */
export function boatPages(boat) {
  const parts = boat && boat.parts ? boat.parts : {};
  const have = ['planks', 'sail', 'rudder', 'compass'].filter((p) => parts[p]);
  const missing = ['planks', 'sail', 'rudder', 'compass'].filter((p) => !parts[p]);
  if (!have.length) {
    return [
      "She is a sorry sight, crew. Hull cracked, mast stub, no sail, no rudder, no compass. The storm took her parts and spread them around this island like crumbs.",
      `First things first: ${PART_HINTS.planks}. Hop the stones out to it, one stone at a time, and Biscuit will carry it home. Easy as a clam.`,
    ];
  }
  const pages = [];
  if (parts.planks) pages.push('The planks are back by the hull, all stacked up. Good hopping, crew!');
  if (!missing.length) return [...pages, ...MARLO_SCRIPT.allBack];
  pages.push(`Still missing: ${missing.map((p) => p).join(', ')}.`);
  pages.push(`If I remember right, ${missing.map((p, i) => (i ? `and ${PART_HINTS[p]}` : PART_HINTS[p])).join(', ')}.`);
  const tips = { planks: 'Hop the tide-pool stones.', sail: 'Follow the mushrooms and swaying bamboo for the sail. Hold Jump to glide down.', rudder: 'Rest on the still basalt between the sinking crust plates.', compass: 'Take the wet headland steps gently, and ring the shell bell.' };
  pages.push(missing.map((p) => tips[p]).join(' '));
  return pages;
}

export function nextHint(boat) {
  const parts = boat && boat.parts ? boat.parts : {};
  if (!parts.planks) return 'Next: hop the tide-pool stones to the reef rock for the planks.';
  if (!parts.sail) return 'Next: climb the swaying mushrooms and bamboo around the big tree for the sail. Hold Jump to glide down.';
  if (!parts.rudder) return 'Next: cross the cooling lava pool on the lower flank for the rudder. Rest on still basalt.';
  if (!parts.compass) return 'Next: climb the slippery sea-stack headland for the compass. Stop gently at the shell bell.';
  return 'All four parts are back. Marlo will be ready to patch her up soon.';
}
