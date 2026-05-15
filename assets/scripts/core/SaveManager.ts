import { sys } from 'cc';
import { Config } from '../data/Config';
import { SaveData, MiniGameResult, createDefaultSave, ensureMiniGameSave } from '../data/SaveData';
import { EventBus, Events } from './EventBus';

class SaveManagerImpl {
    private cache: SaveData | null = null;

    load(): SaveData {
        if (this.cache) return this.cache;

        const raw = sys.localStorage.getItem(Config.SAVE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as SaveData;
                // 简单版本校验，未来可以做迁移
                if (parsed.version === Config.SAVE_VERSION) {
                    this.cache = parsed;
                    if (Config.DEBUG) console.log('[SaveManager] loaded existing save', parsed);
                    EventBus.emit(Events.SAVE_LOADED, parsed);
                    return parsed;
                }
                console.warn('[SaveManager] save version mismatch, resetting');
            } catch (e) {
                console.error('[SaveManager] failed to parse save, resetting', e);
            }
        }

        this.cache = createDefaultSave();
        this.flush();
        if (Config.DEBUG) console.log('[SaveManager] created default save', this.cache);
        EventBus.emit(Events.SAVE_LOADED, this.cache);
        return this.cache;
    }

    get(): SaveData {
        return this.cache ?? this.load();
    }

    flush() {
        if (!this.cache) return;
        this.cache.sync.dirty = true;
        sys.localStorage.setItem(Config.SAVE_KEY, JSON.stringify(this.cache));
        // TODO(cloud): 触发云同步
    }

    addCoins(delta: number) {
        const save = this.get();
        save.currency.coins = Math.max(0, save.currency.coins + delta);
        this.flush();
        EventBus.emit(Events.COINS_CHANGED, save.currency.coins);
    }

    recordGameResult(gameId: string, result: MiniGameResult) {
        const save = this.get();
        const mg = ensureMiniGameSave(save, gameId);
        mg.playCount += 1;
        mg.lastPlayedAt = Date.now();
        if (result.score > mg.highScore) mg.highScore = result.score;
        this.flush();
    }

    // 调试用：清空存档
    reset() {
        sys.localStorage.removeItem(Config.SAVE_KEY);
        this.cache = null;
    }
}

export const SaveManager = new SaveManagerImpl();
