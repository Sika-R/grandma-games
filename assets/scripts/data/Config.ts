// 全局常量配置
export const Config = {
    SAVE_KEY: 'mygrandmagames.save.v1',
    SAVE_VERSION: 1,
    DEBUG: true,
} as const;

// 小游戏 ID 枚举（字符串字面量，避免循环依赖）
export type GameId = 'bubble';

// 启动场景名（如果切换主场景在这里改）
export const SceneName = {
    MAIN: 'MainScene',
    BUBBLE: 'BubbleShooter',
} as const;
