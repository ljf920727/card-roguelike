/** Derives audible changes from presentation snapshots without modifying gameplay state. */

/** Captures scalar solo values before mutable game objects change again. */
export function soloSoundSnapshot(state) {
    return {
        run: state.run, enemy: state.enemy, hp: state.player.hp, shield: state.player.shield,
        enemyHp: state.enemy.hp, gold: state.run.gold, phase: state.phase, turn: state.run.turn,
        result: state.result, round: state.blackjack, outcome: state.blackjack?.outcome,
        rewardDone: state.reward?.done, curses: state.run.curses.length,
    };
}

/** Returns only new solo effects; redraws, theme changes and new encounters remain silent. */
export function soloSoundCues(before, after) {
    if (!before || before.run !== after.run || before.enemy !== after.enemy) return [];
    const cues = [];
    if (after.enemyHp < before.enemyHp) cues.push('attack');
    if (after.hp < before.hp) cues.push('hurt');
    if (after.hp > before.hp) cues.push('heal');
    if (after.shield > before.shield) cues.push('shield');
    if (after.shield < before.shield && after.turn === before.turn && !before.result) cues.push('block');
    const payout = after.gold - before.gold;
    // Ten chips is the base payout for a doubled blackjack win.
    if (payout > 0) cues.push(payout >= 10 ? 'bigPayout' : 'chips');
    else if (payout < 0 || (after.rewardDone && !before.rewardDone) || after.curses > before.curses) cues.push('exchange');
    if (after.outcome && (after.round !== before.round || after.outcome !== before.outcome)) {
        if (['win', 'natural'].includes(after.outcome)) cues.push('win');
        if (after.outcome === 'bust') cues.push('bust');
    }
    if (after.result && after.result !== before.result) cues.push(after.result === 'victory' ? 'victory' : 'defeat');
    else if (after.turn > before.turn && after.phase === 'player') cues.push('turn');
    return cues;
}

/** Returns effects only between consecutive connected co-op snapshots, never from restored history. */
export function multiplayerSoundCues(before, after) {
    const opening = after.players[after.activeIndex]?.isYou ? ['deal', 'turn'] : ['deal'];
    if (!before || before.roomId !== after.roomId || before.status === 'waiting') {
        return before?.roomId === after.roomId && before.status === 'waiting' && after.status === 'playing' ? opening : [];
    }
    if (before.status === 'finished' && after.status === 'playing') return opening;
    const cues = [];
    if (after.enemy?.hp < before.enemy?.hp) cues.push('attack');
    for (const player of after.players) {
        const old = before.players.find(value => value.index === player.index);
        if (!old) continue;
        if (player.hp < old.hp) cues.push('hurt');
        if (player.hp > old.hp) cues.push('heal');
        if (player.shield > old.shield) cues.push('shield');
        if (player.shield < old.shield && player.hp <= old.hp) cues.push('block');
    }
    const round = after.blackjack || after.lastBlackjack;
    const previous = before.blackjack || before.lastBlackjack;
    if (round && (!previous || round.player[0]?.id !== previous.player[0]?.id)) cues.push('deal');
    else if (round && previous && round.player.length > previous.player.length) cues.push('deal');
    else if (round && previous && round.dealer.length > previous.dealer.length) cues.push('deal');
    if (after.lastBlackjack && JSON.stringify(after.lastBlackjack) !== JSON.stringify(before.lastBlackjack)) {
        if (after.lastBlackjack.outcome === 'win') cues.push('win');
        if (after.lastBlackjack.outcome === 'bust') cues.push('bust');
    }
    if (after.result && after.result !== before.result && after.result !== 'abandoned') cues.push(after.result === 'victory' ? 'victory' : 'defeat');
    else if (after.turn !== before.turn && after.players[after.activeIndex]?.isYou) cues.push('turn');
    if (!after.blackjack && after.hand.some(card => !before.hand.some(old => old.id === card.id))) cues.push('deal');
    return [...new Set(cues)];
}

/** Spaces result cues so a single action does not bury its feedback under simultaneous sounds. */
export function playSoundCues(audio, cues, delay = 0) {
    for (const cue of cues) {
        void audio.play(cue, { delay });
        // Leave space for a payout or round result before the battle ending.
        if (cue === 'chips') delay += 0.54;
        else if (cue === 'bigPayout') delay += 0.95;
        else if (cue === 'win') delay += 0.58;
        else if (cue === 'bust') delay += 0.36;
        else delay += 0.09;
    }
}
