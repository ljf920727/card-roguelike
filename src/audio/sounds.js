/** Defines the shared sound palette, relative levels and player-facing effect labels. */
export const SOUNDS = {
    ui: { label: 'Button', hint: 'A soft click when you press a menu button or choose a difficulty.', files: ['chip-lay-1.ogg'], gain: 0.22 },
    select: { label: 'Select card', hint: 'A light tap when you select or deselect a poker card.', files: ['card-place-1.ogg'], gain: 0.22, duration: 0.22 },
    deal: { label: 'Deal card', hint: 'Cards slide onto the table when you draw in poker or blackjack.', files: ['card-slide-1.ogg', 'card-slide-2.ogg', 'card-slide-3.ogg'], gain: 0.34 },
    play: { label: 'Play cards', hint: 'Cards slide forward when you play your selected poker hand.', files: ['card-shove-1.ogg'], gain: 0.5 },
    shuffle: { label: 'Mulligan', hint: 'A short shuffle when you trade selected cards for new ones.', files: ['card-shuffle.ogg'], gain: 0.32, duration: 0.65 },
    attack: { label: 'Hit enemy', hint: 'A thud when the enemy loses HP.', files: ['impactPunch_medium_000.ogg'], gain: 0.32 },
    hurt: { label: 'Take damage', hint: 'A thud when you or your co-op partner loses HP.', files: ['impactSoft_heavy_000.ogg'], gain: 0.35, rate: 0.85 },
    block: { label: 'Block hit', hint: 'A metallic clink when a shield absorbs an incoming hit.', files: ['impactMetal_light_000.ogg'], gain: 0.22, duration: 0.4 },
    shield: { label: 'Gain shield', hint: 'Two rising notes when you gain shield, such as by playing a pair.', notes: [392, 587.33], gain: 0.05 },
    heal: { label: 'Heal', hint: 'Three rising notes when a hand or potion restores HP.', notes: [523.25, 659.25, 783.99], gain: 0.045 },
    chips: { label: 'Chip payout', hint: 'A small stack of chips lands when you collect 1–9 chips.', files: ['payout-stack.wav'], gain: 0.52 },
    bigPayout: { label: 'Large chip payout', hint: 'A longer clatter when you collect 10 or more chips at once.', files: ['payout-pile.wav'], gain: 0.55 },
    exchange: { label: 'Purchase / reward', hint: 'A chip rattles when you buy something or claim a non-cash reward.', files: ['chips-handle-1.ogg'], gain: 0.38 },
    win: { label: 'Blackjack win', hint: 'A short jazz chord when you beat the dealer in blackjack.', files: ['blackjack-win.wav'], gain: 0.31 },
    bust: { label: 'Bust', hint: 'Two falling notes when your blackjack hand goes over its limit.', notes: [311.13, 233.08, 155.56], gain: 0.05 },
    victory: {
        label: 'Battle victory', hint: 'A piano and bass flourish when you defeat an enemy or boss.',
        files: ['battle-victory.wav'], gain: 0.65,
        variants: { rareFinisher: { file: 'rare-hand-finish.mp3', gain: 0.72 } },
    },
    defeat: { label: 'Battle defeat', hint: 'A low piano phrase when you lose a fight.', files: ['battle-defeat.wav'], gain: 0.65 },
    boss: { label: 'Boss entrance', hint: 'A metallic swell and a heavy hit as a solo boss appears.', files: ['boss-entrance.wav'], gain: 0.40 },
    turn: { label: 'Your turn', hint: 'A chime when your next turn starts, including a handoff in co-op.', notes: [440, 659.25], gain: 0.035 },
};

/** Keeps all requests compatible with both root hosting and GitHub Pages subpaths. */
export const AUDIO_BASE = `${import.meta.env?.BASE_URL ?? '/'}audio/`;
