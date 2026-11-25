/** Defines the shared sound palette, relative levels and player-facing audition labels. */
export const SOUNDS = {
    ui: { label: 'Button', hint: 'Use a menu, choose a difficulty, or confirm a dialog.', files: ['chip-lay-1.ogg'], gain: 0.22 },
    select: { label: 'Select card', hint: 'Select or deselect a poker card.', files: ['card-place-1.ogg'], gain: 0.22, duration: 0.22 },
    deal: { label: 'Deal card', hint: 'Deal, Hit, or draw new poker cards.', files: ['card-slide-1.ogg', 'card-slide-2.ogg', 'card-slide-3.ogg'], gain: 0.34 },
    play: { label: 'Play cards', hint: 'Resolve a valid poker hand.', files: ['card-shove-1.ogg'], gain: 0.5 },
    shuffle: { label: 'Mulligan', hint: 'Swap selected poker cards.', files: ['card-shuffle.ogg'], gain: 0.32, duration: 0.65 },
    attack: { label: 'Hit enemy', hint: 'Deal damage to the enemy.', files: ['impactPunch_medium_000.ogg'], gain: 0.32 },
    hurt: { label: 'Take damage', hint: 'Lose player HP.', files: ['impactSoft_heavy_000.ogg'], gain: 0.35, rate: 0.85 },
    block: { label: 'Block hit', hint: 'An enemy hit spends your shield.', files: ['impactMetal_light_000.ogg'], gain: 0.22, duration: 0.4 },
    shield: { label: 'Gain shield', hint: 'Play a pair or another shield-granting hand.', notes: [392, 587.33], gain: 0.05 },
    heal: { label: 'Heal', hint: 'Restore HP with a hand or potion.', notes: [523.25, 659.25, 783.99], gain: 0.045 },
    chips: { label: 'Chip payout', hint: 'Collect 1–9 chips, including a skipped reward.', files: ['payout-stack.wav'], gain: 0.52 },
    bigPayout: { label: 'Large chip payout', hint: 'Collect 10 or more chips at once.', files: ['payout-pile.wav'], gain: 0.55 },
    exchange: { label: 'Purchase / reward', hint: 'Spend chips or claim a non-cash reward.', files: ['chips-handle-1.ogg'], gain: 0.38 },
    win: { label: 'Blackjack win', hint: 'Win a blackjack round, including a natural.', files: ['blackjack-win.wav'], gain: 0.31 },
    bust: { label: 'Bust', hint: 'Go over the blackjack limit.', notes: [311.13, 233.08, 155.56], gain: 0.05 },
    victory: { label: 'Battle victory', hint: 'Defeat an enemy or boss.', files: ['battle-victory.wav'], gain: 0.65 },
    defeat: { label: 'Battle defeat', hint: 'Lose the battle.', files: ['battle-defeat.wav'], gain: 0.65 },
    boss: { label: 'Boss entrance', hint: 'Open the boss introduction.', files: ['boss-entrance.wav'], gain: 0.40 },
    turn: { label: 'Your turn', hint: 'An enemy turn finishes, or co-op passes to you.', notes: [440, 659.25], gain: 0.035 },
};

/** Keeps all requests compatible with both root hosting and GitHub Pages subpaths. */
export const AUDIO_BASE = `${import.meta.env?.BASE_URL ?? '/'}audio/`;
