import { _decorator, Component, Node, Vec3, UITransform, Layers, Color, view, director, Graphics, Camera, Canvas, Label, UIOpacity, tween } from 'cc';
import { MiniGameBase } from '../../core/MiniGameBase';
import { BubbleConfig, computeGridCols, computeBubbleRadius, computeShootSpeed, rowHeight } from './BubbleConfig';
import { Grid } from './Grid';
import { Shooter } from './Shooter';
import { Bubble } from './Bubble';
import { BubbleFX } from './BubbleFX';
import { SceneName } from '../../data/Config';
import { EventBus } from '../../core/EventBus';
import { AudioManager } from '../../core/AudioManager';
import { ensureCanvas, ensureUITransform, createButton, createLabelNode } from '../../ui/MainMenu';

const { ccclass } = _decorator;

// 每隔多少次发射，顶部下推一行（无尽模式压力）
const FIRES_PER_PUSHDOWN = 6;

// 顶部 HUD 占用的高度（design 像素）—— 网格从这下面开始放，避免与 HUD 重叠
const HUD_HEIGHT = 220;

// 泡泡龙主控
@ccclass('BubbleGame')
export class BubbleGame extends MiniGameBase {
    get gameId() { return 'bubble'; }

    private grid: Grid | null = null;
    private fx: BubbleFX | null = null;
    private worldNode: Node | null = null;
    private canvasNode: Node | null = null;
    private shooter: Shooter | null = null;

    // HUD
    private scoreLabel: Label | null = null;
    private pushdownLabel: Label | null = null;

    // 游戏状态
    private score: number = 0;
    private firesUntilPushdown: number = FIRES_PER_PUSHDOWN;
    private gameOver: boolean = false;
    private startedAt: number = 0;

    // 触底失败的世界 Y 阈值；任何泡泡 worldY < 这个就 GG
    private dangerLineY: number = 0;

    // 初始网格 cols（重开用）
    private initialCols: number = 11;

    startGame() {
        if (!this.grid || !this.shooter) return;
        this.grid.clearAll();
        this.grid.fillInitial(BubbleConfig.INITIAL_ROWS, this.initialCols);
        this.score = 0;
        this.firesUntilPushdown = FIRES_PER_PUSHDOWN;
        this.gameOver = false;
        this.startedAt = Date.now();
        this.refreshScoreLabel();
        this.refreshPushdownLabel();
        this.shooter.setLocked(false);
    }

    onLoad() {
        super.onLoad();

        const visible = view.getVisibleSize();
        ensureUITransform(this.node).setContentSize(visible);

        // ⚠️ 关键：先按屏幕实际像素重算泡泡半径和飞行速度，让游戏在不同分辨率屏幕上感受一致
        BubbleConfig.BUBBLE_RADIUS = computeBubbleRadius();
        BubbleConfig.SHOOT_SPEED = computeShootSpeed();

        // === Camera + Canvas ===
        const canvasNode = ensureCanvas(this.node);
        this.canvasNode = canvasNode;

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
        const r = BubbleConfig.BUBBLE_RADIUS;
        const cols = computeGridCols(visible.width);
        this.initialCols = cols;
        const gridOriginX = -(cols - 1) * r;
        // 网格起点 Y：从 HUD 区域下方 r 开始（让 row 0 顶边刚好贴在 HUD 区域底）
        const gridOriginY = visible.height / 2 - HUD_HEIGHT - r;
        gridNode.setPosition(gridOriginX, gridOriginY, 0);
        world.addChild(gridNode);
        const grid = gridNode.addComponent(Grid);
        grid.fillInitial(BubbleConfig.INITIAL_ROWS, cols);
        this.grid = grid;

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
        this.shooter = shooter;

        // === 危险线（在 shooter 上方 r*3）：泡泡碰到这条线就 GG ===
        this.dangerLineY = shooterY + r * 3;
        this.drawDangerLine(world, this.dangerLineY, visible.width);

        // === FX Layer（颗粒、飘字、闪光等）===
        const fxNode = new Node('FX');
        fxNode.layer = Layers.Enum.UI_2D;
        ensureUITransform(fxNode);
        world.addChild(fxNode);
        this.fx = fxNode.addComponent(BubbleFX);
        shooter.attachFX(this.fx);

        // === 顶部 HUD：分数 + 下推倒计时 ===
        this.buildHUD(canvasNode, visible);

        // === 返回按钮（左上）===
        // 游戏中点 → 弹暂停面板（继续 / 结束）
        // 游戏已结束 → 直接回主菜单
        const back = createButton('返回', 140, 60, () => {
            if (this.gameOver) {
                director.loadScene(SceneName.MAIN);
            } else {
                this.showPausePanel();
            }
        }, new Color(80, 80, 100));
        back.setPosition(-visible.width / 2 + 90, visible.height / 2 - 60, 0);
        canvasNode.addChild(back);

        const frame = view.getFrameSize();
        console.log(`[BubbleGame] visible=${visible.width}x${visible.height}, frame=${frame.width}x${frame.height}, radius=${BubbleConfig.BUBBLE_RADIUS.toFixed(1)}, cols=${cols}`);

        this.startGame();
    }

