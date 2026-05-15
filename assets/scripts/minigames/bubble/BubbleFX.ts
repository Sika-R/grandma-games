import { _decorator, Component, Node, Vec3, UITransform, Layers, Graphics, Color, Label, tween, UIOpacity, view, director } from 'cc';

const { ccclass } = _decorator;

// 通用特效模块。挂在 fxLayer 节点上（在 world 内、grid/shooter 之上）
// 所有需要 spawn 临时视觉效果的代码都通过这个组件，避免到处写 tween+destroy
@ccclass('BubbleFX')
export class BubbleFX extends Component {
    private hitStopActive: boolean = false;

    // 颗粒爆发：在 worldPos 处生成 N 个小圆向外飞，淡出
    burst(worldPos: Vec3, color: Color, count: number = 8, distance: number = 80, durationMs: number = 450) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
            const dist = distance * (0.7 + Math.random() * 0.5);
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist;
            this.spawnParticle(worldPos, dx, dy, color, durationMs);
        }
    }

    private spawnParticle(startWorld: Vec3, dx: number, dy: number, color: Color, durationMs: number) {
        const n = new Node('FXParticle');
        n.layer = Layers.Enum.UI_2D;
        n.addComponent(UITransform);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(color.r, color.g, color.b, 255);
        g.circle(0, 0, 7);
        g.fill();
        const op = n.addComponent(UIOpacity);
        this.node.addChild(n);
        n.setWorldPosition(startWorld);

        const startLocal = n.position.clone();
        const t = durationMs / 1000;
        tween(n)
            .to(t, {
                position: new Vec3(startLocal.x + dx, startLocal.y + dy, 0),
                scale: new Vec3(0.2, 0.2, 1),
            }, { easing: 'cubicOut' })
            .call(() => n.destroy())
            .start();
        tween(op).to(t, { opacity: 0 }).start();
    }

    // 飘字：在 worldPos 处显示文本，向上飘并淡出
    scorePopup(text: string, worldPos: Vec3, color: Color = new Color(255, 240, 100), fontSize: number = 56) {
        const n = new Node('ScorePopup');
        n.layer = Layers.Enum.UI_2D;
        n.addComponent(UITransform);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.lineHeight = fontSize * 1.1;
        lbl.color = color;
        lbl.isBold = true;
        const op = n.addComponent(UIOpacity);
        this.node.addChild(n);
        n.setWorldPosition(worldPos);

        const startLocal = n.position.clone();
        // 先放大一下凸显，再向上飘并缩小
        n.setScale(0.3, 0.3, 1);
        tween(n)
            .to(0.15, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'backOut' })
            .to(0.6, {
                position: new Vec3(startLocal.x, startLocal.y + 140, 0),
                scale: new Vec3(0.9, 0.9, 1),
            }, { easing: 'cubicOut' })
            .call(() => n.destroy())
            .start();
        tween(op)
            .delay(0.3)
            .to(0.45, { opacity: 0 })
            .start();
    }

    // 震屏：每帧给 target 加随机偏移，幅度衰减到 0
    screenShake(target: Node, amplitude: number = 12, durationMs: number = 250) {
        const orig = target.position.clone();
        const totalT = durationMs / 1000;
        let elapsed = 0;
        const step = (dt: number) => {
            elapsed += dt;
            if (elapsed >= totalT) {
                target.setPosition(orig);
                this.unschedule(step);
                return;
            }
            const decay = 1 - elapsed / totalT;
            const dx = (Math.random() - 0.5) * 2 * amplitude * decay;
            const dy = (Math.random() - 0.5) * 2 * amplitude * decay;
            target.setPosition(orig.x + dx, orig.y + dy, 0);
        };
        this.schedule(step);
    }

    // 闪光：在 worldPos 处一个白色大圆瞬间放大 + 淡出（"啪"那一下的视觉重音）
    flash(worldPos: Vec3, radius: number = 60, durationMs: number = 200, color: Color = new Color(255, 255, 255, 200)) {
        const n = new Node('FXFlash');
        n.layer = Layers.Enum.UI_2D;
        n.addComponent(UITransform);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.circle(0, 0, radius);
        g.fill();
        const op = n.addComponent(UIOpacity);
        op.opacity = 220;
        this.node.addChild(n);
        n.setWorldPosition(worldPos);
        n.setScale(0.4, 0.4, 1);

        const t = durationMs / 1000;
        tween(n)
            .to(t, { scale: new Vec3(2, 2, 1) }, { easing: 'cubicOut' })
            .call(() => n.destroy())
            .start();
        tween(op).to(t, { opacity: 0 }).start();
    }

    // ============ 进阶反馈：冲击波 / 顿帧 / 镜头冲击 / 全屏闪光 / 飞行轨迹 / Combo 飘字 / 枪口火 ============

    // 冲击波：从 worldPos 扩散一个圆环（描边，不填充）
    shockwave(worldPos: Vec3, color: Color = new Color(255, 255, 255), maxRadius: number = 220, durationMs: number = 450, lineWidth: number = 6) {
        const n = new Node('FXShockwave');
        n.layer = Layers.Enum.UI_2D;
        n.addComponent(UITransform);
        const g = n.addComponent(Graphics);
        g.lineWidth = lineWidth;
        g.strokeColor = color;
        g.circle(0, 0, 1);  // 实际半径靠 scale 控制
        g.stroke();
        const op = n.addComponent(UIOpacity);
        op.opacity = 220;
        this.node.addChild(n);
        n.setWorldPosition(worldPos);
        n.setScale(0.1, 0.1, 1);

        const t = durationMs / 1000;
        tween(n)
            .to(t, { scale: new Vec3(maxRadius, maxRadius, 1) }, { easing: 'cubicOut' })
            .call(() => n.destroy())
            .start();
        tween(op).to(t, { opacity: 0 }, { easing: 'cubicIn' }).start();
    }

    // 顿帧：暂停整个游戏调度器一小段时间。最大杀伤力的"力度感"工具
    // 注意：tween 受调度器影响，所以一切动画都会冻结；只有真实 setTimeout 不受影响
    hitStop(durationMs: number = 80) {
        if (this.hitStopActive) return;       // 防止叠加
        this.hitStopActive = true;
        director.getScheduler().setTimeScale(0);
        // window.setTimeout 走真实时间，不被 setTimeScale 影响
        setTimeout(() => {
            director.getScheduler().setTimeScale(1);
            this.hitStopActive = false;
        }, durationMs);
    }

    // 镜头冲击：目标节点快速放大一拍再回去（搭配震屏更带感）
    worldPunch(target: Node, scaleAmount: number = 0.04, durationMs: number = 220) {
        const orig = target.scale.clone();
        const t = durationMs / 1000;
        const peak = new Vec3(orig.x + scaleAmount, orig.y + scaleAmount, orig.z);
        tween(target)
            .to(t * 0.3, { scale: peak }, { easing: 'cubicOut' })
            .to(t * 0.7, { scale: orig }, { easing: 'elasticOut' })
            .start();
    }

    // 全屏一闪：覆盖整屏的彩色矩形快速淡入淡出
    bgFlash(color: Color = new Color(255, 255, 255), peakAlpha: number = 90, durationMs: number = 220) {
        const visible = view.getVisibleSize();
        const n = new Node('FXBgFlash');
        n.layer = Layers.Enum.UI_2D;
        ensureTransform(n).setContentSize(visible);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-visible.width / 2, -visible.height / 2, visible.width, visible.height);
        g.fill();
        const op = n.addComponent(UIOpacity);
        op.opacity = 0;
        this.node.addChild(n);

        const t = durationMs / 1000;
        tween(op)
            .to(t * 0.2, { opacity: peakAlpha }, { easing: 'cubicOut' })
            .to(t * 0.8, { opacity: 0 }, { easing: 'cubicIn' })
            .call(() => n.destroy())
            .start();
    }

    // 飞行轨迹的一颗小点：放在飞行泡泡过的位置，快速缩没
    spawnTrailDot(worldPos: Vec3, color: Color, radius: number = 10, durationMs: number = 280) {
        const n = new Node('FXTrail');
        n.layer = Layers.Enum.UI_2D;
        n.addComponent(UITransform);
        const g = n.addComponent(Graphics);
        // 略带透明的彩色尾迹
        g.fillColor = new Color(color.r, color.g, color.b, 200);
        g.circle(0, 0, radius);
        g.fill();
        const op = n.addComponent(UIOpacity);
        this.node.addChild(n);
        n.setWorldPosition(worldPos);

        const t = durationMs / 1000;
        tween(n)
            .to(t, { scale: new Vec3(0.1, 0.1, 1) }, { easing: 'cubicOut' })
            .call(() => n.destroy())
            .start();
        tween(op).to(t, { opacity: 0 }).start();
    }

    // 段位飘字：比 scorePopup 更夸张，用于大消除（"不错!" "厉害!" "天才!"）
    comboText(text: string, worldPos: Vec3, color: Color = new Color(255, 200, 80), fontSize: number = 96) {
        const n = new Node('FXCombo');
        n.layer = Layers.Enum.UI_2D;
        n.addComponent(UITransform);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.lineHeight = fontSize * 1.1;
        lbl.color = color;
        lbl.isBold = true;
        const op = n.addComponent(UIOpacity);
        this.node.addChild(n);
        n.setWorldPosition(worldPos);

        const startLocal = n.position.clone();
        n.setScale(0.1, 0.1, 1);
        // 弹出 → 略停 → 上飘 + 淡出
        tween(n)
            .to(0.2, { scale: new Vec3(1.4, 1.4, 1) }, { easing: 'backOut' })
            .delay(0.2)
            .to(0.5, {
                position: new Vec3(startLocal.x, startLocal.y + 180, 0),
                scale: new Vec3(1.0, 1.0, 1),
            }, { easing: 'cubicOut' })
            .call(() => n.destroy())
            .start();
        tween(op)
            .delay(0.5)
            .to(0.4, { opacity: 0 })
            .start();
    }

    // 枪口火：发射时在发射器位置一个小白光闪一下
    muzzleFlash(worldPos: Vec3, color: Color = new Color(255, 255, 200)) {
        this.flash(worldPos, 36, 150, color);
    }
}

// 私有 helper（避免依赖 MainMenu）
function ensureTransform(n: Node): UITransform {
    return n.getComponent(UITransform) ?? n.addComponent(UITransform);
}
