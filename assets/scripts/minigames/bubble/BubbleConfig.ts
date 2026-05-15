import { Color, view } from 'cc';

// 泡泡龙游戏全局参数
// 注意：BUBBLE_RADIUS 不是 const，会在 BubbleGame.onLoad 里根据屏幕和 PREFERRED_COLS 重算
export const BubbleConfig = {
    // 偏好列数：游戏始终保持这么多列，泡泡半径根据屏幕宽度反推
    // 11 是平衡点：iPhone 14 上还看得清，iPad 上不至于太空
    PREFERRED_COLS: 11,

    // 泡泡几何（design 像素，运行时重算）
    BUBBLE_RADIUS: 36,
    INITIAL_ROWS: 5,

    // 颜色调色板（与 BubbleColor 枚举一一对应）
    COLOR_PALETTE: [
        new Color(231, 76, 60),         // 红
        new Color(52, 152, 219),        // 蓝
        new Color(46, 204, 113),        // 绿
        new Color(241, 196, 15),        // 黄
        new Color(155, 89, 182),        // 紫
    ],

    // 发射器
    SHOOTER_BOTTOM_MARGIN: 100,         // 距底部多少像素
    SHOOT_SPEED: 1200,                  // design 像素/秒，运行时根据屏幕重算
    AIM_MAX_REFLECTIONS: 4,             // 瞄准线最多反弹次数
    AIM_DASH_LEN: 14,                   // 虚线段长
    AIM_GAP_LEN: 8,                     // 虚线间隔

    // 调试
    DEBUG_DRAW_GRID: false,
};

// 行高 = 半径 × √3（六边形几何）
export function rowHeight(): number {
    return BubbleConfig.BUBBLE_RADIUS * Math.sqrt(3);
}

// 根据屏幕宽度和偏好列数反推 design 半径
// 这样不管什么屏幕都是 PREFERRED_COLS 列，泡泡刚好填满宽度
export function computeBubbleRadius(): number {
    const visible = view.getVisibleSize();
    return visible.width / (2 * BubbleConfig.PREFERRED_COLS);
}

// 目标飞行速度：实际屏幕像素/秒（保证各设备感受一致）
// 1500 表示 ~0.3 秒飞过 iPhone 屏宽，比较爽快
const TARGET_ACTUAL_SHOOT_SPEED = 1500;

// 反推 design 速度
export function computeShootSpeed(): number {
    const visible = view.getVisibleSize();
    const frame = view.getFrameSize();
    if (frame.width === 0) return TARGET_ACTUAL_SHOOT_SPEED;
    return TARGET_ACTUAL_SHOOT_SPEED * (visible.width / frame.width);
}

// 列数：直接返回偏好值（保持各设备一致的游戏感受）
export function computeGridCols(_visibleWidth: number): number {
    return BubbleConfig.PREFERRED_COLS;
}
