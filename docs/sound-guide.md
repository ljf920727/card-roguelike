# Sound guide

Open **Settings → Sound** from the main menu or the solo/co-op top bar. Under **Try the sounds**,
each **Play** button auditions the same cue and relative level used in gameplay.
Mute and effects volume also apply to previews. Closing the dialog stops the preview.
Effects default to 55% and music to 16%, with independent volume and mute controls.
The main menu and co-op lobby play Spring Spring's “(Basically not) Fusion Jazz”.
Solo battles on every floor and co-op battles play “Bass Walker” by Kevin MacLeod
(CC BY 4.0), mixed lower to leave room for cards and chips. Each track resumes
from its own position. Battle introductions, rewards and endings leave room for
their cues. See Settings → Sound → Music credits for sources, licenses and playback changes.

| Preview label | In-game trigger |
| --- | --- |
| Button | Menus, difficulty choices, tutorial prompts, dialog navigation, co-op lobby controls and actions without their own feedback |
| Select card | Select or deselect a poker card, with mouse or keyboard |
| Deal card | Blackjack deals/hits/dealer draws, or new poker cards |
| Play cards | A successful poker play |
| Mulligan | A successful solo card swap |
| Hit enemy | Enemy HP decreases |
| Take damage | Player HP decreases |
| Block hit | Shield is spent by an attack; solo turn-start decay is silent |
| Gain shield | Shield increases |
| Heal | HP increases within an encounter, including a shop potion |
| Chip payout | Collect 1–9 chips, including skipping a reward for 5 chips |
| Large chip payout | Collect at least 10 chips in one transaction |
| Purchase / reward | Spend chips, claim a reward without a payout, or accept a curse |
| Blackjack win | A winning or natural blackjack round settles |
| Bust | A blackjack round ends over the limit |
| Battle victory | An enemy is defeated |
| Battle defeat | A battle is lost |
| Boss entrance | A solo boss introduction opens for the first time |
| Your turn | Solo enemy phase completes, or co-op passes control to you |

For a repeatable first listening pass, enable **Settings → Tutorial**, start a new solo run,
enter the Lobby, and follow the guidance. Select the two 7s and play the pair to hear
selection, play and shield cues. Mulligan a card, then end the turn to hear a swap,
draw, block and turn notification. Follow the blackjack lesson and double down to
hear the deal, hit, damage, chips and winning sequence. Rare outcomes can be auditioned
directly without finishing a run.

## Implementation

- `src/audio/sounds.js` owns preview labels, filenames, gains, sample durations and note sequences.
- `AudioManager.js` owns lazy Web Audio activation, cached decoding, preferences, envelopes,
  voice limits and cancellation. Missing audio never blocks combat.
- `battleSounds.js` compares presentation snapshots. Solo redraws and theme changes are
  silent; co-op compares only consecutive synchronized server snapshots. Reconnection
  establishes a fresh silent baseline.
- `AudioSettings.js` installs the shared modal and gesture/background handling.
- Solo card sounds follow the existing 110 ms deal stagger. Co-op uses one short draw
  cue per arriving group; it does not sound hidden teammate cards.
- The two payout WAVs combine distinct Kenney Casino Audio recordings. The short
  mix uses chips-handle-6 and chips-stack-3, 5 and 2. The large mix uses chips-handle-5
  and chips-stack-2, 5, 3, 6, 4 and 1. Both follow the actual wallet increase.
- Four original WAV cues distinguish a blackjack hand win (a short jazz chord),
  boss arrival (bowed metal and a heavy impact), battle victory (a bright piano
  chord over bass), and defeat (a sparse piano phrase over a descending bass).
- Samples are served from the deployment base path. The 11 bundled Ogg files retain
  their source filenames and accompanying CC0 licenses. Synthesized cues use sine
  notes with short envelopes. No audio library or external asset host is required.

Audio support and perceived loudness vary by browser and output device. For tuning,
identify the preview label, the gameplay action, and whether the issue is tone, level,
length or timing. Keep gameplay rules independent of sound playback.
