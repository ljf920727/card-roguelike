import test from "node:test";
import assert from "node:assert/strict";
import {
    createRoom, disconnectPlayer, getPublicState, handleAction, joinRoom, leaveRoom, setReady,
} from "../server/game.js";

const tokenA = "token-aaaaaaaaaaaaaaaa";
const tokenB = "token-bbbbbbbbbbbbbbbb";

function startedRoom() {
    const room = createRoom("A1B2C3");
    const leo = joinRoom(room, { name: "Leo", token: tokenA }).player;
    const alan = joinRoom(room, { name: "Alan", token: tokenB }).player;
    setReady(room, leo);
    setReady(room, alan);
    return { room, leo, alan };
}

test("two players join a room and the battle starts when both are ready", () => {
    const room = createRoom("A1B2C3");
    const leo = joinRoom(room, { name: "Leo", token: tokenA }).player;
    assert.equal(setReady(room, leo), null);
    assert.equal(room.status, "waiting");
    const alan = joinRoom(room, { name: "Alan", token: tokenB }).player;
    setReady(room, alan);
    assert.equal(room.status, "playing");
    assert.equal(room.enemy.name, "Ogre");
    assert.equal(leo.hand.length, 5);
    assert.equal(alan.hand.length, 5);
});

test("a room rejects bad tokens, a third player, and newcomers after the start", () => {
    const room = createRoom("A1B2C3");
    assert.equal(joinRoom(room, { name: "Leo", token: "short" }).error, "Invalid session token");
    joinRoom(room, { name: "Leo", token: tokenA });
    joinRoom(room, { name: "Alan", token: tokenB });
    assert.equal(joinRoom(room, { name: "Kim", token: "token-cccccccccccccccc" }).error, "Room is full");
    const { room: started } = startedRoom();
    assert.equal(joinRoom(started, { name: "Kim", token: "token-cccccccccccccccc" }).error, "Game already started");
});

test("each player sees only their own hand and the dealer's face-up card", () => {
    const { room, leo, alan } = startedRoom();
    assert.equal(handleAction(room, leo, { type: "deal" }), null);
    const view = getPublicState(room, alan);
    assert.deepEqual(view.hand.map(card => card.id), alan.hand.map(card => card.id));
    assert.equal(view.players.find(p => p.name === "Leo").cards, 5);
    assert.equal(view.blackjack, null);
    const leoView = getPublicState(room, leo);
    if (leoView.blackjack) assert.deepEqual(leoView.blackjack.dealer[1], { hidden: true });
});

test("only the active player can act, and ending a turn passes it on", () => {
    const { room, leo, alan } = startedRoom();
    assert.equal(handleAction(room, alan, { type: "endTurn" }), "Not your turn or waiting for opponent");
    assert.equal(handleAction(room, leo, { type: "endTurn" }), null);
    assert.equal(room.players[room.active], alan);
    assert.equal(leo.hp, 88);
});

test("poker plays must use cards from the player's own hand", () => {
    const { room, leo, alan } = startedRoom();
    assert.equal(handleAction(room, leo, { type: "poker", cardIds: [alan.hand[0].id + "x"] }), "Cards are not in your hand");
    const hp = room.enemy.hp;
    assert.equal(handleAction(room, leo, { type: "poker", cardIds: [leo.hand[0].id] }), null);
    assert.ok(room.enemy.hp < hp);
    assert.equal(room.players[room.active], alan);
});

test("a dropped player keeps their seat mid-game and gets it back with the same token", () => {
    const { room, leo } = startedRoom();
    disconnectPlayer(room, leo);
    assert.equal(room.players.length, 2);
    assert.equal(handleAction(room, room.players[1], { type: "endTurn" }), "Not your turn or waiting for opponent");
    const back = joinRoom(room, { name: "Leo", token: tokenA });
    assert.equal(back.player, leo);
    assert.equal(leo.connected, true);
});

test("leaving mid-game forfeits, and leaving the lobby frees the seat", () => {
    const { room, leo } = startedRoom();
    leaveRoom(room, leo);
    assert.equal(room.status, "finished");
    assert.equal(room.players.length, 1);
    const lobby = createRoom("D4E5F6");
    const kim = joinRoom(lobby, { name: "Kim", token: tokenA }).player;
    disconnectPlayer(lobby, kim);
    assert.equal(lobby.players.length, 0);
});
