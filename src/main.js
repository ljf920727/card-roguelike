import{Application,} from "pixi.js";
import "./style.css";
import{gameState} from "./gameState.js";
import {
    BattleScene,
} from "./scenes/BattleScene.js";


async function main() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: "#15181e",
    antialias: true,
  });

  const gameContainer =document.getElementById("game-container");
  gameContainer.appendChild(app.canvas);
  const battleScene = new BattleScene(app, gameState);
  battleScene.resize();
  window.addEventListener("resize", () => {
    battleScene.resize();
  }
);
}


main();