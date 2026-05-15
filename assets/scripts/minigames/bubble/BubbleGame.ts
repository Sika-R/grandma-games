import { _decorator, Component, Node, Vec3, UITransform, Layers, Color, view, director, Graphics, Camera, Canvas } from 'cc';
import { MiniGameBase } from '../../core/MiniGameBase';
import { BubbleConfig, computeGridCols, computeBubbleRadius, computeShootSpeed } from './BubbleConfig';
import { Grid } from './Grid';
import { Shooter } from './Shooter';
import { Bubble } from './Bubble';
import { BubbleFX } from './BubbleFX';
import { SceneName } from '../../data/Config';
import { EventBus } from '../../core/EventBus';
import { AudioManager } from '../../core/AudioManager';
import { ensureCanvas, ensureUITransform, createButton, createLabelNode } from '../../ui/MainMenu';

const { ccclass } = _decorator;

// 泡泡龙主控
// 在 Cocos 编辑器里：BubbleShooter 场景根节点挂一个空节点 "Bootstrap"，挂上本组件
@ccclass('BubbleGame')
export class BubbleGame extends MiniGameBase {
    get gameId() { return 'bubble'; }

    private grid: Grid | null = null;
    private fx: BubbleFX | null = null;
    private worldNode: Node | null = null;

    startGame() {
        // Day 6 起会有更多初始化（重置网格、计分归零等）。当前 onLoad 已搭建场景，此处暂留空。
    }

    onLoad() {
        super.onLoad();

        const visible = view.getVisibleSize();
        ensureUITransform(this.node).setContentSize(visible);

        // ⚠️ 关键：先按屏幕实际像素重算泡泡半径和飞行速度，让游戏在不同分辨率屏幕上感受一致
        //    （老人看得清；不至于在窄屏幕上变得很小或飞得很慢）
        //    必须在创建任何泡泡/网格之前完成
        BubbleConfig.BUBBLE_RADIUS = computeBubbleRadius();
        BubbleConfig.SHOOT_SPEED = computeShootSpeed();

        // === Camera + Canvas ===
        const canvasNode = ensureCanvas(this.node);

        // === 背景 ===
        const bg = new Node('BG');
        bg.layer = Layers.Enum.UI_2D;
        ensureUITransform(bg).setContentSize(visible);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = new Color(20, 25, 50);
        bgG.rect(-visible.width / 2, -visible.height / 2, visible.width, visible.height);
        bgG.fill();
        canvasNode.addChild(bg);

        // === 游戏世界容器（所有飞行/吸附泡泡都加到这里）===
        const world = new Node('World');
        world.layer = Layers.Enum.UI_2D;
        ensureUITransform(world).setContentSize(visible);
        canvasNode.addChild(world);
        this.worldNode = world;

        // === Grid ===
        const gridNode = new Node('Grid');
        gridNode.layer = Layers.Enum.UI_2D;
        ensureUITransform(gridNode);
        // 根据屏幕宽度动态算列数 → 让泡泡占满整屏宽度
        const r = BubbleConfig.BUBBLE_RADIUS;
        const cols = computeGridCols(visible.width);
        // 居中放置：偶数行的中心点对齐 x=0
        const gridOriginX = -(cols - 1) * r;
        const gridOriginY = visible.height / 2 - r * 2;
        gridNode.setPosition(gridOriginX, gridOriginY, 0);
        world.addChild(gridNode);
        const grid = gridNode.addComponent(Grid);
        grid.fillInitial(BubbleConfig.INITIAL_ROWS, cols);
        this.grid = grid;
        const frame = view.getFrameSize();
        console.log(`[BubbleGame] visible=${visible.width}x${visible.height}, frame=${frame.width}x${frame.height}, radius=${BubbleConfig.BUBBLE_RADIUS.toFixed(1)}, cols=${cols}, gridChildren=${gridNode.children.length}`);

        // === Shooter ===
        const shooterNode = new Node('Shooter');
        shooterNode.layer = Layers.Enum.UI_2D;
        ensureUITransform(shooterNode);
        const shooterY = -visible.height / 2 + BubbleConfig.SHOOTER_BOTTOM_MARGIN;
        shooterNode.setPosition(0, shooterY, 0);
        world.addChild(shooterNode);
        const shooter = shooterNode.addComponent(Shooter);
        shooter.init({
            worldRoot: world,
            bounds: {
                leftX: -visible.width / 2,
                rightX: visible.width / 2,
                topY: visible.height / 2,
            },
            grid: grid,
            onBubbleLand: (b, worldPos) => this.handleBubbleLand(b, worldPos),
        });

        // === FX Layer（颗粒、飘字、闪光等都加到这层；放在 world 内最上层，
        //     这样震屏时 FX 跟随 world 一起动，UI 按钮不动）===
        const fxNode = new Node('FX');
        fxNode.layer = Layers.Enum.UI_2D;
        ensureUITransform(fxNode);
        world.addChild(fxNode);
        this.fx = fxNode.addComponent(BubbleFX);

        // 把 fx 传给 shooter（飞行轨迹、枪口火）
        // 注意：shooter 已经创建过；这里不能修改 deps，所以我们调一个 setter
        shooter.attachFX(this.fx);

        // === 返回按钮（左上）===
        const back = createButton('返回', 140, 60, () => {
            director.loadScene(SceneName.MAIN);
        }, new Color(80, 80, 100));
        back.setPosition(-visible.width / 2 + 90, visible.height / 2 - 50, 0);
        canvasNode.addChild(back);

        // === 标题（顶中）===
        const title = createLabelNode('泡泡龙', 36, new Color(255, 255, 255));
        title.setPosition(0, visible.height / 2 - 50, 0);
        canvasNode.addChild(title);

        this.startGame();
    }