    private buildHUD(parent: Node, visible: { width: number; height: number }) {
        // HUD 区域占顶部 HUD_HEIGHT 高度。中心 Y = top - HUD_HEIGHT/2
        const top = visible.height / 2;

        // 分数（顶中，大字）
        const scoreNode = createLabelNode('0', 64, new Color(255, 230, 100));
        scoreNode.setPosition(0, top - 100, 0);
        parent.addChild(scoreNode);
        this.scoreLabel = scoreNode.getComponent(Label);

        // 下推倒计时（分数下方小字）
        const pdNode = createLabelNode('', 28, new Color(180, 180, 200));
        pdNode.setPosition(0, top - 170, 0);
        parent.addChild(pdNode);
        this.pushdownLabel = pdNode.getComponent(Label);
    }

    private drawDangerLine(parent: Node, y: number, width: number) {
        const n = new Node('DangerLine');
        n.layer = Layers.Enum.UI_2D;
        ensureUITransform(n);
        const g = n.addComponent(Graphics);
        g.lineWidth = 3;
        g.strokeColor = new Color(220, 80, 80, 200);
        // 虚线
        const dash = 24;
        const gap = 16;
        let x = -width / 2;
        while (x < width / 2) {
            g.moveTo(x, y);
            g.lineTo(Math.min(x + dash, width / 2), y);
            x += dash + gap;
        }
        g.stroke();
        parent.addChild(n);
    }

    private refreshScoreLabel() {
        if (this.scoreLabel) this.scoreLabel.string = String(this.score);
    }

    private refreshPushdownLabel() {
        if (this.pushdownLabel) {
            this.pushdownLabel.string = `${this.firesUntilPushdown} 发后下压`;
        }
    }

