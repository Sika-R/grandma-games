// 全局常量配置
export const Config = {
    SAVE_KEY: 'mygrandmagames.save.v1',
    SAVE_VERSION: 1,
    DEBUG: true,
} as const;

// 小游戏 ID 枚举（字符串字面量，避免循环依赖）
export type GameId = 'bubble';

// 启动场景名（如果切换主场景在这里改）
// 注意：场景名必须跟 Cocos 编辑器里 .scene 文件名完全一致（大小写敏感）
export const SceneName = {
    MAIN: 'MainScene',
    BUBBLE: 'BubbleDuragon',
} as const;
