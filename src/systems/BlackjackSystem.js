/** Card values and blackjack rounds against the enemy dealer, including double down and surrender. */
import { drawCard, isJinx, GILDED_DAMAGE } from "./DeckSystem.js";
import { applyAction, damagePlayer } from "./CombatSystem.js";
import { advanceTutorial, tutorialAllows } from "./TutorialSystem.js";
import { hasJoker } from "./JokerSystem.js";
import { hasCurse } from "./CurseSystem.js";

/** A jinx wastes a draw without adding to the blackjack total. */
export const JINX_VALUE = 0;

export function getCardValue(rank) {
    if (rank === "J" ||rank === "Q" ||rank === "K"){
        return 10;
    }
    if (rank === "A") {
        return 11;
    }
    if (rank === "X") {
        return JINX_VALUE;
    }
    return Number(rank);
}

/** Returns the best total and whether an ace is still counted as 11. */
export function scoreHand(cards) {
    let total = 0;
    let aceCount = 0;
    for (const card of cards) {
        total += getCardValue(
            card.rank
        );
        if (card.rank === "A") {
            aceCount += 1;
        }
    }
    while (
        total > 21 &&
        aceCount > 0
    ) {
        total -= 10;
        aceCount -= 1;
    }
    return { total, soft: aceCount > 0 };
}

export function calculateBlackjackValue(cards) {
    return scoreHand(cards).total;
}

export const DEAL_COST = 1;
export const DOUBLE_COST = 1;
export const NATURAL_DAMAGE = 30;
export const DEALER_STANDS_ON = 17;
export const WIN_CHIPS = 5;
export const NATURAL_CHIPS = 15;
const HIGH_ROLLER_DAMAGE = 6;
const HIGH_ROLLER_CHIPS = 5;

export function isNatural(cards) {
    return cards.length === 2 && !cards.some(isJinx) && calculateBlackjackValue(cards) === 21;
}

export function isRoundActive(state) {
    return state.blackjack?.status === "playing";
}

/** The HP a lost round costs: the enemy's average attack, doubled on a double down. */
export function lossPenalty(state) {
    return (state.enemy.penalty ?? state.enemy.intent?.value ?? 0) * (state.blackjack?.doubled ? 2 : 1) *
        (hasCurse(state, "blood-money") ? 2 : 1);
}

function dealerShouldHit(state, cards) {
    const { total, soft } = scoreHand(cards);
    return total < DEALER_STANDS_ON || (total === DEALER_STANDS_ON && soft && Boolean(state.run?.rules?.dealerHitsSoft17));
}

export function canDeal(state) {
    if (state.phase !== "player" || state.result || isRoundActive(state) || !tutorialAllows(state, "deal")) return false;
    return state.player.energy >= DEAL_COST;
}

export function dealRound(state) {
    if (!canDeal(state)) return false;
    state.player.energy -= DEAL_COST;
    const player = [drawCard(state), drawCard(state)];
    const dealer = [drawCard(state.enemy.deck), drawCard(state.enemy.deck)];
    state.blackjack = { player, dealer, status: "playing", outcome: null, doubled: false };
    advanceTutorial(state, "deal");
    if (isNatural(player)) finishRound(state);
    return true;
}

export function hit(state) {
    if (!isRoundActive(state) || !tutorialAllows(state, "hit")) return false;
    state.blackjack.player.push(drawCard(state));
    const total = calculateBlackjackValue(state.blackjack.player);
    if (total > 21) {
        resolveRound(state);
    } else if (total === 21) {
        finishRound(state);
    }
    advanceTutorial(state, "hit");
    return true;
}

export function stand(state) {
    if (!isRoundActive(state) || !tutorialAllows(state, "stand")) return false;
    finishRound(state);
    advanceTutorial(state, "stand");
    return true;
}

function canAdjustBet(state) {
    return isRoundActive(state) && state.blackjack.player.length === 2 && !state.blackjack.doubled;
}

export function canDoubleDown(state) {
    return canAdjustBet(state) && state.player.energy >= DOUBLE_COST && tutorialAllows(state, "double");
}

/** Pays 1 more energy, takes exactly one card and doubles the round's result. */
export function doubleDown(state) {
    if (!canDoubleDown(state)) return false;
    state.player.energy -= DOUBLE_COST;
    state.blackjack.doubled = true;
    state.blackjack.player.push(drawCard(state));
    if (calculateBlackjackValue(state.blackjack.player) > 21) resolveRound(state);
    else finishRound(state);
    return true;
}

export function canSurrender(state) {
    return canAdjustBet(state) && tutorialAllows(state, "surrender");
}

