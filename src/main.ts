import Phaser from 'phaser';
import './ui/hud.css';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HUD } from './ui/HUD';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#101210',
  banner: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  scene: [BootScene, GameScene],
});

new HUD(game);

(window as unknown as { __phaser: Phaser.Game }).__phaser = game;
