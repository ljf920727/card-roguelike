import { tutorialAllows } from "../systems/TutorialSystem.js";
import { canDoubleDown, calculateBlackjackValue, lossPenalty } from "../systems/BlackjackSystem.js";
import { PLAY_COST, MULLIGAN_COST } from "../systems/PlaySystem.js";

/** Content stays independent of DOM positioning so lesson behavior can be tested. */
export function getTutorialLesson(state) {
    if (!state.tutorial) return null;
    const step = state.tutorial.step;
    if (step === "complete") {
        if (state.run.floor !== 1 || state.run.fight !== 2 || state.run.turn !== 1) return null;
        return { key: "complete", title: "You're on your own", target: "#fight-text",
            body: "Each floor is two fights and a boss. Beating a boss offers a Curse and opens the shop, where blackjack chips buy potions, cards and Jokers. Turn Hints on in the side panel if you want tips along the way." };
    }
    if (state.result) {
        return { key: state.result, number: 6, target: "#play-button",
            title: state.result === "victory" ? "Goblin down" : "Try again",
            body: state.result === "victory" ? "Pick a reward, then choose Next fight to finish the tutorial." :
                "Your HP reached zero. New run restarts the guided opening." };
    }
    const selected = state.hand.filter(card => card.selected);
    const round = state.blackjack;
    const lessons = {
        intro: { number: 1, target: "#enemy-intent", title: "Read the enemy, spend 3 energy",
            body: `The Goblin shows its next move: it attacks for ${state.enemy.intent.value} when you end your turn. Each turn you get 3 energy. A poker play costs ${PLAY_COST}; a mulligan or a blackjack deal costs ${MULLIGAN_COST}.` },
        pair: selected.length && tutorialAllows(state, "play", selected) ?
            { number: 2, target: "#play-button", title: "Play the pair",
                body: "25 shield for 2 energy. Only the cards you play are discarded; the rest stay in your hand." } :
            { number: 2, target: "#hand", title: "Make a poker hand",
                body: "Select the two 7s. Pairs shield, flushes heal, and bigger hands hit harder: the full list is in the side panel." },
        mulligan: { number: 3, target: selected.length ? "#mulligan-button" : "#hand", title: "Mulligan what you don't need",
            body: "You have 1 energy left. Select up to 3 cards and swap them for new ones. Your hand carries into next turn, so keep what helps you build a bigger hand." },
        "end-turn": { number: 4, target: "#end-turn-button", title: "End turn: the Goblin acts",
            body: `Your shield takes the hit first. Shield lasts one turn, then halves for one more turn, then vanishes, so time it against the enemy's moves.` },
        blackjack: state.mode === "poker" ? { number: 5, target: '.mode-option[data-mode="blackjack"]', title: "Blackjack: the gamble",
            body: `Your leftover shield decayed to ${state.player.shield}. Now try blackjack. Beat the dealer without going over 21 to deal damage and win chips. Spend those chips on perks in the shop after each floor's boss. You draw from your deck; the dealer has its own.` } :
            !round ? { number: 5, target: "#play-button", title: "Deal a round",
                body: `Deal costs 1 energy. J/Q/K count 10, Aces 11 or 1, and the dealer draws to 17. Lose or bust and the Goblin hits you for ${lossPenalty(state)}.` } :
            { number: 5, target: canDoubleDown(state) ? "#double-button" : "#play-button", title: `You have ${calculateBlackjackValue(round.player)}`,
                body: "With your first two cards you can double down (1 more energy, one card, double the result) or surrender (half the loss). Or just hit and stand. Your call." },
        free: { number: 6, target: "#side-intent", title: "Finish the Goblin your way",
            body: "That's the loop. Enemies telegraph different moves: piercing hits, shatters, charges and jinxes. Read the move here before you choose. Your turn now ends on its own when you run out of energy." },
    };
    const lesson = lessons[step];
    if (!lesson) return null;
    const blackjackKey = step === "blackjack" ? `:${state.mode}:${round?.status ?? ""}` : "";
    return { ...lesson, key: `${step}:${lesson.target}${blackjackKey}` };
}

/** Combat lessons finish early; shop guidance arrives when it can actually be used. */
export function getShopLesson(state) {
    if (!state.tutorial || !state.shop || state.run.floor !== 1) return null;
    return {
        title: "Blackjack winnings become perks",
        body: "Every floor ends with a boss. You beat this one, so the shop is open before you move up.",
        facts: ["Winning blackjack hands earns chips: 5 for a win, 15 for a natural. Double down doubles the payout.",
            "Trade chips here for perks: healing, better cards, deck upgrades and passive Jokers. Purchases last this run.",
            "Buy what helps, or save your chips. Choose Climb to enter the next floor; its boss unlocks the next shop."],
    };
}
