/** Initializes PixiJS and keeps the battle layout aligned with renderer size. */
import {Application,} from 'pixi.js';
import './style.css';
import {gameState} from './gameState.js';
import {
  BattleScene,
} from './scenes/BattleScene.js';


/**
 * Starts the local battle scene and listens for completed canvas resizing.
 *
 * @returns {Promise<void>} Resolves when the scene and resize listener are ready.
 */
async function main() {
  const app = new Application();
  /**
   * Includes the background and view options supplied by PixiJS renderer systems.
   * @type {Partial<import('pixi.js').ApplicationOptions> & Partial<import('pixi.js').BackgroundSystemOptions> & Partial<import('pixi.js').ViewSystemOptions>}
   */
  const options = {
    resizeTo: window,
    background: '#15181E',
    antialias: true,
  };
  await app.init(options);

  const gameContainer = document.getElementById('game-container');
  gameContainer.appendChild(app.canvas);
  const battleScene = new BattleScene(app, gameState);
  battleScene.resize();
  app.renderer.on('resize', () => {
        battleScene.resize();
      }
  );
}


main().catch((error) => {
  console.error('Failed to initialize the battle scene:', error);
});