    // 飞行泡泡触发吸附 → 找空格落位 → 同色 BFS 消除 → 悬空掉落
    // 全部反馈通过 fx 模块和 EventBus 广播
    private handleBubbleLand(b: Bubble, worldPos: Vec3) {
        if (!this.grid || !this.fx) return;
        const cell = this.grid.findNearestEmptyCell(worldPos);
        if (!cell) {
            b.node.destroy();
            return;
        }

        // 落位（addBubble 内部会触发 landSquash 弹一下）
        this.grid.addBubble(b, cell.row, cell.col);
        EventBus.emit('bubble.landed', { row: cell.row, col: cell.col, color: b.color });
        AudioManager.playSfx('land');

        // 同色 3+ 消除
        const cluster = this.grid.findColorCluster(cell.row, cell.col);
        if (cluster.length < 3) return;

        // 关键：先在数据还在的时候采集每颗泡泡的世界位置 + 颜色，给 FX 用
        const eliminated: { pos: Vec3; color: Color }[] = [];
        for (const c of cluster) {
            const eb = this.grid.getCell(c.row, c.col);
            if (!eb) continue;
            eliminated.push({
                pos: eb.node.getWorldPosition().clone(),
                color: BubbleConfig.COLOR_PALETTE[eb.color],
            });
        }

        const centerPos = this.averagePos(eliminated.map(e => e.pos));
        const score = this.scoreFor(cluster.length);

        // ==== 反馈分三档：3-4 / 5-6 / 7+ ====
        // 基础（所有消除都有）
        for (const e of eliminated) {
            this.fx.burst(e.pos, e.color);
        }
        for (const c of cluster) {
            this.grid.removeBubble(c.row, c.col, true);
        }
        this.fx.flash(centerPos, BubbleConfig.BUBBLE_RADIUS * 1.6);
        this.fx.shockwave(centerPos, eliminated[0].color, BubbleConfig.BUBBLE_RADIUS * (3 + cluster.length * 0.4));

        // 中型（≥5）：顿帧 + 镜头冲击 + 段位飘字
        if (cluster.length >= 5) {
            this.fx.hitStop(70);
            if (this.worldNode) {
                this.fx.worldPunch(this.worldNode, 0.04, 280);
                this.fx.screenShake(this.worldNode, 14, 280);
            }
            this.fx.comboText(this.comboLabel(cluster.length), centerPos, this.comboColor(cluster.length));
        } else {
            // 普通飘字
            this.fx.scorePopup(`+${score}`, centerPos);
        }

        // 大型（≥7）：再加全屏一闪
        if (cluster.length >= 7) {
            this.fx.bgFlash(eliminated[0].color, 110, 280);
        }

        EventBus.emit('bubble.eliminated', { count: cluster.length, score });
        AudioManager.playSfx(cluster.length >= 5 ? 'big_pop' : 'pop');

        // 悬空掉落
        const floating = this.grid.findFloatingBubbles();
        for (const f of floating) {
            this.grid.dropBubble(f.row, f.col);
        }
        if (floating.length > 0) {
            EventBus.emit('bubble.dropped', { count: floating.length });
            AudioManager.playSfx('drop');
        }
    }

    private scoreFor(clusterSize: number): number {
        return 30 + Math.max(0, clusterSize - 3) * 15;
    }

    private comboLabel(clusterSize: number): string {
        if (clusterSize >= 9) return '天才!';
        if (clusterSize >= 7) return '厉害!';
        return '不错!';
    }

    private comboColor(clusterSize: number): Color {
        if (clusterSize >= 9) return new Color(255, 80, 80);     // 红
        if (clusterSize >= 7) return new Color(255, 160, 60);    // 橙
        return new Color(255, 220, 80);                          // 黄
    }

    private averagePos(positions: Vec3[]): Vec3 {
        if (positions.length === 0) return new Vec3(0, 0, 0);
        const sum = positions.reduce(
            (acc, p) => new Vec3(acc.x + p.x, acc.y + p.y, 0),
            new Vec3(0, 0, 0)
        );
        return new Vec3(sum.x / positions.length, sum.y / positions.length, 0);
    }
}
