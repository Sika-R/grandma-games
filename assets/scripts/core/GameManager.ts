import { Config } from '../data/Config';
import { MiniGameResult } from '../data/SaveData';
import { SaveManager } from './SaveManager';

// 全局运行时管理器 —— 静态单例
// 未来要"宠物在角落出现"等跨场景常驻 UI，再升级为常驻 Component
class GameManagerImpl {
    // 入场参数缓存（主菜单 → 小游戏传难度/养成加成等）
    private pendingContext: Record<string, any> = {};

    setMiniGameContext(ctx: Record<string, any>) {
        this.pendingContext = ctx;
    }

    consumeMiniGameContext(): Record<string, any> {
        const ctx = this.pendingContext;
        this.pendingContext = {};
        return ctx;
    }

    // ⭐ 所有小游戏奖励发放的唯一入口
    // 未来塞养成加成（宠物加成、双倍金币道具等）只改这里
    handleReward(gameId: string, result: MiniGameResult) {
        if (!result.success && result.score === 0) return;

        // 基础规则：score 直接当金币（先简单做，后续 Day 7 再调）
        const baseCoins = Math.floor(result.score);

        // 养成加成占位：未来从 SaveManager.get().pet/inventory 读
        const bonusMultiplier = 1.0;

        const totalCoins = Math.floor(baseCoins * bonusMultiplier);
        if (totalCoins > 0) {
            SaveManager.addCoins(totalCoins);
        }

        if (Config.DEBUG) {
            console.log(`[GameManager] reward for ${gameId}:`, { baseCoins, totalCoins, result });
        }
    }
}

export const GameManager = new GameManagerImpl();
