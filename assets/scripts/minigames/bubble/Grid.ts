import { _decorator, Component, Node, Vec3, UITransform, Layers, Graphics, Color } from 'cc';
import { BubbleConfig, rowHeight } from './BubbleConfig';
import { Bubble } from './Bubble';
import { BubbleColor, randomBubbleColor } from './BubbleType';

const { ccclass } = _decorator;

// 六边形网格管理。挂在 GridContainer 节点上，子节点是所有 Bubble。
// 坐标系：本地原点为网格逻辑左上角（第 0 行第 0 列泡泡的中心）
@ccclass('Grid')
export class Grid extends Component {
    // 二维存储：cells[row][col]，可能为 null
    private cells: (Bubble | null)[][] = [];

    // 当前网格列数（动态，运行时根据屏幕宽度算出）
    private cols: number = 0;

    // 网格逻辑宽（最右泡泡中心 x）
    get widthPx(): number {
        const r = BubbleConfig.BUBBLE_RADIUS;
        return (this.cols - 1) * 2 * r + r; // 奇数行多偏移 r
    }

    onLoad() {
        // 父节点会决定本节点位置；这里不做额外定位
    }

    // 用初始行数填充随机泡泡
    fillInitial(rows: number, cols: number) {
        this.cols = cols;
        this.cells = [];
        for (let row = 0; row < rows; row++) {
            this.cells.push(this.makeRow(row, true));
        }
    }

    private makeRow(row: number, fillRandom: boolean): (Bubble | null)[] {
        const cols = this.colCount(row);
        const arr: (Bubble | null)[] = new Array(cols).fill(null);
        if (!fillRandom) return arr;
        for (let col = 0; col < cols; col++) {
            const pos = this.gridToLocal(row, col);
            const b = Bubble.create(this.node, randomBubbleColor(), pos);
            b.row = row;
            b.col = col;
            arr[col] = b;
        }
        return arr;
    }

    // 偶数行 cols 个，奇数行 cols - 1 个（保持视觉宽度对齐）
    colCount(row: number): number {
        return row % 2 === 0 ? this.cols : this.cols - 1;
    }

    // 网格坐标 → 本节点局部坐标（Y 向下递增，所以返回的 y 是负值）
    gridToLocal(row: number, col: number): Vec3 {
        const r = BubbleConfig.BUBBLE_RADIUS;
        const xOffset = row % 2 === 0 ? 0 : r;
        const x = col * 2 * r + xOffset;
        const y = -row * rowHeight();
        return new Vec3(x, y, 0);
    }

    // 本节点局部坐标 → 最近的网格行列（用于 Day 6 吸附）
    localToGrid(localPos: Vec3): { row: number; col: number } {
        const r = BubbleConfig.BUBBLE_RADIUS;
        const row = Math.round(-localPos.y / rowHeight());
        const xOffset = row % 2 === 0 ? 0 : r;
        const col = Math.round((localPos.x - xOffset) / (2 * r));
        return { row, col };
    }

    // 邻居（六边形 6 方向）—— 留给 Day 6 同色 BFS 用
    getNeighbors(row: number, col: number): { row: number; col: number }[] {
        const offsetEven = [
            [-1, -1], [-1, 0],
            [0, -1],  [0, 1],
            [1, -1],  [1, 0],
        ];
        const offsetOdd = [
            [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, 0],  [1, 1],
        ];
        const offsets = row % 2 === 0 ? offsetEven : offsetOdd;
        const out: { row: number; col: number }[] = [];
        for (const [dr, dc] of offsets) {
            const r = row + dr;
            const c = col + dc;
            if (r < 0 || r >= this.cells.length) continue;
            if (c < 0 || c >= this.colCount(r)) continue;
            out.push({ row: r, col: c });
        }
        return out;
    }

    getCell(row: number, col: number): Bubble | null {
        if (row < 0 || row >= this.cells.length) return null;
        if (col < 0 || col >= this.colCount(row)) return null;
        return this.cells[row][col];
    }

    rowCount(): number {
        return this.cells.length;
    }
}
