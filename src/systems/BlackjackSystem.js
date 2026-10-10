import { drawCard } from "./DeckSystem.js";
import { applyAction, applyEnemyAttack } from "./CombatSystem.js";

export function getCardValue(rank) {
    if (rank === "J" ||rank === "Q" ||rank === "K"){
        return 10;
    }
    if (rank === "A") {
        return 11;
    }
    return Number(rank);
}

export function calculateBlackjackValue(cards) {
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
    return total;
}

export const DEAL_COST = 1;
export const NATURAL_DAMAGE = 30;
export const DEALER_STANDS_ON = 17;

export function isNatural(cards) {
    return cards.length === 2 && calculateBlackjackValue(cards) === 21;
}

export function isRoundActive(state) {
    return state.blackjack?.status === "playing";
}

export function canDeal(state) {
    if (state.phase !== "player" || state.result || isRoundActive(state)) return false;
    return state.player.energy >= DEAL_COST;
}

export function dealRound(state) {
    if (!canDeal(state)) return false;
    state.player.energy -= DEAL_COST;
    const player = [drawCard(state), drawCard(state)];
    const dealer = [drawCard(state), drawCard(state)];
    state.blackjack = { player, dealer, status: "playing", outcome: null };
    if (isNatural(player)) stand(state);
    return true;
}

export function hit(state) {
    if (!isRoundActive(state)) return false;
    state.blackjack.player.push(drawCard(state));
    const total = calculateBlackjackValue(state.blackjack.player);
    if (total > 21) {
        resolveRound(state);
    } else if (total === 21) {
        stand(state);
    }
    return true;
}

export function stand(state) {
    if (!isRoundActive(state)) return false;
    const { dealer, player } = state.blackjack;
    if (!isNatural(player)) {
        while (calculateBlackjackValue(dealer) < DEALER_STANDS_ON) dealer.push(drawCard(state));
    }
    resolveRound(state);
    return true;
}

function resolveRound(state) {
    const round = state.blackjack;
    const playerTotal = calculateBlackjackValue(round.player);
    const dealerTotal = calculateBlackjackValue(round.dealer);
    const playerNatural = isNatural(round.player);
    const dealerNatural = isNatural(round.dealer);
    const name = state.enemy.name;
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
    round.playerTotal = playerTotal;
    round.dealerTotal = dealerTotal;
    state.discardPile.push(...round.player, ...round.dealer);

    if (outcome === "win" || outcome === "natural") {
        const damage = outcome === "natural" ? NATURAL_DAMAGE : playerTotal;
        const before = state.enemy.hp;
        applyAction(state, { type: "attack", amount: damage });
        round.damage = before - state.enemy.hp;
        state.lastAction = outcome === "natural"
            ? `Natural blackjack! You dealt ${round.damage} damage.`
            : `You won with ${playerTotal} against ${dealerTotal > 21 ? "a bust" : dealerTotal}: dealt ${round.damage} damage.`;
    } else if (outcome === "push") {
        state.player.energy += DEAL_COST;
        state.lastAction = `Push at ${playerTotal}. Your energy was refunded.`;
    } else {
        const hitResult = applyEnemyAttack(state);
        round.blocked = hitResult.blocked;
        round.damage = hitResult.damage;
        state.lastAction = `${outcome === "bust" ? `Bust at ${playerTotal}` : `${name} won with ${dealerTotal}`}: blocked ${hitResult.blocked}, lost ${hitResult.damage} HP.`;
    }
}