    // 计分滚动动画：从 from 滚到 to
    private animateScoreTo(from: number, to: number, durationMs: number = 350) {
        if (!this.scoreLabel) {
            this.score = to;
            this.refreshScoreLabel();
            return;
        }
        const lbl = this.scoreLabel;
        const start = Date.now();
        const tick = () => {
            const elapsed = Date.now() - start;
            const t = Math.min(1, elapsed / durationMs);
            const v = Math.floor(from + (to - from) * t);
            lbl.string = String(v);
            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                lbl.string = String(to);
            }
        };
        requestAnimationFrame(tick);
    }

    // 飞行泡泡触发吸附 → 找空格落位 → 同色 BFS 消除 → 悬空掉落
    private handleBubbleLand(b: Bubble, worldPos: Vec3) {
        if (!this.grid || !this.fx) return;
        if (this.gameOver) {
            b.node.destroy();
            return;
        }
        const cell = this.grid.findNearestEmptyCell(worldPos);
        if (!cell) {
            b.node.destroy();
            return;
        }

        // 落位
        this.grid.addBubble(b, cell.row, cell.col);
        EventBus.emit('bubble.landed', { row: cell.row, col: cell.col, color: b.color });
        AudioManager.playSfx('land');

        // 同色 3+ 消除
        const cluster = this.grid.findColorCluster(cell.row, cell.col);
        let droppedCount = 0;
        if (cluster.length >= 3) {
            // 采集位置 + 颜色 给 FX
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
            const eliminationScore = this.scoreFor(cluster.length);

            // 反馈分档
            for (const e of eliminated) this.fx.burst(e.pos, e.color);
            for (const c of cluster) this.grid.removeBubble(c.row, c.col, true);
            this.fx.flash(centerPos, BubbleConfig.BUBBLE_RADIUS * 1.6);
            this.fx.shockwave(centerPos, eliminated[0].color, BubbleConfig.BUBBLE_RADIUS * (3 + cluster.length * 0.4));

            if (cluster.length >= 5) {
                this.fx.hitStop(70);
                if (this.worldNode) {
                    this.fx.worldPunch(this.worldNode, 0.04, 280);
                    this.fx.screenShake(this.worldNode, 14, 280);
                }
                this.fx.comboText(this.comboLabel(cluster.length), centerPos, this.comboColor(cluster.length));
            } else {
                this.fx.scorePopup(`+${eliminationScore}`, centerPos);
            }

            if (cluster.length >= 7) {
                this.fx.bgFlash(eliminated[0].color, 110, 280);
            }

            EventBus.emit('bubble.eliminated', { count: cluster.length, score: eliminationScore });
            AudioManager.playSfx(cluster.length >= 5 ? 'big_pop' : 'pop');

            // 悬空掉落（每颗也算分）
            const floating = this.grid.findFloatingBubbles();
            for (const f of floating) this.grid.dropBubble(f.row, f.col);
            droppedCount = floating.length;
            if (droppedCount > 0) {
                EventBus.emit('bubble.dropped', { count: droppedCount });
                AudioManager.playSfx('drop');
            }

            // 累计计分
            const totalGain = eliminationScore + droppedCount * 20;
            this.animateScoreTo(this.score, this.score + totalGain);
            this.score += totalGain;
        }

        // 每发都计入下推倒计时
        this.firesUntilPushdown -= 1;
        if (this.firesUntilPushdown <= 0) {
            this.firesUntilPushdown = FIRES_PER_PUSHDOWN;
            this.grid.pushDownOneRow();
            AudioManager.playSfx('pushdown');
        }
        this.refreshPushdownLabel();

        // 胜利 / 失败判定
        // 胜利：网格清空（grid.isEmpty 不算正在动画掉落的）
        if (this.grid.isEmpty()) {
            this.endGameWithResult(true);
            return;
        }
        // 失败：最低泡泡 worldY 已低于危险线
        // 注意：pushDownOneRow 是异步动画，但数据上 row 已经 +1，最低 Y 实际上还没动到位
        // 用"数据 row × rowHeight"算理论位置（更严格，提前判定）
        if (this.checkLoseTheoretical()) {
            this.endGameWithResult(false);
            return;
        }
    }

    private checkLoseTheoretical(): boolean {
        if (!this.grid) return false;
        // 找最大 row 索引（最下面那行有泡泡的）
        let maxRow = -1;
        for (let row = this.grid.rowCount() - 1; row >= 0; row--) {
            for (let col = 0; col < this.initialCols; col++) {
                if (this.grid.getCell(row, col)) {
                    maxRow = row;
                    break;
                }
            }
            if (maxRow >= 0) break;
        }
        if (maxRow < 0) return false;
        const gridWorldY = this.grid.node.getWorldPosition().y;
        const lowestY = gridWorldY - maxRow * rowHeight();
        return lowestY < this.dangerLineY;
    }

    private endGameWithResult(success: boolean, isQuit: boolean = false) {
        if (this.gameOver) return;
        this.gameOver = true;
        if (this.shooter) this.shooter.setLocked(true);

        // 上报结果给核心层（写存档 + 发奖励金币）
        const duration = Date.now() - this.startedAt;
        this.endGame({ success, score: this.score, duration });

        this.showEndPanel(success, isQuit);
    }

    // 暂停面板：冻结发射器 + 飞行，给玩家"继续 / 结束"两个选项
    // 不调用 endGame —— 暂停期间游戏状态完整保留，选"继续"可无缝恢复
    private showPausePanel() {
        if (!this.canvasNode || this.gameOver) return;
        if (this.shooter) this.shooter.setLocked(true);

        const visible = view.getVisibleSize();

        const overlay = new Node('PauseOverlay');
        overlay.layer = Layers.Enum.UI_2D;
        ensureUITransform(overlay).setContentSize(visible);
        const og = overlay.addComponent(Graphics);
        og.fillColor = new Color(0, 0, 0, 180);
        og.rect(-visible.width / 2, -visible.height / 2, visible.width, visible.height);
        og.fill();
        const ovOp = overlay.addComponent(UIOpacity);
        ovOp.opacity = 0;
        overlay.on(Node.EventType.TOUCH_END, () => { /* 吞掉穿透点击 */ });
        this.canvasNode.addChild(overlay);
        tween(ovOp).to(0.2, { opacity: 220 }).start();

        const panel = new Node('PausePanel');
        panel.layer = Layers.Enum.UI_2D;
        const panelW = Math.min(visible.width * 0.8, 720);
        const panelH = panelW * 0.6;
        ensureUITransform(panel).setContentSize(panelW, panelH);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(40, 50, 80, 240);
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 28);
        pg.fill();
        pg.lineWidth = 4;
        pg.strokeColor = new Color(180, 180, 200);
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 28);
        pg.stroke();
        overlay.addChild(panel);

        // 标题：暂停
        const titleNode = createLabelNode('暂停', 80, new Color(220, 220, 240));
        titleNode.setPosition(0, panelH * 0.25, 0);
        panel.addChild(titleNode);

        // 当前分数（小字提示）
        const scoreNode = createLabelNode(`当前得分: ${this.score}`, 36, new Color(255, 230, 100));
        scoreNode.setPosition(0, panelH * 0.0, 0);
        panel.addChild(scoreNode);

        // 按钮：继续 / 结束
        const btnW = panelW * 0.4;
        const btnH = 90;
        const btnY = -panelH * 0.3;

        const continueBtn = createButton('继续', btnW, btnH, () => {
            this.fadeOutEndPanel(overlay, () => {
                if (this.shooter && !this.gameOver) this.shooter.setLocked(false);
            });
        }, new Color(80, 140, 220));
        continueBtn.setPosition(-panelW * 0.22, btnY, 0);
        panel.addChild(continueBtn);

        const endBtn = createButton('结束', btnW, btnH, () => {
            // 关掉暂停面板再走结算流程（结算面板会接着弹出来）
            this.fadeOutEndPanel(overlay, () => {
                this.endGameWithResult(false, true /* isQuit */);
            });
        }, new Color(180, 100, 100));
        endBtn.setPosition(panelW * 0.22, btnY, 0);
        panel.addChild(endBtn);

        // 入场动画
        panel.setScale(0.5, 0.5, 1);
        tween(panel).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }

    private showEndPanel(success: boolean, isQuit: boolean = false) {
        if (!this.canvasNode) return;
        const visible = view.getVisibleSize();

        // 半透明遮罩
        const overlay = new Node('EndOverlay');
        overlay.layer = Layers.Enum.UI_2D;
        ensureUITransform(overlay).setContentSize(visible);
        const og = overlay.addComponent(Graphics);
        og.fillColor = new Color(0, 0, 0, 180);
        og.rect(-visible.width / 2, -visible.height / 2, visible.width, visible.height);
        og.fill();
        const ovOp = overlay.addComponent(UIOpacity);
        ovOp.opacity = 0;
        // 拦截下方的触摸（任意 click 不会穿透到游戏）
        overlay.on(Node.EventType.TOUCH_END, () => { /* 吞掉 */ });
        this.canvasNode.addChild(overlay);
        tween(ovOp).to(0.25, { opacity: 220 }).start();

        // 中心面板
        const panel = new Node('EndPanel');
        panel.layer = Layers.Enum.UI_2D;
        const panelW = Math.min(visible.width * 0.8, 720);
        const panelH = panelW * 0.7;
        ensureUITransform(panel).setContentSize(panelW, panelH);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(40, 50, 80, 240);
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 28);
        pg.fill();
        pg.lineWidth = 4;
        // 边框颜色：胜利绿 / 失败红 / 中途退出灰白
        pg.strokeColor = isQuit
            ? new Color(180, 180, 200)
            : (success ? new Color(120, 220, 120) : new Color(220, 120, 120));
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 28);
        pg.stroke();
        overlay.addChild(panel);

        // 标题
        const titleText = isQuit ? '本局结束' : (success ? '通关!' : '游戏结束');
        const titleColor = isQuit
            ? new Color(220, 220, 240)
            : (success ? new Color(150, 240, 150) : new Color(240, 150, 150));
        const titleNode = createLabelNode(titleText, 80, titleColor);
        titleNode.setPosition(0, panelH * 0.28, 0);
        panel.addChild(titleNode);

        // 分数
        const scoreNode = createLabelNode(`得分: ${this.score}`, 56, new Color(255, 230, 100));
        scoreNode.setPosition(0, panelH * 0.05, 0);
        panel.addChild(scoreNode);

        // 按钮：再来一次 / 返回
        const btnW = panelW * 0.4;
        const btnH = 90;
        const btnY = -panelH * 0.28;

        const restartBtn = createButton('再来一次', btnW, btnH, () => {
            this.fadeOutEndPanel(overlay, () => this.startGame());
        }, new Color(80, 140, 220));
        restartBtn.setPosition(-panelW * 0.22, btnY, 0);
        panel.addChild(restartBtn);

        const backBtn = createButton('返回', btnW, btnH, () => {
            director.loadScene(SceneName.MAIN);
        }, new Color(100, 100, 120));
        backBtn.setPosition(panelW * 0.22, btnY, 0);
        panel.addChild(backBtn);

        // 入场动画：缩放 0.5 → 1
        panel.setScale(0.5, 0.5, 1);
        tween(panel)
            .to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    private fadeOutEndPanel(overlay: Node, onDone: () => void) {
        const op = overlay.getComponent(UIOpacity);
        if (!op) {
            overlay.destroy();
            onDone();
            return;
        }
        tween(op)
            .to(0.2, { opacity: 0 })
            .call(() => {
                overlay.destroy();
                onDone();
            })
            .start();
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
        if (clusterSize >= 9) return new Color(255, 80, 80);
        if (clusterSize >= 7) return new Color(255, 160, 60);
        return new Color(255, 220, 80);
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