/** Gives up after the first two cards for half the loss penalty. */
export function surrender(state) {
    if (!canSurrender(state)) return false;
    const round = state.blackjack;
    const penalty = Math.ceil(lossPenalty(state) / 2);
    const hitResult = damagePlayer(state, penalty);
    Object.assign(round, { status: "done", outcome: "surrender", blocked: hitResult.blocked, damage: hitResult.damage,
        playerTotal: calculateBlackjackValue(round.player), dealerTotal: calculateBlackjackValue(round.dealer) });
    state.discardPile.push(...round.player);
    state.enemy.deck.discardPile.push(...round.dealer);
    state.lastAction = `You surrendered: blocked ${hitResult.blocked}, lost ${hitResult.damage} HP.`;
    advanceTutorial(state, "round-done");
    return true;
}

/** The dealer draws (unless the player has a natural), then the round resolves. */
function finishRound(state) {
    const { dealer, player } = state.blackjack;
    if (!isNatural(player)) {
        while (dealerShouldHit(state, dealer)) dealer.push(drawCard(state.enemy.deck));
    }
    resolveRound(state);
}

function resolveRound(state) {
    const round = state.blackjack;
    const playerTotal = calculateBlackjackValue(round.player);
    const dealerTotal = calculateBlackjackValue(round.dealer);
    const playerNatural = isNatural(round.player);
    const dealerNatural = isNatural(round.dealer);
    const name = state.enemy.name;
    const multiplier = round.doubled ? 2 : 1;
    let outcome;
    if (playerTotal > 21) {
        outcome = "bust";
    } else if (playerNatural && dealerNatural) {
        outcome = "push";
    } else if (playerNatural) {
        outcome = "natural";
    } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
        outcome = "win";
    } else if (playerTotal === dealerTotal) {
        outcome = "push";
    } else {
        outcome = "lose";
    }

    round.status = "done";
    round.outcome = outcome;
    advanceTutorial(state, "round-done");
    round.playerTotal = playerTotal;
    round.dealerTotal = dealerTotal;
    state.discardPile.push(...round.player);
    state.enemy.deck.discardPile.push(...round.dealer);

    if (outcome === "win" || outcome === "natural") {
        const highRoller = hasJoker(state, "high-roller");
        const base = (outcome === "natural" ? NATURAL_DAMAGE : playerTotal) +
            round.player.filter(card => card.gilded).length * GILDED_DAMAGE + (highRoller ? HIGH_ROLLER_DAMAGE : 0);
        const chips = ((outcome === "natural" ? NATURAL_CHIPS : WIN_CHIPS) + (highRoller ? HIGH_ROLLER_CHIPS : 0)) * multiplier *
            (hasCurse(state, "greed") ? 2 : 1);
        const before = state.enemy.hp;
        applyAction(state, { type: "attack", amount: base * multiplier * (hasCurse(state, "blood-money") ? 2 : 1) });
        round.damage = before - state.enemy.hp;
        round.chips = chips;
        state.run.gold += chips;
        const doubled = round.doubled ? " Doubled!" : "";
        state.lastAction = outcome === "natural"
            ? `Natural blackjack! You dealt ${round.damage} damage and won ${chips} chips.${doubled}`
            : `You won with ${playerTotal} against ${dealerTotal > 21 ? "a bust" : dealerTotal}: dealt ${round.damage} damage, won ${chips} chips.${doubled}`;
    } else if (outcome === "push") {
        const refund = state.run?.rules?.noPushRefund ? 0 : DEAL_COST + (round.doubled ? DOUBLE_COST : 0);
        state.player.energy += refund;
        round.refund = refund;
        state.lastAction = refund ? `Push at ${playerTotal}. Your energy was refunded.` : `Push at ${playerTotal}. The house keeps your energy.`;
    } else if (hasJoker(state, "insurance") && !state.flags.insuranceUsed) {
        state.flags.insuranceUsed = true;
        Object.assign(round, { insured: true, blocked: 0, damage: 0 });
        state.lastAction = `${outcome === "bust" ? `Bust at ${playerTotal}` : `${name} won with ${dealerTotal}`}: Insurance covered the loss.`;
    } else {
        const hitResult = damagePlayer(state, lossPenalty(state));
        round.blocked = hitResult.blocked;
        round.damage = hitResult.damage;
        state.lastAction = `${outcome === "bust" ? `Bust at ${playerTotal}` : `${name} won with ${dealerTotal}`}: blocked ${hitResult.blocked}, lost ${hitResult.damage} HP.`;
    }
}
