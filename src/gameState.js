/** Stores the single-battle prototype's player, enemy and demo hand data. */
export const gameState = {
    player: {
        hp:80,
        maxHp:100,
        shield:0,
        energy:3,
        maxEnergy:3,
    },
    enemy: {
        name: "Goblin",
        hp: 50,
        maxHp: 50,

        intent: {
            type: "attack",
        value: 8,
        },
    },
    run: {
        floor:1,
        turn:1,
        gold:0,

    },
    deck: {
        drawPile:47,
        discardPile:0,
    },
    hand: [
        {
        id:1,
        rank: "A",
        suit: "spades",
        selected: false,   
        },
        {
        id:2,
        rank: "K",
        suit: "diamonds",
        selected: false,
        },
        {
        id:3,
        rank: "7",
        suit: "hearts",
        selected: false,
        },
        {
        id:4,
        rank: "7",
        suit: "spades",
        selected: false,
        },
        {
        id:5,
        rank: "3",
        suit: "hearts",
        selected: false,
        },

     ],
     usedCards: [],
     selection: {
        cards: [],
        value: 0,
        results:[],
        primaryAction: null,

     },

};
