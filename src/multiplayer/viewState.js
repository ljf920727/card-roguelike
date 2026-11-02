/** Derives cooperative control availability and player-facing status from server snapshots. */

/** Allows actions only after a fresh snapshot and while both players can participate. */
export function canAct(data, connected, pending = false) {
    const me = data?.players.find(player => player.isYou);
    return Boolean(connected && !pending && data?.status === "playing" && me?.hp > 0 &&
        data.players.length === 2 && data.players.every(player => player.connected) &&
        data.players[data.activeIndex]?.isYou);
}

/** Explains the next available step, including disconnection, defeat and abandoned rooms. */
export function battleStatus(data, connected) {
    if (!connected) return "Connection lost. Reconnecting; battle controls are paused.";
    if (data.status === "finished") {
        if (data.result === "victory") return "Victory! You defeated the Ogre together.";
        if (data.result === "abandoned") return "Battle ended. Your teammate left the room.";
        return "Defeat. Ready up together to try again.";
    }
    if (data.players.some(player => !player.connected)) return "Battle paused. Waiting for your teammate to reconnect.";
    const me = data.players.find(player => player.isYou);
    if (me?.hp <= 0) return "You are defeated. Your teammate can still win for both of you.";
    return data.players[data.activeIndex]?.isYou
        ? `Turn ${data.turn} — Your turn`
        : `Turn ${data.turn} — Waiting for ${data.currentPlayer}`;
}
