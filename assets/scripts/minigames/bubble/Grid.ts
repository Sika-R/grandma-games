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

    // ============ Day 6 新增：碰撞、吸附、消除、掉落 ============

    // 世界坐标 → 网格本地坐标（grid 节点局部空间）
    worldToLocal(worldPos: Vec3): Vec3 {
        const gw = this.node.getWorldPosition();
        return new Vec3(worldPos.x - gw.x, worldPos.y - gw.y, 0);
    }

    // 平铺所有泡泡（碰撞检测/广播用）
    getAllBubbles(): Bubble[] {
        const out: Bubble[] = [];
        for (const row of this.cells) {
            for (const b of row) {
                if (b) out.push(b);
            }
        }
        return out;
    }

    // 顶部 Y（世界坐标）—— 飞行泡泡 y 超过这个就该贴到 row 0
    getTopWorldY(): number {
        return this.node.getWorldPosition().y;
    }

    private cellEmpty(row: number, col: number): boolean {
        if (row < 0) return false;
        if (col < 0 || col >= this.colCount(row)) return false;
        if (row >= this.cells.length) return true;       // 不存在的行视作空（允许扩展）
        return this.cells[row][col] === null;
    }

    // 找到一个空格放置飞行泡泡：从计算出来的最近网格开始，向外环形搜索
    findNearestEmptyCell(worldPos: Vec3): { row: number; col: number } | null {
        const local = this.worldToLocal(worldPos);
        const target = this.localToGrid(local);
        // 计算位置可能在第 0 行之上，钳到 row >= 0
        const startRow = Math.max(0, target.row);
        const startCol = Math.max(0, Math.min(this.colCount(startRow) - 1, target.col));

        if (this.cellEmpty(startRow, startCol)) return { row: startRow, col: startCol };

        // 环形扩散搜最近空格
        const maxRing = 4;
        let best: { row: number; col: number; dist: number } | null = null;
        for (let ring = 1; ring <= maxRing; ring++) {
            for (let dr = -ring; dr <= ring; dr++) {
                for (let dc = -ring; dc <= ring; dc++) {
                    if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                    const r = startRow + dr;
                    const c = startCol + dc;
                    if (!this.cellEmpty(r, c)) continue;
                    // 距离用网格坐标的 local 位置
                    const cellLocal = this.gridToLocal(r, c);
                    const d = (cellLocal.x - local.x) ** 2 + (cellLocal.y - local.y) ** 2;
                    if (!best || d < best.dist) best = { row: r, col: c, dist: d };
                }
            }
            if (best) return { row: best.row, col: best.col };
        }
        return null;
    }

    // 把一颗已经存在的泡泡放到网格里（自动扩展行）
    addBubble(b: Bubble, row: number, col: number) {
        while (this.cells.length <= row) {
            const newRow: (Bubble | null)[] = new Array(this.colCount(this.cells.length)).fill(null);
            this.cells.push(newRow);
        }
        if (col < 0 || col >= this.colCount(row)) return;
        this.cells[row][col] = b;
        b.row = row;
        b.col = col;
        b.velocity = null;
        // 重新挂到 grid 下，并对齐到网格坐标
        b.node.removeFromParent();
        this.node.addChild(b.node);
        b.node.setPosition(this.gridToLocal(row, col));
        // 落位的小弹跳，爽感
        b.landSquash();
    }

    // 移除（销毁）一颗泡泡。animated=true 时播放弹出动画再销毁
    // 注意：cells 数据立刻清空，所以飞行碰撞检测不会再撞到正在动画的泡泡
    removeBubble(row: number, col: number, animated: boolean = false) {
        const b = this.getCell(row, col);
        if (!b) return;
        this.cells[row][col] = null;
        if (animated) {
            b.popOut().then(() => b.node.destroy());
        } else {
            b.node.destroy();
        }
    }

    // 悬空泡泡：重力掉落动画，然后销毁
    dropBubble(row: number, col: number) {
        const b = this.getCell(row, col);
        if (!b) return;
        this.cells[row][col] = null;
        b.dropOut().then(() => b.node.destroy());
    }

    // BFS 找出与 (row,col) 同色相连的所有泡泡（含自己）
    findColorCluster(row: number, col: number): { row: number; col: number }[] {
        const start = this.getCell(row, col);
        if (!start) return [];
        const color = start.color;
        const visited = new Set<string>();
        const queue: { row: number; col: number }[] = [{ row, col }];
        const result: { row: number; col: number }[] = [];

        while (queue.length > 0) {
            const cur = queue.shift()!;
            const key = `${cur.row},${cur.col}`;
            if (visited.has(key)) continue;
            visited.add(key);
            const b = this.getCell(cur.row, cur.col);
            if (!b || b.color !== color) continue;
            result.push(cur);
            for (const n of this.getNeighbors(cur.row, cur.col)) queue.push(n);
        }
        return result;
    }

    // 找出"悬空"的泡泡：从 row 0 向下 BFS，没被访问到的就是悬空的
    findFloatingBubbles(): { row: number; col: number }[] {
        const visited = new Set<string>();
        const queue: { row: number; col: number }[] = [];

        if (this.cells.length > 0) {
            for (let col = 0; col < this.colCount(0); col++) {
                if (this.cells[0][col]) queue.push({ row: 0, col });
            }
        }

        while (queue.length > 0) {
            const cur = queue.shift()!;
            const key = `${cur.row},${cur.col}`;
            if (visited.has(key)) continue;
            if (!this.getCell(cur.row, cur.col)) continue;
            visited.add(key);
            for (const n of this.getNeighbors(cur.row, cur.col)) queue.push(n);
        }

        const floating: { row: number; col: number }[] = [];
        for (let row = 0; row < this.cells.length; row++) {
            for (let col = 0; col < this.colCount(row); col++) {
                if (this.cells[row][col] && !visited.has(`${row},${col}`)) {
                    floating.push({ row, col });
                }
            }
        }
        return floating;
    }
}
