import { _decorator, Component } from 'cc';
import { MiniGameResult } from '../data/SaveData';
import { SaveManager } from './SaveManager';
import { GameManager } from './GameManager';
import { EventBus, Events } from './EventBus';

const { ccclass } = _decorator;

// 所有小游戏的统一基类。继承时实现 gameId / startGame，结束时调 endGame
@ccclass('MiniGameBase')
export abstract class MiniGameBase extends Component {
    // 入场参数（来自 GameManager.setMiniGameContext）
    protected gameContext: {
        difficulty?: number;
        bonuses?: Record<string, number>;
        [k: string]: any;
    } = {};

    abstract get gameId(): string;
    abstract startGame(): void;

    onLoad() {
        this.gameContext = GameManager.consumeMiniGameContext();
    }

    protected endGame(result: MiniGameResult) {
        SaveManager.recordGameResult(this.gameId, result);
        GameManager.handleReward(this.gameId, result);
        EventBus.emit(Events.MINIGAME_ENDED, { gameId: this.gameId, result });
    }
}
