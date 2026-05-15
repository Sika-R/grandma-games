import { _decorator, Component, Node, Vec3, UITransform, Layers, Graphics, Color, Label, tween, UIOpacity } from 'cc';

const { ccclass } = _decorator;

// 通用特效模块。挂在 fxLayer 节点上（在 world 内、grid/shooter 之上）
// 所有需要 spawn 临时视觉效果的代码都通过这个组件，避免到处写 tween+destroy
@ccclass('BubbleFX')
export class BubbleFX extends Component {

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
}
