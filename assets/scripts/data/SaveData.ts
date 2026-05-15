import { Config } from './Config';

// 单局结果（小游戏上报用）
export interface MiniGameResult {
    success: boolean;
    score: number;
    duration: number;
    extra?: Record<string, any>;
}

// 单个小游戏的存档数据
export interface MiniGameSave {
    highScore: number;
    unlockedLevels: number;
    playCount: number;
    lastPlayedAt: number;
}

// 全局存档结构 —— 一开始就预留所有养成字段，未来加养成不改结构
export interface SaveData {
    version: number;

    player: {
        nickname: string;
        openId?: string;
        createdAt: number;
    };

    currency: {
        coins: number;
        gems: number;
    };

    minigames: {
        [gameId: string]: MiniGameSave;
    };

    // ===== 养成系统预留（当前为空）=====
    pet: { [key: string]: any };
    inventory: { items: { [itemId: string]: number } };
    achievements: string[];
    // ==================================

    settings: {
        bgmVolume: number;
        sfxVolume: number;
    };

    sync: {
        lastSyncAt: number;
        dirty: boolean;
    };
}

export function createDefaultSave(): SaveData {
    const now = Date.now();
    return {
        version: Config.SAVE_VERSION,
        player: {
            nickname: '玩家',
            createdAt: now,
        },
        currency: {
            coins: 0,
            gems: 0,
        },
        minigames: {},
        pet: {},
        inventory: { items: {} },
        achievements: [],
        settings: {
            bgmVolume: 0.6,
            sfxVolume: 0.8,
        },
        sync: {
            lastSyncAt: 0,
            dirty: false,
        },
    };
}

export function ensureMiniGameSave(save: SaveData, gameId: string): MiniGameSave {
    if (!save.minigames[gameId]) {
        save.minigames[gameId] = {
            highScore: 0,
            unlockedLevels: 1,
            playCount: 0,
            lastPlayedAt: 0,
        };
    }
    return save.minigames[gameId];
}
