import { _decorator, Component, Node, Vec3, UITransform, Layers, Color, view, director, Graphics, Camera, Canvas } from 'cc';
import { MiniGameBase } from '../../core/MiniGameBase';
import { BubbleConfig, computeGridCols, computeBubbleRadius } from './BubbleConfig';
import { Grid } from './Grid';
import { Shooter } from './Shooter';
import { SceneName } from '../../data/Config';
import { ensureCanvas, ensureUITransform, createButton, createLabelNode } from '../../ui/MainMenu';

const { ccclass } = _decorator;

// 泡泡龙主控
// 在 Cocos 编辑器里：BubbleShooter 场景根节点挂一个空节点 "Bootstrap"，挂上本组件
@ccclass('BubbleGame')
export class BubbleGame extends MiniGameBase {
    get gameId() { return 'bubble'; }

    startGame() {
        // Day 6 起会有更多初始化（重置网格、计分归零等）。当前 onLoad 已搭建场景，此处暂留空。
    }

    onLoad() {
        super.onLoad();

        const visible = view.getVisibleSize();
        ensureUITransform(this.node).setContentSize(visible);

        // ⚠️ 关键：先按屏幕实际像素重算泡泡半径，让泡泡在不同分辨率屏幕上保持物理大小恒定
        //    （老人看得清；不至于在窄屏幕上变得很小）
        //    必须在创建任何泡泡/网格之前完成
        BubbleConfig.BUBBLE_RADIUS = computeBubbleRadius();

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
        const frame = view.getFrameSize();
        console.log(`[BubbleGame] visible=${visible.width}x${visible.height}, frame=${frame.width}x${frame.height}, radius=${BubbleConfig.BUBBLE_RADIUS.toFixed(1)} (target 36 actual px), cols=${cols}, gridChildren=${gridNode.children.length}`);

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
        });

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
}
