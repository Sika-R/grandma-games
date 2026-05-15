import { _decorator, Component, Node, Graphics, Color, UITransform, Layers, Vec3, tween, UIOpacity } from 'cc';
import { BubbleConfig } from './BubbleConfig';
import { BubbleColor } from './BubbleType';

const { ccclass } = _decorator;

@ccclass('Bubble')
export class Bubble extends Component {
    color: BubbleColor = BubbleColor.Red;

    // 网格坐标（吸附到网格后填充；飞行中为 -1）
    row: number = -1;
    col: number = -1;

    // 飞行速度（仅飞行中使用，吸附后清零）
    velocity: { x: number; y: number } | null = null;

    private graphics: Graphics | null = null;

    apply(color: BubbleColor) {
        this.color = color;
        this.redraw();
    }

    private redraw() {
        if (!this.graphics) return;
        const r = BubbleConfig.BUBBLE_RADIUS;
        const c = BubbleConfig.COLOR_PALETTE[this.color];
        this.graphics.clear();
        this.graphics.fillColor = c;
        this.graphics.circle(0, 0, r);
        this.graphics.fill();
        // 高光
        this.graphics.fillColor = new Color(255, 255, 255, 80);
        this.graphics.circle(-r * 0.35, r * 0.35, r * 0.25);
        this.graphics.fill();
    }

    // ============ 动画（特效底子）============

    // 落位时的轻微弹一下（爽感）
    landSquash(durationMs = 180) {
        const t = durationMs / 1000;
        this.node.setScale(0.7, 0.7, 1);
        tween(this.node)
            .to(t * 0.4, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'cubicOut' })
            .to(t * 0.6, { scale: Vec3.ONE }, { easing: 'cubicInOut' })
            .start();
    }

    // 消除时的弹出 + 缩没（颗粒爆发由 FX 模块负责）
    popOut(durationMs = 220): Promise<void> {
        return new Promise<void>(resolve => {
            const t = durationMs / 1000;
            const op = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
            tween(this.node)
                .to(t * 0.25, { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'cubicOut' })
                .to(t * 0.75, { scale: Vec3.ZERO }, { easing: 'cubicIn' })
                .call(() => resolve())
                .start();
            tween(op)
                .delay(t * 0.25)
                .to(t * 0.75, { opacity: 0 })
                .start();
        });
    }

    // 悬空掉落：重力加速向下，淡出
    dropOut(durationMs = 700, fallDistance = 1200): Promise<void> {
        return new Promise<void>(resolve => {
            const t = durationMs / 1000;
            const op = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
            const startPos = this.node.position.clone();
            tween(this.node)
                .to(t, { position: new Vec3(startPos.x, startPos.y - fallDistance, 0) }, { easing: 'quadIn' })
                .call(() => resolve())
                .start();
            tween(op)
                .delay(t * 0.5)
                .to(t * 0.5, { opacity: 0 })
                .start();
        });
    }

    onLoad() {
        // 防御性兜底：如果不是通过 create() 创建，确保也能渲染
        if (!this.graphics) this.setupGraphics();
    }

    private setupGraphics() {
        this.graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        this.redraw();
    }

    static create(parent: Node, color: BubbleColor, pos: Vec3): Bubble {
        const n = new Node('Bubble');
        n.layer = Layers.Enum.UI_2D;
        const ui = n.addComponent(UITransform);
        const r = BubbleConfig.BUBBLE_RADIUS;
        ui.setContentSize(r * 2, r * 2);
        n.setPosition(pos);
        // 关键：先 addChild 让节点进入场景，再加 Bubble 组件并显式渲染
        // 不依赖 onLoad 时机（Cocos 在某些场合 onLoad 是异步的）
        parent.addChild(n);
        const b = n.addComponent(Bubble);
        b.color = color;
        b['setupGraphics']();
        return b;
    }
}
