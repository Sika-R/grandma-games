import { BubbleConfig } from './BubbleConfig';

export enum BubbleColor {
    Red = 0,
    Blue = 1,
    Green = 2,
    Yellow = 3,
    Purple = 4,
}

export const ALL_BUBBLE_COLORS: BubbleColor[] = [
    BubbleColor.Red,
    BubbleColor.Blue,
    BubbleColor.Green,
    BubbleColor.Yellow,
    BubbleColor.Purple,
];

export function randomBubbleColor(): BubbleColor {
    const palette = BubbleConfig.COLOR_PALETTE;
    return Math.floor(Math.random() * palette.length) as BubbleColor;
}
