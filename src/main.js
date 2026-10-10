/** Initializes the PixiJS card canvas inside the HTML battle layout. */
import {Application,} from 'pixi.js';
import './style.css';
import {gameState} from './gameState.js';
import {
  BattleScene,
} from './scenes/BattleScene.js';
import { MenuScreen } from './scenes/MenuScreen.js';


/**
 * Starts the card canvas and connects it to the HTML battle interface.
 *
 * @returns {Promise<void>} Resolves when the scene is ready.
 */
async function main() {
  const app = new Application();
  /**
   * Includes the background and view options supplied by PixiJS renderer systems.
   * @type {Partial<import('pixi.js').ApplicationOptions> & Partial<import('pixi.js').BackgroundSystemOptions> & Partial<import('pixi.js').ViewSystemOptions>}
   */
  const options = {
    width: 580,
    height: 172,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  };
  await app.init(options);

  document.getElementById('hand').appendChild(app.canvas);
  const battle = new BattleScene(app, gameState);
  new MenuScreen(battle).show();
}

const SPLASH_MIN_MS = 600;

function hideSplash() {
  const remaining = SPLASH_MIN_MS - performance.now();
  if (remaining > 0) {
    setTimeout(hideSplash, remaining);
    return;
  }
  document.body.classList.add('ready');
  const splash = document.getElementById('splash');
  splash?.addEventListener('transitionend', () => splash.remove(), { once: true });
}


main().then(hideSplash).catch((error) => {
  console.error('Failed to initialize the battle scene:', error);
  hideSplash();
});
